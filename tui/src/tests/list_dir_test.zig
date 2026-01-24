const std = @import("std");
const list_dir = @import("../agent/tools/list_dir.zig");
const registry = @import("../agent/tools/registry.zig");

// Re-export inline tests
test {
    _ = list_dir;
}

test "list_dir tool has correct name" {
    try std.testing.expectEqualStrings("list_dir", list_dir.tool.name);
}

test "list_dir tool has description" {
    try std.testing.expect(list_dir.tool.description.len > 0);
}

test "list_dir tool has execute_ctx" {
    try std.testing.expect(list_dir.tool.execute_ctx != null);
}

test "list_dir legacy export matches tool" {
    try std.testing.expectEqualStrings(list_dir.list_dir_tool.name, list_dir.tool.name);
}

test "list_dir missing path uses default" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    // Should succeed or return error about directory - not "missing path"
    try std.testing.expect(result.error_message == null or 
        !std.mem.eql(u8, result.error_message.?, "Missing required parameter: path"));
}

test "list_dir cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "list_dir nonexistent directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const json = "{\"path\": \"/nonexistent_path_12345\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Directory not found", result.error_message.?);
}

test "list_dir on file returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create temp file
    const test_file = "/tmp/list_dir_test_file.txt";
    const file = try std.fs.cwd().createFile(test_file, .{});
    file.close();
    defer std.fs.cwd().deleteFile(test_file) catch {};
    
    const json = "{\"path\": \"/tmp/list_dir_test_file.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Path is not a directory", result.error_message.?);
}

test "list_dir reads current directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const json = "{\"path\": \".\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(result.content.len > 0);
}

test "list_dir with depth parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const json = "{\"path\": \".\", \"depth\": 2}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

test "list_dir empty directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Create empty temp dir
    const test_dir = "/tmp/list_dir_test_empty";
    std.fs.cwd().makeDir(test_dir) catch {};
    defer std.fs.cwd().deleteDir(test_dir) catch {};
    
    const json = "{\"path\": \"/tmp/list_dir_test_empty\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("(empty directory)", result.content);
}

test "list_dir depth clamp" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    // Depth > MAX_DEPTH should be clamped
    const json = "{\"path\": \".\", \"depth\": 100}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

test "list_dir negative depth uses default" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    
    const json = "{\"path\": \".\", \"depth\": -5}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();
    
    const ctx = registry.ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };
    
    const result = list_dir.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}
