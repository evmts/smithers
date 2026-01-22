// Loader Component per God-TUI spec §4
// Braille spinner animation with 80ms frame interval

const std = @import("std");
const Allocator = std.mem.Allocator;
const component_mod = @import("component.zig");
const Component = component_mod.Component;

/// Braille spinner frames (10 frames)
pub const SPINNER_FRAMES = [_][]const u8{
    "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
};

/// Frame interval in nanoseconds (80ms)
pub const FRAME_INTERVAL_NS: u64 = 80 * std.time.ns_per_ms;

pub const LoaderStyle = struct {
    label: ?[]const u8 = null,
    label_position: enum { left, right } = .right,
    separator: []const u8 = " ",
};

pub const Loader = struct {
    frame_index: u8 = 0,
    style: LoaderStyle = .{},
    allocator: Allocator,
    last_frame_time: i128 = 0,
    running: bool = true,

    const Self = @This();
    const FRAME_COUNT: u8 = SPINNER_FRAMES.len;

    pub fn init(allocator: Allocator) Self {
        return .{
            .allocator = allocator,
            .last_frame_time = std.time.nanoTimestamp(),
        };
    }

    pub fn initWithLabel(allocator: Allocator, label: []const u8) Self {
        return .{
            .allocator = allocator,
            .style = .{ .label = label },
            .last_frame_time = std.time.nanoTimestamp(),
        };
    }

    pub fn deinit(_: *Self) void {}

    pub fn setLabel(self: *Self, label: ?[]const u8) void {
        self.style.label = label;
    }

    pub fn setRunning(self: *Self, running: bool) void {
        self.running = running;
    }

    pub fn isRunning(self: *const Self) bool {
        return self.running;
    }

    /// Advance frame if enough time has passed. Returns true if frame changed.
    pub fn tick(self: *Self) bool {
        if (!self.running) return false;

        const now = std.time.nanoTimestamp();
        const elapsed = now - self.last_frame_time;
        if (elapsed >= FRAME_INTERVAL_NS) {
            self.frame_index = (self.frame_index + 1) % FRAME_COUNT;
            self.last_frame_time = now;
            return true;
        }
        return false;
    }

    /// Force advance to next frame
    pub fn advance(self: *Self) void {
        self.frame_index = (self.frame_index + 1) % FRAME_COUNT;
        self.last_frame_time = std.time.nanoTimestamp();
    }

    /// Get current frame character
    pub fn currentFrame(self: *const Self) []const u8 {
        return SPINNER_FRAMES[self.frame_index];
    }

    pub fn invalidate(_: *Self) void {}

    pub fn render(self: *Self, _: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        // Auto-tick on render
        _ = self.tick();

        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        const frame = self.currentFrame();

        if (self.style.label) |label| {
            if (self.style.label_position == .left) {
                try line.appendSlice(allocator, label);
                try line.appendSlice(allocator, self.style.separator);
                try line.appendSlice(allocator, frame);
            } else {
                try line.appendSlice(allocator, frame);
                try line.appendSlice(allocator, self.style.separator);
                try line.appendSlice(allocator, label);
            }
        } else {
            try line.appendSlice(allocator, frame);
        }

        const result = try allocator.alloc([]const u8, 1);
        result[0] = try line.toOwnedSlice(allocator);
        return result;
    }

    /// Convert to Component interface
    pub fn component(self: *Self) Component {
        return .{
            .ptr = self,
            .vtable = &vtable,
        };
    }

    const vtable = Component.VTable{
        .render = renderVtable,
        .invalidate = invalidateVtable,
        .deinit = deinitVtable,
    };

    fn renderVtable(ptr: *anyopaque, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        const self: *Self = @ptrCast(@alignCast(ptr));
        return self.render(width, allocator);
    }

    fn invalidateVtable(ptr: *anyopaque) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.invalidate();
    }

    fn deinitVtable(ptr: *anyopaque, _: Allocator) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.deinit();
    }
};

// ============ Tests ============

test "Loader frame cycling" {
    const allocator = std.testing.allocator;
    var loader = Loader.init(allocator);
    defer loader.deinit();

    try std.testing.expectEqual(@as(u8, 0), loader.frame_index);
    try std.testing.expectEqualStrings("⠋", loader.currentFrame());

    loader.advance();
    try std.testing.expectEqual(@as(u8, 1), loader.frame_index);
    try std.testing.expectEqualStrings("⠙", loader.currentFrame());

    // Cycle through all frames
    for (2..10) |i| {
        loader.advance();
        try std.testing.expectEqual(@as(u8, @intCast(i)), loader.frame_index);
    }

    // Wrap around
    loader.advance();
    try std.testing.expectEqual(@as(u8, 0), loader.frame_index);
}

test "Loader render basic" {
    const allocator = std.testing.allocator;
    var loader = Loader.init(allocator);
    defer loader.deinit();

    const lines = try loader.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    // First frame
    try std.testing.expect(lines[0].len > 0);
}

test "Loader with label right" {
    const allocator = std.testing.allocator;
    var loader = Loader.initWithLabel(allocator, "Loading");
    defer loader.deinit();

    const lines = try loader.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Loading") != null);
}

test "Loader with label left" {
    const allocator = std.testing.allocator;
    var loader = Loader.init(allocator);
    loader.style.label = "Status";
    loader.style.label_position = .left;
    defer loader.deinit();

    const lines = try loader.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.startsWith(u8, lines[0], "Status"));
}

test "Loader running state" {
    const allocator = std.testing.allocator;
    var loader = Loader.init(allocator);
    defer loader.deinit();

    try std.testing.expect(loader.isRunning());
    loader.setRunning(false);
    try std.testing.expect(!loader.isRunning());

    // tick should not advance when not running
    const frame_before = loader.frame_index;
    _ = loader.tick();
    try std.testing.expectEqual(frame_before, loader.frame_index);
}

test "Loader all frames valid" {
    for (SPINNER_FRAMES) |frame| {
        try std.testing.expect(frame.len > 0);
        // Verify UTF-8 validity
        _ = std.unicode.utf8Decode(frame) catch unreachable;
    }
}
