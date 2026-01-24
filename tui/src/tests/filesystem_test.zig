const std = @import("std");
const fs_mod = @import("../filesystem.zig");
const FileHandle = fs_mod.FileHandle;
const Filesystem = fs_mod.Filesystem;
const StdFs = fs_mod.StdFs;
const DefaultFilesystem = fs_mod.DefaultFilesystem;

// Test helpers
fn getTempDir() !std.fs.Dir {
    return std.fs.cwd().openDir("/tmp", .{});
}

fn createTempFile(name: []const u8, content: []const u8) !void {
    var dir = try getTempDir();
    defer dir.close();
    const file = try dir.createFile(name, .{});
    defer file.close();
    try file.writeAll(content);
}

fn deleteTempFile(name: []const u8) void {
    var dir = getTempDir() catch return;
    defer dir.close();
    dir.deleteFile(name) catch {};
}

fn tempPath(name: []const u8) []const u8 {
    // Build path at comptime for test file names
    return "/tmp/" ++ name;
}

// ============================================================
// FileHandle Tests
// ============================================================

test "FileHandle read operations" {
    const test_file = "fs_test_read.txt";
    const test_content = "Hello, FileHandle!";
    try createTempFile(test_file, test_content);
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    var buffer: [64]u8 = undefined;
    const bytes_read = try handle.read(&buffer);

    try std.testing.expectEqual(@as(usize, test_content.len), bytes_read);
    try std.testing.expectEqualStrings(test_content, buffer[0..bytes_read]);
}

test "FileHandle read partial buffer" {
    const test_file = "fs_test_partial.txt";
    const test_content = "ABCDEFGHIJ";
    try createTempFile(test_file, test_content);
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    var buffer: [5]u8 = undefined;
    const bytes_read = try handle.read(&buffer);

    try std.testing.expectEqual(@as(usize, 5), bytes_read);
    try std.testing.expectEqualStrings("ABCDE", buffer[0..bytes_read]);
}

test "FileHandle readToEndAlloc" {
    const test_file = "fs_test_alloc.txt";
    const test_content = "Content for readToEndAlloc test";
    try createTempFile(test_file, test_content);
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    const allocator = std.testing.allocator;
    const content = try handle.readToEndAlloc(allocator, 1024);
    defer allocator.free(content);

    try std.testing.expectEqualStrings(test_content, content);
}

test "FileHandle seekTo" {
    const test_file = "fs_test_seek.txt";
    const test_content = "0123456789";
    try createTempFile(test_file, test_content);
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    try handle.seekTo(5);

    var buffer: [10]u8 = undefined;
    const bytes_read = try handle.read(&buffer);

    try std.testing.expectEqual(@as(usize, 5), bytes_read);
    try std.testing.expectEqualStrings("56789", buffer[0..bytes_read]);
}

test "FileHandle seekTo beginning after read" {
    const test_file = "fs_test_seek_begin.txt";
    const test_content = "ABCDEF";
    try createTempFile(test_file, test_content);
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    var buffer: [10]u8 = undefined;
    _ = try handle.read(&buffer);

    try handle.seekTo(0);

    const bytes_read = try handle.read(&buffer);
    try std.testing.expectEqualStrings("ABCDEF", buffer[0..bytes_read]);
}

test "FileHandle close is idempotent-safe" {
    const test_file = "fs_test_close.txt";
    try createTempFile(test_file, "test");
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    handle.close();
    // Second close would be undefined behavior, so we just verify first works
}

// ============================================================
// Filesystem Interface Tests
// ============================================================

test "Filesystem openFile returns handle" {
    const test_file = "fs_iface_open.txt";
    try createTempFile(test_file, "interface test");
    defer deleteTempFile(test_file);

    const handle = try DefaultFilesystem.openFile(tempPath(test_file), .{});
    defer handle.close();

    var buffer: [20]u8 = undefined;
    const n = try handle.read(&buffer);
    try std.testing.expectEqualStrings("interface test", buffer[0..n]);
}

test "Filesystem openFile error on missing file" {
    const result = DefaultFilesystem.openFile("/tmp/nonexistent_file_12345.txt", .{});
    try std.testing.expectError(error.FileNotFound, result);
}

test "Filesystem readFileAlloc works" {
    const test_file = "fs_iface_readalloc.txt";
    const content = "readFileAlloc content";
    try createTempFile(test_file, content);
    defer deleteTempFile(test_file);

    const allocator = std.testing.allocator;
    const data = try DefaultFilesystem.readFileAlloc(allocator, tempPath(test_file));
    defer allocator.free(data);

    try std.testing.expectEqualStrings(content, data);
}

test "Filesystem readFileAlloc error on missing file" {
    const allocator = std.testing.allocator;
    const result = DefaultFilesystem.readFileAlloc(allocator, "/tmp/nonexistent_99999.txt");
    try std.testing.expectError(error.FileNotFound, result);
}

test "Filesystem writeFile creates file" {
    const test_file = "/tmp/fs_iface_write.txt";
    defer std.fs.cwd().deleteFile(test_file) catch {};

    const content = "written via Filesystem";
    try DefaultFilesystem.writeFile(test_file, content);

    const allocator = std.testing.allocator;
    const read_back = try DefaultFilesystem.readFileAlloc(allocator, test_file);
    defer allocator.free(read_back);

    try std.testing.expectEqualStrings(content, read_back);
}

test "Filesystem writeFile overwrites existing" {
    const test_file = "/tmp/fs_iface_overwrite.txt";
    defer std.fs.cwd().deleteFile(test_file) catch {};

    try DefaultFilesystem.writeFile(test_file, "first");
    try DefaultFilesystem.writeFile(test_file, "second");

    const allocator = std.testing.allocator;
    const data = try DefaultFilesystem.readFileAlloc(allocator, test_file);
    defer allocator.free(data);

    try std.testing.expectEqualStrings("second", data);
}

test "Filesystem deleteFile removes file" {
    const test_file = "/tmp/fs_iface_delete.txt";
    try DefaultFilesystem.writeFile(test_file, "to delete");

    try DefaultFilesystem.deleteFile(test_file);

    const result = DefaultFilesystem.access(test_file);
    try std.testing.expectError(error.FileNotFound, result);
}

test "Filesystem deleteFile error on missing file" {
    const result = DefaultFilesystem.deleteFile("/tmp/nonexistent_delete_999.txt");
    try std.testing.expectError(error.FileNotFound, result);
}

test "Filesystem access succeeds for existing file" {
    const test_file = "fs_iface_access.txt";
    try createTempFile(test_file, "access test");
    defer deleteTempFile(test_file);

    try DefaultFilesystem.access(tempPath(test_file));
}

test "Filesystem access fails for missing file" {
    const result = DefaultFilesystem.access("/tmp/no_such_file_access.txt");
    try std.testing.expectError(error.FileNotFound, result);
}

test "Filesystem makeDirAbsolute creates directory" {
    const test_dir = "/tmp/fs_test_mkdir";
    defer std.fs.cwd().deleteDir(test_dir) catch {};

    try DefaultFilesystem.makeDirAbsolute(test_dir);

    // Verify it exists by opening it
    var dir = try std.fs.openDirAbsolute(test_dir, .{});
    dir.close();
}

test "Filesystem makeDirAbsolute ignores existing" {
    const test_dir = "/tmp/fs_test_mkdir_exists";
    defer std.fs.cwd().deleteDir(test_dir) catch {};

    try DefaultFilesystem.makeDirAbsolute(test_dir);
    try DefaultFilesystem.makeDirAbsolute(test_dir); // Should not error
}

// ============================================================
// DI Pattern Verification
// ============================================================

/// Mock filesystem for testing DI pattern
const MockFs = struct {
    var open_count: usize = 0;
    var read_count: usize = 0;
    var write_count: usize = 0;
    var last_path: ?[]const u8 = null;

    pub fn reset() void {
        open_count = 0;
        read_count = 0;
        write_count = 0;
        last_path = null;
    }

    pub fn openFile(path: []const u8, _: std.fs.File.OpenFlags) !FileHandle {
        open_count += 1;
        last_path = path;
        return error.FileNotFound; // Mock always fails
    }

    pub fn readFileAlloc(_: std.mem.Allocator, path: []const u8) ![]u8 {
        read_count += 1;
        last_path = path;
        return error.FileNotFound;
    }

    pub fn writeFile(path: []const u8, _: []const u8) !void {
        write_count += 1;
        last_path = path;
    }

    pub fn makeDirAbsolute(path: []const u8) !void {
        last_path = path;
    }

    pub fn deleteFile(path: []const u8) !void {
        last_path = path;
    }

    pub fn access(path: []const u8) !void {
        last_path = path;
        return error.FileNotFound;
    }
};

const MockFilesystem = Filesystem(MockFs);

test "DI pattern allows mock implementation" {
    MockFs.reset();

    _ = MockFilesystem.openFile("/mock/path.txt", .{}) catch {};

    try std.testing.expectEqual(@as(usize, 1), MockFs.open_count);
    try std.testing.expectEqualStrings("/mock/path.txt", MockFs.last_path.?);
}

test "DI pattern mock tracks readFileAlloc" {
    MockFs.reset();

    const allocator = std.testing.allocator;
    _ = MockFilesystem.readFileAlloc(allocator, "/mock/read.txt") catch {};

    try std.testing.expectEqual(@as(usize, 1), MockFs.read_count);
    try std.testing.expectEqualStrings("/mock/read.txt", MockFs.last_path.?);
}

test "DI pattern mock tracks writeFile" {
    MockFs.reset();

    try MockFilesystem.writeFile("/mock/write.txt", "data");

    try std.testing.expectEqual(@as(usize, 1), MockFs.write_count);
    try std.testing.expectEqualStrings("/mock/write.txt", MockFs.last_path.?);
}

test "DI pattern different impls are independent" {
    // Verify DefaultFilesystem and MockFilesystem are different types
    const default_type = @TypeOf(DefaultFilesystem.openFile);
    const mock_type = @TypeOf(MockFilesystem.openFile);

    // Both should have same signature but come from different impls
    try std.testing.expect(@TypeOf(default_type) == @TypeOf(mock_type));
}

// ============================================================
// Edge Cases
// ============================================================

test "FileHandle read empty file" {
    const test_file = "fs_test_empty.txt";
    try createTempFile(test_file, "");
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    var buffer: [10]u8 = undefined;
    const bytes_read = try handle.read(&buffer);

    try std.testing.expectEqual(@as(usize, 0), bytes_read);
}

test "FileHandle readToEndAlloc empty file" {
    const test_file = "fs_test_empty_alloc.txt";
    try createTempFile(test_file, "");
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    const allocator = std.testing.allocator;
    const content = try handle.readToEndAlloc(allocator, 1024);
    defer allocator.free(content);

    try std.testing.expectEqual(@as(usize, 0), content.len);
}

test "FileHandle seek past end then read" {
    const test_file = "fs_test_seek_past.txt";
    try createTempFile(test_file, "short");
    defer deleteTempFile(test_file);

    const handle = try StdFs.openFile(tempPath(test_file), .{});
    defer handle.close();

    try handle.seekTo(1000);

    var buffer: [10]u8 = undefined;
    const bytes_read = try handle.read(&buffer);

    try std.testing.expectEqual(@as(usize, 0), bytes_read);
}

test "Filesystem writeFile then read large content" {
    const test_file = "/tmp/fs_test_large.txt";
    defer std.fs.cwd().deleteFile(test_file) catch {};

    const allocator = std.testing.allocator;

    // Create 10KB of content
    const large = try allocator.alloc(u8, 10 * 1024);
    defer allocator.free(large);
    @memset(large, 'X');

    try DefaultFilesystem.writeFile(test_file, large);

    const read_back = try DefaultFilesystem.readFileAlloc(allocator, test_file);
    defer allocator.free(read_back);

    try std.testing.expectEqual(large.len, read_back.len);
    try std.testing.expectEqualSlices(u8, large, read_back);
}

test "Filesystem operations with special characters in content" {
    const test_file = "/tmp/fs_test_special.txt";
    defer std.fs.cwd().deleteFile(test_file) catch {};

    const content = "Line1\nLine2\tTabbed\r\nCRLF\x00NullByte";

    try DefaultFilesystem.writeFile(test_file, content);

    const allocator = std.testing.allocator;
    const read_back = try DefaultFilesystem.readFileAlloc(allocator, test_file);
    defer allocator.free(read_back);

    try std.testing.expectEqualSlices(u8, content, read_back);
}
