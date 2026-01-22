// Differential Rendering Engine per God-TUI spec §3
// Efficient terminal rendering with sync mode and incremental updates

const std = @import("std");
const width_mod = @import("width.zig");

// ANSI constants and utilities (inline to avoid module path issues)
const ansi = struct {
    pub const ESC = "\x1b";
    pub const CSI = "\x1b[";
    pub const CURSOR_MARKER = "\x1b_pi:c\x07";
    pub const LINE_RESET = "\x1b[0m\x1b]8;;\x07";
    pub const SYNC_START = "\x1b[?2026h";
    pub const SYNC_END = "\x1b[?2026l";
    pub const HIDE_CURSOR = "\x1b[?25l";
    pub const SHOW_CURSOR = "\x1b[?25h";
    pub const HOME = "\x1b[H";
    pub const CLEAR_LINE = "\x1b[2K";
    pub const CLEAR_TO_EOS = "\x1b[J";
    pub const CLEAR_SCREEN = "\x1b[2J";

    pub fn cursorPosition(writer: anytype, row: u16, col: u16) !void {
        try writer.print("\x1b[{d};{d}H", .{ row, col });
    }

    pub fn containsImage(line: []const u8) bool {
        if (std.mem.indexOf(u8, line, "\x1b_G") != null) return true;
        if (std.mem.indexOf(u8, line, "\x1b]1337;File=") != null) return true;
        return false;
    }

    pub const SequenceType = enum { not_escape, incomplete, csi, osc, dcs, apc, ss3, single_char };

    pub fn classifySequence(data: []const u8) struct { type: SequenceType, len: usize } {
        if (data.len == 0) return .{ .type = .not_escape, .len = 0 };
        if (data[0] != '\x1b') return .{ .type = .not_escape, .len = 0 };
        if (data.len == 1) return .{ .type = .incomplete, .len = 1 };

        const after = data[1];
        if (after == '[') {
            var i: usize = 2;
            while (i < data.len) : (i += 1) {
                const c = data[i];
                if (c >= 0x40 and c <= 0x7E) return .{ .type = .csi, .len = i + 1 };
            }
            return .{ .type = .incomplete, .len = data.len };
        }
        if (after == ']') {
            var i: usize = 2;
            while (i < data.len) : (i += 1) {
                if (data[i] == '\x07') return .{ .type = .osc, .len = i + 1 };
                if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') return .{ .type = .osc, .len = i + 2 };
            }
            return .{ .type = .incomplete, .len = data.len };
        }
        if (after == 'P') {
            var i: usize = 2;
            while (i + 1 < data.len) : (i += 1) {
                if (data[i] == '\x1b' and data[i + 1] == '\\') return .{ .type = .dcs, .len = i + 2 };
            }
            return .{ .type = .incomplete, .len = data.len };
        }
        if (after == '_') {
            var i: usize = 2;
            while (i < data.len) : (i += 1) {
                if (data[i] == '\x07') return .{ .type = .apc, .len = i + 1 };
                if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') return .{ .type = .apc, .len = i + 2 };
            }
            return .{ .type = .incomplete, .len = data.len };
        }
        if (after == 'O') {
            if (data.len >= 3) return .{ .type = .ss3, .len = 3 };
            return .{ .type = .incomplete, .len = data.len };
        }
        return .{ .type = .single_char, .len = 2 };
    }
};

/// Renderer state tracking for differential updates
pub const RendererState = struct {
    previous_lines: std.ArrayListUnmanaged([]const u8),
    previous_width: i32,
    cursor_row: i32,
    cursor_col: i32,
    hardware_cursor_row: i32,
    hardware_cursor_col: i32,
    max_lines_rendered: i32,
    render_requested: bool,
    allocator: std.mem.Allocator,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .previous_lines = .{},
            .previous_width = 0,
            .cursor_row = 0,
            .cursor_col = 0,
            .hardware_cursor_row = 0,
            .hardware_cursor_col = 0,
            .max_lines_rendered = 0,
            .render_requested = false,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearPreviousLines();
        self.previous_lines.deinit(self.allocator);
    }

    fn clearPreviousLines(self: *Self) void {
        for (self.previous_lines.items) |line| {
            self.allocator.free(line);
        }
        self.previous_lines.clearRetainingCapacity();
    }

    /// Request a render (coalesces multiple requests)
    pub fn requestRender(self: *Self) void {
        self.render_requested = true;
    }

    /// Check if render is pending
    pub fn isRenderRequested(self: *const Self) bool {
        return self.render_requested;
    }

    /// Clear render request flag
    pub fn clearRenderRequest(self: *Self) void {
        self.render_requested = false;
    }
};

/// Container interface for components that can be rendered
pub const RenderContainer = struct {
    ctx: *anyopaque,
    renderFn: *const fn (ctx: *anyopaque, width: i32) RenderResult,
};

/// Result from container.render()
pub const RenderResult = struct {
    lines: []const []const u8,
    cursor_row: ?i32 = null,
    cursor_col: ?i32 = null,
};

/// Overlay for compositing (modals, menus, etc)
pub const Overlay = struct {
    lines: []const []const u8,
    row: i32,
    col: i32,
    z_index: i32,
};

/// Main render output buffer
pub const RenderOutput = struct {
    buffer: std.ArrayListUnmanaged(u8),
    allocator: std.mem.Allocator,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .buffer = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.buffer.deinit(self.allocator);
    }

    pub fn writer(self: *Self) std.ArrayListUnmanaged(u8).Writer {
        return self.buffer.writer(self.allocator);
    }

    pub fn getOutput(self: *const Self) []const u8 {
        return self.buffer.items;
    }

    pub fn clear(self: *Self) void {
        self.buffer.clearRetainingCapacity();
    }
};

/// Extract cursor position from rendered lines (finds and removes CURSOR_MARKER)
pub fn extractCursorPosition(allocator: std.mem.Allocator, lines: []const []const u8) struct { row: ?i32, col: ?i32, modified_lines: [][]u8 } {
    var result_lines = allocator.alloc([]u8, lines.len) catch return .{ .row = null, .col = null, .modified_lines = &[_][]u8{} };
    var found_row: ?i32 = null;
    var found_col: ?i32 = null;

    for (lines, 0..) |line, row_idx| {
        if (std.mem.indexOf(u8, line, ansi.CURSOR_MARKER)) |marker_pos| {
            // Found cursor marker
            found_row = @intCast(row_idx);
            // Calculate column (visible width before marker)
            const before_marker = line[0..marker_pos];
            found_col = @intCast(width_mod.visibleWidthWithAllocator(allocator, before_marker));

            // Remove marker from line
            const before = line[0..marker_pos];
            const after = line[marker_pos + ansi.CURSOR_MARKER.len ..];
            const new_line = allocator.alloc(u8, before.len + after.len) catch {
                result_lines[row_idx] = allocator.dupe(u8, line) catch &[_]u8{};
                continue;
            };
            @memcpy(new_line[0..before.len], before);
            @memcpy(new_line[before.len..], after);
            result_lines[row_idx] = new_line;
        } else {
            result_lines[row_idx] = allocator.dupe(u8, line) catch &[_]u8{};
        }
    }

    return .{ .row = found_row, .col = found_col, .modified_lines = result_lines };
}

/// Apply LINE_RESET to each line, skip image lines
pub fn applyLineResets(allocator: std.mem.Allocator, lines: []const []const u8) ![][]u8 {
    var result = try allocator.alloc([]u8, lines.len);

    for (lines, 0..) |line, i| {
        if (ansi.containsImage(line)) {
            // Skip LINE_RESET for image lines
            result[i] = try allocator.dupe(u8, line);
        } else {
            // Append LINE_RESET
            const new_len = line.len + ansi.LINE_RESET.len;
            result[i] = try allocator.alloc(u8, new_len);
            @memcpy(result[i][0..line.len], line);
            @memcpy(result[i][line.len..], ansi.LINE_RESET);
        }
    }

    return result;
}

/// Composite overlays onto base lines
pub fn compositeOverlays(allocator: std.mem.Allocator, base_lines: []const []const u8, overlays: []const Overlay) ![][]u8 {
    if (overlays.len == 0) {
        var result = try allocator.alloc([]u8, base_lines.len);
        for (base_lines, 0..) |line, i| {
            result[i] = try allocator.dupe(u8, line);
        }
        return result;
    }

    // Sort overlays by z-index
    const sorted = try allocator.alloc(Overlay, overlays.len);
    defer allocator.free(sorted);
    @memcpy(sorted, overlays);
    std.mem.sort(Overlay, sorted, {}, struct {
        fn lessThan(_: void, a: Overlay, b: Overlay) bool {
            return a.z_index < b.z_index;
        }
    }.lessThan);

    // Start with base lines
    var result = try allocator.alloc([]u8, base_lines.len);
    for (base_lines, 0..) |line, i| {
        result[i] = try allocator.dupe(u8, line);
    }

    // Apply each overlay
    for (sorted) |overlay| {
        for (overlay.lines, 0..) |overlay_line, overlay_row_idx| {
            const target_row = overlay.row + @as(i32, @intCast(overlay_row_idx));
            if (target_row < 0 or target_row >= @as(i32, @intCast(result.len))) continue;

            const row_idx: usize = @intCast(target_row);
            const base = result[row_idx];

            // Composite at column position
            const col: u32 = if (overlay.col >= 0) @intCast(overlay.col) else 0;
            const overlay_width = width_mod.visibleWidthWithAllocator(allocator, overlay_line);

            // Slice base before and after overlay
            const before = width_mod.sliceByColumn(allocator, base, 0, col) catch continue;
            defer allocator.free(before);

            const after_col = col + overlay_width;
            const after = width_mod.sliceByColumn(allocator, base, after_col, 9999) catch continue;
            defer allocator.free(after);

            // Combine
            const new_len = before.len + overlay_line.len + after.len;
            const new_line = allocator.alloc(u8, new_len) catch continue;
            @memcpy(new_line[0..before.len], before);
            @memcpy(new_line[before.len .. before.len + overlay_line.len], overlay_line);
            @memcpy(new_line[before.len + overlay_line.len ..], after);

            allocator.free(result[row_idx]);
            result[row_idx] = new_line;
        }
    }

    return result;
}

/// Determine render mode based on state
pub const RenderMode = enum {
    full, // First render or width changed
    full_with_clear, // Width changed, need to clear
    incremental, // Differential update
};

pub fn determineRenderMode(state: *const RendererState, new_width: i32) RenderMode {
    if (state.previous_lines.items.len == 0) {
        return .full;
    }
    if (state.previous_width != new_width) {
        return .full_with_clear;
    }
    return .incremental;
}

/// Generate output for a full render
pub fn renderFull(output: *RenderOutput, lines: []const []const u8, clear: bool) !void {
    const w = output.writer();

    // Start sync mode
    try w.writeAll(ansi.SYNC_START);

    if (clear) {
        // Clear screen and home
        try w.writeAll(ansi.CLEAR_SCREEN);
        try w.writeAll(ansi.HOME);
    } else {
        // Just home
        try w.writeAll(ansi.HOME);
    }

    // Write all lines
    for (lines, 0..) |line, i| {
        try w.writeAll(line);
        if (i < lines.len - 1) {
            try w.writeAll("\r\n");
        }
    }

    // Clear to end of screen
    try w.writeAll(ansi.CLEAR_TO_EOS);

    // End sync mode
    try w.writeAll(ansi.SYNC_END);
}

/// Generate output for incremental render
pub fn renderIncremental(
    output: *RenderOutput,
    allocator: std.mem.Allocator,
    prev_lines: []const []const u8,
    new_lines: []const []const u8,
    max_prev_rendered: i32,
) !void {
    const w = output.writer();

    // Start sync mode
    try w.writeAll(ansi.SYNC_START);

    // Home cursor
    try w.writeAll(ansi.HOME);

    const max_rows = @max(prev_lines.len, new_lines.len);

    for (0..max_rows) |row| {
        const prev_line: []const u8 = if (row < prev_lines.len) prev_lines[row] else "";
        const new_line: []const u8 = if (row < new_lines.len) new_lines[row] else "";

        // Compare lines (including ANSI - they need exact match)
        if (!std.mem.eql(u8, prev_line, new_line)) {
            // Move to line
            if (row > 0) {
                try ansi.cursorPosition(w, @intCast(row + 1), 1);
            }
            // Clear and write new content
            try w.writeAll(ansi.CLEAR_LINE);
            try w.writeAll(new_line);
        } else if (row >= new_lines.len and row < prev_lines.len) {
            // Line was removed
            try ansi.cursorPosition(w, @intCast(row + 1), 1);
            try w.writeAll(ansi.CLEAR_LINE);
        }
    }

    // Clear any extra lines from previous render
    _ = allocator;
    const prev_max: usize = @intCast(@max(0, max_prev_rendered));
    if (new_lines.len < prev_max) {
        for (new_lines.len..prev_max) |row| {
            try ansi.cursorPosition(w, @intCast(row + 1), 1);
            try w.writeAll(ansi.CLEAR_LINE);
        }
    }

    // End sync mode
    try w.writeAll(ansi.SYNC_END);
}

/// Position hardware cursor for IME input
pub fn positionHardwareCursor(output: *RenderOutput, row: i32, col: i32) !void {
    const w = output.writer();
    if (row >= 0 and col >= 0) {
        try ansi.cursorPosition(w, @intCast(row + 1), @intCast(col + 1));
        try w.writeAll(ansi.SHOW_CURSOR);
    } else {
        try w.writeAll(ansi.HIDE_CURSOR);
    }
}

/// Main render pipeline
pub fn doRender(
    state: *RendererState,
    output: *RenderOutput,
    new_lines: []const []const u8,
    new_width: i32,
    overlays: []const Overlay,
) !void {
    output.clear();

    // 1. Composite overlays
    const composited = try compositeOverlays(state.allocator, new_lines, overlays);
    defer {
        for (composited) |line| state.allocator.free(line);
        state.allocator.free(composited);
    }

    // 2. Extract cursor position
    const cursor_info = extractCursorPosition(state.allocator, composited);
    defer {
        for (cursor_info.modified_lines) |line| state.allocator.free(line);
        state.allocator.free(cursor_info.modified_lines);
    }

    if (cursor_info.row) |r| state.cursor_row = r;
    if (cursor_info.col) |c| state.cursor_col = c;

    // 3. Apply line resets
    const reset_lines = try applyLineResets(state.allocator, cursor_info.modified_lines);
    defer {
        for (reset_lines) |line| state.allocator.free(line);
        state.allocator.free(reset_lines);
    }

    // 4. Determine render mode and render
    const mode = determineRenderMode(state, new_width);

    switch (mode) {
        .full => try renderFull(output, reset_lines, false),
        .full_with_clear => try renderFull(output, reset_lines, true),
        .incremental => try renderIncremental(
            output,
            state.allocator,
            state.previous_lines.items,
            reset_lines,
            state.max_lines_rendered,
        ),
    }

    // 5. Position hardware cursor for IME
    try positionHardwareCursor(output, state.cursor_row, state.cursor_col);

    // 6. Update state
    state.clearPreviousLines();
    for (reset_lines) |line| {
        const copy = try state.allocator.dupe(u8, line);
        try state.previous_lines.append(state.allocator, copy);
    }
    state.previous_width = new_width;
    state.max_lines_rendered = @max(state.max_lines_rendered, @as(i32, @intCast(reset_lines.len)));
    state.hardware_cursor_row = state.cursor_row;
    state.hardware_cursor_col = state.cursor_col;
    state.clearRenderRequest();
}

// ============ Tests ============

test "RendererState init/deinit" {
    const allocator = std.testing.allocator;
    var state = RendererState.init(allocator);
    defer state.deinit();

    try std.testing.expect(!state.isRenderRequested());
    state.requestRender();
    try std.testing.expect(state.isRenderRequested());
    state.clearRenderRequest();
    try std.testing.expect(!state.isRenderRequested());
}

test "RenderOutput basic" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const w = output.writer();
    try w.writeAll("Hello");
    try std.testing.expectEqualStrings("Hello", output.getOutput());

    output.clear();
    try std.testing.expectEqual(@as(usize, 0), output.getOutput().len);
}

test "extractCursorPosition found" {
    const allocator = std.testing.allocator;
    var lines = [_][]const u8{
        "Line 0",
        "Pre" ++ ansi.CURSOR_MARKER ++ "Post",
        "Line 2",
    };

    const result = extractCursorPosition(allocator, &lines);
    defer {
        for (result.modified_lines) |line| allocator.free(line);
        allocator.free(result.modified_lines);
    }

    try std.testing.expectEqual(@as(?i32, 1), result.row);
    try std.testing.expectEqual(@as(?i32, 3), result.col); // "Pre" = 3 cols
    try std.testing.expectEqualStrings("PrePost", result.modified_lines[1]);
}

test "extractCursorPosition not found" {
    const allocator = std.testing.allocator;
    var lines = [_][]const u8{ "Line 0", "Line 1" };

    const result = extractCursorPosition(allocator, &lines);
    defer {
        for (result.modified_lines) |line| allocator.free(line);
        allocator.free(result.modified_lines);
    }

    try std.testing.expectEqual(@as(?i32, null), result.row);
    try std.testing.expectEqual(@as(?i32, null), result.col);
}

test "applyLineResets basic" {
    const allocator = std.testing.allocator;
    const lines = [_][]const u8{ "Hello", "World" };

    const result = try applyLineResets(allocator, &lines);
    defer {
        for (result) |line| allocator.free(line);
        allocator.free(result);
    }

    try std.testing.expectEqual(@as(usize, 2), result.len);
    try std.testing.expect(std.mem.endsWith(u8, result[0], ansi.LINE_RESET));
    try std.testing.expect(std.mem.endsWith(u8, result[1], ansi.LINE_RESET));
}

test "applyLineResets skips image" {
    const allocator = std.testing.allocator;
    const lines = [_][]const u8{ "Normal", "\x1b_Ga=T;data\x1b\\" };

    const result = try applyLineResets(allocator, &lines);
    defer {
        for (result) |line| allocator.free(line);
        allocator.free(result);
    }

    try std.testing.expect(std.mem.endsWith(u8, result[0], ansi.LINE_RESET));
    try std.testing.expect(!std.mem.endsWith(u8, result[1], ansi.LINE_RESET));
}

test "determineRenderMode first render" {
    const allocator = std.testing.allocator;
    var state = RendererState.init(allocator);
    defer state.deinit();

    try std.testing.expectEqual(RenderMode.full, determineRenderMode(&state, 80));
}

test "determineRenderMode width change" {
    const allocator = std.testing.allocator;
    var state = RendererState.init(allocator);
    defer state.deinit();

    // Simulate previous render
    const line = try allocator.dupe(u8, "test");
    try state.previous_lines.append(allocator, line);
    state.previous_width = 80;

    try std.testing.expectEqual(RenderMode.full_with_clear, determineRenderMode(&state, 100));
}

test "determineRenderMode incremental" {
    const allocator = std.testing.allocator;
    var state = RendererState.init(allocator);
    defer state.deinit();

    const line = try allocator.dupe(u8, "test");
    try state.previous_lines.append(allocator, line);
    state.previous_width = 80;

    try std.testing.expectEqual(RenderMode.incremental, determineRenderMode(&state, 80));
}

test "renderFull basic" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const lines = [_][]const u8{ "Line 1", "Line 2" };
    try renderFull(&output, &lines, false);

    const result = output.getOutput();
    try std.testing.expect(std.mem.startsWith(u8, result, ansi.SYNC_START));
    try std.testing.expect(std.mem.endsWith(u8, result, ansi.SYNC_END));
    try std.testing.expect(std.mem.indexOf(u8, result, "Line 1") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "Line 2") != null);
}

test "renderFull with clear" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const lines = [_][]const u8{"Test"};
    try renderFull(&output, &lines, true);

    const result = output.getOutput();
    try std.testing.expect(std.mem.indexOf(u8, result, ansi.CLEAR_SCREEN) != null);
}

test "renderIncremental same lines" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const prev = [_][]const u8{ "Same", "Lines" };
    const new = [_][]const u8{ "Same", "Lines" };

    try renderIncremental(&output, allocator, &prev, &new, 2);

    const result = output.getOutput();
    try std.testing.expect(std.mem.startsWith(u8, result, ansi.SYNC_START));
    // Should not contain line content (no changes)
    try std.testing.expect(std.mem.indexOf(u8, result, "Same") == null);
}

test "renderIncremental different lines" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const prev = [_][]const u8{ "Old", "Same" };
    const new = [_][]const u8{ "New", "Same" };

    try renderIncremental(&output, allocator, &prev, &new, 2);

    const result = output.getOutput();
    try std.testing.expect(std.mem.indexOf(u8, result, "New") != null);
    // "Same" should not be re-rendered
    try std.testing.expect(std.mem.indexOf(u8, result, "Same") == null);
}

test "positionHardwareCursor visible" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    try positionHardwareCursor(&output, 5, 10);

    const result = output.getOutput();
    try std.testing.expect(std.mem.indexOf(u8, result, ansi.SHOW_CURSOR) != null);
}

test "positionHardwareCursor hidden" {
    const allocator = std.testing.allocator;
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    try positionHardwareCursor(&output, -1, -1);

    const result = output.getOutput();
    try std.testing.expect(std.mem.indexOf(u8, result, ansi.HIDE_CURSOR) != null);
}

test "doRender full pipeline" {
    const allocator = std.testing.allocator;
    var state = RendererState.init(allocator);
    defer state.deinit();
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const lines = [_][]const u8{ "Hello", "World" };

    try doRender(&state, &output, &lines, 80, &[_]Overlay{});

    // Verify state updated
    try std.testing.expectEqual(@as(usize, 2), state.previous_lines.items.len);
    try std.testing.expectEqual(@as(i32, 80), state.previous_width);
    try std.testing.expect(!state.isRenderRequested());
}

test "doRender with cursor marker" {
    const allocator = std.testing.allocator;
    var state = RendererState.init(allocator);
    defer state.deinit();
    var output = RenderOutput.init(allocator);
    defer output.deinit();

    const lines = [_][]const u8{ "No cursor", "Cur" ++ ansi.CURSOR_MARKER ++ "sor here" };

    try doRender(&state, &output, &lines, 80, &[_]Overlay{});

    try std.testing.expectEqual(@as(i32, 1), state.cursor_row);
    try std.testing.expectEqual(@as(i32, 3), state.cursor_col);
}
