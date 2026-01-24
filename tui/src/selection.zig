const std = @import("std");

/// Text selection state for mouse-based copy
pub const Selection = struct {
    /// Start position (where mouse down occurred) - in content space
    anchor_x: u16,
    anchor_y: i32, // i32 to handle scroll adjustments
    /// Current position (where mouse is now) - in content space
    focus_x: u16,
    focus_y: i32,
    /// Is selection currently active (mouse held down)
    is_selecting: bool,
    /// Does a completed selection exist
    has_selection: bool,
    /// Scroll offset when selection started
    start_scroll_offset: u16,

    const Self = @This();

    pub fn init() Self {
        return .{
            .anchor_x = 0,
            .anchor_y = 0,
            .focus_x = 0,
            .focus_y = 0,
            .is_selecting = false,
            .has_selection = false,
            .start_scroll_offset = 0,
        };
    }

    /// Start a new selection at the given screen position
    pub fn start(self: *Self, x: u16, y: u16, scroll_offset: u16) void {
        self.anchor_x = x;
        // Convert screen Y to content Y by adding scroll offset
        self.anchor_y = @as(i32, y) + @as(i32, scroll_offset);
        self.focus_x = x;
        self.focus_y = self.anchor_y;
        self.is_selecting = true;
        self.has_selection = false;
        self.start_scroll_offset = scroll_offset;
    }

    /// Update selection as mouse moves (screen coords + current scroll)
    pub fn update(self: *Self, x: u16, y: u16, scroll_offset: u16) void {
        if (self.is_selecting) {
            self.focus_x = x;
            // Convert screen Y to content Y
            self.focus_y = @as(i32, y) + @as(i32, scroll_offset);
            // Selection exists if we've moved from anchor
            const anchor_y_u: u16 = if (self.anchor_y >= 0) @intCast(self.anchor_y) else 0;
            const focus_y_u: u16 = if (self.focus_y >= 0) @intCast(self.focus_y) else 0;
            self.has_selection = (x != self.anchor_x or focus_y_u != anchor_y_u);
        }
    }

    /// End selection (mouse released)
    pub fn end(self: *Self) void {
        self.is_selecting = false;
        // Keep has_selection true if we have a valid selection
    }

    /// Clear selection
    pub fn clear(self: *Self) void {
        self.is_selecting = false;
        self.has_selection = false;
    }

    /// Get normalized bounds in content space (min/max regardless of drag direction)
    pub fn getBounds(self: *const Self) struct { min_x: u16, min_y: i32, max_x: u16, max_y: i32 } {
        return .{
            .min_x = @min(self.anchor_x, self.focus_x),
            .min_y = @min(self.anchor_y, self.focus_y),
            .max_x = @max(self.anchor_x, self.focus_x),
            .max_y = @max(self.anchor_y, self.focus_y),
        };
    }

    /// Get bounds adjusted for current scroll offset (screen space)
    pub fn getScreenBounds(self: *const Self, scroll_offset: u16) struct { min_x: u16, min_y: i32, max_x: u16, max_y: i32 } {
        const content_bounds = self.getBounds();
        return .{
            .min_x = content_bounds.min_x,
            .min_y = content_bounds.min_y - @as(i32, scroll_offset),
            .max_x = content_bounds.max_x,
            .max_y = content_bounds.max_y - @as(i32, scroll_offset),
        };
    }

    /// Check if a cell is within the selection
    pub fn containsCell(self: *const Self, x: u16, y: u16) bool {
        if (!self.has_selection and !self.is_selecting) return false;

        const bounds = self.getBounds();

        // For multi-line selection, we use a "stream" selection model:
        // - First line: from anchor_x to end of line
        // - Middle lines: entire line
        // - Last line: from start to focus_x
        if (y < bounds.min_y or y > bounds.max_y) return false;

        if (bounds.min_y == bounds.max_y) {
            // Single line selection
            return x >= bounds.min_x and x <= bounds.max_x;
        } else if (y == bounds.min_y) {
            // First line of multi-line: from start pos to end
            const start_x = if (self.anchor_y <= self.focus_y) self.anchor_x else self.focus_x;
            return x >= start_x;
        } else if (y == bounds.max_y) {
            // Last line of multi-line: from beginning to end pos
            const end_x = if (self.anchor_y <= self.focus_y) self.focus_x else self.anchor_x;
            return x <= end_x;
        } else {
            // Middle lines: entire line selected
            return true;
        }
    }
};

/// Copy text to system clipboard
pub fn copyToClipboard(allocator: std.mem.Allocator, text: []const u8) !void {
    if (text.len == 0) return;

    // Try pbcopy (macOS) first, then xclip (Linux)
    const commands = [_][]const []const u8{
        &.{"pbcopy"},
        &.{ "xclip", "-selection", "clipboard" },
        &.{ "xsel", "--clipboard", "--input" },
    };

    for (commands) |cmd| {
        var child = std.process.Child.init(cmd, allocator);
        child.stdin_behavior = .Pipe;
        child.stdout_behavior = .Ignore;
        child.stderr_behavior = .Ignore;

        child.spawn() catch continue;

        if (child.stdin) |*stdin| {
            stdin.writeAll(text) catch {};
            // Close stdin to signal EOF to the clipboard command
            // Set to null so wait() doesn't try to close it again
            stdin.close();
            child.stdin = null;
        }

        const result = child.wait() catch continue;
        if (result.Exited == 0) return;
    }
}

test "Selection bounds" {
    var sel = Selection.init();
    sel.start(5, 10, 0);
    sel.update(15, 12, 0);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(u16, 5), bounds.min_x);
    try std.testing.expectEqual(@as(i32, 10), bounds.min_y);
    try std.testing.expectEqual(@as(u16, 15), bounds.max_x);
    try std.testing.expectEqual(@as(i32, 12), bounds.max_y);
}

test "Selection with scroll offset" {
    var sel = Selection.init();
    // Start selection at screen y=5 with scroll_offset=10 -> content y=15
    sel.start(5, 5, 10);
    sel.update(15, 8, 10);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(i32, 15), bounds.min_y);
    try std.testing.expectEqual(@as(i32, 18), bounds.max_y);

    // Screen bounds should be back at screen coords
    const screen_bounds = sel.getScreenBounds(10);
    try std.testing.expectEqual(@as(i32, 5), screen_bounds.min_y);
    try std.testing.expectEqual(@as(i32, 8), screen_bounds.max_y);
}
