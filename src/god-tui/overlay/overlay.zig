// Overlay System per God-TUI spec §9
// Stack-based overlays with positioning, compositing, and focus management

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

// Note: In production, these would be injected via build system
// For now, use inline implementations for compositing

// ============ Width Utilities (inline for standalone compilation) ============

const width_mod = struct {
    pub fn visibleWidth(text: []const u8) u32 {
        // Simple width calculation - ASCII = 1 column each
        // Skip ANSI escape sequences
        var width: u32 = 0;
        var i: usize = 0;
        while (i < text.len) {
            if (text[i] == '\x1b') {
                // Skip ANSI sequence
                i += 1;
                if (i < text.len and text[i] == '[') {
                    i += 1;
                    while (i < text.len and !(text[i] >= 0x40 and text[i] <= 0x7E)) : (i += 1) {}
                    if (i < text.len) i += 1;
                } else if (i < text.len and text[i] == ']') {
                    while (i < text.len and text[i] != '\x07') : (i += 1) {}
                    if (i < text.len) i += 1;
                }
            } else if (text[i] >= 0x20 and text[i] <= 0x7E) {
                width += 1;
                i += 1;
            } else {
                i += 1;
            }
        }
        return width;
    }

    pub fn sliceByColumn(allocator: Allocator, text: []const u8, start_col: u32, end_col: u32) ![]u8 {
        var result = ArrayListUnmanaged(u8){};
        errdefer result.deinit(allocator);

        var col: u32 = 0;
        var i: usize = 0;
        var in_range = false;

        while (i < text.len) {
            // Handle ANSI sequences - preserve them
            if (text[i] == '\x1b') {
                var seq_end = i + 1;
                if (seq_end < text.len and text[seq_end] == '[') {
                    seq_end += 1;
                    while (seq_end < text.len and !(text[seq_end] >= 0x40 and text[seq_end] <= 0x7E)) : (seq_end += 1) {}
                    if (seq_end < text.len) seq_end += 1;
                }
                if (in_range or col >= start_col) {
                    try result.appendSlice(allocator, text[i..seq_end]);
                }
                i = seq_end;
                continue;
            }

            if (col >= start_col and !in_range) in_range = true;
            if (col >= end_col) break;

            if (in_range) {
                try result.append(allocator, text[i]);
            }

            if (text[i] >= 0x20 and text[i] <= 0x7E) col += 1;
            i += 1;
        }

        return result.toOwnedSlice(allocator);
    }
};

// ============ Component (local copy for standalone compilation) ============

pub const Component = struct {
    ptr: *anyopaque,
    vtable: *const VTable,

    pub const VTable = struct {
        render: *const fn (ptr: *anyopaque, width: u16, allocator: Allocator) RenderError![][]const u8,
        invalidate: *const fn (ptr: *anyopaque) void,
        handleInput: ?*const fn (ptr: *anyopaque, data: []const u8) void = null,
        wantsKeyRelease: bool = false,
        deinit: ?*const fn (ptr: *anyopaque, allocator: Allocator) void = null,
    };

    pub const RenderError = error{OutOfMemory};

    pub fn render(self: Component, width: u16, allocator: Allocator) RenderError![][]const u8 {
        return self.vtable.render(self.ptr, width, allocator);
    }

    pub fn invalidate(self: Component) void {
        self.vtable.invalidate(self.ptr);
    }

    pub fn handleInput(self: Component, data: []const u8) void {
        if (self.vtable.handleInput) |handler| {
            handler(self.ptr, data);
        }
    }

    pub fn deinit(self: Component, allocator: Allocator) void {
        if (self.vtable.deinit) |deinit_fn| {
            deinit_fn(self.ptr, allocator);
        }
    }
};

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

pub const OverlayAnchor = enum {
    center,
    top_left,
    top_right,
    bottom_left,
    bottom_right,
    top_center,
    bottom_center,
    left_center,
    right_center,

    pub fn resolveRow(self: OverlayAnchor, height: u16, avail_height: u16, margin_top: u16) u16 {
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
        };
    }

    pub fn resolveCol(self: OverlayAnchor, overlay_width: u16, avail_width: u16, margin_left: u16) u16 {
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
        };
    }
};

// ============ Margin ============

pub const OverlayMargin = struct {
    top: u16 = 0,
    right: u16 = 0,
    bottom: u16 = 0,
    left: u16 = 0,

    pub fn uniform(value: u16) OverlayMargin {
        return .{ .top = value, .right = value, .bottom = value, .left = value };
    }
};

// ============ Overlay Options ============

pub const VisibilityCallback = *const fn (term_width: u16, term_height: u16) bool;

pub const OverlayOptions = struct {
    width: ?SizeValue = null,
    min_width: ?u16 = null,
    max_height: ?SizeValue = null,

    anchor: OverlayAnchor = .center,
    offset_x: i16 = 0,
    offset_y: i16 = 0,

    row: ?SizeValue = null,
    col: ?SizeValue = null,

    margin: OverlayMargin = .{},

    visible: ?VisibilityCallback = null,
};

// ============ Resolved Layout ============

pub const ResolvedLayout = struct {
    width: u16,
    row: u16,
    col: u16,
    max_height: ?u16,

    pub fn resolve(options: OverlayOptions, overlay_height: u16, term_width: u16, term_height: u16) ResolvedLayout {
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

        // Resolve max height
        const max_height: ?u16 = if (options.max_height) |mh| blk: {
            var h = mh.resolve(term_height);
            h = @min(h, avail_height);
            h = @max(h, 1);
            break :blk h;
        } else null;

        // Effective overlay height
        const effective_height = if (max_height) |mh|
            @min(overlay_height, mh)
        else
            overlay_height;

        // Resolve row position
        var resolved_row: i32 = if (options.row) |r| blk: {
            switch (r) {
                .percent => |p| {
                    const max_row = if (avail_height > effective_height) avail_height - effective_height else 0;
                    const offset: i32 = @intCast(@as(u32, max_row) * @as(u32, p) / 100);
                    break :blk @as(i32, margin.top) + offset;
                },
                .absolute => |v| break :blk @intCast(v),
            }
        } else @intCast(options.anchor.resolveRow(effective_height, avail_height, margin.top));

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
        } else @intCast(options.anchor.resolveCol(resolved_width, avail_width, margin.left));

        // Apply offsets
        resolved_row += options.offset_y;
        resolved_col += options.offset_x;

        // Clamp to terminal bounds
        const min_row: i32 = @intCast(margin.top);
        const max_row: i32 = @as(i32, term_height) - @as(i32, margin.bottom) - @as(i32, effective_height);
        resolved_row = @max(resolved_row, min_row);
        resolved_row = @min(resolved_row, @max(min_row, max_row));

        const min_col: i32 = @intCast(margin.left);
        const max_col: i32 = @as(i32, term_width) - @as(i32, margin.right) - @as(i32, resolved_width);
        resolved_col = @max(resolved_col, min_col);
        resolved_col = @min(resolved_col, @max(min_col, max_col));

        return .{
            .width = resolved_width,
            .row = @intCast(@max(0, resolved_row)),
            .col = @intCast(@max(0, resolved_col)),
            .max_height = max_height,
        };
    }
};

// ============ Overlay Entry ============

pub const OverlayEntry = struct {
    component: Component,
    options: OverlayOptions,
    pre_focus: ?Component,
    hidden: bool,

    pub fn isVisible(self: *const OverlayEntry, term_width: u16, term_height: u16) bool {
        if (self.hidden) return false;
        if (self.options.visible) |visible_fn| {
            return visible_fn(term_width, term_height);
        }
        return true;
    }
};

// ============ Overlay Stack ============

pub const OverlayStack = struct {
    entries: ArrayListUnmanaged(OverlayEntry),
    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .entries = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.entries.deinit(self.allocator);
    }

    pub fn push(self: *Self, component: Component, options: OverlayOptions, pre_focus: ?Component) !*OverlayEntry {
        try self.entries.append(self.allocator, .{
            .component = component,
            .options = options,
            .pre_focus = pre_focus,
            .hidden = false,
        });
        return &self.entries.items[self.entries.items.len - 1];
    }

    pub fn pop(self: *Self) ?OverlayEntry {
        if (self.entries.items.len == 0) return null;
        return self.entries.pop();
    }

    pub fn remove(self: *Self, entry: *OverlayEntry) bool {
        const ptr_addr = @intFromPtr(entry);
        for (self.entries.items, 0..) |*e, i| {
            if (@intFromPtr(e) == ptr_addr) {
                _ = self.entries.orderedRemove(i);
                return true;
            }
        }
        return false;
    }

    pub fn hide(self: *Self, entry: *OverlayEntry) void {
        _ = self;
        entry.hidden = true;
    }

    pub fn setHidden(self: *Self, entry: *OverlayEntry, hidden: bool) void {
        _ = self;
        entry.hidden = hidden;
    }

    pub fn getTopmostVisible(self: *Self, term_width: u16, term_height: u16) ?*OverlayEntry {
        var i = self.entries.items.len;
        while (i > 0) {
            i -= 1;
            if (self.entries.items[i].isVisible(term_width, term_height)) {
                return &self.entries.items[i];
            }
        }
        return null;
    }

    pub fn isEmpty(self: *const Self) bool {
        return self.entries.items.len == 0;
    }

    pub fn count(self: *const Self) usize {
        return self.entries.items.len;
    }
};

// ============ Compositing ============

const RESET = "\x1b[0m\x1b]8;;\x07";

pub fn compositeLineAt(
    allocator: Allocator,
    base_line: []const u8,
    overlay_line: []const u8,
    col: u16,
    overlay_width: u16,
) ![]u8 {
    // Skip image lines
    if (containsImage(base_line)) {
        return allocator.dupe(u8, base_line);
    }

    const base_visible_width = width_mod.visibleWidth(base_line);

    // Extract "before" segment (0 to col)
    const before = try width_mod.sliceByColumn(allocator, base_line, 0, col);
    defer allocator.free(before);
    const before_width = width_mod.visibleWidth(before);

    // Extract "after" segment (col + overlay_width to end)
    const after_start = col + overlay_width;
    const after = if (after_start < base_visible_width)
        try width_mod.sliceByColumn(allocator, base_line, after_start, std.math.maxInt(u32))
    else
        try allocator.alloc(u8, 0);
    defer allocator.free(after);

    // Calculate overlay visible width
    const overlay_vis_width = width_mod.visibleWidth(overlay_line);

    // Build result
    var result = ArrayListUnmanaged(u8){};
    errdefer result.deinit(allocator);

    // Before segment
    try result.appendSlice(allocator, before);

    // Padding before overlay if base was shorter
    if (before_width < col) {
        const pad_count = col - @as(u16, @intCast(before_width));
        try result.appendNTimes(allocator, ' ', pad_count);
    }

    // Reset before overlay
    try result.appendSlice(allocator, RESET);

    // Overlay content
    try result.appendSlice(allocator, overlay_line);

    // Padding if overlay narrower than declared width
    if (overlay_vis_width < overlay_width) {
        const pad_count = overlay_width - @as(u16, @intCast(overlay_vis_width));
        try result.appendNTimes(allocator, ' ', pad_count);
    }

    // Reset after overlay
    try result.appendSlice(allocator, RESET);

    // After segment
    try result.appendSlice(allocator, after);

    return result.toOwnedSlice(allocator);
}

fn containsImage(line: []const u8) bool {
    // Kitty graphics protocol
    if (std.mem.indexOf(u8, line, "\x1b_G")) |_| return true;
    // iTerm2 inline images
    if (std.mem.indexOf(u8, line, "\x1b]1337;File=")) |_| return true;
    return false;
}

pub const RenderedOverlay = struct {
    lines: [][]const u8,
    row: u16,
    col: u16,
    width: u16,
};

pub fn compositeOverlays(
    allocator: Allocator,
    base_lines: []const []const u8,
    stack: *OverlayStack,
    term_width: u16,
    term_height: u16,
) ![][]u8 {
    if (stack.isEmpty()) {
        // Just duplicate base lines
        const result = try allocator.alloc([]u8, base_lines.len);
        for (base_lines, 0..) |line, i| {
            result[i] = try allocator.dupe(u8, line);
        }
        return result;
    }

    // Pre-render visible overlays
    var rendered = ArrayListUnmanaged(RenderedOverlay){};
    defer {
        for (rendered.items) |r| {
            for (r.lines) |line| allocator.free(@constCast(line));
            allocator.free(r.lines);
        }
        rendered.deinit(allocator);
    }

    var min_lines_needed: usize = base_lines.len;

    for (stack.entries.items) |*entry| {
        if (!entry.isVisible(term_width, term_height)) continue;

        // First pass: get width
        const layout1 = ResolvedLayout.resolve(entry.options, 0, term_width, term_height);

        // Render component
        var overlay_lines = try entry.component.render(layout1.width, allocator);
        defer allocator.free(overlay_lines);

        // Apply max height
        var effective_lines = overlay_lines;
        if (layout1.max_height) |mh| {
            if (overlay_lines.len > mh) {
                // Free excess lines
                for (overlay_lines[mh..]) |line| {
                    allocator.free(@constCast(line));
                }
                effective_lines = overlay_lines[0..mh];
            }
        }

        // Second pass: get position with actual height
        const layout2 = ResolvedLayout.resolve(entry.options, @intCast(effective_lines.len), term_width, term_height);

        // Copy lines for storage
        const lines_copy = try allocator.alloc([]const u8, effective_lines.len);
        for (effective_lines, 0..) |line, i| {
            lines_copy[i] = try allocator.dupe(u8, line);
        }

        try rendered.append(allocator, .{
            .lines = lines_copy,
            .row = layout2.row,
            .col = layout2.col,
            .width = layout2.width,
        });

        min_lines_needed = @max(min_lines_needed, layout2.row + effective_lines.len);
    }

    // Create result with extended lines if needed
    var result = try allocator.alloc([]u8, min_lines_needed);
    errdefer {
        for (result) |line| allocator.free(line);
        allocator.free(result);
    }

    // Copy base lines
    for (0..min_lines_needed) |i| {
        if (i < base_lines.len) {
            result[i] = try allocator.dupe(u8, base_lines[i]);
        } else {
            result[i] = try allocator.alloc(u8, 0);
        }
    }

    // Composite each overlay
    for (rendered.items) |r| {
        for (r.lines, 0..) |overlay_line, i| {
            const idx = r.row + i;
            if (idx < result.len) {
                const old_line = result[idx];
                defer allocator.free(old_line);

                // Truncate overlay line to declared width
                const truncated = try width_mod.sliceByColumn(allocator, overlay_line, 0, r.width);
                defer allocator.free(truncated);

                result[idx] = try compositeLineAt(allocator, old_line, truncated, r.col, r.width);
            }
        }
    }

    return result;
}

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

test "OverlayAnchor center positioning" {
    // 80 width overlay, 100 available, 5 margin
    const col = OverlayAnchor.center.resolveCol(80, 100, 5);
    try std.testing.expectEqual(@as(u16, 15), col); // 5 + (100-80)/2 = 5 + 10 = 15

    // 20 height overlay, 50 available, 2 margin
    const row = OverlayAnchor.center.resolveRow(20, 50, 2);
    try std.testing.expectEqual(@as(u16, 17), row); // 2 + (50-20)/2 = 2 + 15 = 17
}

test "OverlayAnchor corner positioning" {
    // Top-left
    try std.testing.expectEqual(@as(u16, 5), OverlayAnchor.top_left.resolveRow(10, 50, 5));
    try std.testing.expectEqual(@as(u16, 3), OverlayAnchor.top_left.resolveCol(20, 80, 3));

    // Bottom-right
    try std.testing.expectEqual(@as(u16, 45), OverlayAnchor.bottom_right.resolveRow(10, 50, 5)); // 5 + 50 - 10 = 45
    try std.testing.expectEqual(@as(u16, 63), OverlayAnchor.bottom_right.resolveCol(20, 80, 3)); // 3 + 80 - 20 = 63
}

test "ResolvedLayout basic center" {
    const options = OverlayOptions{};
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    try std.testing.expectEqual(@as(u16, 80), layout.width); // min(80, 100)
    try std.testing.expectEqual(@as(u16, 10), layout.col); // (100-80)/2
    try std.testing.expectEqual(@as(u16, 20), layout.row); // (50-10)/2
    try std.testing.expectEqual(@as(?u16, null), layout.max_height);
}

test "ResolvedLayout with margins" {
    const options = OverlayOptions{
        .margin = .{ .top = 5, .right = 10, .bottom = 5, .left = 10 },
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    // Available: 80 wide, 40 tall
    try std.testing.expectEqual(@as(u16, 80), layout.width);
    try std.testing.expectEqual(@as(u16, 10), layout.col); // margin_left + (80-80)/2 = 10
    try std.testing.expectEqual(@as(u16, 20), layout.row); // 5 + (40-10)/2 = 5 + 15 = 20
}

test "ResolvedLayout with width percent" {
    const options = OverlayOptions{
        .width = .{ .percent = 50 },
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    try std.testing.expectEqual(@as(u16, 50), layout.width);
    try std.testing.expectEqual(@as(u16, 25), layout.col); // (100-50)/2
}

test "ResolvedLayout with offsets" {
    const options = OverlayOptions{
        .offset_x = 5,
        .offset_y = -3,
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    try std.testing.expectEqual(@as(u16, 15), layout.col); // 10 + 5
    try std.testing.expectEqual(@as(u16, 17), layout.row); // 20 - 3
}

test "ResolvedLayout clamps to bounds" {
    const options = OverlayOptions{
        .offset_x = 1000,
        .offset_y = 1000,
    };
    const layout = ResolvedLayout.resolve(options, 10, 100, 50);

    // Should clamp to max valid position
    try std.testing.expect(layout.col + layout.width <= 100);
    try std.testing.expect(layout.row + 10 <= 50);
}

test "OverlayStack push/pop" {
    const allocator = std.testing.allocator;
    var stack = OverlayStack.init(allocator);
    defer stack.deinit();

    const DummyVTable = Component.VTable{
        .render = struct {
            fn f(_: *anyopaque, _: u16, alloc: Allocator) Component.RenderError![][]const u8 {
                return try alloc.alloc([]const u8, 0);
            }
        }.f,
        .invalidate = struct {
            fn f(_: *anyopaque) void {}
        }.f,
    };

    var dummy: u8 = 0;
    const comp = Component{ .ptr = &dummy, .vtable = &DummyVTable };

    _ = try stack.push(comp, .{}, null);
    try std.testing.expectEqual(@as(usize, 1), stack.count());

    _ = try stack.push(comp, .{ .anchor = .top_left }, null);
    try std.testing.expectEqual(@as(usize, 2), stack.count());

    _ = stack.pop();
    try std.testing.expectEqual(@as(usize, 1), stack.count());

    _ = stack.pop();
    try std.testing.expect(stack.isEmpty());
}

test "OverlayStack visibility" {
    const allocator = std.testing.allocator;
    var stack = OverlayStack.init(allocator);
    defer stack.deinit();

    const DummyVTable = Component.VTable{
        .render = struct {
            fn f(_: *anyopaque, _: u16, alloc: Allocator) Component.RenderError![][]const u8 {
                return try alloc.alloc([]const u8, 0);
            }
        }.f,
        .invalidate = struct {
            fn f(_: *anyopaque) void {}
        }.f,
    };

    var dummy: u8 = 0;
    const comp = Component{ .ptr = &dummy, .vtable = &DummyVTable };

    _ = try stack.push(comp, .{}, null);
    _ = try stack.push(comp, .{}, null);

    // Both visible - topmost is index 1
    const topmost1 = stack.getTopmostVisible(100, 50);
    try std.testing.expect(topmost1 != null);
    try std.testing.expectEqual(@as(usize, 1), (@intFromPtr(topmost1.?) - @intFromPtr(&stack.entries.items[0])) / @sizeOf(OverlayEntry));

    // Hide entry at index 1
    stack.entries.items[1].hidden = true;
    const topmost2 = stack.getTopmostVisible(100, 50);
    try std.testing.expect(topmost2 != null);
    try std.testing.expectEqual(@as(usize, 0), (@intFromPtr(topmost2.?) - @intFromPtr(&stack.entries.items[0])) / @sizeOf(OverlayEntry));

    // Unhide
    stack.entries.items[1].hidden = false;
    const topmost3 = stack.getTopmostVisible(100, 50);
    try std.testing.expect(topmost3 != null);
    try std.testing.expectEqual(@as(usize, 1), (@intFromPtr(topmost3.?) - @intFromPtr(&stack.entries.items[0])) / @sizeOf(OverlayEntry));
}

test "compositeLineAt basic" {
    const allocator = std.testing.allocator;

    const base = "AAAAAABBBBBBCCCCCC";
    const overlay = "OVERLAY";
    // overlay at col 6, width 7: replaces cols 6-12, keeps cols 0-5 and 13-17
    const result = try compositeLineAt(allocator, base, overlay, 6, 7);
    defer allocator.free(result);

    // Should have: AAAAAA (cols 0-5) + RESET + OVERLAY + RESET + CCCCC (cols 13-17)
    try std.testing.expect(std.mem.indexOf(u8, result, "AAAAAA") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "OVERLAY") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "CCCCC") != null);
}

test "compositeLineAt with padding" {
    const allocator = std.testing.allocator;

    const base = "SHORT";
    const overlay = "OVL";
    const result = try compositeLineAt(allocator, base, overlay, 10, 5);
    defer allocator.free(result);

    // Base is 5 chars, overlay starts at 10, so padding needed
    const vis_width = width_mod.visibleWidth(result);
    try std.testing.expect(vis_width >= 15); // at least 10 + 5
}

test "containsImage detection" {
    try std.testing.expect(containsImage("prefix\x1b_Gsomething"));
    try std.testing.expect(containsImage("prefix\x1b]1337;File=something"));
    try std.testing.expect(!containsImage("normal text"));
    try std.testing.expect(!containsImage("\x1b[31mred text\x1b[0m"));
}

test "OverlayEntry visibility" {
    const DummyVTable = Component.VTable{
        .render = struct {
            fn f(_: *anyopaque, _: u16, alloc: Allocator) Component.RenderError![][]const u8 {
                return try alloc.alloc([]const u8, 0);
            }
        }.f,
        .invalidate = struct {
            fn f(_: *anyopaque) void {}
        }.f,
    };

    var dummy: u8 = 0;
    const comp = Component{ .ptr = &dummy, .vtable = &DummyVTable };

    // No callback, not hidden
    var entry1 = OverlayEntry{
        .component = comp,
        .options = .{},
        .pre_focus = null,
        .hidden = false,
    };
    try std.testing.expect(entry1.isVisible(100, 50));

    // Hidden
    entry1.hidden = true;
    try std.testing.expect(!entry1.isVisible(100, 50));

    // With callback that returns false for small terminals
    const smallTermCallback = struct {
        fn cb(w: u16, h: u16) bool {
            return w >= 80 and h >= 24;
        }
    }.cb;

    var entry2 = OverlayEntry{
        .component = comp,
        .options = .{ .visible = smallTermCallback },
        .pre_focus = null,
        .hidden = false,
    };
    try std.testing.expect(entry2.isVisible(100, 50));
    try std.testing.expect(!entry2.isVisible(60, 20));
}
