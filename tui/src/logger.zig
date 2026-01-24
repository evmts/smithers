const std = @import("std");

pub const Logger = struct {
    const LOG_FILE = "/tmp/smithers-tui.log";
    
    file: ?std.fs.File = null,
    allocator: std.mem.Allocator,
    
    pub fn init(allocator: std.mem.Allocator) !Logger {
        const file = std.fs.createFileAbsolute(LOG_FILE, .{}) catch |err| switch (err) {
            error.AccessDenied => return Logger{ .allocator = allocator },
            else => return err,
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
            const writer = f.writer();
            const timestamp = std.time.timestamp();
            
            writer.print("[{d}] [{s}] ({s}): ", .{ timestamp, @tagName(level), @tagName(scope) }) catch return;
            writer.print(format, args) catch return;
            writer.writeByte('\n') catch return;
            f.sync() catch return;
        }
    }
    
    // Convenience methods for different log levels
    pub fn debug(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.debug, scope, format, args);
    }
    
    pub fn info(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.info, scope, format, args);
    }
    
    pub fn warn(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.warn, scope, format, args);
    }
    
    pub fn err(self: *Logger, comptime scope: @TypeOf(.EnumLiteral), comptime format: []const u8, args: anytype) void {
        self.log(.err, scope, format, args);
    }
};

// Global logger instance setup
pub fn setupGlobalLogger(allocator: std.mem.Allocator) !void {
    var logger = try Logger.init(allocator);
    // Note: In a real implementation, you'd want to store this logger somewhere accessible
    // For now, this shows the structure
    _ = logger;
}