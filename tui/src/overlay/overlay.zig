// Overlay System for smithers TUI
// Stack-based overlays with vaxis rendering, positioning, and focus management

const std = @import("std");
const renderer_mod = @import("../rendering/renderer.zig");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

// ============ Size Value ============

pub const SizeValue = union(enum) {
    absolute: u16,
    percent: u8, // 0-100

    pub fn resolve(self: SizeValue, reference: u16) u16 {
        return switch (self) {
            .absolute => |v| v,
            .percent => |p| @intCast(@as(u32, reference) * @as(u32, p) / 100),
        };
    }
};

// ============ Anchor Enum ============

pub const Anchor = enum {
    center,
    top_left,
    top_right,
    bottom_left,
    bottom_right,
    top_center,
    bottom_center,
    left_center,
    right_center,
    cursor, // Position at cursor location (requires cursor_x, cursor_y in options)

    pub fn resolveRow(self: Anchor, height: u16, avail_height: u16, margin_top: u16) u16 {
        return switch (self) {
            .top_left, .top_center, .top_right => margin_top,
            .bottom_left, .bottom_center, .bottom_right => if (avail_height > height)
                margin_top + avail_height - height
            else
                margin_top,
            .left_center, .center, .right_center => if (avail_height > height)
                margin_top + (avail_height - height) / 2
            else
                margin_top,
            .cursor => margin_top, // Handled separately with cursor_y
        };
    }

    pub fn resolveCol(self: Anchor, overlay_width: u16, avail_width: u16, margin_left: u16) u16 {
        return switch (self) {
            .top_left, .left_center, .bottom_left => margin_left,
            .top_right, .right_center, .bottom_right => if (avail_width > overlay_width)
                margin_left + avail_width - overlay_width
            else
                margin_left,
            .top_center, .center, .bottom_center => if (avail_width > overlay_width)
                margin_left + (avail_width - overlay_width) / 2
            else
                margin_left,
            .cursor => margin_left, // Handled separately with cursor_x
        };
    }
};

// ============ Margin ============

pub const Margin = struct {
    top: u16 = 0,
    right: u16 = 0,
    bottom: u16 = 0,
    left: u16 = 0,

    pub fn uniform(value: u16) Margin {
        return .{ .top = value, .right = value, .bottom = value, .left = value };
    }
};

// ============ Overlay Options ============

pub const VisibilityCallback = *const fn (term_width: u16, term_height: u16) bool;

pub fn Overlay(comptime R: type) type {
    return struct {
        const OverlaySelf = @This();
        pub const DrawCallback = *const fn (renderer: R, ctx: ?*anyopaque) void;

        pub const Options = struct {
            width: ?SizeValue = null,
            height: ?SizeValue = null,
            min_width: ?u16 = null,
            max_height: ?SizeValue = null,

            anchor: Anchor = .center,
            offset_x: i16 = 0,
            offset_y: i16 = 0,

            // For cursor-relative positioning
            cursor_x: ?u16 = null,
            cursor_y: ?u16 = null,

            // Explicit row/col override
            row: ?SizeValue = null,
            col: ?SizeValue = null,

            margin: Margin = .{},

            visible: ?VisibilityCallback = null,
        };

        pub const Entry = struct {
            draw_fn: OverlaySelf.DrawCallback,
            ctx: ?*anyopaque,
            options: OverlaySelf.Options,
            hidden: bool,
            z_order: u16,

            pub fn isVisible(self: *const @This(), term_width: u16, term_height: u16) bool {
                if (self.hidden) return false;
                if (self.options.visible) |visible_fn| {
                    return visible_fn(term_width, term_height);
                }
                return true;
            }
        };

        pub const Stack = struct {
            entries: ArrayListUnmanaged(OverlaySelf.Entry),
            allocator: Allocator,
            next_z: u16,

            const Self = @This();

            pub fn init(allocator: Allocator) Self {
                return .{
                    .entries = .{},
                    .allocator = allocator,
                    .next_z = 0,
                };
            }

            pub fn deinit(self: *Self) void {
                self.entries.deinit(self.allocator);
            }

            pub fn push(self: *Self, draw_fn: OverlaySelf.DrawCallback, ctx: ?*anyopaque, options: OverlaySelf.Options) !*OverlaySelf.Entry {
                const z = self.next_z;
                self.next_z += 1;
                try self.entries.append(self.allocator, .{
                    .draw_fn = draw_fn,
                    .ctx = ctx,
                    .options = options,
                    .hidden = false,
                    .z_order = z,
                });
                return &self.entries.items[self.entries.items.len - 1];
            }

            pub fn pop(self: *Self) ?OverlaySelf.Entry {
                return self.entries.popOrNull();
            }

            pub fn remove(self: *Self, entry: *OverlaySelf.Entry) bool {
                for (self.entries.items, 0..) |*e, i| {
                    if (e == entry) {
                        _ = self.entries.orderedRemove(i);
                        return true;
                    }
                }
                return false;
            }

            pub fn getTopmostVisible(self: *const Self, term_width: u16, term_height: u16) ?*const OverlaySelf.Entry {
                var topmost: ?*const OverlaySelf.Entry = null;
                for (self.entries.items) |*entry| {
                    if (entry.isVisible(term_width, term_height)) {
                        if (topmost == null or entry.z_order > topmost.?.z_order) {
                            topmost = entry;
                        }
                    }
                }
                return topmost;
            }

            pub fn isEmpty(self: *const Self) bool {
                return self.entries.items.len == 0;
            }

            pub fn count(self: *const Self) usize {
                return self.entries.items.len;
            }

            /// Draw all visible overlays in z-order using Renderer
            pub fn draw(self: *Self, renderer: R) void {
                const term_width = renderer.width();
                const term_height = renderer.height();

                // Draw overlays in z-order (lowest first, so topmost renders last)
                for (self.entries.items) |*entry| {
                    if (!entry.isVisible(term_width, term_height)) continue;

                    // Default content height - caller can set explicit height
                    const content_height: u16 = if (entry.options.height) |h|
                        h.resolve(term_height)
                    else
                        10; // Sensible default

                    const layout = ResolvedLayout.resolve(entry.options, content_height, term_width, term_height);

                    // Create sub-region renderer for overlay
                    const overlay_renderer = renderer.subRegion(layout.col, layout.row, layout.width, layout.height);

                    // Call draw callback
                    entry.draw_fn(overlay_renderer, entry.ctx);
                }
            }
        };
    };
}



// ============ Resolved Layout ============

pub const ResolvedLayout = struct {
    width: u16,
    height: u16,
    row: u16,
    col: u16,

    pub fn resolve(options: Options, content_height: u16, term_width: u16, term_height: u16) ResolvedLayout {
        const margin = options.margin;

        // Calculate available space
        const margin_h = margin.left +| margin.right;
        const margin_v = margin.top +| margin.bottom;
        const avail_width = if (term_width > margin_h) term_width - margin_h else 1;
        const avail_height = if (term_height > margin_v) term_height - margin_v else 1;

        // Resolve width
        var resolved_width: u16 = if (options.width) |w|
            w.resolve(term_width)
        else
            @min(80, avail_width);

        if (options.min_width) |min_w| {
            resolved_width = @max(resolved_width, min_w);
        }
        resolved_width = @min(resolved_width, avail_width);
        resolved_width = @max(resolved_width, 1);

        // Resolve height
        var resolved_height: u16 = if (options.height) |h|
            h.resolve(term_height)
        else
            content_height;

        if (options.max_height) |mh| {
            resolved_height = @min(resolved_height, mh.resolve(term_height));
        }
        resolved_height = @min(resolved_height, avail_height);
        resolved_height = @max(resolved_height, 1);

        // Resolve row position
        var resolved_row: i32 = if (options.row) |r| blk: {
            switch (r) {
                .percent => |p| {
                    const max_row = if (avail_height > resolved_height) avail_height - resolved_height else 0;
                    const offset: i32 = @intCast(@as(u32, max_row) * @as(u32, p) / 100);
                    break :blk @as(i32, margin.top) + offset;
                },
                .absolute => |v| break :blk @intCast(v),
            }
        } else if (options.anchor == .cursor) blk: {
            break :blk @intCast(options.cursor_y orelse margin.top);
        } else @intCast(options.anchor.resolveRow(resolved_height, avail_height, margin.top));

        // Resolve col position
        var resolved_col: i32 = if (options.col) |c| blk: {
            switch (c) {
                .percent => |p| {
                    const max_col = if (avail_width > resolved_width) avail_width - resolved_width else 0;
                    const offset: i32 = @intCast(@as(u32, max_col) * @as(u32, p) / 100);
                    break :blk @as(i32, margin.left) + offset;
                },
                .absolute => |v| break :blk @intCast(v),
            }
        } else if (options.anchor == .cursor) blk: {
            break :blk @intCast(options.cursor_x orelse margin.left);
        } else @intCast(options.anchor.resolveCol(resolved_width, avail_width, margin.left));

        // Apply offsets
        resolved_row += options.offset_y;
        resolved_col += options.offset_x;

        // Clamp to terminal bounds
        const min_row: i32 = @intCast(margin.top);
        const max_row: i32 = @as(i32, term_height) - @as(i32, margin.bottom) - @as(i32, resolved_height);
        resolved_row = @max(resolved_row, min_row);
        resolved_row = @min(resolved_row, @max(min_row, max_row));

        const min_col: i32 = @intCast(margin.left);
        const max_col: i32 = @as(i32, term_width) - @as(i32, margin.right) - @as(i32, resolved_width);
        resolved_col = @max(resolved_col, min_col);
        resolved_col = @min(resolved_col, @max(min_col, max_col));

        return .{
            .width = resolved_width,
            .height = resolved_height,
            .row = @intCast(@max(0, resolved_row)),
            .col = @intCast(@max(0, resolved_col)),
        };
    }
};

// ============ Tests ============

test "SizeValue resolve absolute" {
    const sv = SizeValue{ .absolute = 50 };
    try std.testing.expectEqual(@as(u16, 50), sv.resolve(100));
    try std.testing.expectEqual(@as(u16, 50), sv.resolve(200));
}

test "SizeValue resolve percent" {
    const sv = SizeValue{ .percent = 50 };
    try std.testing.expectEqual(@as(u16, 50), sv.resolve(100));
    try std.testing.expectEqual(@as(u16, 100), sv.resolve(200));
}

test "Anchor center positioning" {
    // 80 width overlay, 100 available, 5 margin
    const col = Anchor.center.resolveCol(80, 100, 5);
    try std.testing.expectEqual(@as(u16, 15), col); // 5 + (100-80)/2 = 5 + 10 = 15

    // 20 height overlay, 50 available, 2 margin
    const row = Anchor.center.resolveRow(20, 50, 2);
    try std.testing.expectEqual(@as(u16, 17), row); // 2 + (50-20)/2 = 2 + 15 = 17
}

test "Anchor corner positioning" {
    // Top-left
    try std.testing.expectEqual(@as(u16, 5), Anchor.top_left.resolveRow(10, 50, 5));
    try std.testing.expectEqual(@as(u16, 3), Anchor.top_left.resolveCol(20, 80, 3));

    // Bottom-right
    try std.testing.expectEqual(@as(u16, 45), Anchor.bottom_right.resolveRow(10, 50, 5)); // 5 + 50 - 10 = 45
    try std.testing.expectEqual(@as(u16, 63), Anchor.bottom_right.resolveCol(20, 80, 3)); // 3 + 80 - 20 = 63
}

// Mock renderer for tests
const MockRenderer = struct {
    w: u16 = 100,
    h: u16 = 50,

    pub const Color = struct { rgb: struct { u8, u8, u8 } = .{ 0, 0, 0 } };
    pub const Style = struct { fg: ?Color = null, bg: ?Color = null };
    pub const Window = struct {};

    window: Window = .{},

    pub fn init(_: Window) MockRenderer {
        return .{};
    }

    pub fn width(self: MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.h;
    }

    pub fn subRegion(self: MockRenderer, _: u16, _: u16, sw: u16, sh: u16) MockRenderer {
        return .{ .w = sw, .h = sh };
    }

    pub fn drawText(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}
    pub fn drawCell(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}
    pub fn fill(_: MockRenderer, _: u16, _: u16, _: u16, _: u16, _: []const u8, _: Style) void {}
};

const TestOverlay = Overlay(MockRenderer);
const TestOptions = TestOverlay.Options;
const TestStack = TestOverlay.Stack;
const TestEntry = TestOverlay.Entry;

test "ResolvedLayout basic center" {
    const options = TestOptions{};
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    try std.testing.expectEqual(@as(u16, 80), layout.width); // min(80, 100)
    try std.testing.expectEqual(@as(u16, 10), layout.col); // (100-80)/2
    try std.testing.expectEqual(@as(u16, 20), layout.row); // (50-10)/2
}

test "ResolvedLayout with margins" {
    const options = TestOptions{
        .margin = .{ .top = 5, .right = 10, .bottom = 5, .left = 10 },
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    // Available: 80 wide, 40 tall
    try std.testing.expectEqual(@as(u16, 80), layout.width);
    try std.testing.expectEqual(@as(u16, 10), layout.col); // margin_left + (80-80)/2 = 10
    try std.testing.expectEqual(@as(u16, 20), layout.row); // 5 + (40-10)/2 = 5 + 15 = 20
}

test "ResolvedLayout with width percent" {
    const options = TestOptions{
        .width = .{ .percent = 50 },
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    try std.testing.expectEqual(@as(u16, 50), layout.width);
    try std.testing.expectEqual(@as(u16, 25), layout.col); // (100-50)/2
}

test "ResolvedLayout with offsets" {
    const options = TestOptions{
        .offset_x = 5,
        .offset_y = -3,
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    try std.testing.expectEqual(@as(u16, 15), layout.col); // 10 + 5
    try std.testing.expectEqual(@as(u16, 17), layout.row); // 20 - 3
}

test "ResolvedLayout clamps to bounds" {
    const options = TestOptions{
        .offset_x = 1000,
        .offset_y = 1000,
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    // Should clamp to max valid position
    try std.testing.expect(layout.col + layout.width <= 100);
    try std.testing.expect(layout.row + 10 <= 50);
}

test "Stack push/pop" {
    const allocator = std.testing.allocator;
    var stack = TestStack.init(allocator);
    defer stack.deinit();

    const dummy_draw = struct {
        fn f(_: MockRenderer, _: ?*anyopaque) void {}
    }.f;

    _ = try stack.push(dummy_draw, null, .{});
    try std.testing.expectEqual(@as(usize, 1), stack.count());

    _ = try stack.push(dummy_draw, null, .{ .anchor = .top_left });
    try std.testing.expectEqual(@as(usize, 2), stack.count());

    _ = stack.pop();
    try std.testing.expectEqual(@as(usize, 1), stack.count());

    _ = stack.pop();
    try std.testing.expect(stack.isEmpty());
}

test "Stack z-order" {
    const allocator = std.testing.allocator;
    var stack = TestStack.init(allocator);
    defer stack.deinit();

    const dummy_draw = struct {
        fn f(_: MockRenderer, _: ?*anyopaque) void {}
    }.f;

    const e1 = try stack.push(dummy_draw, null, .{});
    const e2 = try stack.push(dummy_draw, null, .{});
    const e3 = try stack.push(dummy_draw, null, .{});

    try std.testing.expectEqual(@as(u16, 0), e1.z_order);
    try std.testing.expectEqual(@as(u16, 1), e2.z_order);
    try std.testing.expectEqual(@as(u16, 2), e3.z_order);
}

test "Stack visibility" {
    const allocator = std.testing.allocator;
    var stack = TestStack.init(allocator);
    defer stack.deinit();

    const dummy_draw = struct {
        fn f(_: MockRenderer, _: ?*anyopaque) void {}
    }.f;

    _ = try stack.push(dummy_draw, null, .{});
    _ = try stack.push(dummy_draw, null, .{});

    // Both visible - topmost is index 1
    const topmost1 = stack.getTopmostVisible(100, 50);
    try std.testing.expect(topmost1 != null);

    // Hide entry at index 1
    stack.entries.items[1].hidden = true;
    const topmost2 = stack.getTopmostVisible(100, 50);
    try std.testing.expect(topmost2 != null);
    try std.testing.expectEqual(@as(u16, 0), topmost2.?.z_order);

    // Unhide
    stack.entries.items[1].hidden = false;
    const topmost3 = stack.getTopmostVisible(100, 50);
    try std.testing.expect(topmost3 != null);
    try std.testing.expectEqual(@as(u16, 1), topmost3.?.z_order);
}

test "Entry visibility with callback" {
    const dummy_draw = struct {
        fn f(_: MockRenderer, _: ?*anyopaque) void {}
    }.f;

    const small_term_callback = struct {
        fn cb(w: u16, h: u16) bool {
            return w >= 80 and h >= 24;
        }
    }.cb;

    var entry = TestEntry{
        .draw_fn = dummy_draw,
        .ctx = null,
        .options = .{ .visible = small_term_callback },
        .hidden = false,
        .z_order = 0,
    };
    try std.testing.expect(entry.isVisible(100, 50));
    try std.testing.expect(!entry.isVisible(60, 20));
}

test "Anchor cursor positioning" {
    const options = TestOptions{
        .anchor = .cursor,
        .cursor_x = 25,
        .cursor_y = 10,
        .width = .{ .absolute = 20 },
        .height = .{ .absolute = 5 },
    };
    const layout = ResolvedLayout.resolve(options, 5, 100, 50);

    try std.testing.expectEqual(@as(u16, 25), layout.col);
    try std.testing.expectEqual(@as(u16, 10), layout.row);
}

test "Stack remove" {
    const allocator = std.testing.allocator;
    var stack = TestStack.init(allocator);
    defer stack.deinit();

    const dummy_draw = struct {
        fn f(_: MockRenderer, _: ?*anyopaque) void {}
    }.f;

    _ = try stack.push(dummy_draw, null, .{});
    const e2 = try stack.push(dummy_draw, null, .{});
    _ = try stack.push(dummy_draw, null, .{});

    try std.testing.expectEqual(@as(usize, 3), stack.count());

    const removed = stack.remove(e2);
    try std.testing.expect(removed);
    try std.testing.expectEqual(@as(usize, 2), stack.count());
}
