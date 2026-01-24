const std = @import("std");
const registry = @import("../agent/tools/registry.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const ToolRegistry = registry.ToolRegistry;

// Tool modules
const bash = @import("../agent/tools/bash.zig");
const read_file = @import("../agent/tools/read_file.zig");
const write_file = @import("../agent/tools/write_file.zig");
const edit_file = @import("../agent/tools/edit_file.zig");
const glob = @import("../agent/tools/glob.zig");
const grep = @import("../agent/tools/grep.zig");
const list_dir = @import("../agent/tools/list_dir.zig");

// ============================================================================
// Helper Functions
// ============================================================================

fn createMockContext(allocator: std.mem.Allocator, json_str: []const u8, cancelled: *std.atomic.Value(bool)) !struct { ctx: ToolContext, parsed: std.json.Parsed(std.json.Value) } {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json_str, .{});
    return .{
        .ctx = ToolContext{
            .allocator = allocator,
            .args = parsed.value,
            .cancelled = cancelled,
            .cwd = ".",
        },
        .parsed = parsed,
    };
}

// ============================================================================
// Bash Tool Tests
// ============================================================================

test "bash tool definition" {
    try std.testing.expectEqualStrings("bash", bash.tool.name);
    try std.testing.expect(bash.tool.execute_ctx != null);
    try std.testing.expect(bash.tool.description.len > 0);
    try std.testing.expect(std.mem.indexOf(u8, bash.tool.description, "bash") != null);
}

test "bash tool description mentions output truncation" {
    try std.testing.expect(std.mem.indexOf(u8, bash.tool.description, "truncated") != null or
        std.mem.indexOf(u8, bash.tool.description, "500") != null);
}

test "bash tool requires command parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = bash.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: command", result.error_message.?);
}

test "bash tool respects cancellation before start" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"command\": \"echo test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = bash.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "bash tool legacy export exists" {
    try std.testing.expectEqualStrings("bash", bash.bash_tool.name);
}

// ============================================================================
// Read File Tool Tests
// ============================================================================

test "read_file tool definition" {
    try std.testing.expectEqualStrings("read_file", read_file.tool.name);
    try std.testing.expect(read_file.tool.execute_ctx != null);
    try std.testing.expect(read_file.tool.description.len > 0);
}

test "read_file tool description mentions parameters" {
    try std.testing.expect(std.mem.indexOf(u8, read_file.tool.description, "path") != null);
    try std.testing.expect(std.mem.indexOf(u8, read_file.tool.description, "offset") != null);
    try std.testing.expect(std.mem.indexOf(u8, read_file.tool.description, "limit") != null);
}

test "read_file tool requires path parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = read_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "read_file tool respects cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"path\": \"/some/file\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = read_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "read_file tool handles file not found" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/nonexistent/path/to/file/12345.txt\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = read_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("File not found", result.error_message.?);
}

test "read_file tool legacy export exists" {
    try std.testing.expectEqualStrings("read_file", read_file.read_file_tool.name);
}

// ============================================================================
// Write File Tool Tests
// ============================================================================

test "write_file tool definition" {
    try std.testing.expectEqualStrings("write_file", write_file.tool.name);
    try std.testing.expect(write_file.tool.execute_ctx != null);
    try std.testing.expect(write_file.tool.description.len > 0);
}

test "write_file tool description mentions parameters" {
    try std.testing.expect(std.mem.indexOf(u8, write_file.tool.description, "path") != null);
    try std.testing.expect(std.mem.indexOf(u8, write_file.tool.description, "content") != null);
}

test "write_file tool description mentions creating directories" {
    try std.testing.expect(std.mem.indexOf(u8, write_file.tool.description, "directories") != null or
        std.mem.indexOf(u8, write_file.tool.description, "Creates") != null);
}

test "write_file tool requires path parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"content\": \"test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = write_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "write_file tool requires content parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/test.txt\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = write_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: content", result.error_message.?);
}

test "write_file tool respects cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/test.txt\", \"content\": \"test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = write_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "write_file tool legacy export exists" {
    try std.testing.expectEqualStrings("write_file", write_file.write_file_tool.name);
}

// ============================================================================
// Edit File Tool Tests
// ============================================================================

test "edit_file tool definition" {
    try std.testing.expectEqualStrings("edit_file", edit_file.tool.name);
    try std.testing.expect(edit_file.tool.execute_ctx != null);
    try std.testing.expect(edit_file.tool.description.len > 0);
}

test "edit_file tool description mentions parameters" {
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "path") != null);
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "old_str") != null);
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "new_str") != null);
}

test "edit_file tool description mentions uniqueness" {
    try std.testing.expect(std.mem.indexOf(u8, edit_file.tool.description, "unique") != null);
}

test "edit_file tool requires path parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"old_str\": \"a\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: path", result.error_message.?);
}

test "edit_file tool requires old_str parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/f.txt\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: old_str", result.error_message.?);
}

test "edit_file tool requires new_str parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/f.txt\", \"old_str\": \"a\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: new_str", result.error_message.?);
}

test "edit_file tool rejects same old_str and new_str" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/f.txt\", \"old_str\": \"same\", \"new_str\": \"same\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("old_str and new_str must be different", result.error_message.?);
}

test "edit_file tool respects cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"path\": \"/tmp/f.txt\", \"old_str\": \"a\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "edit_file tool handles file not found" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/nonexistent/path/12345.txt\", \"old_str\": \"a\", \"new_str\": \"b\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = edit_file.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("File not found", result.error_message.?);
}

test "edit_file tool legacy export exists" {
    try std.testing.expectEqualStrings("edit_file", edit_file.edit_file_tool.name);
}

// ============================================================================
// Glob Tool Tests
// ============================================================================

test "glob tool definition" {
    try std.testing.expectEqualStrings("glob", glob.tool.name);
    try std.testing.expect(glob.tool.execute_ctx != null);
    try std.testing.expect(glob.tool.description.len > 0);
}

test "glob tool description mentions pattern" {
    try std.testing.expect(std.mem.indexOf(u8, glob.tool.description, "pattern") != null);
}

test "glob tool description mentions max results" {
    try std.testing.expect(std.mem.indexOf(u8, glob.tool.description, "100") != null);
}

test "glob tool requires pattern parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: pattern", result.error_message.?);
}

test "glob tool respects cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "glob tool legacy export exists" {
    try std.testing.expectEqualStrings("glob", glob.glob_tool.name);
}

// ============================================================================
// Grep Tool Tests
// ============================================================================

test "grep tool definition" {
    try std.testing.expectEqualStrings("grep", grep.tool.name);
    try std.testing.expect(grep.tool.execute_ctx != null);
    try std.testing.expect(grep.tool.description.len > 0);
}

test "grep tool description mentions pattern" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "pattern") != null);
}

test "grep tool description mentions ripgrep" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "ripgrep") != null);
}

test "grep tool description mentions max results" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "100") != null);
}

test "grep tool requires pattern parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: pattern", result.error_message.?);
}

test "grep tool respects cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "grep tool legacy export exists" {
    try std.testing.expectEqualStrings("grep", grep.grep_tool.name);
}

// ============================================================================
// List Dir Tool Tests
// ============================================================================

test "list_dir tool definition" {
    try std.testing.expectEqualStrings("list_dir", list_dir.tool.name);
    try std.testing.expect(list_dir.tool.execute_ctx != null);
    try std.testing.expect(list_dir.tool.description.len > 0);
}

test "list_dir tool description mentions path" {
    try std.testing.expect(std.mem.indexOf(u8, list_dir.tool.description, "path") != null);
}

test "list_dir tool description mentions depth" {
    try std.testing.expect(std.mem.indexOf(u8, list_dir.tool.description, "depth") != null);
}

test "list_dir tool description mentions max entries" {
    try std.testing.expect(std.mem.indexOf(u8, list_dir.tool.description, "500") != null);
}

test "list_dir tool respects cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"path\": \".\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = list_dir.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "list_dir tool handles directory not found" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"path\": \"/nonexistent/dir/12345\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = list_dir.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Directory not found", result.error_message.?);
}

test "list_dir tool legacy export exists" {
    try std.testing.expectEqualStrings("list_dir", list_dir.list_dir_tool.name);
}

// ============================================================================
// Registry Integration Tests
// ============================================================================

test "all tools registered in builtin registry" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    try std.testing.expect(reg.get("bash") != null);
    try std.testing.expect(reg.get("read_file") != null);
    try std.testing.expect(reg.get("write_file") != null);
    try std.testing.expect(reg.get("edit_file") != null);
    try std.testing.expect(reg.get("glob") != null);
    try std.testing.expect(reg.get("grep") != null);
    try std.testing.expect(reg.get("list_dir") != null);
}

test "builtin registry has expected tool count" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    try std.testing.expectEqual(@as(usize, 7), reg.count());
}

test "tools have unique names" {
    const tools = [_]*const registry.Tool{
        &bash.tool,
        &read_file.tool,
        &write_file.tool,
        &edit_file.tool,
        &glob.tool,
        &grep.tool,
        &list_dir.tool,
    };

    for (tools, 0..) |t1, i| {
        for (tools[i + 1 ..]) |t2| {
            try std.testing.expect(!std.mem.eql(u8, t1.name, t2.name));
        }
    }
}

test "all tools have non-empty descriptions" {
    const tools = [_]*const registry.Tool{
        &bash.tool,
        &read_file.tool,
        &write_file.tool,
        &edit_file.tool,
        &glob.tool,
        &grep.tool,
        &list_dir.tool,
    };

    for (tools) |t| {
        try std.testing.expect(t.description.len > 0);
    }
}

test "all tools have execute_ctx function" {
    const tools = [_]*const registry.Tool{
        &bash.tool,
        &read_file.tool,
        &write_file.tool,
        &edit_file.tool,
        &glob.tool,
        &grep.tool,
        &list_dir.tool,
    };

    for (tools) |t| {
        try std.testing.expect(t.execute_ctx != null);
    }
}
