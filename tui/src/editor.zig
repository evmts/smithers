const std = @import("std");
const vaxis = @import("vaxis");
const EventLoop = @import("event_loop.zig").DefaultEventLoop;
const Input = @import("components/input.zig").Input;

/// Open external editor for composing a message
pub fn openExternalEditor(alloc: std.mem.Allocator, event_loop: *EventLoop, input: *Input) ![]u8 {
    const editor_cmd = std.posix.getenv("EDITOR") orelse std.posix.getenv("VISUAL") orelse "vi";

    // Create temp file with current input content
    const tmp_path = "/tmp/smithers-edit.txt";
    {
        const file = try std.fs.createFileAbsolute(tmp_path, .{});
        defer file.close();

        const current_text = try input.getText();
        defer alloc.free(current_text);
        if (current_text.len > 0) {
            try file.writeAll(current_text);
        }
    }

    // Exit alt screen and restore terminal
    try event_loop.vx.exitAltScreen(event_loop.tty.writer());
    event_loop.loop.stop();
    event_loop.tty.deinit();

    // Run the editor
    var child = std.process.Child.init(&.{ editor_cmd, tmp_path }, alloc);
    child.stdin_behavior = .Inherit;
    child.stdout_behavior = .Inherit;
    child.stderr_behavior = .Inherit;

    try child.spawn();
    _ = try child.wait();

    // Restore terminal
    event_loop.tty = try vaxis.Tty.init(&event_loop.tty_buffer);
    event_loop.loop = .{ .tty = &event_loop.tty, .vaxis = &event_loop.vx };
    try event_loop.loop.init();
    try event_loop.loop.start();
    try event_loop.vx.enterAltScreen(event_loop.tty.writer());

    // Read the edited content
    const file = try std.fs.openFileAbsolute(tmp_path, .{});
    defer file.close();
    const content = try file.readToEndAlloc(alloc, 1024 * 1024);

    // Clear input after successful edit
    input.clear();

    // Clean up temp file
    std.fs.deleteFileAbsolute(tmp_path) catch {};

    // Trim trailing whitespace
    const trimmed = std.mem.trimRight(u8, content, " \t\n\r");
    if (trimmed.len < content.len) {
        const result = try alloc.dupe(u8, trimmed);
        alloc.free(content);
        return result;
    }

    return content;
}
