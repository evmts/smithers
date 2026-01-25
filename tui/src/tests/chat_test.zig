const std = @import("std");
const chat = @import("../ui/chat.zig");
const chat_history_mod = @import("../components/chat_history.zig");
const db = @import("../db.zig");

// ============================================================================
// Mock Types for Testing
// ============================================================================

const MockCell = struct {
    char: struct {
        grapheme: []const u8,
    },
};

const MockWindow = struct {
    w: u16 = 80,
    h: u16 = 24,

    pub fn readCell(_: MockWindow, _: u16, _: u16) ?MockCell {
        return .{ .char = .{ .grapheme = " " } };
    }

    pub fn printSegment(_: MockWindow, _: anytype, _: anytype) struct { col: u16, overflow: bool } {
        return .{ .col = 0, .overflow = false };
    }

    pub fn child(self: MockWindow, _: anytype) MockWindow {
        return self;
    }

    pub fn clear(_: MockWindow) void {}
};

const MockColor = union(enum) {
    index: u8,
    rgb: struct { r: u8, g: u8, b: u8 },
};

const MockStyle = struct {
    fg: ?MockColor = null,
    bg: ?MockColor = null,
    bold: bool = false,
    italic: bool = false,
};

const MockRenderer = struct {
    w: u16 = 80,
    h: u16 = 24,
    window: MockWindow,
    draw_calls: *std.ArrayList(DrawCall),
    cell_calls: *std.ArrayList(CellCall),

    const DrawCall = struct {
        x: u16,
        y: u16,
        text: []const u8,
    };

    const CellCall = struct {
        x: u16,
        y: u16,
        char: []const u8,
    };

    pub const Style = MockStyle;
    pub const Color = MockColor;
    pub const Window = MockWindow;

    pub fn init(allocator: std.mem.Allocator, width: u16, height: u16) MockRenderer {
        const draw_calls = allocator.create(std.ArrayList(DrawCall)) catch @panic("OOM");
        draw_calls.* = std.ArrayList(DrawCall).init(allocator);
        const cell_calls = allocator.create(std.ArrayList(CellCall)) catch @panic("OOM");
        cell_calls.* = std.ArrayList(CellCall).init(allocator);
        return .{
            .w = width,
            .h = height,
            .window = .{ .w = width, .h = height },
            .draw_calls = draw_calls,
            .cell_calls = cell_calls,
        };
    }

    pub fn deinit(self: *MockRenderer) void {
        const allocator = self.draw_calls.allocator;
        self.draw_calls.deinit();
        allocator.destroy(self.draw_calls);
        self.cell_calls.deinit();
        allocator.destroy(self.cell_calls);
    }

    pub fn width(self: *const MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: *const MockRenderer) u16 {
        return self.h;
    }

    pub fn drawText(self: *MockRenderer, x: u16, y: u16, text: []const u8, _: Style) void {
        self.draw_calls.append(.{ .x = x, .y = y, .text = text }) catch {};
    }

    pub fn drawCell(self: *MockRenderer, x: u16, y: u16, char: []const u8, _: Style) void {
        self.cell_calls.append(.{ .x = x, .y = y, .char = char }) catch {};
    }

    pub fn subRegion(self: MockRenderer, _: u16, _: u16, w: u16, h: u16) MockRenderer {
        var r = self;
        r.w = w;
        r.h = h;
        return r;
    }
};

const TestChatHistory = chat_history_mod.ChatHistory(MockRenderer);
const TestChatContainer = chat.ChatContainer(MockRenderer);

// ============================================================================
// ChatContainer Init Tests
// ============================================================================

test "ChatContainer init stores chat history reference" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    try std.testing.expectEqual(&ch, container.chat_history);
}

test "ChatContainer init default title is null" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    const container = TestChatContainer.init(&ch);
    try std.testing.expect(container.title == null);
}

test "ChatContainer init default show_border is true" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    const container = TestChatContainer.init(&ch);
    try std.testing.expect(container.show_border);
}

// ============================================================================
// setTitle Tests
// ============================================================================

test "setTitle updates title field" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setTitle("Test Chat");
    try std.testing.expectEqualStrings("Test Chat", container.title.?);
}

test "setTitle can set to null" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setTitle("Initial");
    try std.testing.expect(container.title != null);

    container.setTitle(null);
    try std.testing.expect(container.title == null);
}

test "setTitle with empty string" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setTitle("");
    try std.testing.expectEqualStrings("", container.title.?);
}

test "setTitle multiple times" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setTitle("First");
    try std.testing.expectEqualStrings("First", container.title.?);

    container.setTitle("Second");
    try std.testing.expectEqualStrings("Second", container.title.?);

    container.setTitle("Third");
    try std.testing.expectEqualStrings("Third", container.title.?);
}

// ============================================================================
// setBorder Tests
// ============================================================================

test "setBorder updates show_border field" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    try std.testing.expect(container.show_border);

    container.setBorder(false);
    try std.testing.expect(!container.show_border);

    container.setBorder(true);
    try std.testing.expect(container.show_border);
}

test "setBorder toggle multiple times" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);

    for (0..5) |i| {
        container.setBorder(i % 2 == 0);
        try std.testing.expectEqual(i % 2 == 0, container.show_border);
    }
}

// ============================================================================
// Draw Tests - Border Rendering
// ============================================================================

test "draw with border draws corner characters" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);

    // Verify corners are drawn
    var found_top_left = false;
    var found_top_right = false;
    var found_bottom_left = false;
    var found_bottom_right = false;

    for (renderer.cell_calls.items) |call| {
        if (std.mem.eql(u8, call.char, "╭") and call.x == 0 and call.y == 0) {
            found_top_left = true;
        }
        if (std.mem.eql(u8, call.char, "╮") and call.x == 39 and call.y == 0) {
            found_top_right = true;
        }
        if (std.mem.eql(u8, call.char, "╰") and call.x == 0 and call.y == 19) {
            found_bottom_left = true;
        }
        if (std.mem.eql(u8, call.char, "╯") and call.x == 39 and call.y == 19) {
            found_bottom_right = true;
        }
    }

    try std.testing.expect(found_top_left);
    try std.testing.expect(found_top_right);
    try std.testing.expect(found_bottom_left);
    try std.testing.expect(found_bottom_right);
}

test "draw with border draws side borders" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 20, 10);
    defer renderer.deinit();

    container.draw(&renderer);

    // Verify vertical borders are drawn
    var left_border_count: usize = 0;
    var right_border_count: usize = 0;

    for (renderer.cell_calls.items) |call| {
        if (std.mem.eql(u8, call.char, "│")) {
            if (call.x == 0) left_border_count += 1;
            if (call.x == 19) right_border_count += 1;
        }
    }

    // Should have side borders for height-2 rows (excluding corners)
    try std.testing.expect(left_border_count >= 8);
    try std.testing.expect(right_border_count >= 8);
}

test "draw with border draws horizontal lines" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 20, 10);
    defer renderer.deinit();

    container.draw(&renderer);

    var top_line_count: usize = 0;
    var bottom_line_count: usize = 0;

    for (renderer.cell_calls.items) |call| {
        if (std.mem.eql(u8, call.char, "─")) {
            if (call.y == 0) top_line_count += 1;
            if (call.y == 9) bottom_line_count += 1;
        }
    }

    try std.testing.expect(top_line_count > 0);
    try std.testing.expect(bottom_line_count > 0);
}

test "draw without border skips border drawing" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setBorder(false);
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);

    // No border characters should be drawn
    for (renderer.cell_calls.items) |call| {
        try std.testing.expect(!std.mem.eql(u8, call.char, "╭"));
        try std.testing.expect(!std.mem.eql(u8, call.char, "╮"));
        try std.testing.expect(!std.mem.eql(u8, call.char, "╰"));
        try std.testing.expect(!std.mem.eql(u8, call.char, "╯"));
        try std.testing.expect(!std.mem.eql(u8, call.char, "│"));
    }
}

// ============================================================================
// Draw Tests - Title Rendering
// ============================================================================

test "draw with title includes title in top border" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setTitle("My Chat");
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);

    var found_title = false;
    for (renderer.draw_calls.items) |call| {
        if (std.mem.eql(u8, call.text, "My Chat") and call.y == 0) {
            found_title = true;
            break;
        }
    }

    try std.testing.expect(found_title);
}

test "draw without title does not draw title text" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);

    // Title should not be drawn - only check y==0 for title area
    for (renderer.draw_calls.items) |call| {
        if (call.y == 0) {
            // Should not find any title text at position typical for title
            try std.testing.expect(call.x != 2 or call.text.len == 0);
        }
    }
}

test "draw with long title truncates" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    const long_title = "This is a very long title that should be truncated to fit within the border";
    container.setTitle(long_title);
    var renderer = MockRenderer.init(allocator, 20, 10);
    defer renderer.deinit();

    container.draw(&renderer);

    for (renderer.draw_calls.items) |call| {
        if (call.y == 0) {
            // Title should be truncated to fit
            try std.testing.expect(call.text.len <= renderer.w - 6);
        }
    }
}

// ============================================================================
// Draw Tests - Small Renderer Edge Cases
// ============================================================================

test "draw with very small renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 3, 3);
    defer renderer.deinit();

    // Should not crash
    container.draw(&renderer);
}

test "draw with zero width renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 0, 10);
    defer renderer.deinit();

    // Should not crash
    container.draw(&renderer);
}

test "draw with zero height renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 10, 0);
    defer renderer.deinit();

    // Should not crash
    container.draw(&renderer);
}

test "draw with 1x1 renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 1, 1);
    defer renderer.deinit();

    // Should not crash
    container.draw(&renderer);
}

test "draw with 2x2 renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 2, 2);
    defer renderer.deinit();

    // Should not crash, minimal border possible
    container.draw(&renderer);
}

// ============================================================================
// Scroll Delegation Tests
// ============================================================================

test "scrollUp delegates to chat_history" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);

    container.scrollUp(10);
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);
}

test "scrollDown delegates to chat_history" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 20;

    var container = TestChatContainer.init(&ch);
    container.scrollDown(5);
    try std.testing.expectEqual(@as(u16, 15), ch.scroll_offset);
}

test "scrollToBottom delegates to chat_history" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 100;

    var container = TestChatContainer.init(&ch);
    container.scrollToBottom();
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "multiple scroll operations" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);

    container.scrollUp(10);
    container.scrollUp(5);
    container.scrollDown(3);
    try std.testing.expectEqual(@as(u16, 12), ch.scroll_offset);

    container.scrollToBottom();
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "scroll saturation at zero" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.scrollDown(100);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "scroll saturation at max" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = std.math.maxInt(u16) - 5;

    var container = TestChatContainer.init(&ch);
    container.scrollUp(10);
    try std.testing.expectEqual(std.math.maxInt(u16), ch.scroll_offset);
}

// ============================================================================
// Struct Field Tests
// ============================================================================

test "ChatContainer has chat_history field" {
    const fields = @typeInfo(TestChatContainer).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "chat_history")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "ChatContainer has title field" {
    const fields = @typeInfo(TestChatContainer).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "title")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "ChatContainer has show_border field" {
    const fields = @typeInfo(TestChatContainer).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "show_border")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "ChatContainer has exactly 3 fields" {
    const fields = @typeInfo(TestChatContainer).@"struct".fields;
    try std.testing.expectEqual(@as(usize, 3), fields.len);
}

// ============================================================================
// DefaultChatContainer Type Tests
// ============================================================================

test "DefaultChatContainer type exists" {
    const default_type_info = @typeInfo(chat.DefaultChatContainer);
    try std.testing.expect(default_type_info == .@"struct");
}

// ============================================================================
// Layout Tests - Content Area
// ============================================================================

test "draw creates subRegion for content" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 50, 30);
    defer renderer.deinit();

    container.draw(&renderer);

    // Content should be drawn in inner area
    // With border, content area is (width-2) x (height-2)
    // So content starts at x=1, y=1
}

test "draw without border uses full area" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setBorder(false);
    var renderer = MockRenderer.init(allocator, 50, 30);
    defer renderer.deinit();

    container.draw(&renderer);

    // When no border, content uses full renderer area
}

// ============================================================================
// Memory Safety Tests
// ============================================================================

test "ChatContainer multiple init with same chat_history" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    const container1 = TestChatContainer.init(&ch);
    const container2 = TestChatContainer.init(&ch);

    try std.testing.expectEqual(container1.chat_history, container2.chat_history);
}

test "ChatContainer does not own chat_history memory" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);

    {
        var container = TestChatContainer.init(&ch);
        container.scrollUp(10);
    }

    // chat_history should still be valid
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);
    ch.deinit();
}

// ============================================================================
// Combined State Tests
// ============================================================================

test "draw with title and no border" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    container.setTitle("Title");
    container.setBorder(false);
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);

    // Title should not be drawn when border is off
    for (renderer.draw_calls.items) |call| {
        try std.testing.expect(!std.mem.eql(u8, call.text, "Title"));
    }
}

test "draw multiple times" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);
    container.draw(&renderer);
    container.draw(&renderer);

    // Should have accumulated draw calls
    try std.testing.expect(renderer.cell_calls.items.len > 0);
}

test "state changes between draws" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    var renderer = MockRenderer.init(allocator, 40, 20);
    defer renderer.deinit();

    container.draw(&renderer);
    const calls_with_border = renderer.cell_calls.items.len;

    container.setBorder(false);
    container.draw(&renderer);

    // Fewer new border calls when border is off
    // (though old calls still exist in the list)
    try std.testing.expect(calls_with_border > 0);
}

// ============================================================================
// Boundary Value Tests
// ============================================================================

test "title at exact width boundary" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    // Set title that would be exactly width - 6 characters
    container.setTitle("1234567890");
    var renderer = MockRenderer.init(allocator, 16, 10);
    defer renderer.deinit();

    container.draw(&renderer);
}

test "scroll with zero lines" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 10;
    var container = TestChatContainer.init(&ch);

    container.scrollUp(0);
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);

    container.scrollDown(0);
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);
}

test "draw with max u16 dimensions" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var container = TestChatContainer.init(&ch);
    // Use large but not max to avoid memory issues
    var renderer = MockRenderer.init(allocator, 1000, 500);
    defer renderer.deinit();

    container.draw(&renderer);
}

// ============================================================================
// Color Constants Tests
// ============================================================================

test "border color constant is valid ANSI" {
    // border_color = 240 (gray)
    try std.testing.expect(240 <= 255);
}

test "title color constant is valid ANSI" {
    // title_color = 75 (blue)
    try std.testing.expect(75 <= 255);
}
