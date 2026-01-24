const std = @import("std");
const message_cell = @import("../components/message_cell.zig");

// ============================================================================
// Mock Backend for Testing (DI pattern from renderer_test.zig)
// ============================================================================

const MockCell = struct {
    grapheme: []const u8,
    width: u8,
};

const MockStyle = struct {
    fg: ?MockColor = null,
    bg: ?MockColor = null,
    bold: bool = false,
};

const MockColor = union(enum) {
    index: u8,
    rgb: struct { u8, u8, u8 },
};

const MockWindow = struct {
    width: u16 = 80,
    height: u16 = 24,
    cells_written: *usize,
    segments_printed: *usize,
    last_text: *?[]const u8,
    last_style: *?MockStyle,

    pub fn child(self: MockWindow, opts: struct {
        x_off: u16 = 0,
        y_off: u16 = 0,
        width: u16 = 0,
        height: u16 = 0,
        border: ?struct {
            where: enum { all, none },
            style: MockStyle,
        } = null,
    }) MockWindow {
        const effective_width = if (opts.width == 0) self.width -| opts.x_off else opts.width;
        const effective_height = if (opts.height == 0) self.height -| opts.y_off else opts.height;
        return .{
            .width = effective_width,
            .height = effective_height,
            .cells_written = self.cells_written,
            .segments_printed = self.segments_printed,
            .last_text = self.last_text,
            .last_style = self.last_style,
        };
    }

    pub fn writeCell(self: MockWindow, _: u16, _: u16, _: struct {
        char: MockCell,
        style: MockStyle,
    }) void {
        self.cells_written.* += 1;
    }

    pub fn printSegment(self: MockWindow, segment: struct {
        text: []const u8,
        style: MockStyle,
    }, _: struct { wrap: enum { word, grapheme } = .grapheme }) struct { col: usize } {
        self.segments_printed.* += 1;
        self.last_text.* = segment.text;
        self.last_style.* = segment.style;
        return .{ .col = segment.text.len };
    }

    pub fn clear(_: MockWindow) void {}
};

const MockRenderer = struct {
    pub const Style = MockStyle;
    pub const Color = MockColor;

    window: MockWindow,
    w: u16,
    h: u16,

    pub fn init(rw: u16, rh: u16, cells_written: *usize, segments_printed: *usize, last_text: *?[]const u8, last_style: *?MockStyle) MockRenderer {
        return .{
            .w = rw,
            .h = rh,
            .window = .{
                .width = rw,
                .height = rh,
                .cells_written = cells_written,
                .segments_printed = segments_printed,
                .last_text = last_text,
                .last_style = last_style,
            },
        };
    }

    pub fn width(self: *const MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: *const MockRenderer) u16 {
        return self.h;
    }

    pub fn drawCell(self: *const MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {
        self.window.cells_written.* += 1;
    }

    pub fn drawText(self: *const MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {
        self.window.segments_printed.* += 1;
    }

    pub fn subRegion(self: *const MockRenderer, _: u16, _: u16, sw: u16, sh: u16) MockRenderer {
        return .{
            .w = sw,
            .h = sh,
            .window = .{
                .width = sw,
                .height = sh,
                .cells_written = self.window.cells_written,
                .segments_printed = self.window.segments_printed,
                .last_text = self.window.last_text,
                .last_style = self.window.last_style,
            },
        };
    }
};

const TestMessageCell = message_cell.MessageCell(MockRenderer);

// ============================================================================
// MessageRole Tests
// ============================================================================

test "MessageRole enum has all expected variants" {
    const roles = [_]message_cell.MessageRole{
        .user,
        .assistant,
        .system,
        .tool_call,
        .tool_result,
    };
    try std.testing.expectEqual(@as(usize, 5), roles.len);
}

test "MessageRole values are distinct" {
    try std.testing.expect(message_cell.MessageRole.user != message_cell.MessageRole.assistant);
    try std.testing.expect(message_cell.MessageRole.assistant != message_cell.MessageRole.system);
    try std.testing.expect(message_cell.MessageRole.system != message_cell.MessageRole.tool_call);
    try std.testing.expect(message_cell.MessageRole.tool_call != message_cell.MessageRole.tool_result);
}

// ============================================================================
// MessageCell Init Tests
// ============================================================================

test "MessageCell.init sets role correctly for user" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "test");
    defer cell.deinit();
    try std.testing.expectEqual(message_cell.MessageRole.user, cell.role);
}

test "MessageCell.init sets role correctly for assistant" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "test");
    defer cell.deinit();
    try std.testing.expectEqual(message_cell.MessageRole.assistant, cell.role);
}

test "MessageCell.init sets role correctly for system" {
    var cell = TestMessageCell.init(std.testing.allocator, .system, "test");
    defer cell.deinit();
    try std.testing.expectEqual(message_cell.MessageRole.system, cell.role);
}

test "MessageCell.init sets role correctly for tool_call" {
    var cell = TestMessageCell.init(std.testing.allocator, .tool_call, "test");
    defer cell.deinit();
    try std.testing.expectEqual(message_cell.MessageRole.tool_call, cell.role);
}

test "MessageCell.init sets role correctly for tool_result" {
    var cell = TestMessageCell.init(std.testing.allocator, .tool_result, "test");
    defer cell.deinit();
    try std.testing.expectEqual(message_cell.MessageRole.tool_result, cell.role);
}

test "MessageCell.init duplicates content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Hello World");
    defer cell.deinit();
    try std.testing.expectEqualStrings("Hello World", cell.content);
    try std.testing.expect(cell.owned_content);
}

test "MessageCell.init with empty content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "");
    defer cell.deinit();
    try std.testing.expectEqualStrings("", cell.content);
}

test "MessageCell.init sets streaming_text to null" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "test");
    defer cell.deinit();
    try std.testing.expect(cell.streaming_text == null);
    try std.testing.expect(!cell.owned_streaming);
}

test "MessageCell.init preserves allocator" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "test");
    defer cell.deinit();
    try std.testing.expect(@intFromPtr(cell.allocator.ptr) == @intFromPtr(std.testing.allocator.ptr));
}

// ============================================================================
// MessageCell Content Tests
// ============================================================================

test "MessageCell.init with long content" {
    const long_content = "A" ** 1000;
    var cell = TestMessageCell.init(std.testing.allocator, .user, long_content);
    defer cell.deinit();
    try std.testing.expectEqual(@as(usize, 1000), cell.content.len);
}

test "MessageCell.init with unicode content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "こんにちは世界");
    defer cell.deinit();
    try std.testing.expectEqualStrings("こんにちは世界", cell.content);
}

test "MessageCell.init with emoji content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Hello 🌍🚀✨");
    defer cell.deinit();
    try std.testing.expectEqualStrings("Hello 🌍🚀✨", cell.content);
}

test "MessageCell.init with newlines" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "line1\nline2\nline3");
    defer cell.deinit();
    try std.testing.expectEqualStrings("line1\nline2\nline3", cell.content);
}

test "MessageCell.init with tabs" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "col1\tcol2\tcol3");
    defer cell.deinit();
    try std.testing.expectEqualStrings("col1\tcol2\tcol3", cell.content);
}

test "MessageCell.init with mixed whitespace" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "  \t\n  spaces  \n\t");
    defer cell.deinit();
    try std.testing.expectEqualStrings("  \t\n  spaces  \n\t", cell.content);
}

// ============================================================================
// MessageCell Streaming Tests
// ============================================================================

test "MessageCell.setStreaming updates streaming_text" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("Streaming...");
    try std.testing.expectEqualStrings("Streaming...", cell.streaming_text.?);
    try std.testing.expect(cell.owned_streaming);
}

test "MessageCell.setStreaming can be called multiple times" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("First");
    try std.testing.expectEqualStrings("First", cell.streaming_text.?);

    cell.setStreaming("Second");
    try std.testing.expectEqualStrings("Second", cell.streaming_text.?);

    cell.setStreaming("Third");
    try std.testing.expectEqualStrings("Third", cell.streaming_text.?);
}

test "MessageCell.setStreaming with empty string" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("");
    try std.testing.expectEqualStrings("", cell.streaming_text.?);
}

test "MessageCell.setStreaming with long text" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Short");
    defer cell.deinit();

    const long_text = "B" ** 500;
    cell.setStreaming(long_text);
    try std.testing.expectEqual(@as(usize, 500), cell.streaming_text.?.len);
}

test "MessageCell.clearStreaming resets streaming_text" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("Streaming...");
    try std.testing.expect(cell.streaming_text != null);

    cell.clearStreaming();
    try std.testing.expect(cell.streaming_text == null);
    try std.testing.expect(!cell.owned_streaming);
}

test "MessageCell.clearStreaming when no streaming text" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.clearStreaming();
    try std.testing.expect(cell.streaming_text == null);
}

test "MessageCell.clearStreaming multiple times is safe" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("Test");
    cell.clearStreaming();
    cell.clearStreaming();
    cell.clearStreaming();
    try std.testing.expect(cell.streaming_text == null);
}

// ============================================================================
// MessageCell getDisplayContent Tests
// ============================================================================

test "MessageCell.getDisplayContent returns content when no streaming" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Original content");
    defer cell.deinit();

    const display = cell.getDisplayContent();
    try std.testing.expectEqualStrings("Original content", display);
}

test "MessageCell.getDisplayContent returns streaming when set" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Original");
    defer cell.deinit();

    cell.setStreaming("Streaming content");
    const display = cell.getDisplayContent();
    try std.testing.expectEqualStrings("Streaming content", display);
}

test "MessageCell.getDisplayContent returns content after clearStreaming" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Original");
    defer cell.deinit();

    cell.setStreaming("Streaming");
    cell.clearStreaming();
    const display = cell.getDisplayContent();
    try std.testing.expectEqualStrings("Original", display);
}

// ============================================================================
// MessageCell getHeight Tests
// ============================================================================

test "MessageCell.getHeight for short message is 1" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Short");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 1), cell.getHeight(80));
}

test "MessageCell.getHeight for system is always 1" {
    var cell = TestMessageCell.init(std.testing.allocator, .system, "A very long system message that would normally wrap across multiple lines");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 1), cell.getHeight(20));
}

test "MessageCell.getHeight with newlines" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "line1\nline2\nline3");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 3), cell.getHeight(80));
}

test "MessageCell.getHeight with text wrapping" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "This is a message that should wrap");
    defer cell.deinit();
    const height = cell.getHeight(16); // text_width = 16 - 6 = 10
    try std.testing.expect(height > 1);
}

test "MessageCell.getHeight minimum width handling" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Test");
    defer cell.deinit();
    const height = cell.getHeight(6); // text_width would be 0, clamped to 1
    try std.testing.expect(height >= 1);
}

test "MessageCell.getHeight with streaming content" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Short");
    defer cell.deinit();

    const initial_height = cell.getHeight(80);
    cell.setStreaming("Much longer streaming content\nwith multiple\nlines\nhere");
    const streaming_height = cell.getHeight(80);

    try std.testing.expect(streaming_height > initial_height);
}

test "MessageCell.getHeight for tool_call" {
    var cell = TestMessageCell.init(std.testing.allocator, .tool_call, "read_file(path)");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 1), cell.getHeight(80));
}

test "MessageCell.getHeight for tool_result" {
    var cell = TestMessageCell.init(std.testing.allocator, .tool_result, "result data");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 1), cell.getHeight(80));
}

test "MessageCell.getHeight with very small width" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Hello World");
    defer cell.deinit();
    const height = cell.getHeight(1);
    try std.testing.expect(height >= 1);
}

test "MessageCell.getHeight with empty content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 1), cell.getHeight(80));
}

// ============================================================================
// MessageCell draw Tests
// ============================================================================

test "MessageCell.draw user draws bar and content" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .user, "User message");
    defer cell.deinit();

    cell.draw(renderer);
    try std.testing.expect(cells_written > 0 or segments_printed > 0);
}

test "MessageCell.draw assistant draws content" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Assistant message");
    defer cell.deinit();

    cell.draw(renderer);
    try std.testing.expect(segments_printed > 0);
}

test "MessageCell.draw system centers content" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .system, "System message");
    defer cell.deinit();

    cell.draw(renderer);
    try std.testing.expect(segments_printed > 0);
}

test "MessageCell.draw tool_call draws indicator" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .tool_call, "read_file");
    defer cell.deinit();

    cell.draw(renderer);
    try std.testing.expect(cells_written > 0 or segments_printed > 0);
}

test "MessageCell.draw tool_result draws indicator" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .tool_result, "file contents");
    defer cell.deinit();

    cell.draw(renderer);
    try std.testing.expect(cells_written > 0 or segments_printed > 0);
}

test "MessageCell.draw with streaming content" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Original");
    defer cell.deinit();

    cell.setStreaming("Streaming...");
    cell.draw(renderer);
    try std.testing.expect(segments_printed > 0);
}

test "MessageCell.draw with small width" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(10, 5, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .user, "Test message");
    defer cell.deinit();

    cell.draw(renderer);
}

test "MessageCell.draw with minimal width" {
    var cells_written: usize = 0;
    var segments_printed: usize = 0;
    var last_text: ?[]const u8 = null;
    var last_style: ?MockStyle = null;
    const renderer = MockRenderer.init(7, 3, &cells_written, &segments_printed, &last_text, &last_style);

    var cell = TestMessageCell.init(std.testing.allocator, .user, "X");
    defer cell.deinit();

    cell.draw(renderer);
}

// ============================================================================
// MessageCell Type Tests
// ============================================================================

test "MessageCell can be instantiated with MockRenderer" {
    _ = TestMessageCell;
}

// ============================================================================
// Memory Management Tests
// ============================================================================

test "MessageCell deinit frees owned content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Test content");
    cell.deinit();
}

test "MessageCell deinit frees owned streaming" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    cell.setStreaming("Streaming content");
    cell.deinit();
}

test "MessageCell multiple setStreaming no leaks" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("First");
    cell.setStreaming("Second");
    cell.setStreaming("Third");
    cell.setStreaming("Fourth");
    cell.setStreaming("Fifth");
}

test "MessageCell setStreaming then clearStreaming no leaks" {
    var cell = TestMessageCell.init(std.testing.allocator, .assistant, "Initial");
    defer cell.deinit();

    cell.setStreaming("Streaming");
    cell.clearStreaming();
    cell.setStreaming("More streaming");
    cell.clearStreaming();
}

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

test "MessageCell with null byte in content" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "hello\x00world");
    defer cell.deinit();
    try std.testing.expectEqual(@as(usize, 11), cell.content.len);
}

test "MessageCell with only newlines" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "\n\n\n");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 4), cell.getHeight(80)); // 3 newlines = 4 lines
}

test "MessageCell with trailing newline" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "text\n");
    defer cell.deinit();
    try std.testing.expectEqual(@as(u16, 2), cell.getHeight(80));
}

test "MessageCell getHeight width boundary 6" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "abc");
    defer cell.deinit();
    const height = cell.getHeight(6);
    try std.testing.expect(height >= 1);
}

test "MessageCell getHeight width boundary 7" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "abc");
    defer cell.deinit();
    const height = cell.getHeight(7);
    try std.testing.expect(height >= 1);
}

test "MessageCell roles all draw without error" {
    const roles = [_]message_cell.MessageRole{
        .user,
        .assistant,
        .system,
        .tool_call,
        .tool_result,
    };

    for (roles) |role| {
        var cells_written: usize = 0;
        var segments_printed: usize = 0;
        var last_text: ?[]const u8 = null;
        var last_style: ?MockStyle = null;
        const renderer = MockRenderer.init(80, 24, &cells_written, &segments_printed, &last_text, &last_style);

        var cell = TestMessageCell.init(std.testing.allocator, role, "Test content");
        defer cell.deinit();
        cell.draw(renderer);
    }
}

test "MessageCell large width value" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Short");
    defer cell.deinit();
    const height = cell.getHeight(std.math.maxInt(u16));
    try std.testing.expectEqual(@as(u16, 1), height);
}

test "MessageCell zero width handling" {
    var cell = TestMessageCell.init(std.testing.allocator, .user, "Test");
    defer cell.deinit();
    const height = cell.getHeight(0);
    try std.testing.expect(height >= 1);
}

// ============================================================================
// Generic Type Tests
// ============================================================================

test "MessageCell generic instantiation compiles" {
    _ = message_cell.MessageCell(MockRenderer);
}

test "MessageCell can use different renderer types" {
    const AlternateRenderer = struct {
        pub const Style = struct {
            fg: ?union(enum) { index: u8 } = null,
        };

        window: struct {
            pub fn printSegment(_: @This(), _: anytype, _: anytype) struct { col: usize } {
                return .{ .col = 0 };
            }
        },
        w: u16,

        pub fn width(self: *const @This()) u16 {
            return self.w;
        }

        pub fn drawCell(_: *const @This(), _: u16, _: u16, _: []const u8, _: Style) void {}

        pub fn subRegion(self: *const @This(), _: u16, _: u16, w: u16, _: u16) @This() {
            return .{ .w = w, .window = self.window };
        }
    };

    const AltCell = message_cell.MessageCell(AlternateRenderer);
    var cell = AltCell.init(std.testing.allocator, .user, "test");
    defer cell.deinit();
    try std.testing.expectEqual(message_cell.MessageRole.user, cell.role);
}
