// Vaxis-based Cell Rendering Engine for God-TUI
// Uses libvaxis for cell-based rendering with automatic diffing
// Provides backward-compatible API for line-based rendering

const std = @import("std");
const vaxis = @import("vaxis");

// Re-export vaxis types for external use
pub const Cell = vaxis.Cell;
pub const Style = vaxis.Cell.Style;
pub const Color = vaxis.Cell.Color;
pub const Segment = vaxis.Cell.Segment;
pub const Window = vaxis.Window;
pub const Screen = vaxis.Screen;
pub const Winsize = vaxis.Winsize;

/// Cursor marker for IME positioning (APC sequence)
pub const CURSOR_MARKER = "\x1b_pi:c\x07";

// ANSI constants for backward compatibility
const ansi = struct {
    pub const ESC = "\x1b";
    pub const CSI = "\x1b[";
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
};

/// Renderer state tracking for differential updates
/// Maintains backward compatibility with line-based API
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

/// RenderOutput wraps a writer for terminal output
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

/// Calculate visible width of a grapheme using vaxis
pub fn graphemeWidth(str: []const u8, method: vaxis.gwidth.Method) u16 {
    return vaxis.gwidth.gwidth(str, method);
}

/// Calculate visible width using unicode method (default) - returns u32 for backward compat
pub fn visibleWidth(str: []const u8) u32 {
    return @as(u32, graphemeWidth(str, .unicode));
}

/// Calculate visible width with allocator (backward compatible, allocator unused with vaxis)
pub fn visibleWidthWithAllocator(_: std.mem.Allocator, str: []const u8) u32 {
    return visibleWidth(str);
}

/// Extract cursor position from rendered lines (finds and removes CURSOR_MARKER)
pub fn extractCursorPosition(allocator: std.mem.Allocator, lines: []const []const u8) struct { row: ?i32, col: ?i32, modified_lines: [][]u8 } {
    var result_lines = allocator.alloc([]u8, lines.len) catch return .{ .row = null, .col = null, .modified_lines = &[_][]u8{} };
    var found_row: ?i32 = null;
    var found_col: ?i32 = null;

    for (lines, 0..) |line, row_idx| {
        if (std.mem.indexOf(u8, line, CURSOR_MARKER)) |marker_pos| {
            found_row = @intCast(row_idx);
            const before_marker = line[0..marker_pos];
            found_col = @intCast(visibleWidth(before_marker));

            const before = line[0..marker_pos];
            const after = line[marker_pos + CURSOR_MARKER.len ..];
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
            result[i] = try allocator.dupe(u8, line);
        } else {
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

    const sorted = try allocator.alloc(Overlay, overlays.len);
    defer allocator.free(sorted);
    @memcpy(sorted, overlays);
    std.mem.sort(Overlay, sorted, {}, struct {
        fn lessThan(_: void, a: Overlay, b: Overlay) bool {
            return a.z_index < b.z_index;
        }
    }.lessThan);

    var result = try allocator.alloc([]u8, base_lines.len);
    for (base_lines, 0..) |line, i| {
        result[i] = try allocator.dupe(u8, line);
    }

    for (sorted) |overlay| {
        for (overlay.lines, 0..) |overlay_line, overlay_row_idx| {
            const target_row = overlay.row + @as(i32, @intCast(overlay_row_idx));
            if (target_row < 0 or target_row >= @as(i32, @intCast(result.len))) continue;

            const row_idx: usize = @intCast(target_row);
            const base = result[row_idx];

            const col: u32 = if (overlay.col >= 0) @intCast(overlay.col) else 0;
            const overlay_width = visibleWidth(overlay_line);

            const before = sliceByColumn(allocator, base, 0, col) catch continue;
            defer allocator.free(before);

            const after_col = col + overlay_width;
            const after = sliceByColumn(allocator, base, after_col, 9999) catch continue;
            defer allocator.free(after);

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

/// Slice text by visible column range
pub fn sliceByColumn(allocator: std.mem.Allocator, text: []const u8, start_col: u32, end_col: u32) ![]u8 {
    var result = std.ArrayListUnmanaged(u8){};
    errdefer result.deinit(allocator);

    var col: u32 = 0;
    var i: usize = 0;
    var in_range = false;

    while (i < text.len) {
        if (text[i] == '\x1b') {
            const seq_len = findAnsiSequenceLen(text[i..]);
            if (seq_len > 0) {
                if (in_range or col >= start_col) {
                    try result.appendSlice(allocator, text[i .. i + seq_len]);
                }
                i += seq_len;
                continue;
            }
        }

        const byte = text[i];
        var char_width: u32 = 1;
        var char_len: usize = 1;

        if (byte >= 0x80) {
            const decoded = decodeUtf8Len(text[i..]);
            if (decoded.len > 0) {
                char_len = decoded.len;
                char_width = @as(u32, graphemeWidth(text[i .. i + char_len], .unicode));
            }
        } else if (byte == '\t') {
            char_width = 3;
        } else if (byte < 0x20) {
            char_width = 0;
        }

        if (col < start_col and col + char_width > start_col) {
            in_range = true;
        } else if (col >= start_col and !in_range) {
            in_range = true;
        }

        if (col >= end_col) {
            break;
        }

        if (in_range and col + char_width <= end_col) {
            try result.appendSlice(allocator, text[i .. i + char_len]);
        } else if (in_range and col < end_col) {
            try result.appendSlice(allocator, text[i .. i + char_len]);
        }

        col += char_width;
        i += char_len;
    }

    return result.toOwnedSlice(allocator);
}

fn findAnsiSequenceLen(data: []const u8) usize {
    if (data.len < 2 or data[0] != '\x1b') return 0;
    const after = data[1];

    if (after == '[') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            const c = data[i];
            if (c >= 0x40 and c <= 0x7E) return i + 1;
        }
        return 0;
    }
    if (after == ']') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            if (data[i] == '\x07') return i + 1;
            if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') return i + 2;
        }
        return 0;
    }
    if (after == 'P' or after == '_') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            if (data[i] == '\x07') return i + 1;
            if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') return i + 2;
        }
        return 0;
    }
    if (after == 'O' and data.len >= 3) return 3;
    return 2;
}

fn decodeUtf8Len(bytes: []const u8) struct { len: usize } {
    if (bytes.len == 0) return .{ .len = 0 };
    const byte0 = bytes[0];
    if (byte0 < 0x80) return .{ .len = 1 };
    if (byte0 >= 0xC0 and byte0 < 0xE0) return .{ .len = if (bytes.len >= 2) 2 else 0 };
    if (byte0 >= 0xE0 and byte0 < 0xF0) return .{ .len = if (bytes.len >= 3) 3 else 0 };
    if (byte0 >= 0xF0 and byte0 < 0xF8) return .{ .len = if (bytes.len >= 4) 4 else 0 };
    return .{ .len = 0 };
}

/// Determine render mode based on state
pub const RenderMode = enum {
    full,
    full_with_clear,
    incremental,
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

    try w.writeAll(ansi.SYNC_START);

    if (clear) {
        try w.writeAll(ansi.CLEAR_SCREEN);
        try w.writeAll(ansi.HOME);
    } else {
        try w.writeAll(ansi.HOME);
    }

    for (lines, 0..) |line, i| {
        try w.writeAll(line);
        if (i < lines.len - 1) {
            try w.writeAll("\r\n");
        }
    }

    try w.writeAll(ansi.CLEAR_TO_EOS);
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

    try w.writeAll(ansi.SYNC_START);
    try w.writeAll(ansi.HOME);

    const max_rows = @max(prev_lines.len, new_lines.len);

    for (0..max_rows) |row| {
        const prev_line: []const u8 = if (row < prev_lines.len) prev_lines[row] else "";
        const new_line: []const u8 = if (row < new_lines.len) new_lines[row] else "";

        if (!std.mem.eql(u8, prev_line, new_line)) {
            if (row > 0) {
                try ansi.cursorPosition(w, @intCast(row + 1), 1);
            }
            try w.writeAll(ansi.CLEAR_LINE);
            try w.writeAll(new_line);
        } else if (row >= new_lines.len and row < prev_lines.len) {
            try ansi.cursorPosition(w, @intCast(row + 1), 1);
            try w.writeAll(ansi.CLEAR_LINE);
        }
    }

    _ = allocator;
    const prev_max: usize = @intCast(@max(0, max_prev_rendered));
    if (new_lines.len < prev_max) {
        for (new_lines.len..prev_max) |row| {
            try ansi.cursorPosition(w, @intCast(row + 1), 1);
            try w.writeAll(ansi.CLEAR_LINE);
        }
    }

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

/// Main render pipeline (backward compatible)
pub fn doRender(
    state: *RendererState,
    output: *RenderOutput,
    new_lines: []const []const u8,
    new_width: i32,
    overlays: []const Overlay,
) !void {
    output.clear();

    const composited = try compositeOverlays(state.allocator, new_lines, overlays);
    defer {
        for (composited) |line| state.allocator.free(line);
        state.allocator.free(composited);
    }

    const cursor_info = extractCursorPosition(state.allocator, composited);
    defer {
        for (cursor_info.modified_lines) |line| state.allocator.free(line);
        state.allocator.free(cursor_info.modified_lines);
    }

    if (cursor_info.row) |r| state.cursor_row = r;
    if (cursor_info.col) |c| state.cursor_col = c;

    const reset_lines = try applyLineResets(state.allocator, cursor_info.modified_lines);
    defer {
        for (reset_lines) |line| state.allocator.free(line);
        state.allocator.free(reset_lines);
    }

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

    try positionHardwareCursor(output, state.cursor_row, state.cursor_col);

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

// ============ Vaxis Cell API ============

/// Print text segments to a window
pub fn printSegments(win: Window, segments: []const Segment, opts: Window.PrintOptions) Window.PrintResult {
    return win.print(segments, opts);
}

/// Print a single segment to a window
pub fn printSegment(win: Window, segment: Segment, opts: Window.PrintOptions) Window.PrintResult {
    return win.printSegment(segment, opts);
}

/// Write a cell to a window at the specified position
pub fn writeCell(win: Window, col: u16, row: u16, cell: Cell) void {
    win.writeCell(col, row, cell);
}

/// Fill a window with a cell
pub fn fill(win: Window, cell: Cell) void {
    win.fill(cell);
}

/// Clear a window (fill with default cell)
pub fn clearWindow(win: Window) void {
    win.clear();
}

/// Create a child window with optional border
pub fn childWindow(win: Window, opts: Window.ChildOptions) Window {
    return win.child(opts);
}

/// Show cursor at position in window
pub fn showCursor(win: Window, col: u16, row: u16) void {
    win.showCursor(col, row);
}

/// Hide cursor in window
pub fn hideCursor(win: Window) void {
    win.hideCursor();
}

/// Set cursor shape
pub fn setCursorShape(win: Window, shape: Cell.CursorShape) void {
    win.setCursorShape(shape);
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
        "Pre" ++ CURSOR_MARKER ++ "Post",
        "Line 2",
    };

    const result = extractCursorPosition(allocator, &lines);
    defer {
        for (result.modified_lines) |line| allocator.free(line);
        allocator.free(result.modified_lines);
    }

    try std.testing.expectEqual(@as(?i32, 1), result.row);
    try std.testing.expectEqual(@as(?i32, 3), result.col);
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

    const lines = [_][]const u8{ "No cursor", "Cur" ++ CURSOR_MARKER ++ "sor here" };

    try doRender(&state, &output, &lines, 80, &[_]Overlay{});

    try std.testing.expectEqual(@as(i32, 1), state.cursor_row);
    try std.testing.expectEqual(@as(i32, 3), state.cursor_col);
}

test "visibleWidth ASCII" {
    const width = visibleWidth("Hello, World!");
    try std.testing.expectEqual(@as(u32, 13), width);
}

test "visibleWidth empty" {
    const width = visibleWidth("");
    try std.testing.expectEqual(@as(u32, 0), width);
}

test "graphemeWidth with method" {
    const width_unicode = graphemeWidth("a", .unicode);
    const width_wcwidth = graphemeWidth("a", .wcwidth);
    try std.testing.expectEqual(@as(u16, 1), width_unicode);
    try std.testing.expectEqual(@as(u16, 1), width_wcwidth);
}

test "Cell creation" {
    const cell: Cell = .{
        .char = .{ .grapheme = "A", .width = 1 },
        .style = .{ .bold = true },
    };
    try std.testing.expectEqualStrings("A", cell.char.grapheme);
    try std.testing.expect(cell.style.bold);
}

test "Style with colors" {
    const style: Style = .{
        .fg = .{ .rgb = .{ 255, 0, 0 } },
        .bg = .{ .index = 0 },
        .bold = true,
        .italic = true,
    };
    try std.testing.expect(style.bold);
    try std.testing.expect(style.italic);
    switch (style.fg) {
        .rgb => |rgb| {
            try std.testing.expectEqual(@as(u8, 255), rgb[0]);
            try std.testing.expectEqual(@as(u8, 0), rgb[1]);
        },
        else => unreachable,
    }
}

test "Segment creation" {
    const segment: Segment = .{
        .text = "Hello World",
        .style = .{ .fg = .{ .index = 1 } },
    };
    try std.testing.expectEqualStrings("Hello World", segment.text);
}

test "Color equality" {
    const c1: Color = .{ .rgb = .{ 255, 0, 0 } };
    const c2: Color = .{ .rgb = .{ 255, 0, 0 } };
    const c3: Color = .{ .rgb = .{ 0, 255, 0 } };
    try std.testing.expect(Color.eql(c1, c2));
    try std.testing.expect(!Color.eql(c1, c3));
}

test "Style equality" {
    const s1: Style = .{ .bold = true, .fg = .{ .index = 1 } };
    const s2: Style = .{ .bold = true, .fg = .{ .index = 1 } };
    const s3: Style = .{ .bold = false, .fg = .{ .index = 1 } };
    try std.testing.expect(s1.eql(s2));
    try std.testing.expect(!s1.eql(s3));
}
