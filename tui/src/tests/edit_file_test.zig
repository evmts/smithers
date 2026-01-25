const std = @import("std");
const registry = @import("../agent/tools/registry.zig");
const edit_file = @import("../agent/tools/edit_file.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;

// ============================================================================
// Helper Functions
// ============================================================================

fn createMockContext(
    allocator: std.mem.Allocator,
    json_str: []const u8,
    cancelled: *std.atomic.Value(bool),
) !struct { ctx: ToolContext, parsed: std.json.Parsed(std.json.Value) } {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json_str, .{});
    return .{
        .ctx = ToolContext{
            .allocator = allocator,
            .args = parsed.value,
            .cancelled = cancelled,
            .cwd = "/tmp",
        },
        .parsed = parsed,
    };
}

fn createTempFile(allocator: std.mem.Allocator, content: []const u8) ![]const u8 {
    const tmp_dir = std.fs.cwd().openDir("/tmp", .{}) catch return error.TmpDirNotFound;
    defer tmp_dir.close();

    const rand = std.crypto.random.int(u64);
    // Create full path directly without intermediate allocation
    const full_path = try std.fmt.allocPrint(allocator, "/tmp/edit_file_test_{d}.txt", .{rand});
    errdefer allocator.free(full_path);

    // Extract just the filename part for createFile
    const filename = std.fs.path.basename(full_path);
    const file = try tmp_dir.createFile(filename, .{});
    defer file.close();
    try file.writeAll(content);

    return full_path;
}

fn deleteTempFile(path: []const u8) void {
    std.fs.cwd().deleteFile(path) catch {};
}

fn readFileContent(allocator: std.mem.Allocator, path: []const u8) ![]const u8 {
    const file = try std.fs.cwd().openFile(path, .{});
    defer file.close();
    return try file.readToEndAlloc(allocator, 10 * 1024 * 1024);
}

// ============================================================================
// Tool Definition Tests
// ============================================================================

test "edit_file tool has correct name" {
    try std.testing.expectEqualStrings("edit_file", edit_file.tool.name);
}

test "edit_file tool has execute_ctx function" {
    try std.testing.expect(edit_file.tool.execute_ctx != null);
}

test "edit_file tool has non-empty description" {
    try std.testing.expect(edit_file.tool.description.len > 0);
}

test "edit_file tool description mentions parameters" {
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "path") != null);
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "old_str") != null);
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "new_str") != null);
}

test "edit_file tool legacy export exists" {
    try std.testing.expectEqualStrings("edit_file", edit_file.edit_file_tool.name);
}

// ============================================================================
// Parameter Validation Tests
// ============================================================================

test "edit_file requires path parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"old_str\": \"a\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "edit_file requires old_str parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/test.txt\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: old_str", result.error_message.?);
}

test "edit_file requires new_str parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/test.txt\", \"old_str\": \"a\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: new_str", result.error_message.?);
}

test "edit_file rejects old_str equal to new_str" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/test.txt\", \"old_str\": \"same\", \"new_str\": \"same\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("old_str and new_str must be different", result.error_message.?);
}

// ============================================================================
// Cancellation Tests
// ============================================================================

test "edit_file respects cancellation before file operations" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/test.txt\", \"old_str\": \"a\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

// ============================================================================
// File Not Found Tests
// ============================================================================

test "edit_file returns error for nonexistent file" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/nonexistent_file_12345.txt\", \"old_str\": \"a\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("File not found", result.error_message.?);
}

// ============================================================================
// Basic Edit Tests
// ============================================================================

test "edit_file replaces single occurrence" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "Hello World");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"World\", \"new_str\": \"Zig\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("File edited successfully", result.content);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("Hello Zig", content);
}

test "edit_file handles multiline content" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "line1\nline2\nline3");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"line2\", \"new_str\": \"replaced\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("line1\nreplaced\nline3", content);
}

test "edit_file replaces multiline old_str" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "start\nmiddle\nend");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"start\\nmiddle\", \"new_str\": \"replaced\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("replaced\nend", content);
}

test "edit_file replaces with empty string (deletion)" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "keep this remove this keep that");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"remove this \", \"new_str\": \"\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("keep this keep that", content);
}

test "edit_file inserts content (empty old_str at position)" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "Hello World");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"Hello \", \"new_str\": \"Hello Beautiful \"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("Hello Beautiful World", content);
}

// ============================================================================
// Multiple Occurrence Tests
// ============================================================================

test "edit_file rejects multiple occurrences" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "foo bar foo baz foo");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"foo\", \"new_str\": \"qux\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.error_message.?, "multiple occurrences") != null);
}

test "edit_file succeeds with unique context for ambiguous match" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "foo bar\nfoo baz");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"foo bar\", \"new_str\": \"qux bar\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("qux bar\nfoo baz", content);
}

// ============================================================================
// String Not Found Tests
// ============================================================================

test "edit_file returns error when old_str not found" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "Hello World");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"NotInFile\", \"new_str\": \"replacement\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.error_message.?, "not found") != null);
}

// ============================================================================
// Fuzzy Match Tests
// ============================================================================

test "edit_file fuzzy match with trimmed whitespace" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "  hello world  \nnext line");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"hello world\", \"new_str\": \"replaced\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.content, "fuzzy") != null);
}

// ============================================================================
// Edge Cases
// ============================================================================

test "edit_file handles empty file" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"anything\", \"new_str\": \"replacement\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.error_message.?, "not found") != null);
}

test "edit_file handles file with only whitespace" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "   \n\t\n   ");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"\\t\", \"new_str\": \"tab\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expect(std.mem.indexOf(u8, content, "tab") != null);
}

test "edit_file preserves file when old_str at start" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "PREFIX rest of content");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"PREFIX\", \"new_str\": \"NEWPREFIX\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("NEWPREFIX rest of content", content);
}

test "edit_file preserves file when old_str at end" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "content before SUFFIX");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"SUFFIX\", \"new_str\": \"NEWSUFFIX\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("content before NEWSUFFIX", content);
}

test "edit_file handles special characters" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "special: @#$% chars");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"@#$%\", \"new_str\": \"REPLACED\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("special: REPLACED chars", content);
}

test "edit_file handles unicode content" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "Hello 世界 emoji 🎉");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"世界\", \"new_str\": \"World\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("Hello World emoji 🎉", content);
}

test "edit_file handles very long lines" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    var long_line = try allocator.alloc(u8, 10000);
    defer allocator.free(long_line);
    @memset(long_line, 'x');
    long_line[5000] = 'Y';

    const path = try createTempFile(allocator, long_line);
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"Y\", \"new_str\": \"Z\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expect(content[5000] == 'Z');
}

test "edit_file case sensitive match" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "Hello HELLO hello");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"HELLO\", \"new_str\": \"REPLACED\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("Hello REPLACED hello", content);
}

// ============================================================================
// Whitespace Handling Tests
// ============================================================================

test "edit_file preserves leading whitespace" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "    indented line");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"    indented\", \"new_str\": \"    modified\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("    modified line", content);
}

test "edit_file preserves trailing newlines" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const path = try createTempFile(allocator, "content\n\n\n");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"content\", \"new_str\": \"modified\"}}", .{path});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("modified\n\n\n", content);
}

// ============================================================================
// Registry Integration Tests
// ============================================================================

test "edit_file tool registers in builtin registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    const tool = reg.get("edit_file");
    try std.testing.expect(tool != null);
    try std.testing.expectEqualStrings("edit_file", tool.?.name);
}

test "edit_file tool executable via registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    const path = try createTempFile(allocator, "registry test content");
    defer allocator.free(path);
    defer deleteTempFile(path);

    const json = try std.fmt.allocPrint(allocator, "{{\"path\": \"{s}\", \"old_str\": \"test\", \"new_str\": \"success\"}}", .{path});
    defer allocator.free(json);

    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("edit_file", parsed.value);
    try std.testing.expect(result.success);

    const content = try readFileContent(allocator, path);
    defer allocator.free(content);
    try std.testing.expectEqualStrings("registry success content", content);
}
