// Debug logging for god-tui
// Writes to a log file for debugging terminal issues without corrupting terminal output

const std = @import("std");
const posix = std.posix;

var log_file: ?std.fs.File = null;
var log_enabled: bool = false;

/// Initialize debug logging to a file
pub fn init() void {
    // Check if GOD_TUI_DEBUG env var is set
    if (posix.getenv("GOD_TUI_DEBUG")) |_| {
        log_enabled = true;
        log_file = std.fs.cwd().createFile(".god-tui-debug.log", .{ .truncate = true }) catch null;
        if (log_file) |f| {
            var buf: [256]u8 = undefined;
            const msg = std.fmt.bufPrint(&buf, "=== god-tui debug log started at {} ===\n", .{std.time.timestamp()}) catch return;
            _ = f.write(msg) catch {};
        }
    }
}

/// Close debug log
pub fn deinit() void {
    if (log_file) |f| {
        f.close();
        log_file = null;
    }
}

/// Log a message to the debug file
pub fn log(comptime fmt: []const u8, args: anytype) void {
    if (!log_enabled) return;
    if (log_file) |f| {
        var buf: [4096]u8 = undefined;
        const timestamp = std.fmt.bufPrint(buf[0..32], "[{d}] ", .{std.time.milliTimestamp()}) catch return;
        _ = f.write(timestamp) catch {};
        const msg = std.fmt.bufPrint(&buf, fmt ++ "\n", args) catch return;
        _ = f.write(msg) catch {};
    }
}

/// Log with category prefix
pub fn logCategory(category: []const u8, comptime fmt: []const u8, args: anytype) void {
    if (!log_enabled) return;
    if (log_file) |f| {
        var buf: [4096]u8 = undefined;
        const timestamp = std.fmt.bufPrint(buf[0..64], "[{d}] [{s}] ", .{ std.time.milliTimestamp(), category }) catch return;
        _ = f.write(timestamp) catch {};
        const msg = std.fmt.bufPrint(&buf, fmt ++ "\n", args) catch return;
        _ = f.write(msg) catch {};
    }
}

/// Log input events
pub fn logInput(data: []const u8) void {
    if (!log_enabled) return;
    logCategory("INPUT", "received {d} bytes: {s}", .{ data.len, std.fmt.fmtSliceEscapeLower(data) });
}

/// Log render events
pub fn logRender(comptime fmt: []const u8, args: anytype) void {
    logCategory("RENDER", fmt, args);
}

/// Log agent events
pub fn logAgent(comptime fmt: []const u8, args: anytype) void {
    logCategory("AGENT", fmt, args);
}

/// Log terminal events
pub fn logTerminal(comptime fmt: []const u8, args: anytype) void {
    logCategory("TERMINAL", fmt, args);
}

test "debug logging disabled by default" {
    const testing = std.testing;
    try testing.expect(!log_enabled);
}
