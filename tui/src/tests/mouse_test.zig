const std = @import("std");
const mouse_mod = @import("../keys/mouse.zig");
const Layout = @import("../layout.zig").Layout;
const chat_history_mod = @import("../components/chat_history.zig");
const selection_mod = @import("../selection.zig");
const clipboard_mod = @import("../clipboard.zig");

// ============================================================================
// Mock Types for Testing
// ============================================================================

const MockCell = struct {
    char: struct {
        grapheme: []const u8,
        width: u8,
    },
    style: MockStyle,
};

const MockStyle = struct {
    fg: ?MockColor = null,
    bg: ?MockColor = null,
    bold: bool = false,
    italic: bool = false,

    pub const Color = union(enum) {
        index: u8,
        rgb: struct { r: u8, g: u8, b: u8 },
    };
};

const MockColor = MockStyle.Color;

const MockWindow = struct {
    w: u16 = 80,
    h: u16 = 24,

    pub fn child(self: MockWindow, _: anytype) MockWindow {
        return self;
    }

    pub fn writeCell(_: MockWindow, _: u16, _: u16, _: anytype) void {}

    pub fn printSegment(_: MockWindow, _: anytype, _: anytype) struct { col: u16, overflow: bool } {
        return .{ .col = 0, .overflow = false };
    }

    pub fn clear(_: MockWindow) void {}

    pub fn readCell(_: MockWindow, _: u16, _: u16) ?MockCell {
        return MockCell{
            .char = .{ .grapheme = "x", .width = 1 },
            .style = .{},
        };
    }

    pub const width: u16 = 80;
    pub const height: u16 = 24;
};

const MockMouse = struct {
    col: i16,
    row: i16,
    button: Button,
    type: Type,

    pub const Button = enum {
        left,
        right,
        middle,
        wheel_up,
        wheel_down,
        none,
    };

    pub const Type = enum {
        press,
        release,
        drag,
        motion,
    };
};

const MockRenderer = struct {
    window: MockWindow = .{},

    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Mouse = MockMouse;

    pub fn init(window: MockWindow) MockRenderer {
        return .{ .window = window };
    }

    pub fn width(self: MockRenderer) u16 {
        return self.window.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.window.h;
    }

    pub fn subRegion(_: MockRenderer, _: u16, _: u16, _: u16, _: u16) MockRenderer {
        return .{};
    }

    pub fn drawText(_: MockRenderer, _: u16, _: u16, _: []const u8, _: MockStyle) void {}

    pub fn drawCell(_: MockRenderer, _: u16, _: u16, _: []const u8, _: MockStyle) void {}

    pub fn fill(_: MockRenderer, _: u16, _: u16, _: u16, _: u16, _: []const u8, _: MockStyle) void {}
};

const TestMouseHandler = mouse_mod.MouseHandler(MockRenderer);
const TestChatHistory = chat_history_mod.ChatHistory(MockRenderer);

// ============================================================================
// MouseHandler Initialization Tests
// ============================================================================

test "MouseHandler init stores allocator" {
    const allocator = std.testing.allocator;
    const handler = TestMouseHandler.init(allocator);
    try std.testing.expectEqual(allocator, handler.alloc);
}

test "MouseHandler init with different allocators" {
    var buffer: [1024]u8 = undefined;
    var fba = std.heap.FixedBufferAllocator.init(&buffer);
    const fba_allocator = fba.allocator();

    const handler = TestMouseHandler.init(fba_allocator);
    try std.testing.expectEqual(fba_allocator, handler.alloc);
}

// ============================================================================
// Scroll Wheel Tests
// ============================================================================

test "handleMouse wheel_up scrolls up by 3 lines" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const initial_offset = chat.scroll_offset;

    const mouse = MockMouse{
        .col = 40,
        .row = 12,
        .button = .wheel_up,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expectEqual(initial_offset + 3, chat.scroll_offset);
}

test "handleMouse wheel_down scrolls down by 3 lines" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = 10;

    const mouse = MockMouse{
        .col = 40,
        .row = 12,
        .button = .wheel_down,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expectEqual(@as(u16, 7), chat.scroll_offset);
}

test "handleMouse wheel_up multiple times accumulates scroll" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 0,
        .row = 0,
        .button = .wheel_up,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);
    handler.handleMouse(mouse, &chat);
    handler.handleMouse(mouse, &chat);

    try std.testing.expectEqual(@as(u16, 9), chat.scroll_offset);
}

test "handleMouse wheel_down saturates at zero" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = 2;

    const mouse = MockMouse{
        .col = 0,
        .row = 0,
        .button = .wheel_down,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

test "handleMouse wheel at different positions" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);

    const positions = [_]struct { col: i16, row: i16 }{
        .{ .col = 0, .row = 0 },
        .{ .col = 79, .row = 0 },
        .{ .col = 0, .row = 23 },
        .{ .col = 79, .row = 23 },
        .{ .col = 40, .row = 12 },
    };

    for (positions) |pos| {
        var chat = TestChatHistory.init(allocator);
        defer chat.deinit();
        const mouse = MockMouse{
            .col = pos.col,
            .row = pos.row,
            .button = .wheel_up,
            .type = .press,
        };
        handler.handleMouse(mouse, &chat);
        try std.testing.expectEqual(@as(u16, 3), chat.scroll_offset);
    }
}

// ============================================================================
// Left Button Press (Selection Start) Tests
// ============================================================================

test "handleMouse left press starts selection" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 20,
        .row = 10,
        .button = .left,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse left press with negative col clamps to zero" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = -5,
        .row = 10,
        .button = .left,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse left press with row above header clamps to zero" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 10,
        .row = 0,
        .button = .left,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

// ============================================================================
// Left Button Drag (Selection Update) Tests
// ============================================================================

test "handleMouse left drag updates selection" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 10,
        .row = 5,
        .button = .left,
        .type = .press,
    }, &chat);

    const mouse = MockMouse{
        .col = 30,
        .row = 15,
        .button = .left,
        .type = .drag,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse left drag with negative row clamps to zero" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 10,
        .row = 5,
        .button = .left,
        .type = .press,
    }, &chat);

    const mouse = MockMouse{
        .col = 10,
        .row = -10,
        .button = .left,
        .type = .drag,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse left drag sequence" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 10,
        .row = 5,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());

    handler.handleMouse(.{
        .col = 20,
        .row = 10,
        .button = .left,
        .type = .drag,
    }, &chat);

    try std.testing.expect(chat.isSelecting());

    handler.handleMouse(.{
        .col = 30,
        .row = 15,
        .button = .left,
        .type = .drag,
    }, &chat);

    try std.testing.expect(chat.isSelecting());
}

// ============================================================================
// Left Button Release (Selection End) Tests
// ============================================================================

test "handleMouse left release ends selection" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 10,
        .row = 5,
        .button = .left,
        .type = .press,
    }, &chat);

    handler.handleMouse(.{
        .col = 25,
        .row = 12,
        .button = .left,
        .type = .release,
    }, &chat);

    try std.testing.expect(!chat.isSelecting());
}

test "handleMouse complete selection workflow" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 5,
        .row = 3,
        .button = .left,
        .type = .press,
    }, &chat);
    try std.testing.expect(chat.isSelecting());

    handler.handleMouse(.{
        .col = 15,
        .row = 5,
        .button = .left,
        .type = .drag,
    }, &chat);
    try std.testing.expect(chat.isSelecting());

    handler.handleMouse(.{
        .col = 20,
        .row = 7,
        .button = .left,
        .type = .release,
    }, &chat);
    try std.testing.expect(!chat.isSelecting());
}

// ============================================================================
// Non-handled Button Tests
// ============================================================================

test "handleMouse right button does nothing" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 20,
        .row = 10,
        .button = .right,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(!chat.isSelecting());
    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

test "handleMouse middle button does nothing" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 20,
        .row = 10,
        .button = .middle,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(!chat.isSelecting());
    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

test "handleMouse none button does nothing" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 20,
        .row = 10,
        .button = .none,
        .type = .motion,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(!chat.isSelecting());
    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

// ============================================================================
// Coordinate Edge Cases
// ============================================================================

test "handleMouse maximum coordinate values" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = std.math.maxInt(i16),
        .row = std.math.maxInt(i16),
        .button = .left,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse minimum coordinate values" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = std.math.minInt(i16),
        .row = std.math.minInt(i16),
        .button = .left,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse zero coordinates" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    const mouse = MockMouse{
        .col = 0,
        .row = 0,
        .button = .left,
        .type = .press,
    };

    handler.handleMouse(mouse, &chat);

    try std.testing.expect(chat.isSelecting());
}

// ============================================================================
// Mixed Event Type Tests
// ============================================================================

test "handleMouse alternating scroll and click" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 0,
        .row = 0,
        .button = .wheel_up,
        .type = .press,
    }, &chat);
    try std.testing.expectEqual(@as(u16, 3), chat.scroll_offset);

    handler.handleMouse(.{
        .col = 10,
        .row = 5,
        .button = .left,
        .type = .press,
    }, &chat);
    try std.testing.expect(chat.isSelecting());

    handler.handleMouse(.{
        .col = 0,
        .row = 0,
        .button = .wheel_down,
        .type = .press,
    }, &chat);
    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

test "handleMouse rapid scroll events" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    var i: u16 = 0;
    while (i < 100) : (i += 1) {
        handler.handleMouse(.{
            .col = 0,
            .row = 0,
            .button = .wheel_up,
            .type = .press,
        }, &chat);
    }

    try std.testing.expectEqual(@as(u16, 300), chat.scroll_offset);
}

// ============================================================================
// DefaultMouseHandler Type Test
// ============================================================================

test "DefaultMouseHandler type exists" {
    const default_type_info = @typeInfo(mouse_mod.DefaultMouseHandler);
    try std.testing.expect(default_type_info == .@"struct");
}

test "DefaultMouseHandler has alloc field" {
    const fields = @typeInfo(mouse_mod.DefaultMouseHandler).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "alloc")) {
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

// ============================================================================
// Struct Field Tests
// ============================================================================

test "MouseHandler has exactly 1 field" {
    const fields = @typeInfo(TestMouseHandler).@"struct".fields;
    try std.testing.expectEqual(@as(usize, 1), fields.len);
}

test "MouseHandler has init function" {
    try std.testing.expect(@hasDecl(TestMouseHandler, "init"));
}

test "MouseHandler has handleMouse function" {
    try std.testing.expect(@hasDecl(TestMouseHandler, "handleMouse"));
}

// ============================================================================
// Memory Safety Tests
// ============================================================================

test "handleMouse with testing allocator detects leaks" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 0,
        .row = 0,
        .button = .wheel_up,
        .type = .press,
    }, &chat);

    handler.handleMouse(.{
        .col = 10,
        .row = 10,
        .button = .left,
        .type = .press,
    }, &chat);

    handler.handleMouse(.{
        .col = 20,
        .row = 15,
        .button = .left,
        .type = .drag,
    }, &chat);

    handler.handleMouse(.{
        .col = 25,
        .row = 18,
        .button = .left,
        .type = .release,
    }, &chat);
}

test "handleMouse multiple handlers do not interfere" {
    const allocator = std.testing.allocator;
    var handler1 = TestMouseHandler.init(allocator);
    var handler2 = TestMouseHandler.init(allocator);
    var chat1 = TestChatHistory.init(allocator);
    defer chat1.deinit();
    var chat2 = TestChatHistory.init(allocator);
    defer chat2.deinit();

    handler1.handleMouse(.{
        .col = 0,
        .row = 0,
        .button = .wheel_up,
        .type = .press,
    }, &chat1);

    handler2.handleMouse(.{
        .col = 10,
        .row = 5,
        .button = .left,
        .type = .press,
    }, &chat2);

    try std.testing.expectEqual(@as(u16, 3), chat1.scroll_offset);
    try std.testing.expect(!chat1.isSelecting());

    try std.testing.expectEqual(@as(u16, 0), chat2.scroll_offset);
    try std.testing.expect(chat2.isSelecting());
}

// ============================================================================
// Header Height Offset Tests
// ============================================================================

test "Layout HEADER_HEIGHT constant is accessible" {
    try std.testing.expectEqual(@as(u16, 1), Layout.HEADER_HEIGHT);
}

test "handleMouse row adjustment for header" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 10,
        .row = Layout.HEADER_HEIGHT,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "handleMouse row below header" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 10,
        .row = Layout.HEADER_HEIGHT + 5,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());
}

// ============================================================================
// Selection State via ChatHistory API
// ============================================================================

test "ChatHistory selection starts inactive" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    try std.testing.expect(!chat.isSelecting());
    try std.testing.expect(!chat.hasSelection());
}

test "ChatHistory startSelection activates selection" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.startSelection(10, 5);

    try std.testing.expect(chat.isSelecting());
}

test "ChatHistory updateSelection during active selection" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.startSelection(10, 5);
    chat.updateSelection(20, 10);

    try std.testing.expect(chat.isSelecting());
}

test "ChatHistory endSelection stops selecting" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.startSelection(10, 5);
    chat.updateSelection(20, 10);
    chat.endSelection();

    try std.testing.expect(!chat.isSelecting());
}

test "ChatHistory clearSelection resets state" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.startSelection(10, 5);
    chat.updateSelection(20, 10);
    chat.clearSelection();

    try std.testing.expect(!chat.isSelecting());
    try std.testing.expect(!chat.hasSelection());
}

// ============================================================================
// Scroll API Tests
// ============================================================================

test "ChatHistory scrollUp increases offset" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scrollUp(5);

    try std.testing.expectEqual(@as(u16, 5), chat.scroll_offset);
}

test "ChatHistory scrollDown decreases offset" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = 10;
    chat.scrollDown(3);

    try std.testing.expectEqual(@as(u16, 7), chat.scroll_offset);
}

test "ChatHistory scrollToBottom resets offset" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = 50;
    chat.scrollToBottom();

    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

test "ChatHistory scrollDown saturates at zero" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = 2;
    chat.scrollDown(10);

    try std.testing.expectEqual(@as(u16, 0), chat.scroll_offset);
}

test "ChatHistory scrollUp saturates" {
    const allocator = std.testing.allocator;
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = std.math.maxInt(u16) - 5;
    chat.scrollUp(10);

    try std.testing.expectEqual(std.math.maxInt(u16), chat.scroll_offset);
}

// ============================================================================
// Button Type Coverage Tests
// ============================================================================

test "all mouse button types are handled without crash" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);

    const buttons = [_]MockMouse.Button{
        .left,
        .right,
        .middle,
        .wheel_up,
        .wheel_down,
        .none,
    };

    for (buttons) |button| {
        var chat = TestChatHistory.init(allocator);
        defer chat.deinit();
        handler.handleMouse(.{
            .col = 10,
            .row = 10,
            .button = button,
            .type = .press,
        }, &chat);
    }
}

test "all mouse event types are handled without crash" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);

    const event_types = [_]MockMouse.Type{
        .press,
        .release,
        .drag,
        .motion,
    };

    for (event_types) |event_type| {
        var chat = TestChatHistory.init(allocator);
        defer chat.deinit();
        handler.handleMouse(.{
            .col = 10,
            .row = 10,
            .button = .left,
            .type = event_type,
        }, &chat);
    }
}

// ============================================================================
// Selection with Scroll Offset Tests
// ============================================================================

test "selection with non-zero scroll offset" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    chat.scroll_offset = 50;

    handler.handleMouse(.{
        .col = 5,
        .row = 10,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());
    try std.testing.expectEqual(@as(u16, 50), chat.scroll_offset);
}

test "scroll during selection" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 5,
        .row = 10,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());

    handler.handleMouse(.{
        .col = 0,
        .row = 0,
        .button = .wheel_up,
        .type = .press,
    }, &chat);

    try std.testing.expectEqual(@as(u16, 3), chat.scroll_offset);
    try std.testing.expect(chat.isSelecting());
}

// ============================================================================
// Boundary Row Tests
// ============================================================================

test "mouse at row equal to header height" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 0,
        .row = 1,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());
}

test "mouse at row just below header height" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{
        .col = 0,
        .row = 2,
        .button = .left,
        .type = .press,
    }, &chat);

    try std.testing.expect(chat.isSelecting());
}

// ============================================================================
// Multiple Selection Sessions
// ============================================================================

test "multiple selection sessions" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{ .col = 5, .row = 5, .button = .left, .type = .press }, &chat);
    handler.handleMouse(.{ .col = 10, .row = 10, .button = .left, .type = .release }, &chat);
    try std.testing.expect(!chat.isSelecting());

    handler.handleMouse(.{ .col = 20, .row = 8, .button = .left, .type = .press }, &chat);
    try std.testing.expect(chat.isSelecting());
    handler.handleMouse(.{ .col = 30, .row = 15, .button = .left, .type = .release }, &chat);
    try std.testing.expect(!chat.isSelecting());
}

test "selection cleared then new selection" {
    const allocator = std.testing.allocator;
    var handler = TestMouseHandler.init(allocator);
    var chat = TestChatHistory.init(allocator);
    defer chat.deinit();

    handler.handleMouse(.{ .col = 5, .row = 5, .button = .left, .type = .press }, &chat);
    handler.handleMouse(.{ .col = 10, .row = 10, .button = .left, .type = .drag }, &chat);
    handler.handleMouse(.{ .col = 15, .row = 15, .button = .left, .type = .release }, &chat);

    chat.clearSelection();
    try std.testing.expect(!chat.hasSelection());

    handler.handleMouse(.{ .col = 1, .row = 1, .button = .left, .type = .press }, &chat);
    try std.testing.expect(chat.isSelecting());
}
