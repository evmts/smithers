const std = @import("std");
const message_cell = @import("message_cell.zig");

const MessageCell = message_cell.MessageCell;
const MessageRole = message_cell.MessageRole;

fn countLines(text: []const u8, w: u16) u16 {
    if (w == 0) return 1;
    if (text.len == 0) return 1;

    var lines: u16 = 1;
    var col: u16 = 0;

    for (text) |c| {
        if (c == '\n') {
            lines += 1;
            col = 0;
        } else {
            col += 1;
            if (col >= w) {
                lines += 1;
                col = 0;
            }
        }
    }

    return lines;
}

test "countLines single line" {
    try std.testing.expectEqual(@as(u16, 1), countLines("hello", 80));
}

test "countLines with newlines" {
    try std.testing.expectEqual(@as(u16, 3), countLines("line1\nline2\nline3", 80));
}

test "countLines with wrapping" {
    try std.testing.expectEqual(@as(u16, 3), countLines("1234567890", 5));
}

test "countLines empty" {
    try std.testing.expectEqual(@as(u16, 1), countLines("", 80));
}

const TestMockRenderer = struct {
    pub const Color = struct { index: u8 = 0 };
    pub const Style = struct { fg: Color = .{} };
};
const TestCell = MessageCell(TestMockRenderer);

test "MessageCell init user" {
    var cell = TestCell.init(std.testing.allocator, .user, "Hello world");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.user, cell.role);
    try std.testing.expectEqualStrings("Hello world", cell.content);
}

test "MessageCell init assistant" {
    var cell = TestCell.init(std.testing.allocator, .assistant, "Response text");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.assistant, cell.role);
}

test "MessageCell init system" {
    var cell = TestCell.init(std.testing.allocator, .system, "System message");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.system, cell.role);
}

test "MessageCell init tool_call" {
    var cell = TestCell.init(std.testing.allocator, .tool_call, "read_file(path)");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.tool_call, cell.role);
}

test "MessageCell init tool_result" {
    var cell = TestCell.init(std.testing.allocator, .tool_result, "file contents");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.tool_result, cell.role);
}

test "MessageCell getHeight user" {
    var cell = TestCell.init(std.testing.allocator, .user, "Short message");
    defer cell.deinit();
    const height = cell.getHeight(80);
    try std.testing.expectEqual(@as(u16, 1), height);
}

test "MessageCell getHeight system always 1" {
    var cell = TestCell.init(std.testing.allocator, .system, "System message that is quite long");
    defer cell.deinit();
    const height = cell.getHeight(80);
    try std.testing.expectEqual(@as(u16, 1), height);
}

test "MessageCell getHeight with wrapping" {
    var cell = TestCell.init(std.testing.allocator, .user, "This is a longer message that should wrap across multiple lines when width is small");
    defer cell.deinit();
    const height = cell.getHeight(20);
    try std.testing.expect(height > 1);
}

test "MessageCell setStreaming" {
    var cell = TestCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("Streaming content...");
    try std.testing.expectEqualStrings("Streaming content...", cell.getDisplayContent());

    cell.clearStreaming();
    try std.testing.expectEqualStrings("Initial", cell.getDisplayContent());
}

test "MessageCell streaming height" {
    var cell = TestCell.init(std.testing.allocator, .assistant, "Short");
    defer cell.deinit();

    const initial_height = cell.getHeight(80);
    cell.setStreaming("Much longer streaming content\nwith multiple\nlines");
    const streaming_height = cell.getHeight(80);

    try std.testing.expect(streaming_height > initial_height);
}
