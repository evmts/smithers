const std = @import("std");
const registry = @import("../agent/tools/registry.zig");
const write_file_mod = @import("../agent/tools/write_file.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

const test_dir = "/tmp/write_file_test";

fn setupTestDir() !void {
    std.fs.cwd().makePath(test_dir) catch {};
}

fn cleanupTestDir() void {
    std.fs.cwd().deleteTree(test_dir) catch {};
}

fn testPath(comptime name: []const u8) []const u8 {
    return test_dir ++ "/" ++ name;
}

fn readTestFile(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
    const file = try std.fs.cwd().openFile(path, .{});
    defer file.close();
    return try file.readToEndAlloc(allocator, 1024 * 1024);
}

fn fileExists(path: []const u8) bool {
    std.fs.cwd().access(path, .{}) catch return false;
    return true;
}

// ============================================================================
// Tool Definition Tests
// ============================================================================

test "write_file tool definition has correct name" {
    try std.testing.expectEqualStrings("write_file", write_file_mod.tool.name);
}

test "write_file tool definition has description" {
    try std.testing.expect(write_file_mod.tool.description.len > 0);
}

test "write_file tool definition has execute_ctx function" {
    try std.testing.expect(write_file_mod.tool.execute_ctx != null);
}

test "write_file legacy export matches tool" {
    try std.testing.expectEqualStrings(write_file_mod.tool.name, write_file_mod.write_file_tool.name);
}

// ============================================================================
// Parameter Validation Tests
// ============================================================================

test "write_file missing path returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"content\": \"hello\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "write_file missing content returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"path\": \"/tmp/test.txt\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: content", result.error_message.?);
}

test "write_file empty args returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "write_file null args returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const ctx = ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "write_file path as non-string type returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"path\": 123, \"content\": \"hello\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "write_file content as non-string type returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"path\": \"/tmp/test.txt\", \"content\": 42}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: content", result.error_message.?);
}

// ============================================================================
// Cancellation Tests
// ============================================================================

test "write_file cancelled returns error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);
    const json = "{\"path\": \"/tmp/test.txt\", \"content\": \"hello\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "write_file not cancelled proceeds" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("cancel_test.txt");
    const json_template = "{{\"path\": \"{s}\", \"content\": \"test\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

// ============================================================================
// File Writing Tests
// ============================================================================

test "write_file creates new file" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("new_file.txt");
    const content = "Hello, World!";
    const json_template = "{{\"path\": \"{s}\", \"content\": \"{s}\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{ path, content });
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(fileExists(path));

    const read_content = try readTestFile(allocator, path);
    defer allocator.free(read_content);
    try std.testing.expectEqualStrings(content, read_content);
}

test "write_file overwrites existing file" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("overwrite.txt");

    // Create initial file
    const file = try std.fs.cwd().createFile(path, .{});
    try file.writeAll("original content");
    file.close();

    const new_content = "new content";
    const json_template = "{{\"path\": \"{s}\", \"content\": \"{s}\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{ path, new_content });
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);

    const read_content = try readTestFile(allocator, path);
    defer allocator.free(read_content);
    try std.testing.expectEqualStrings(new_content, read_content);
}

test "write_file creates parent directories" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("nested/deep/dir/file.txt");
    const content = "nested content";
    const json_template = "{{\"path\": \"{s}\", \"content\": \"{s}\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{ path, content });
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(fileExists(path));

    const read_content = try readTestFile(allocator, path);
    defer allocator.free(read_content);
    try std.testing.expectEqualStrings(content, read_content);
}

test "write_file empty content creates empty file" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("empty.txt");
    const json_template = "{{\"path\": \"{s}\", \"content\": \"\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(fileExists(path));

    const read_content = try readTestFile(allocator, path);
    defer allocator.free(read_content);
    try std.testing.expectEqual(@as(usize, 0), read_content.len);
}

// ============================================================================
// Success Message Tests
// ============================================================================

test "write_file success message contains byte count" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("bytes.txt");
    const content = "12345"; // 5 bytes
    const json_template = "{{\"path\": \"{s}\", \"content\": \"{s}\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{ path, content });
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.content, "5 bytes") != null);
}

test "write_file success message contains path" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("pathcheck.txt");
    const json_template = "{{\"path\": \"{s}\", \"content\": \"x\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.content, path) != null);
}

// ============================================================================
// Edge Cases
// ============================================================================

test "write_file with newlines in content" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("newlines.txt");
    const content = "line1\\nline2\\nline3";
    const json_template = "{{\"path\": \"{s}\", \"content\": \"{s}\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{ path, content });
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

test "write_file with unicode content" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("unicode.txt");
    const content = "Hello 世界 🌍";
    const json_template = "{{\"path\": \"{s}\", \"content\": \"{s}\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{ path, content });
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);

    const read_content = try readTestFile(allocator, path);
    defer allocator.free(read_content);
    try std.testing.expectEqualStrings(content, read_content);
}

test "write_file large content" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("large.txt");

    // Create 64KB content
    const large_content = try allocator.alloc(u8, 64 * 1024);
    defer allocator.free(large_content);
    @memset(large_content, 'X');

    // Build JSON manually since content is too large for format string
    var json_buf = std.ArrayListUnmanaged(u8){};
    defer json_buf.deinit(allocator);
    try json_buf.appendSlice(allocator, "{\"path\": \"");
    try json_buf.appendSlice(allocator, path);
    try json_buf.appendSlice(allocator, "\", \"content\": \"");
    try json_buf.appendSlice(allocator, large_content);
    try json_buf.appendSlice(allocator, "\"}");

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json_buf.items, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);

    const read_content = try readTestFile(allocator, path);
    defer allocator.free(read_content);
    try std.testing.expectEqual(large_content.len, read_content.len);
}

test "write_file to root of existing directory" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const path = testPath("root_file.txt");
    const json_template = "{{\"path\": \"{s}\", \"content\": \"root\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

test "write_file parent directory already exists" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Create parent dir first
    const parent = testPath("existing_parent");
    try std.fs.cwd().makePath(parent);

    const path = testPath("existing_parent/file.txt");
    const json_template = "{{\"path\": \"{s}\", \"content\": \"test\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    try std.testing.expect(result.success);
}

// ============================================================================
// Error Handling Tests
// ============================================================================

test "write_file access denied on read-only location" {
    // Skip if running as root (root can write anywhere)
    if (std.posix.geteuid() == 0) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    // /proc is typically read-only on Linux; use a system path that should fail
    const path = "/proc/write_test.txt";
    const json_template = "{{\"path\": \"{s}\", \"content\": \"test\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    const result = write_file_mod.tool.execute_ctx.?(ctx);
    // Should fail (either access denied or failed to create)
    try std.testing.expect(!result.success);
}

// ============================================================================
// ToolRegistry Integration Tests
// ============================================================================

test "write_file tool can be registered" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(write_file_mod.tool);
    try std.testing.expectEqual(@as(usize, 1), reg.count());

    const tool = reg.get("write_file");
    try std.testing.expect(tool != null);
    try std.testing.expectEqualStrings("write_file", tool.?.name);
}

test "write_file tool executes via registry" {
    try setupTestDir();
    defer cleanupTestDir();

    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(write_file_mod.tool);

    const path = testPath("registry_exec.txt");
    const json_template = "{{\"path\": \"{s}\", \"content\": \"via registry\"}}";
    const json = try std.fmt.allocPrint(allocator, json_template, .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("write_file", parsed.value);
    try std.testing.expect(result.success);
    try std.testing.expect(fileExists(path));
}

test "write_file via registry with cancellation" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(write_file_mod.tool);
    reg.cancel();

    const json = "{\"path\": \"/tmp/should_not_create.txt\", \"content\": \"x\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("write_file", parsed.value);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}
