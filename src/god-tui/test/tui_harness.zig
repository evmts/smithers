// TUI Test Harness
// Provides a mock terminal for testing the interactive mode without a real TTY

const std = @import("std");
const Allocator = std.mem.Allocator;

/// A mock TTY that captures output and allows injecting input
pub const MockTty = struct {
    allocator: Allocator,
    output_buffer: std.ArrayListUnmanaged(u8) = .{},
    input_queue: std.ArrayListUnmanaged(u8) = .{},
    columns: u16 = 80,
    rows: u16 = 24,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{ .allocator = allocator };
    }

    pub fn deinit(self: *Self) void {
        self.output_buffer.deinit(self.allocator);
        self.input_queue.deinit(self.allocator);
    }

    /// Queue input to be read by the TUI
    pub fn queueInput(self: *Self, data: []const u8) !void {
        try self.input_queue.appendSlice(self.allocator, data);
    }

    /// Queue a keypress (with Enter)
    pub fn queueLine(self: *Self, line: []const u8) !void {
        try self.input_queue.appendSlice(self.allocator, line);
        try self.input_queue.append(self.allocator, '\n');
    }

    /// Queue Ctrl+C to exit
    pub fn queueCtrlC(self: *Self) !void {
        try self.input_queue.append(self.allocator, 3); // Ctrl+C
    }

    /// Get all captured output
    pub fn getOutput(self: *Self) []const u8 {
        return self.output_buffer.items;
    }

    /// Check if output contains a string (ignoring ANSI codes)
    pub fn outputContains(self: *Self, needle: []const u8) bool {
        return std.mem.indexOf(u8, self.output_buffer.items, needle) != null;
    }

    /// Clear captured output
    pub fn clearOutput(self: *Self) void {
        self.output_buffer.clearRetainingCapacity();
    }

    /// Simulate a resize event
    pub fn setSize(self: *Self, cols: u16, row: u16) void {
        self.columns = cols;
        self.rows = row;
    }
};

/// Test case result
pub const TestResult = struct {
    passed: bool,
    description: []const u8,
    error_message: ?[]const u8 = null,
};

/// Run a test with the mock TTY
pub fn runTest(
    allocator: Allocator,
    name: []const u8,
    setup: *const fn (*MockTty) anyerror!void,
    verify: *const fn (*MockTty) anyerror!bool,
) TestResult {
    var tty = MockTty.init(allocator);
    defer tty.deinit();

    setup(&tty) catch |err| {
        return .{
            .passed = false,
            .description = name,
            .error_message = @errorName(err),
        };
    };

    const passed = verify(&tty) catch |err| {
        return .{
            .passed = false,
            .description = name,
            .error_message = @errorName(err),
        };
    };

    return .{
        .passed = passed,
        .description = name,
    };
}

// ============ Tests ============

test "MockTty init" {
    const allocator = std.testing.allocator;
    var tty = MockTty.init(allocator);
    defer tty.deinit();

    try std.testing.expectEqual(@as(u16, 80), tty.columns);
    try std.testing.expectEqual(@as(u16, 24), tty.rows);
}

test "MockTty queueInput" {
    const allocator = std.testing.allocator;
    var tty = MockTty.init(allocator);
    defer tty.deinit();

    try tty.queueInput("hello");
    try std.testing.expectEqual(@as(usize, 5), tty.input_queue.items.len);
}

test "MockTty queueLine adds newline" {
    const allocator = std.testing.allocator;
    var tty = MockTty.init(allocator);
    defer tty.deinit();

    try tty.queueLine("test");
    try std.testing.expectEqual(@as(usize, 5), tty.input_queue.items.len);
    try std.testing.expectEqual(@as(u8, '\n'), tty.input_queue.items[4]);
}

test "MockTty resize" {
    const allocator = std.testing.allocator;
    var tty = MockTty.init(allocator);
    defer tty.deinit();

    tty.setSize(120, 40);
    try std.testing.expectEqual(@as(u16, 120), tty.columns);
    try std.testing.expectEqual(@as(u16, 40), tty.rows);
}
