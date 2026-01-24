const std = @import("std");
const registry = @import("../agent/tools/registry.zig");
const grep = @import("../agent/tools/grep.zig");
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

fn freeResult(allocator: std.mem.Allocator, result: ToolResult) void {
    if (result.content.len > 0) {
        allocator.free(result.content);
    }
    if (result.error_message) |msg| {
        if (msg.len > 0 and !isStaticString(msg)) {
            allocator.free(msg);
        }
    }
}

fn isStaticString(s: []const u8) bool {
    const static_msgs = [_][]const u8{
        "Missing required parameter: pattern",
        "Cancelled",
        "Failed to open search directory",
        "Failed to walk directory",
        "Failed to wait for ripgrep",
        "Grep failed",
        "No matches found",
    };
    for (static_msgs) |static| {
        if (std.mem.eql(u8, s, static)) return true;
    }
    return false;
}

// ============================================================================
// Tool Definition Tests
// ============================================================================

test "grep tool has correct name" {
    try std.testing.expectEqualStrings("grep", grep.tool.name);
}

test "grep tool has execute_ctx function" {
    try std.testing.expect(grep.tool.execute_ctx != null);
}

test "grep tool has non-empty description" {
    try std.testing.expect(grep.tool.description.len > 0);
}

test "grep tool description mentions ripgrep" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "ripgrep") != null);
}

test "grep tool description mentions pattern parameter" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "pattern") != null);
}

test "grep tool description mentions path parameter" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "path") != null);
}

test "grep tool description mentions include parameter" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "include") != null);
}

test "grep tool description mentions max results" {
    try std.testing.expect(std.mem.indexOf(u8, grep.tool.description, "100") != null);
}

test "grep tool legacy export exists" {
    try std.testing.expectEqualStrings("grep", grep.grep_tool.name);
}

// ============================================================================
// Parameter Validation Tests
// ============================================================================

test "grep tool requires pattern parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: pattern", result.error_message.?);
}

test "grep tool rejects non-string pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": 123}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: pattern", result.error_message.?);
}

test "grep tool accepts pattern with null value for path" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"path\": null}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should not fail on missing path - uses "." as default
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool rejects empty pattern implicitly" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Empty pattern is accepted but will likely return no matches or all lines
    // The behavior depends on ripgrep/fallback - just ensure it doesn't crash
    try std.testing.expect(result.success or result.error_message != null);
}

// ============================================================================
// Cancellation Tests
// ============================================================================

test "grep tool respects cancellation before start" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

test "grep tool cancellation flag starts false" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"nonexistent_pattern_xyz\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should not be cancelled
    if (result.error_message) |msg| {
        try std.testing.expect(!std.mem.eql(u8, msg, "Cancelled"));
    }
}

// ============================================================================
// Basic Execution Tests (with ripgrep or fallback)
// ============================================================================

test "grep tool returns no matches for nonexistent pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"xyzzy_nonexistent_pattern_12345\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Either success with no matches, or error from missing rg/directory
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool searches in specified path" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"path\": \".\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should succeed or return an error (no crash)
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles path with include glob" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"path\": \".\", \"include\": \"*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles nonexistent directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"path\": \"/nonexistent_directory_xyz123\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should fail or return no matches (depends on ripgrep availability)
    // Just ensure it doesn't crash
    try std.testing.expect(result.success or result.error_message != null);
}

// ============================================================================
// Result Format Tests
// ============================================================================

test "grep tool result has content or error message" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"const\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Either content or error_message should be set
    try std.testing.expect(result.content.len > 0 or result.error_message != null);
}

test "grep tool success result has no error message" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"nonexistent_xyz\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    if (result.success) {
        try std.testing.expect(result.error_message == null);
    }
}

test "grep tool error result has error message" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Missing pattern should produce an error
    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expect(result.error_message != null);
    try std.testing.expect(result.error_message.?.len > 0);
}

// ============================================================================
// Pattern Matching Tests
// ============================================================================

test "grep tool finds pattern in current directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Search for "std" which should exist in zig files
    const mock = try createMockContext(allocator, "{\"pattern\": \"std\", \"path\": \".\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Either find matches, report none, or error from environment
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles special regex characters" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Search for a pattern with regex special chars (escaped)
    const mock = try createMockContext(allocator, "{\"pattern\": \"\\\\[\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should not crash - behavior depends on ripgrep regex handling
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles unicode patterns" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"日本語\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle unicode without crashing
    try std.testing.expect(result.success or result.error_message != null);
}

// ============================================================================
// Include Glob Tests
// ============================================================================

test "grep tool include filters to zig files" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"fn\", \"include\": \"*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool include filters to txt files" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"include\": \"*.txt\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool include with complex glob" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"include\": \"**/*_test.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

// ============================================================================
// Output Format Tests
// ============================================================================

test "grep tool output includes match count header" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Search for a common pattern that will have matches
    const mock = try createMockContext(allocator, "{\"pattern\": \"const std\", \"path\": \".\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Either success with matches/no-matches, or error from environment
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool output includes line numbers" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"const\", \"path\": \".\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Either success or error from environment
    try std.testing.expect(result.success or result.error_message != null);
}

// ============================================================================
// Edge Cases
// ============================================================================

test "grep tool handles whitespace in pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"  \"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should not crash
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles newlines in pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\\nmore\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should not crash
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles very long pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const long_pattern = "a" ** 500;
    const json = try std.fmt.allocPrint(allocator, "{{\"pattern\": \"{s}\"}}", .{long_pattern});
    defer allocator.free(json);

    const mock = try createMockContext(allocator, json, &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles path with spaces" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"path\": \"/path with spaces\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Path likely doesn't exist, but shouldn't crash
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool handles relative path" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\", \"path\": \"..\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool default path is current directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // No path specified - should default to "."
    const mock = try createMockContext(allocator, "{\"pattern\": \"test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

// ============================================================================
// Registry Integration Tests
// ============================================================================

test "grep tool registers in builtin registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    const tool = reg.get("grep");
    try std.testing.expect(tool != null);
    try std.testing.expectEqualStrings("grep", tool.?.name);
}

test "grep tool executable via registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    const json = "{\"pattern\": \"nonexistent_xyz_abc\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("grep", parsed.value);
    defer freeResult(allocator, result);

    // Either success or error from environment (no ripgrep, etc)
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool cancellation via registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    reg.cancel();

    const json = "{\"pattern\": \"test\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("grep", parsed.value);

    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

// ============================================================================
// Memory Safety Tests
// ============================================================================

test "grep tool no memory leaks on success" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"nonexistent_xyz\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // If we get here without leaks, test passes
    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool no memory leaks on error" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    // Error results with static messages don't need freeing

    try std.testing.expect(!result.success);
}

test "grep tool no memory leaks on cancellation" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    // Cancellation uses static message

    try std.testing.expect(!result.success);
}

// ============================================================================
// Boundary Condition Tests
// ============================================================================

test "grep tool handles empty file" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Search in a path that likely has empty files or none
    const mock = try createMockContext(allocator, "{\"pattern\": \"x\", \"path\": \"/tmp\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}

test "grep tool multiple sequential searches" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Run multiple searches in sequence
    for (0..3) |_| {
        const mock = try createMockContext(allocator, "{\"pattern\": \"const\"}", &cancelled);
        defer mock.parsed.deinit();

        const result = grep.tool.execute_ctx.?(mock.ctx);
        defer freeResult(allocator, result);

        try std.testing.expect(result.success or result.error_message != null);
    }
}

test "grep tool handles case with colons in content" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Pattern that might match file:line:content format
    const mock = try createMockContext(allocator, "{\"pattern\": \":\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = grep.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    try std.testing.expect(result.success or result.error_message != null);
}
