const std = @import("std");
const chat_history_mod = @import("../components/chat_history.zig");
const db = @import("../db.zig");
const selection_mod = @import("../selection.zig");
const clipboard_mod = @import("../clipboard.zig");

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
    cells: std.ArrayList(StoredCell),
    allocator: std.mem.Allocator,

    const StoredCell = struct {
        x: u16,
        y: u16,
        text: []const u8,
    };

    pub fn init(allocator: std.mem.Allocator, width: u16, height: u16) MockWindow {
        return .{
            .w = width,
            .h = height,
            .cells = std.ArrayList(StoredCell).init(allocator),
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *MockWindow) void {
        self.cells.deinit();
    }

    pub fn readCell(_: MockWindow, _: u16, _: u16) ?MockCell {
        return .{ .char = .{ .grapheme = " " } };
    }

    pub fn printSegment(_: MockWindow, _: anytype, _: anytype) struct { col: u16, overflow: bool } {
        return .{ .col = 0, .overflow = false };
    }

    pub fn child(self: MockWindow, opts: anytype) MockWindow {
        _ = opts;
        return self;
    }

    pub fn clear(_: MockWindow) void {}
};

const MockColor = union(enum) {
    index: u8,
    rgb: struct { u8, u8, u8 },
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
    draw_calls: std.ArrayList(DrawCall),

    const DrawCall = struct {
        x: u16,
        y: u16,
        text: []const u8,
    };

    pub const Style = MockStyle;
    pub const Color = MockColor;
    pub const Window = MockWindow;

    pub fn init(allocator: std.mem.Allocator, width: u16, height: u16) MockRenderer {
        return .{
            .w = width,
            .h = height,
            .window = MockWindow.init(allocator, width, height),
            .draw_calls = std.ArrayList(DrawCall).init(allocator),
        };
    }

    pub fn deinit(self: *MockRenderer) void {
        self.window.deinit();
        self.draw_calls.deinit();
    }

    pub fn width(self: MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.h;
    }

    pub fn drawText(self: *MockRenderer, x: u16, y: u16, text: []const u8, _: Style) void {
        self.draw_calls.append(.{ .x = x, .y = y, .text = text }) catch {};
    }

    pub fn drawCell(self: *MockRenderer, x: u16, y: u16, char: []const u8, _: Style) void {
        self.draw_calls.append(.{ .x = x, .y = y, .text = char }) catch {};
    }

    pub fn subRegion(self: MockRenderer, _: u16, _: u16, w: u16, h: u16) MockRenderer {
        return .{
            .w = w,
            .h = h,
            .window = self.window,
            .draw_calls = self.draw_calls,
        };
    }
};

const TestChatHistory = chat_history_mod.ChatHistory(MockRenderer);

// ============================================================================
// Init / Deinit Tests
// ============================================================================

test "ChatHistory init creates empty state" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expectEqual(@as(usize, 0), ch.messages.len);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
    try std.testing.expect(!ch.hasSelection());
    try std.testing.expect(!ch.isSelecting());
    try std.testing.expect(ch.last_renderer == null);
}

test "ChatHistory init selection is initialized" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expect(!ch.selection.is_selecting);
    try std.testing.expect(!ch.selection.has_selection);
    try std.testing.expectEqual(@as(u16, 0), ch.selection.anchor_x);
    try std.testing.expectEqual(@as(i32, 0), ch.selection.anchor_y);
}

test "ChatHistory deinit handles empty messages" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    ch.deinit();
}

// ============================================================================
// Scrolling Tests
// ============================================================================

test "ChatHistory scrollUp increases offset" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scrollUp(5);
    try std.testing.expectEqual(@as(u16, 5), ch.scroll_offset);

    ch.scrollUp(10);
    try std.testing.expectEqual(@as(u16, 15), ch.scroll_offset);
}

test "ChatHistory scrollDown decreases offset" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 20;

    ch.scrollDown(5);
    try std.testing.expectEqual(@as(u16, 15), ch.scroll_offset);

    ch.scrollDown(10);
    try std.testing.expectEqual(@as(u16, 5), ch.scroll_offset);
}

test "ChatHistory scrollDown saturates at zero" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 5;
    ch.scrollDown(10);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "ChatHistory scrollUp saturates at max" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = std.math.maxInt(u16) - 5;
    ch.scrollUp(10);
    try std.testing.expectEqual(std.math.maxInt(u16), ch.scroll_offset);
}

test "ChatHistory scrollToBottom resets offset" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 100;
    ch.scrollToBottom();
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "ChatHistory scrollUpMessage with no messages" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scrollUpMessage(80);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "ChatHistory scrollDownMessage with no messages" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 10;
    ch.scrollDownMessage(80);
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);
}

test "ChatHistory scrollDownMessage at bottom stays at bottom" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 0;
    ch.scrollDownMessage(80);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

// ============================================================================
// hasConversation Tests
// ============================================================================

test "ChatHistory hasConversation false for empty" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expect(!ch.hasConversation());
}

// ============================================================================
// Selection Tests
// ============================================================================

test "ChatHistory startSelection sets state" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(10, 20);

    try std.testing.expect(ch.isSelecting());
    try std.testing.expect(!ch.hasSelection());
    try std.testing.expectEqual(@as(u16, 10), ch.selection.anchor_x);
}

test "ChatHistory updateSelection changes focus" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(10, 20);
    ch.updateSelection(30, 25);

    try std.testing.expect(ch.isSelecting());
    try std.testing.expect(ch.hasSelection());
    try std.testing.expectEqual(@as(u16, 30), ch.selection.focus_x);
}

test "ChatHistory endSelection stops selecting" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(10, 20);
    ch.updateSelection(30, 25);
    ch.endSelection();

    try std.testing.expect(!ch.isSelecting());
    try std.testing.expect(ch.hasSelection());
}

test "ChatHistory clearSelection resets all" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(10, 20);
    ch.updateSelection(30, 25);
    ch.endSelection();
    ch.clearSelection();

    try std.testing.expect(!ch.isSelecting());
    try std.testing.expect(!ch.hasSelection());
}

test "ChatHistory selection with scroll offset" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 10;
    ch.startSelection(5, 5);

    try std.testing.expectEqual(@as(i32, 15), ch.selection.anchor_y);
}

test "ChatHistory hasSelection returns selection state" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expect(!ch.hasSelection());

    ch.startSelection(0, 0);
    ch.updateSelection(10, 10);
    try std.testing.expect(ch.hasSelection());
}

test "ChatHistory isSelecting returns selecting state" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expect(!ch.isSelecting());

    ch.startSelection(0, 0);
    try std.testing.expect(ch.isSelecting());

    ch.endSelection();
    try std.testing.expect(!ch.isSelecting());
}

// ============================================================================
// getSelectedText Tests
// ============================================================================

test "ChatHistory getSelectedText returns null without selection" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expect(ch.getSelectedText() == null);
}

test "ChatHistory getSelectedText returns null without renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(0, 0);
    ch.updateSelection(10, 0);
    ch.endSelection();

    try std.testing.expect(ch.getSelectedText() == null);
}

// ============================================================================
// Draw Tests
// ============================================================================

test "ChatHistory draw with no messages shows empty message" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var renderer = MockRenderer.init(allocator, 80, 24);
    defer renderer.deinit();

    ch.draw(&renderer);

    try std.testing.expect(renderer.draw_calls.items.len > 0);
    var found_empty_msg = false;
    for (renderer.draw_calls.items) |call| {
        if (std.mem.indexOf(u8, call.text, "No messages") != null) {
            found_empty_msg = true;
            break;
        }
    }
    try std.testing.expect(found_empty_msg);
}

test "ChatHistory draw stores renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var renderer = MockRenderer.init(allocator, 80, 24);
    defer renderer.deinit();

    try std.testing.expect(ch.last_renderer == null);

    ch.draw(&renderer);

    try std.testing.expect(ch.last_renderer != null);
}

test "ChatHistory draw centers empty message" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var renderer = MockRenderer.init(allocator, 80, 24);
    defer renderer.deinit();

    ch.draw(&renderer);

    for (renderer.draw_calls.items) |call| {
        if (std.mem.indexOf(u8, call.text, "No messages") != null) {
            try std.testing.expectEqual(@as(u16, 12), call.y);
            break;
        }
    }
}

test "ChatHistory draw with narrow renderer handles edge case" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var renderer = MockRenderer.init(allocator, 10, 5);
    defer renderer.deinit();

    ch.draw(&renderer);
}

test "ChatHistory draw with very small renderer" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var renderer = MockRenderer.init(allocator, 1, 1);
    defer renderer.deinit();

    ch.draw(&renderer);
}

// ============================================================================
// countLines Tests (via internal behavior)
// ============================================================================

test "ChatHistory text_width calculation" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    var renderer = MockRenderer.init(allocator, 100, 50);
    defer renderer.deinit();

    ch.draw(&renderer);
}

// ============================================================================
// Edge Cases & Boundary Tests
// ============================================================================

test "ChatHistory scroll zero lines" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 10;
    ch.scrollUp(0);
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);

    ch.scrollDown(0);
    try std.testing.expectEqual(@as(u16, 10), ch.scroll_offset);
}

test "ChatHistory selection start then clear" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(5, 5);
    try std.testing.expect(ch.isSelecting());

    ch.clearSelection();
    try std.testing.expect(!ch.isSelecting());
    try std.testing.expect(!ch.hasSelection());
}

test "ChatHistory multiple scroll operations" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scrollUp(10);
    ch.scrollUp(20);
    ch.scrollDown(5);
    try std.testing.expectEqual(@as(u16, 25), ch.scroll_offset);

    ch.scrollToBottom();
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "ChatHistory selection without update has no selection" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(10, 10);
    try std.testing.expect(!ch.hasSelection());
    try std.testing.expect(ch.isSelecting());
}

test "ChatHistory update selection same position" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(10, 10);
    ch.updateSelection(10, 10);

    try std.testing.expect(!ch.hasSelection());
}

test "ChatHistory selection across scroll change" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 0;
    ch.startSelection(5, 10);

    ch.scroll_offset = 5;
    ch.updateSelection(15, 15);

    const bounds = ch.selection.getScreenBounds(ch.scroll_offset);
    try std.testing.expect(bounds.min_y <= bounds.max_y);
}

// ============================================================================
// DefaultChatHistory Type Tests
// ============================================================================

test "DefaultChatHistory type exists" {
    _ = chat_history_mod.DefaultChatHistory;
}

// ============================================================================
// Memory Tests
// ============================================================================

test "ChatHistory init with testing allocator" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    try std.testing.expectEqual(allocator, ch.allocator);
}

test "ChatHistory multiple init deinit cycles" {
    const allocator = std.testing.allocator;

    for (0..5) |_| {
        var ch = TestChatHistory.init(allocator);
        ch.scrollUp(10);
        ch.startSelection(0, 0);
        ch.deinit();
    }
}

// ============================================================================
// Draw with Selection Highlight Tests
// ============================================================================

test "ChatHistory draw with active selection" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(5, 5);
    ch.updateSelection(10, 10);

    var renderer = MockRenderer.init(allocator, 80, 24);
    defer renderer.deinit();

    ch.draw(&renderer);
}

test "ChatHistory draw with completed selection" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.startSelection(0, 0);
    ch.updateSelection(20, 5);
    ch.endSelection();

    var renderer = MockRenderer.init(allocator, 80, 24);
    defer renderer.deinit();

    ch.draw(&renderer);
}

// ============================================================================
// Scroll Boundary Tests
// ============================================================================

test "ChatHistory scrollDown from zero" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scrollDown(100);
    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}

test "ChatHistory scrollUp large value" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scrollUp(10000);
    try std.testing.expectEqual(@as(u16, 10000), ch.scroll_offset);
}

test "ChatHistory scrollToBottom multiple times" {
    const allocator = std.testing.allocator;
    var ch = TestChatHistory.init(allocator);
    defer ch.deinit();

    ch.scroll_offset = 100;
    ch.scrollToBottom();
    ch.scrollToBottom();
    ch.scrollToBottom();

    try std.testing.expectEqual(@as(u16, 0), ch.scroll_offset);
}
