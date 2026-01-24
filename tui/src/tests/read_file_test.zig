const std = @import("std");
const read_file = @import("../agent/tools/read_file.zig");
const registry = @import("../agent/tools/registry.zig");

// Re-export inline tests
test {
    _ = read_file;
}

test "read_file tool has correct name" {
    try std.testing.expectEqualStrings("read_file", read_file.tool.name);
}

test "read_file tool has description" {
    try std.testing.expect(read_file.tool.description.len > 0);
}

test "read_file tool has execute_ctx" {
    try std.testing.expect(read_file.tool.execute_ctx != null);
}

test "read_file legacy export matches tool" {
    try std.testing.expectEqualStrings(read_file.read_file_tool.name, read_file.tool.name);
}

test "read_file missing path" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "read_file cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);
    
    const json = "{\"path\": \"/tmp/test.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "read_file nonexistent file" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const json = "{\"path\": \"/nonexistent_file_12345.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("File not found", result.error_message.?);
}

test "read_file on directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const json = "{\"path\": \"/tmp\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Path is a directory, not a file", result.error_message.?);
}

test "read_file reads simple file" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create temp file
    const test_file = "/tmp/read_file_test.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    try file.writeAll("line1\nline2\nline3\n");
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_test.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.content, "line1") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.content, "line2") != null);
}

test "read_file with offset" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create temp file
    const test_file = "/tmp/read_file_offset_test.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    try file.writeAll("line0\nline1\nline2\nline3\n");
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_offset_test.txt\", \"offset\": 2}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    // Should start from line2
    try std.testing.expect(std.mem.indexOf(u8, result.content, "line2") != null);
}

test "read_file offset beyond end" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create temp file
    const test_file = "/tmp/read_file_offset_end.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    try file.writeAll("line1\n");
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_offset_end.txt\", \"offset\": 100}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.error_message.?, "beyond") != null);
}

test "read_file with limit" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create temp file with many lines
    const test_file = "/tmp/read_file_limit_test.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    var i: usize = 0;
    while (i < 100) : (i += 1) {
        try file.writer().print("line{d}\n", .{i});
    }
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_limit_test.txt\", \"limit\": 5}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    // Should indicate more lines available
    try std.testing.expect(result.truncated or std.mem.indexOf(u8, result.content, "more") != null);
}

test "read_file binary file detection" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create binary file
    const test_file = "/tmp/read_file_binary.bin";
    const file = try std.fs.cwd().createFile(test_file, .{});
    try file.writeAll(&[_]u8{ 0x00, 0x01, 0x02, 0x00 });
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_binary.bin\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cannot read binary file", result.error_message.?);
}

test "read_file empty file" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create empty file
    const test_file = "/tmp/read_file_empty.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_empty.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

test "read_file unicode content" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create file with unicode
    const test_file = "/tmp/read_file_unicode.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    try file.writeAll("日本語\nемодзі 🎉\n");
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/read_file_unicode.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = read_file.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.content, "日本語") != null);
}
