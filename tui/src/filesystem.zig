const std = @import("std");

/// File handle abstraction
pub const FileHandle = struct {
    inner: std.fs.File,

    pub fn read(self: FileHandle, buffer: []u8) !usize {
        return self.inner.read(buffer);
    }

    pub fn readToEndAlloc(self: FileHandle, allocator: std.mem.Allocator, max_size: usize) ![]u8 {
        return self.inner.readToEndAlloc(allocator, max_size);
    }

    pub fn seekTo(self: FileHandle, pos: u64) !void {
        try self.inner.seekTo(pos);
    }

    pub fn close(self: FileHandle) void {
        self.inner.close();
    }
};

/// Filesystem interface via comptime DI
pub fn Filesystem(comptime Impl: type) type {
    return struct {
        pub fn openFile(path: []const u8, flags: std.fs.File.OpenFlags) !FileHandle {
            return Impl.openFile(path, flags);
        }

        pub fn readFileAlloc(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
            return Impl.readFileAlloc(allocator, path);
        }

        pub fn writeFile(path: []const u8, data: []const u8) !void {
            return Impl.writeFile(path, data);
        }

        pub fn makeDirAbsolute(path: []const u8) !void {
            return Impl.makeDirAbsolute(path);
        }

        pub fn deleteFile(path: []const u8) !void {
            return Impl.deleteFile(path);
        }

        pub fn access(path: []const u8) !void {
            return Impl.access(path);
        }
    };
}

/// Production implementation using std.fs
pub const StdFs = struct {
    pub fn openFile(path: []const u8, flags: std.fs.File.OpenFlags) !FileHandle {
        const file = try std.fs.cwd().openFile(path, flags);
        return .{ .inner = file };
    }

    pub fn readFileAlloc(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
        return std.fs.cwd().readFileAlloc(allocator, path, 10 * 1024 * 1024);
    }

    pub fn writeFile(path: []const u8, data: []const u8) !void {
        const file = try std.fs.cwd().createFile(path, .{});
        defer file.close();
        try file.writeAll(data);
    }

    pub fn makeDirAbsolute(path: []const u8) !void {
        std.fs.makeDirAbsolute(path) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };
    }

    pub fn deleteFile(path: []const u8) !void {
        try std.fs.cwd().deleteFile(path);
    }

    pub fn access(path: []const u8) !void {
        _ = try std.fs.cwd().statFile(path);
    }
};

test "Filesystem interface compiles" {
    // Just ensure interface compiles with explicit type
    _ = Filesystem(StdFs);
}
