const std = @import("std");

/// Open external editor for composing a message
/// Uses anytype for DI - works with any EventLoop and Input implementations
pub fn openExternalEditor(alloc: std.mem.Allocator, event_loop: anytype, input: anytype) ![]u8 {
    const editor_cmd = std.posix.getenv("EDITOR") orelse std.posix.getenv("VISUAL") orelse "vi";

    // Create temp file with unique name (random + timestamp)
    const rand = std.crypto.random.int(u32);
    const ts = std.time.milliTimestamp();
    const tmp_path = try std.fmt.allocPrint(alloc, "/tmp/smithers-edit-{d}-{d}.txt", .{ rand, ts });
    defer alloc.free(tmp_path);
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
    try event_loop.reinitTty();

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
