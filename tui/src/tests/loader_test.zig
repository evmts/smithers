const std = @import("std");
const loader = @import("../components/loader.zig");

// Mock renderer for draw tests
const MockRenderer = struct {
    const Style = struct {
        fg: ?struct { index: u8 } = null,
    };

    draw_calls: std.ArrayList(DrawCall),
    win_width: u16 = 80,

    const DrawCall = struct {
        x: u16,
        y: u16,
        text: []const u8,
        fg_color: ?u8,
    };

    fn init(allocator: std.mem.Allocator) MockRenderer {
        return .{
            .draw_calls = std.ArrayList(DrawCall).init(allocator),
        };
    }

    fn deinit(self: *MockRenderer) void {
        self.draw_calls.deinit();
    }

    fn reset(self: *MockRenderer) void {
        self.draw_calls.clearRetainingCapacity();
    }

    pub fn width(self: *const MockRenderer) u16 {
        return self.win_width;
    }

    pub fn drawText(self: *MockRenderer, x: u16, y: u16, text: []const u8, style: Style) void {
        self.draw_calls.append(.{
            .x = x,
            .y = y,
            .text = text,
            .fg_color = if (style.fg) |fg| fg.index else null,
        }) catch {};
    }
};

const TestLoader = loader.Loader(*MockRenderer);

// === SPINNER_FRAMES tests ===

test "SPINNER_FRAMES has 10 frames" {
    try std.testing.expectEqual(@as(usize, 10), loader.SPINNER_FRAMES.len);
}

test "SPINNER_FRAMES are braille characters" {
    for (loader.SPINNER_FRAMES) |frame| {
        try std.testing.expect(frame.len > 0);
        // Braille chars are 3 bytes in UTF-8 (U+2800 block)
        try std.testing.expectEqual(@as(usize, 3), frame.len);
    }
}

test "SPINNER_FRAMES first frame is ⠋" {
    try std.testing.expectEqualStrings("⠋", loader.SPINNER_FRAMES[0]);
}

test "SPINNER_FRAMES last frame is ⠏" {
    try std.testing.expectEqualStrings("⠏", loader.SPINNER_FRAMES[9]);
}

// === FRAME_INTERVAL_MS tests ===

test "FRAME_INTERVAL_MS is 80" {
    try std.testing.expectEqual(@as(i64, 80), loader.FRAME_INTERVAL_MS);
}

// === LoaderStyle tests ===

test "LoaderStyle default values" {
    const style: loader.LoaderStyle = .{};
    try std.testing.expectEqual(@as(?[]const u8, null), style.label);
    try std.testing.expectEqual(loader.LoaderStyle.label_position.right, style.label_position);
    try std.testing.expectEqual(@as(u8, 114), style.color);
}

test "LoaderStyle custom label" {
    const style: loader.LoaderStyle = .{ .label = "Loading..." };
    try std.testing.expectEqualStrings("Loading...", style.label.?);
}

test "LoaderStyle left position" {
    const style: loader.LoaderStyle = .{ .label_position = .left };
    try std.testing.expectEqual(loader.LoaderStyle.label_position.left, style.label_position);
}

test "LoaderStyle custom color" {
    const style: loader.LoaderStyle = .{ .color = 200 };
    try std.testing.expectEqual(@as(u8, 200), style.color);
}

// === Loader init tests ===

test "Loader init starts at frame 0" {
    var l = TestLoader.init();
    try std.testing.expectEqual(@as(u8, 0), l.frame_index);
}

test "Loader init is running by default" {
    var l = TestLoader.init();
    try std.testing.expect(l.isRunning());
}

test "Loader init has default style" {
    var l = TestLoader.init();
    try std.testing.expectEqual(@as(?[]const u8, null), l.style.label);
}

test "Loader initWithLabel sets label" {
    var l = TestLoader.initWithLabel("Processing...");
    try std.testing.expectEqualStrings("Processing...", l.style.label.?);
}

test "Loader initWithLabel starts running" {
    var l = TestLoader.initWithLabel("Test");
    try std.testing.expect(l.isRunning());
}

// === setLabel tests ===

test "setLabel changes label" {
    var l = TestLoader.init();
    l.setLabel("New Label");
    try std.testing.expectEqualStrings("New Label", l.style.label.?);
}

test "setLabel can clear label" {
    var l = TestLoader.initWithLabel("Initial");
    l.setLabel(null);
    try std.testing.expectEqual(@as(?[]const u8, null), l.style.label);
}

// === setRunning / isRunning tests ===

test "setRunning stops loader" {
    var l = TestLoader.init();
    l.setRunning(false);
    try std.testing.expect(!l.isRunning());
}

test "setRunning can restart loader" {
    var l = TestLoader.init();
    l.setRunning(false);
    l.setRunning(true);
    try std.testing.expect(l.isRunning());
}

// === advance tests ===

test "advance increments frame_index" {
    var l = TestLoader.init();
    try std.testing.expectEqual(@as(u8, 0), l.frame_index);
    l.advance();
    try std.testing.expectEqual(@as(u8, 1), l.frame_index);
}

test "advance wraps at frame count" {
    var l = TestLoader.init();
    l.frame_index = 9;
    l.advance();
    try std.testing.expectEqual(@as(u8, 0), l.frame_index);
}

test "advance through full cycle" {
    var l = TestLoader.init();
    var i: u8 = 0;
    while (i < 10) : (i += 1) {
        try std.testing.expectEqual(i, l.frame_index);
        l.advance();
    }
    try std.testing.expectEqual(@as(u8, 0), l.frame_index);
}

test "advance multiple cycles" {
    var l = TestLoader.init();
    var i: u8 = 0;
    while (i < 25) : (i += 1) {
        l.advance();
    }
    try std.testing.expectEqual(@as(u8, 5), l.frame_index);
}

// === currentFrame tests ===

test "currentFrame returns correct frame" {
    var l = TestLoader.init();
    try std.testing.expectEqualStrings("⠋", l.currentFrame());
}

test "currentFrame after advance" {
    var l = TestLoader.init();
    l.advance();
    try std.testing.expectEqualStrings("⠙", l.currentFrame());
}

test "currentFrame at each position" {
    var l = TestLoader.init();
    var i: u8 = 0;
    while (i < 10) : (i += 1) {
        try std.testing.expectEqualStrings(loader.SPINNER_FRAMES[i], l.currentFrame());
        l.advance();
    }
}

// === width tests ===

test "width without label is 2" {
    var l = TestLoader.init();
    try std.testing.expectEqual(@as(u16, 2), l.width());
}

test "width with label includes label length" {
    var l = TestLoader.initWithLabel("Hello");
    // spinner_width(2) + separator(1) + label_len(5) = 8
    try std.testing.expectEqual(@as(u16, 8), l.width());
}

test "width with empty label" {
    var l = TestLoader.initWithLabel("");
    try std.testing.expectEqual(@as(u16, 3), l.width());
}

test "width with long label" {
    var l = TestLoader.initWithLabel("This is a very long label for testing");
    try std.testing.expectEqual(@as(u16, 2 + 1 + 38), l.width());
}

// === tick tests (behavior, not timing) ===

test "tick returns false when not running" {
    var l = TestLoader.init();
    l.setRunning(false);
    const result = l.tick();
    try std.testing.expect(!result);
}

test "tick does not advance when not running" {
    var l = TestLoader.init();
    l.setRunning(false);
    const initial_frame = l.frame_index;
    _ = l.tick();
    try std.testing.expectEqual(initial_frame, l.frame_index);
}

// === draw tests ===

test "draw without label renders spinner only" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    defer renderer.deinit();

    var l = TestLoader.init();
    l.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 1), renderer.draw_calls.items.len);
    try std.testing.expectEqual(@as(u16, 0), renderer.draw_calls.items[0].x);
    try std.testing.expectEqual(@as(u16, 0), renderer.draw_calls.items[0].y);
    try std.testing.expectEqualStrings("⠋", renderer.draw_calls.items[0].text);
    try std.testing.expectEqual(@as(?u8, 114), renderer.draw_calls.items[0].fg_color);
}

test "draw with label right position" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    defer renderer.deinit();

    var l = TestLoader.initWithLabel("Loading");
    l.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 2), renderer.draw_calls.items.len);
    // First: spinner at x=0
    try std.testing.expectEqual(@as(u16, 0), renderer.draw_calls.items[0].x);
    try std.testing.expectEqualStrings("⠋", renderer.draw_calls.items[0].text);
    // Second: label at x=2
    try std.testing.expectEqual(@as(u16, 2), renderer.draw_calls.items[1].x);
    try std.testing.expectEqualStrings("Loading", renderer.draw_calls.items[1].text);
}

test "draw with label left position" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    defer renderer.deinit();

    var l = TestLoader.init();
    l.style.label = "Test";
    l.style.label_position = .left;
    l.draw(&renderer);

    try std.testing.expectEqual(@as(usize, 2), renderer.draw_calls.items.len);
    // First: label at x=0
    try std.testing.expectEqual(@as(u16, 0), renderer.draw_calls.items[0].x);
    try std.testing.expectEqualStrings("Test", renderer.draw_calls.items[0].text);
    // Second: spinner at x=5 (4 + 1 space)
    try std.testing.expectEqual(@as(u16, 5), renderer.draw_calls.items[1].x);
    try std.testing.expectEqualStrings("⠋", renderer.draw_calls.items[1].text);
}

test "draw with custom color" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    defer renderer.deinit();

    var l = TestLoader.init();
    l.style.color = 200;
    l.draw(&renderer);

    try std.testing.expectEqual(@as(?u8, 200), renderer.draw_calls.items[0].fg_color);
}

test "draw after advance shows next frame" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    defer renderer.deinit();

    var l = TestLoader.init();
    l.advance();
    l.draw(&renderer);

    try std.testing.expectEqualStrings("⠙", renderer.draw_calls.items[0].text);
}

test "draw truncates long label to window width" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    renderer.win_width = 10;
    defer renderer.deinit();

    var l = TestLoader.initWithLabel("This is a very long label");
    l.draw(&renderer);

    // Label should be truncated: win_width(10) - x(2) = 8 chars max
    try std.testing.expectEqual(@as(usize, 8), renderer.draw_calls.items[1].text.len);
}

test "draw truncates label left position to window width" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    renderer.win_width = 10;
    defer renderer.deinit();

    var l = TestLoader.initWithLabel("This is a very long label");
    l.style.label_position = .left;
    l.draw(&renderer);

    // Label should be truncated: win_width(10) - 3 (spinner + space) = 7 chars max
    try std.testing.expectEqual(@as(usize, 7), renderer.draw_calls.items[0].text.len);
}

// === FRAME_COUNT constant test ===

test "FRAME_COUNT matches SPINNER_FRAMES length" {
    const l = TestLoader.init();
    _ = l;
    // FRAME_COUNT is comptime, verify it equals SPINNER_FRAMES.len
    try std.testing.expectEqual(@as(u8, 10), TestLoader.FRAME_COUNT);
}

// === Edge cases ===

test "frame_index stays in bounds after many advances" {
    var l = TestLoader.init();
    var i: u32 = 0;
    while (i < 1000) : (i += 1) {
        l.advance();
        try std.testing.expect(l.frame_index < 10);
    }
}

test "draw with zero width window" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();

    var renderer = MockRenderer.init(arena.allocator());
    renderer.win_width = 0;
    defer renderer.deinit();

    var l = TestLoader.initWithLabel("Test");
    // Should not crash
    l.draw(&renderer);
}

test "multiple loaders are independent" {
    var l1 = TestLoader.init();
    var l2 = TestLoader.init();

    l1.advance();
    l1.advance();

    try std.testing.expectEqual(@as(u8, 2), l1.frame_index);
    try std.testing.expectEqual(@as(u8, 0), l2.frame_index);

    l1.setRunning(false);
    try std.testing.expect(!l1.isRunning());
    try std.testing.expect(l2.isRunning());
}
