const std = @import("std");
const testing = std.testing;
const help_overlay_mod = @import("../ui/help_overlay.zig");

// =============================================================================
// Mock Renderer for DI Pattern
// =============================================================================

const MockColor = union(enum) {
    default,
    index: u8,
    rgb: struct { r: u8, g: u8, b: u8 },
};

const MockStyle = struct {
    fg: MockColor = .default,
    bg: MockColor = .default,
    bold: bool = false,
};

const DrawCall = struct {
    kind: enum { text, cell, fill },
    x: u16,
    y: u16,
    text: []const u8,
    style: MockStyle,
    w: u16 = 0,
    h: u16 = 0,
};

const MockRenderer = struct {
    w: u16 = 80,
    h: u16 = 24,
    draw_calls: std.ArrayList(DrawCall),
    allocator: std.mem.Allocator,

    pub const Style = MockStyle;
    pub const Color = MockColor;

    pub fn init(allocator: std.mem.Allocator, w: u16, h: u16) MockRenderer {
        return .{
            .w = w,
            .h = h,
            .draw_calls = std.ArrayList(DrawCall).init(allocator),
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *MockRenderer) void {
        self.draw_calls.deinit();
    }

    pub fn width(self: *const MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: *const MockRenderer) u16 {
        return self.h;
    }

    pub fn drawText(self: *const MockRenderer, x: u16, y: u16, text: []const u8, style: Style) void {
        self.draw_calls.append(.{
            .kind = .text,
            .x = x,
            .y = y,
            .text = text,
            .style = style,
        }) catch {};
    }

    pub fn drawCell(self: *const MockRenderer, x: u16, y: u16, char: []const u8, style: Style) void {
        self.draw_calls.append(.{
            .kind = .cell,
            .x = x,
            .y = y,
            .text = char,
            .style = style,
        }) catch {};
    }

    pub fn fill(self: *const MockRenderer, x: u16, y: u16, w: u16, h: u16, char: []const u8, style: Style) void {
        self.draw_calls.append(.{
            .kind = .fill,
            .x = x,
            .y = y,
            .text = char,
            .style = style,
            .w = w,
            .h = h,
        }) catch {};
    }
};

const TestHelpOverlay = help_overlay_mod.HelpOverlay(MockRenderer);

// =============================================================================
// Initialization Tests
// =============================================================================

test "init: creates hidden overlay" {
    const overlay = TestHelpOverlay.init();
    try testing.expect(!overlay.visible);
}

test "init: isVisible returns false initially" {
    const overlay = TestHelpOverlay.init();
    try testing.expect(!overlay.isVisible());
}

// =============================================================================
// Visibility Tests
// =============================================================================

test "show: makes overlay visible" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    try testing.expect(overlay.isVisible());
}

test "hide: makes overlay invisible" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    try testing.expect(overlay.isVisible());
    overlay.hide();
    try testing.expect(!overlay.isVisible());
}

test "hide: can be called when already hidden" {
    var overlay = TestHelpOverlay.init();
    overlay.hide();
    try testing.expect(!overlay.isVisible());
    overlay.hide();
    try testing.expect(!overlay.isVisible());
}

test "show: can be called when already visible" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    try testing.expect(overlay.isVisible());
    overlay.show();
    try testing.expect(overlay.isVisible());
}

test "visibility: toggle multiple times" {
    var overlay = TestHelpOverlay.init();
    for (0..10) |i| {
        if (i % 2 == 0) {
            overlay.show();
            try testing.expect(overlay.isVisible());
        } else {
            overlay.hide();
            try testing.expect(!overlay.isVisible());
        }
    }
}

test "isVisible: returns correct state after show" {
    var overlay = TestHelpOverlay.init();
    try testing.expect(!overlay.isVisible());
    overlay.show();
    try testing.expect(overlay.isVisible());
}

test "isVisible: returns correct state after hide" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    overlay.hide();
    try testing.expect(!overlay.isVisible());
}

// =============================================================================
// Draw Tests - Hidden State
// =============================================================================

test "draw: does nothing when hidden" {
    const overlay = TestHelpOverlay.init();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

test "draw: no draw calls when not visible" {
    var overlay = TestHelpOverlay.init();
    overlay.hide();
    var renderer = MockRenderer.init(testing.allocator, 100, 50);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

// =============================================================================
// Draw Tests - Visible State
// =============================================================================

test "draw: renders when visible and terminal is large enough" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expect(renderer.draw_calls.items.len > 0);
}

test "draw: draws background fill" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var found_fill = false;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .fill) {
            found_fill = true;
            break;
        }
    }
    try testing.expect(found_fill);
}

test "draw: draws border corners" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var corner_count: usize = 0;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .cell) {
            if (std.mem.eql(u8, call.text, "╭") or
                std.mem.eql(u8, call.text, "╮") or
                std.mem.eql(u8, call.text, "╰") or
                std.mem.eql(u8, call.text, "╯"))
            {
                corner_count += 1;
            }
        }
    }
    try testing.expectEqual(@as(usize, 4), corner_count);
}

test "draw: draws title" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var found_title = false;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .text and std.mem.indexOf(u8, call.text, "Ctrl+") != null) {
            found_title = true;
            break;
        }
    }
    try testing.expect(found_title);
}

test "draw: draws keybinding labels" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    const expected_keys = [_][]const u8{ "K", "U", "W", "Y", "Z", "A/E", "C", "D", "T" };
    var found_count: usize = 0;

    for (expected_keys) |key| {
        for (renderer.draw_calls.items) |call| {
            if (call.kind == .text and std.mem.eql(u8, call.text, key)) {
                found_count += 1;
                break;
            }
        }
    }
    try testing.expect(found_count >= 6);
}

test "draw: draws descriptions" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    const expected_descs = [_][]const u8{ "Kill to end", "Exit", "Undo", "Yank (paste)" };
    var found_count: usize = 0;

    for (expected_descs) |desc| {
        for (renderer.draw_calls.items) |call| {
            if (call.kind == .text and std.mem.eql(u8, call.text, desc)) {
                found_count += 1;
                break;
            }
        }
    }
    try testing.expect(found_count >= 2);
}

test "draw: draws horizontal borders" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var horiz_border_count: usize = 0;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .cell and std.mem.eql(u8, call.text, "─")) {
            horiz_border_count += 1;
        }
    }
    try testing.expect(horiz_border_count > 0);
}

test "draw: draws vertical borders" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var vert_border_count: usize = 0;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .cell and std.mem.eql(u8, call.text, "│")) {
            vert_border_count += 1;
        }
    }
    try testing.expect(vert_border_count > 0);
}

// =============================================================================
// Draw Tests - Terminal Size Edge Cases
// =============================================================================

test "draw: does not render when terminal too narrow" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 60, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

test "draw: does not render when terminal too short" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 10);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

test "draw: does not render when terminal both too small" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 30, 5);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

test "draw: does not render with zero dimensions" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 0, 0);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

test "draw: renders at minimum viable size" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 65, 18);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expect(renderer.draw_calls.items.len > 0);
}

test "draw: renders with large terminal" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 200, 60);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expect(renderer.draw_calls.items.len > 0);
}

// =============================================================================
// Draw Tests - Positioning
// =============================================================================

test "draw: overlay is centered horizontally" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 100, 30);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var fill_call: ?DrawCall = null;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .fill) {
            fill_call = call;
            break;
        }
    }

    try testing.expect(fill_call != null);
    const expected_x = (100 - 60) / 2;
    try testing.expectEqual(expected_x, fill_call.?.x);
}

test "draw: overlay is centered vertically" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 100, 30);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var fill_call: ?DrawCall = null;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .fill) {
            fill_call = call;
            break;
        }
    }

    try testing.expect(fill_call != null);
    const expected_y = 30 / 2 - 9 / 2;
    try testing.expectEqual(expected_y, fill_call.?.y);
}

// =============================================================================
// Draw Tests - Styling
// =============================================================================

test "draw: key bindings use bold style" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    var found_bold = false;
    for (renderer.draw_calls.items) |call| {
        if (call.kind == .text and call.style.bold) {
            found_bold = true;
            break;
        }
    }
    try testing.expect(found_bold);
}

test "draw: background uses indexed color" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    for (renderer.draw_calls.items) |call| {
        if (call.kind == .fill) {
            switch (call.style.bg) {
                .index => |idx| try testing.expectEqual(@as(u8, 236), idx),
                else => try testing.expect(false),
            }
            break;
        }
    }
}

// =============================================================================
// Struct Field Tests
// =============================================================================

test "HelpOverlay: has visible field" {
    const fields = @typeInfo(TestHelpOverlay).@"struct".fields;
    var found = false;
    for (fields) |field| {
        if (std.mem.eql(u8, field.name, "visible")) {
            found = true;
            break;
        }
    }
    try testing.expect(found);
}

test "HelpOverlay: has exactly 1 field" {
    const fields = @typeInfo(TestHelpOverlay).@"struct".fields;
    try testing.expectEqual(@as(usize, 1), fields.len);
}

test "HelpOverlay: visible field defaults to false" {
    const overlay = TestHelpOverlay{};
    try testing.expect(!overlay.visible);
}

// =============================================================================
// DefaultHelpOverlay Tests
// =============================================================================

test "DefaultHelpOverlay: type exists" {
    const default_type_info = @typeInfo(help_overlay_mod.DefaultHelpOverlay);
    try testing.expect(default_type_info == .@"struct");
}

test "DefaultHelpOverlay: can be initialized" {
    const overlay = help_overlay_mod.DefaultHelpOverlay.init();
    try testing.expect(!overlay.visible);
}

// =============================================================================
// Generic Type Tests
// =============================================================================

test "HelpOverlay: generic instantiation with different renderer" {
    const AnotherRenderer = struct {
        pub const Style = struct {
            fg: union(enum) { index: u8 } = .{ .index = 0 },
            bg: union(enum) { index: u8 } = .{ .index = 0 },
            bold: bool = false,
        };

        pub fn width(_: *const @This()) u16 {
            return 80;
        }
        pub fn height(_: *const @This()) u16 {
            return 24;
        }
        pub fn drawText(_: *const @This(), _: u16, _: u16, _: []const u8, _: Style) void {}
        pub fn drawCell(_: *const @This(), _: u16, _: u16, _: []const u8, _: Style) void {}
        pub fn fill(_: *const @This(), _: u16, _: u16, _: u16, _: u16, _: []const u8, _: Style) void {}
    };

    const AnotherHelpOverlay = help_overlay_mod.HelpOverlay(AnotherRenderer);
    const overlay = AnotherHelpOverlay.init();
    try testing.expect(!overlay.visible);
}

// =============================================================================
// Integration Tests
// =============================================================================

test "integration: show then draw then hide" {
    var overlay = TestHelpOverlay.init();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    try testing.expect(!overlay.isVisible());
    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);

    overlay.show();
    overlay.draw(&renderer);
    try testing.expect(renderer.draw_calls.items.len > 0);

    const calls_when_visible = renderer.draw_calls.items.len;
    overlay.hide();

    renderer.draw_calls.clearRetainingCapacity();
    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
    _ = calls_when_visible;
}

test "integration: multiple draw calls when visible" {
    var overlay = TestHelpOverlay.init();
    overlay.show();

    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);
    const first_count = renderer.draw_calls.items.len;

    renderer.draw_calls.clearRetainingCapacity();
    overlay.draw(&renderer);
    const second_count = renderer.draw_calls.items.len;

    try testing.expectEqual(first_count, second_count);
}

test "integration: draw with changing terminal size" {
    var overlay = TestHelpOverlay.init();
    overlay.show();

    var renderer1 = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer1.deinit();
    overlay.draw(&renderer1);
    try testing.expect(renderer1.draw_calls.items.len > 0);

    var renderer2 = MockRenderer.init(testing.allocator, 50, 10);
    defer renderer2.deinit();
    overlay.draw(&renderer2);
    try testing.expectEqual(@as(usize, 0), renderer2.draw_calls.items.len);

    var renderer3 = MockRenderer.init(testing.allocator, 100, 40);
    defer renderer3.deinit();
    overlay.draw(&renderer3);
    try testing.expect(renderer3.draw_calls.items.len > 0);
}

// =============================================================================
// Edge Cases
// =============================================================================

test "edge: rapid show/hide cycles" {
    var overlay = TestHelpOverlay.init();
    for (0..100) |_| {
        overlay.show();
        overlay.hide();
    }
    try testing.expect(!overlay.isVisible());
}

test "edge: pointer vs value receiver consistency" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    try testing.expect(overlay.isVisible());

    const ptr = &overlay;
    try testing.expect(ptr.isVisible());

    ptr.hide();
    try testing.expect(!overlay.isVisible());
}

test "edge: const overlay can check visibility" {
    const overlay = TestHelpOverlay.init();
    try testing.expect(!overlay.isVisible());
}

test "edge: const overlay can draw" {
    const overlay = TestHelpOverlay.init();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);
    try testing.expectEqual(@as(usize, 0), renderer.draw_calls.items.len);
}

// =============================================================================
// Color Constant Tests
// =============================================================================

test "colors: background color is dark gray (236)" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    overlay.draw(&renderer);

    for (renderer.draw_calls.items) |call| {
        if (call.kind == .fill) {
            switch (call.style.bg) {
                .index => |idx| try testing.expectEqual(@as(u8, 236), idx),
                else => {},
            }
            break;
        }
    }
}

// =============================================================================
// Memory Safety Tests
// =============================================================================

test "memory: no allocations in init" {
    _ = TestHelpOverlay.init();
}

test "memory: no allocations in show/hide" {
    var overlay = TestHelpOverlay.init();
    overlay.show();
    overlay.hide();
}

test "memory: draw does not leak with mock renderer" {
    var overlay = TestHelpOverlay.init();
    overlay.show();

    var renderer = MockRenderer.init(testing.allocator, 80, 24);
    defer renderer.deinit();

    for (0..10) |_| {
        overlay.draw(&renderer);
        renderer.draw_calls.clearRetainingCapacity();
    }
}
