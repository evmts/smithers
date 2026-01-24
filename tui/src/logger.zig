const std = @import("std");

pub const Logger = struct {
    const LOG_FILE = "/tmp/smithers-tui.log";

    file: ?std.fs.File = null,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) !Logger {
        const file = std.fs.createFileAbsolute(LOG_FILE, .{}) catch |e| switch (e) {
            error.AccessDenied => return Logger{ .allocator = allocator },
            else => return e,
        };

        return Logger{
            .file = file,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Logger) void {
        if (self.file) |f| {
            f.close();
        }
    }

    pub fn log(
        self: *Logger,
        comptime level: std.log.Level,
        comptime scope: @TypeOf(.EnumLiteral),
        comptime format: []const u8,
        args: anytype,
    ) void {
        if (self.file) |f| {
            const timestamp = std.time.timestamp();

            var header_buf: [256]u8 = undefined;
            const header = std.fmt.bufPrint(&header_buf, "[{d}] [{s}] ({s}): ", .{
                timestamp,
                @tagName(level),
                @tagName(scope),
            }) catch return;
            f.writeAll(header) catch return;

            var msg_buf: [4096]u8 = undefined;
            const msg = std.fmt.bufPrint(&msg_buf, format, args) catch return;
            f.writeAll(msg) catch return;

            f.writeAll("\n") catch return;
            f.sync() catch return;
        }
    }

    pub fn debug(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.debug, scope, format, args);
    }

    pub fn info(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.info, scope, format, args);
    }

    pub fn warn(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.warn, scope, format, args);
    }

    pub fn logErr(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.err, scope, format, args);
    }

    pub fn err(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.err, scope, format, args);
    }
};

pub fn setupGlobalLogger(allocator: std.mem.Allocator) !void {
    var logger = try Logger.init(allocator);
    _ = &logger;
}
