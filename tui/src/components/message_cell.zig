const std = @import("std");
const vaxis = @import("vaxis");

// ANSI 256 indexed colors (matching chat_history.zig)
const user_bar_color: u8 = 10; // Bright green
const user_text_color: u8 = 10; // Bright green
const assistant_text_color: u8 = 15; // White
const system_text_color: u8 = 214; // Yellow/orange
const tool_call_color: u8 = 39; // Cyan
const tool_result_color: u8 = 141; // Purple
const dim_color: u8 = 243; // Dim gray

pub const MessageRole = enum {
    user,
    assistant,
    system,
    tool_call,
    tool_result,
};

pub const MessageCell = struct {
    allocator: std.mem.Allocator,
    role: MessageRole,
    content: []const u8,
    owned_content: bool,
    streaming_text: ?[]const u8,
    owned_streaming: bool,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator, role: MessageRole, content: []const u8) Self {
        const owned = allocator.dupe(u8, content) catch content;
        return .{
            .allocator = allocator,
            .role = role,
            .content = owned,
            .owned_content = owned.ptr != content.ptr,
            .streaming_text = null,
            .owned_streaming = false,
        };
    }

    pub fn deinit(self: *Self) void {
        if (self.owned_content) {
            self.allocator.free(self.content);
        }
        if (self.owned_streaming) {
            if (self.streaming_text) |st| {
                self.allocator.free(st);
            }
        }
    }

    pub fn setStreaming(self: *Self, streaming_text: []const u8) void {
        if (self.owned_streaming) {
            if (self.streaming_text) |st| {
                self.allocator.free(st);
            }
        }
        const owned = self.allocator.dupe(u8, streaming_text) catch streaming_text;
        self.streaming_text = owned;
        self.owned_streaming = owned.ptr != streaming_text.ptr;
    }

    pub fn clearStreaming(self: *Self) void {
        if (self.owned_streaming) {
            if (self.streaming_text) |st| {
                self.allocator.free(st);
            }
        }
        self.streaming_text = null;
        self.owned_streaming = false;
    }

    pub fn getDisplayContent(self: *const Self) []const u8 {
        return self.streaming_text orelse self.content;
    }

    pub fn getHeight(self: *const Self, width: u16) u16 {
        const text = self.getDisplayContent();
        const text_width = self.getTextWidth(width);
        return switch (self.role) {
            .system => 1,
            else => countLines(text, text_width),
        };
    }

    fn getTextWidth(self: *const Self, width: u16) u16 {
        _ = self;
        return if (width > 6) width - 6 else 1;
    }

    pub fn draw(self: *const Self, win: vaxis.Window) void {
        const text_width = self.getTextWidth(win.width);
        const content = self.getDisplayContent();
        const content_lines = countLines(content, text_width);

        switch (self.role) {
            .user => self.drawUser(win, content, content_lines, text_width),
            .assistant => self.drawAssistant(win, content, content_lines, text_width),
            .system => self.drawSystem(win, content),
            .tool_call => self.drawToolCall(win, content, content_lines, text_width),
            .tool_result => self.drawToolResult(win, content, content_lines, text_width),
        }
    }

    fn drawUser(self: *const Self, win: vaxis.Window, content: []const u8, content_lines: u16, text_width: u16) void {
        _ = self;
        const bar_style: vaxis.Style = .{ .fg = .{ .index = user_bar_color } };
        const text_style: vaxis.Style = .{ .fg = .{ .index = user_text_color } };

        var row: u16 = 0;
        while (row < content_lines) : (row += 1) {
            win.writeCell(2, row, .{
                .char = .{ .grapheme = "│", .width = 1 },
                .style = bar_style,
            });
        }

        const text_win = win.child(.{
            .x_off = 4,
            .y_off = 0,
            .width = text_width,
            .height = content_lines,
        });
        _ = text_win.printSegment(.{ .text = content, .style = text_style }, .{ .wrap = .word });
    }

    fn drawAssistant(self: *const Self, win: vaxis.Window, content: []const u8, content_lines: u16, text_width: u16) void {
        _ = self;
        // TODO: Use markdown parser from ../markdown/parser.zig when available
        const text_style: vaxis.Style = .{ .fg = .{ .index = assistant_text_color } };

        const text_win = win.child(.{
            .x_off = 2,
            .y_off = 0,
            .width = text_width + 2,
            .height = content_lines,
        });
        _ = text_win.printSegment(.{ .text = content, .style = text_style }, .{ .wrap = .word });
    }

    fn drawSystem(self: *const Self, win: vaxis.Window, content: []const u8) void {
        _ = self;
        const msg_len: u16 = @intCast(@min(content.len, win.width -| 4));
        const x_off: u16 = if (win.width > msg_len) (win.width - msg_len) / 2 else 2;

        const sys_win = win.child(.{
            .x_off = x_off,
            .y_off = 0,
            .width = msg_len,
            .height = 1,
        });

        const style: vaxis.Style = .{ .fg = .{ .index = system_text_color } };
        _ = sys_win.printSegment(.{ .text = content, .style = style }, .{});
    }

    fn drawToolCall(self: *const Self, win: vaxis.Window, content: []const u8, content_lines: u16, text_width: u16) void {
        _ = self;
        const bar_style: vaxis.Style = .{ .fg = .{ .index = tool_call_color } };
        const text_style: vaxis.Style = .{ .fg = .{ .index = tool_call_color } };

        var row: u16 = 0;
        while (row < content_lines) : (row += 1) {
            win.writeCell(2, row, .{
                .char = .{ .grapheme = "▶", .width = 1 },
                .style = bar_style,
            });
        }

        const text_win = win.child(.{
            .x_off = 4,
            .y_off = 0,
            .width = text_width,
            .height = content_lines,
        });
        _ = text_win.printSegment(.{ .text = content, .style = text_style }, .{ .wrap = .word });
    }

    fn drawToolResult(self: *const Self, win: vaxis.Window, content: []const u8, content_lines: u16, text_width: u16) void {
        _ = self;
        const bar_style: vaxis.Style = .{ .fg = .{ .index = tool_result_color } };
        const text_style: vaxis.Style = .{ .fg = .{ .index = dim_color } };

        var row: u16 = 0;
        while (row < content_lines) : (row += 1) {
            win.writeCell(2, row, .{
                .char = .{ .grapheme = "◀", .width = 1 },
                .style = bar_style,
            });
        }

        const text_win = win.child(.{
            .x_off = 4,
            .y_off = 0,
            .width = text_width,
            .height = content_lines,
        });
        _ = text_win.printSegment(.{ .text = content, .style = text_style }, .{ .wrap = .word });
    }
};

fn countLines(text: []const u8, width: u16) u16 {
    if (width == 0) return 1;
    if (text.len == 0) return 1;

    var lines: u16 = 1;
    var col: u16 = 0;

    for (text) |c| {
        if (c == '\n') {
            lines += 1;
            col = 0;
        } else {
            col += 1;
            if (col >= width) {
                lines += 1;
                col = 0;
            }
        }
    }

    return lines;
}

// Tests
test "countLines single line" {
    try std.testing.expectEqual(@as(u16, 1), countLines("hello", 80));
}

test "countLines with newlines" {
    try std.testing.expectEqual(@as(u16, 3), countLines("line1\nline2\nline3", 80));
}

test "countLines with wrapping" {
    // 10 chars, width 5: chars fill col 0-4, wrap at col 5, then 5 more = 2 lines
    try std.testing.expectEqual(@as(u16, 3), countLines("1234567890", 5));
}

test "countLines empty" {
    try std.testing.expectEqual(@as(u16, 1), countLines("", 80));
}

test "MessageCell init user" {
    var cell = MessageCell.init(std.testing.allocator, .user, "Hello world");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.user, cell.role);
    try std.testing.expectEqualStrings("Hello world", cell.content);
}

test "MessageCell init assistant" {
    var cell = MessageCell.init(std.testing.allocator, .assistant, "Response text");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.assistant, cell.role);
}

test "MessageCell init system" {
    var cell = MessageCell.init(std.testing.allocator, .system, "System message");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.system, cell.role);
}

test "MessageCell init tool_call" {
    var cell = MessageCell.init(std.testing.allocator, .tool_call, "read_file(path)");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.tool_call, cell.role);
}

test "MessageCell init tool_result" {
    var cell = MessageCell.init(std.testing.allocator, .tool_result, "file contents");
    defer cell.deinit();
    try std.testing.expectEqual(MessageRole.tool_result, cell.role);
}

test "MessageCell getHeight user" {
    var cell = MessageCell.init(std.testing.allocator, .user, "Short message");
    defer cell.deinit();
    const height = cell.getHeight(80);
    try std.testing.expectEqual(@as(u16, 1), height);
}

test "MessageCell getHeight system always 1" {
    var cell = MessageCell.init(std.testing.allocator, .system, "System message that is quite long");
    defer cell.deinit();
    const height = cell.getHeight(80);
    try std.testing.expectEqual(@as(u16, 1), height);
}

test "MessageCell getHeight with wrapping" {
    var cell = MessageCell.init(std.testing.allocator, .user, "This is a longer message that should wrap across multiple lines when width is small");
    defer cell.deinit();
    const height = cell.getHeight(20);
    try std.testing.expect(height > 1);
}

test "MessageCell setStreaming" {
    var cell = MessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("Streaming content...");
    try std.testing.expectEqualStrings("Streaming content...", cell.getDisplayContent());

    cell.clearStreaming();
    try std.testing.expectEqualStrings("Initial", cell.getDisplayContent());
}

test "MessageCell streaming height" {
    var cell = MessageCell.init(std.testing.allocator, .assistant, "Short");
    defer cell.deinit();

    const initial_height = cell.getHeight(80);
    cell.setStreaming("Much longer streaming content\nwith multiple\nlines");
    const streaming_height = cell.getHeight(80);

    try std.testing.expect(streaming_height > initial_height);
}
