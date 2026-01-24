const std = @import("std");
const renderer_mod = @import("../rendering/renderer.zig");

// ============================================================================
// Mock Backend for Testing
// ============================================================================

const MockCell = struct {
    grapheme: []const u8,
    width: u8,
};

const MockWindow = struct {
    width: u16 = 80,
    height: u16 = 24,
    cells: ?[]MockStoredCell = null,

    const MockStoredCell = struct {
        x: u16,
        y: u16,
        char: MockCell,
        style: MockStyle,
    };

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
        _ = self;
        const effective_width = if (opts.width == 0) self.width -| opts.x_off else opts.width;
        const effective_height = if (opts.height == 0) self.height -| opts.y_off else opts.height;
        return .{
            .width = effective_width,
            .height = effective_height,
            .cells = null,
        };
    }

    pub fn writeCell(_: MockWindow, _: u16, _: u16, _: struct {
        char: MockCell,
        style: MockStyle,
    }) void {}

    pub fn printSegment(_: MockWindow, segment: struct {
        text: []const u8,
        style: MockStyle,
    }, _: struct {}) struct { col: usize } {
        return .{ .col = segment.text.len };
    }

    pub fn clear(_: MockWindow) void {}
};

const MockColor = struct {
    rgb: ?struct { u8, u8, u8 } = null,
    indexed: ?u8 = null,
};

const MockStyle = struct {
    fg: ?MockColor = null,
    bg: ?MockColor = null,
    bold: bool = false,
    italic: bool = false,
    dim: bool = false,
    ul_style: ?enum { single, double } = null,
};

const MockKey = struct {
    codepoint: u21 = 0,
    mods: u8 = 0,
};

const MockMouse = struct {
    x: u16 = 0,
    y: u16 = 0,
    button: u8 = 0,
};

const MockWinsize = struct {
    rows: u16 = 24,
    cols: u16 = 80,
};

const MockBackend = struct {
    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Key = MockKey;
    pub const Mouse = MockMouse;
    pub const Winsize = MockWinsize;
};

const MockRenderer = renderer_mod.Renderer(MockBackend);

// ============================================================================
// Renderer Generic DI Pattern Tests
// ============================================================================

test "Renderer generic instantiation with MockBackend" {
    _ = MockRenderer;
}

test "Renderer re-exports Window type from Backend" {
    try std.testing.expect(MockRenderer.Window == MockBackend.Window);
}

test "Renderer re-exports Color type from Backend" {
    try std.testing.expect(MockRenderer.Color == MockBackend.Color);
}

test "Renderer re-exports Style type from Backend" {
    try std.testing.expect(MockRenderer.Style == MockBackend.Style);
}

test "Renderer re-exports Key type from Backend" {
    try std.testing.expect(MockRenderer.Key == MockBackend.Key);
}

test "Renderer re-exports Mouse type from Backend" {
    try std.testing.expect(MockRenderer.Mouse == MockBackend.Mouse);
}

test "Renderer re-exports Winsize type from Backend" {
    try std.testing.expect(MockRenderer.Winsize == MockBackend.Winsize);
}

// ============================================================================
// Renderer Init Tests
// ============================================================================

test "Renderer.init creates instance with window" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    try std.testing.expectEqual(@as(u16, 100), r.window.width);
    try std.testing.expectEqual(@as(u16, 50), r.window.height);
}

test "Renderer.init with default window dimensions" {
    const window = MockWindow{};
    const r = MockRenderer.init(window);
    try std.testing.expectEqual(@as(u16, 80), r.window.width);
    try std.testing.expectEqual(@as(u16, 24), r.window.height);
}

// ============================================================================
// Renderer Dimension Methods Tests
// ============================================================================

test "Renderer.width returns window width" {
    const window = MockWindow{ .width = 120, .height = 40 };
    const r = MockRenderer.init(window);
    try std.testing.expectEqual(@as(u16, 120), r.width());
}

test "Renderer.height returns window height" {
    const window = MockWindow{ .width = 120, .height = 40 };
    const r = MockRenderer.init(window);
    try std.testing.expectEqual(@as(u16, 40), r.height());
}

test "Renderer dimensions with edge case zero" {
    const window = MockWindow{ .width = 0, .height = 0 };
    const r = MockRenderer.init(window);
    try std.testing.expectEqual(@as(u16, 0), r.width());
    try std.testing.expectEqual(@as(u16, 0), r.height());
}

test "Renderer dimensions with max u16" {
    const window = MockWindow{ .width = std.math.maxInt(u16), .height = std.math.maxInt(u16) };
    const r = MockRenderer.init(window);
    try std.testing.expectEqual(std.math.maxInt(u16), r.width());
    try std.testing.expectEqual(std.math.maxInt(u16), r.height());
}

// ============================================================================
// Renderer subRegion Tests
// ============================================================================

test "Renderer.subRegion creates child renderer" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const sub = r.subRegion(10, 5, 30, 20);
    try std.testing.expectEqual(@as(u16, 30), sub.width());
    try std.testing.expectEqual(@as(u16, 20), sub.height());
}

test "Renderer.subRegion with zero offset" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const sub = r.subRegion(0, 0, 50, 25);
    try std.testing.expectEqual(@as(u16, 50), sub.width());
    try std.testing.expectEqual(@as(u16, 25), sub.height());
}

test "Renderer.subRegion with zero dimensions" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const sub = r.subRegion(10, 10, 0, 0);
    try std.testing.expectEqual(@as(u16, 0), sub.width());
    try std.testing.expectEqual(@as(u16, 0), sub.height());
}

// ============================================================================
// Renderer Drawing Methods (compile/call tests)
// ============================================================================

test "Renderer.drawText compiles and can be called" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{ .fg = .{ .indexed = 7 } };
    r.drawText(0, 0, "Hello", style);
}

test "Renderer.drawCell compiles and can be called" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{ .fg = .{ .indexed = 7 } };
    r.drawCell(5, 5, "X", style);
}

test "Renderer.fill compiles and can be called" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{ .bg = .{ .indexed = 0 } };
    r.fill(0, 0, 10, 10, " ", style);
}

test "Renderer.clear compiles and can be called" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    r.clear();
}

test "Renderer.printSegment compiles and returns column count" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{ .fg = .{ .indexed = 7 } };
    const cols = r.printSegment(0, 0, "Test text", style);
    try std.testing.expectEqual(@as(u16, 9), cols);
}

test "Renderer.subRegionWithBorder compiles and can be called" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const border_style = MockStyle{ .fg = .{ .indexed = 7 } };
    const bordered = r.subRegionWithBorder(5, 5, 40, 20, border_style);
    _ = bordered.width();
}

// ============================================================================
// VaxisBackend Type Exports Tests
// ============================================================================

test "VaxisBackend exports Window type" {
    _ = renderer_mod.VaxisBackend.Window;
}

test "VaxisBackend exports Color type" {
    _ = renderer_mod.VaxisBackend.Color;
}

test "VaxisBackend exports Style type" {
    _ = renderer_mod.VaxisBackend.Style;
}

test "VaxisBackend exports Key type" {
    _ = renderer_mod.VaxisBackend.Key;
}

test "VaxisBackend exports Mouse type" {
    _ = renderer_mod.VaxisBackend.Mouse;
}

test "VaxisBackend exports Winsize type" {
    _ = renderer_mod.VaxisBackend.Winsize;
}

// ============================================================================
// Renderer(VaxisBackend) Tests
// ============================================================================

test "Renderer(VaxisBackend) can be instantiated" {
    const VaxisRenderer = renderer_mod.Renderer(renderer_mod.VaxisBackend);
    _ = VaxisRenderer;
}

test "Renderer(VaxisBackend) has same type exports as VaxisBackend" {
    const VaxisRenderer = renderer_mod.Renderer(renderer_mod.VaxisBackend);
    try std.testing.expect(VaxisRenderer.Window == renderer_mod.VaxisBackend.Window);
    try std.testing.expect(VaxisRenderer.Color == renderer_mod.VaxisBackend.Color);
    try std.testing.expect(VaxisRenderer.Style == renderer_mod.VaxisBackend.Style);
    try std.testing.expect(VaxisRenderer.Key == renderer_mod.VaxisBackend.Key);
    try std.testing.expect(VaxisRenderer.Mouse == renderer_mod.VaxisBackend.Mouse);
    try std.testing.expect(VaxisRenderer.Winsize == renderer_mod.VaxisBackend.Winsize);
}

// ============================================================================
// Backend Interface Contract Tests
// ============================================================================

test "MockBackend satisfies Renderer Backend interface" {
    const R = renderer_mod.Renderer(MockBackend);
    _ = R.Window;
    _ = R.Color;
    _ = R.Style;
    _ = R.Key;
    _ = R.Mouse;
    _ = R.Winsize;
}

test "Renderer generic can be instantiated with different backends" {
    const AnotherBackend = struct {
        pub const Window = struct {
            width: u16 = 0,
            height: u16 = 0,
            pub fn child(_: @This(), _: anytype) @This() {
                return .{};
            }
            pub fn writeCell(_: @This(), _: u16, _: u16, _: anytype) void {}
            pub fn printSegment(_: @This(), _: anytype, _: anytype) struct { col: usize } {
                return .{ .col = 0 };
            }
            pub fn clear(_: @This()) void {}
        };
        pub const Color = u32;
        pub const Style = struct { color: u32 = 0 };
        pub const Key = u8;
        pub const Mouse = u16;
        pub const Winsize = struct { w: u16, h: u16 };
    };

    const AnotherRenderer = renderer_mod.Renderer(AnotherBackend);
    try std.testing.expect(AnotherRenderer.Color == u32);
    try std.testing.expect(AnotherRenderer.Key == u8);
}

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

test "Renderer.drawText with empty string" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{};
    r.drawText(0, 0, "", style);
}

test "Renderer.drawText at boundary positions" {
    const window = MockWindow{ .width = 80, .height = 24 };
    const r = MockRenderer.init(window);
    const style = MockStyle{};
    r.drawText(79, 23, "X", style);
}

test "Renderer.fill with 1x1 area" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{};
    r.fill(50, 25, 1, 1, "#", style);
}

test "Renderer.printSegment with empty string returns 0" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const style = MockStyle{};
    const cols = r.printSegment(0, 0, "", style);
    try std.testing.expectEqual(@as(u16, 0), cols);
}

test "Nested subRegion calls" {
    const window = MockWindow{ .width = 100, .height = 50 };
    const r = MockRenderer.init(window);
    const sub1 = r.subRegion(10, 10, 50, 30);
    const sub2 = sub1.subRegion(5, 5, 20, 10);
    try std.testing.expectEqual(@as(u16, 20), sub2.width());
    try std.testing.expectEqual(@as(u16, 10), sub2.height());
}
