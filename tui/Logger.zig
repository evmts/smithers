const std = @import("std");
const builtin = @import("builtin");

const Logger = @This();

file: std.fs.File,
allocator: std.mem.Allocator,

pub const LogLevel = enum {
    debug,
    info,
    warn,
    err,
};

pub fn init(allocator: std.mem.Allocator) !Logger {
    const log_file = std.fs.cwd().createFile("/tmp/smithers-tui.log", .{}) catch |err| switch (err) {
        error.AccessDenied => {
            // Fallback to a file in the current directory if /tmp is not writable
            return Logger{
                .file = try std.fs.cwd().createFile("smithers-tui.log", .{}),
                .allocator = allocator,
            };
        },
        else => return err,
    };

    return Logger{
        .file = log_file,
        .allocator = allocator,
    };
}

pub fn deinit(self: *Logger) void {
    self.file.close();
}

pub fn log(self: *Logger, level: LogLevel, comptime format: []const u8, args: anytype) void {
    if (builtin.mode == .Debug) {
        const timestamp = std.time.timestamp();
        const level_str = switch (level) {
            .debug => "DEBUG",
            .info => "INFO",
            .warn => "WARN",
            .err => "ERROR",
        };
        
        const message = std.fmt.allocPrint(self.allocator, "[{d}] {s}: " ++ format ++ "\n", .{timestamp, level_str} ++ args) catch return;
        defer self.allocator.free(message);
        
        _ = self.file.writeAll(message) catch return;
    }
}

pub fn debug(self: *Logger, comptime format: []const u8, args: anytype) void {
    self.log(.debug, format, args);
}

pub fn info(self: *Logger, comptime format: []const u8, args: anytype) void {
    self.log(.info, format, args);
}

pub fn warn(self: *Logger, comptime format: []const u8, args: anytype) void {
    self.log(.warn, format, args);
}

pub fn err(self: *Logger, comptime format: []const u8, args: anytype) void {
    self.log(.err, format, args);
}