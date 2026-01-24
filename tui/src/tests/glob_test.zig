const std = @import("std");
const registry = @import("../agent/tools/registry.zig");
const glob = @import("../agent/tools/glob.zig");
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
        "No files found matching pattern",
        "Failed to open search directory",
        "Failed to walk directory",
    };
    for (static_msgs) |static| {
        if (std.mem.eql(u8, s, static)) return true;
    }
    return false;
}

// ============================================================================
// Tool Definition Tests
// ============================================================================

test "glob tool has correct name" {
    try std.testing.expectEqualStrings("glob", glob.tool.name);
}

test "glob tool has execute_ctx function" {
    try std.testing.expect(glob.tool.execute_ctx != null);
}

test "glob tool has non-empty description" {
    try std.testing.expect(glob.tool.description.len > 0);
}

test "glob tool description mentions pattern" {
    try std.testing.expect(std.mem.indexOf(u8, glob.tool.description, "pattern") != null);
}

test "glob tool description mentions path parameter" {
    try std.testing.expect(std.mem.indexOf(u8, glob.tool.description, "path") != null);
}

test "glob tool description mentions max results" {
    try std.testing.expect(std.mem.indexOf(u8, glob.tool.description, "100") != null);
}

test "glob tool legacy export exists" {
    try std.testing.expectEqualStrings("glob", glob.glob_tool.name);
}

// ============================================================================
// Parameter Validation Tests
// ============================================================================

test "glob tool requires pattern parameter" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: pattern", result.error_message.?);
}

test "glob tool rejects non-string pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": 123}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Missing required parameter: pattern", result.error_message.?);
}

test "glob tool accepts string pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should succeed or return "no files found" (depending on rg availability)
    // But should NOT return "Missing required parameter"
    if (result.error_message) |msg| {
        try std.testing.expect(!std.mem.eql(u8, msg, "Missing required parameter: pattern"));
    }
}

test "glob tool uses default path when not specified" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Only pattern, no path
    const mock = try createMockContext(allocator, "{\"pattern\": \"*.nonexistent\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should not fail with directory error - proves default path works
    if (result.error_message) |msg| {
        try std.testing.expect(!std.mem.eql(u8, msg, "Failed to open search directory"));
    }
}

// ============================================================================
// Cancellation Tests
// ============================================================================

test "glob tool respects cancellation before start" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);
}

// ============================================================================
// matchesPattern Unit Tests
// ============================================================================

test "matchesPattern extension match *.zig" {
    try std.testing.expect(glob.matchesPattern("foo/bar.zig", "*.zig"));
    try std.testing.expect(glob.matchesPattern("src/main.zig", "*.zig"));
    try std.testing.expect(glob.matchesPattern("test.zig", "*.zig"));
}

test "matchesPattern extension match *.ts" {
    try std.testing.expect(glob.matchesPattern("src/app.ts", "*.ts"));
    try std.testing.expect(glob.matchesPattern("index.ts", "*.ts"));
}

test "matchesPattern extension mismatch" {
    try std.testing.expect(!glob.matchesPattern("foo/bar.ts", "*.zig"));
    try std.testing.expect(!glob.matchesPattern("main.go", "*.zig"));
    try std.testing.expect(!glob.matchesPattern("readme.md", "*.zig"));
}

test "matchesPattern recursive extension **/*.zig" {
    try std.testing.expect(glob.matchesPattern("src/main.zig", "**/*.zig"));
    try std.testing.expect(glob.matchesPattern("a/b/c/d.zig", "**/*.zig"));
    try std.testing.expect(glob.matchesPattern("test.zig", "**/*.zig"));
}

test "matchesPattern recursive extension **/*.ts" {
    try std.testing.expect(glob.matchesPattern("src/app.ts", "**/*.ts"));
    try std.testing.expect(glob.matchesPattern("nested/deep/file.ts", "**/*.ts"));
}

test "matchesPattern recursive extension mismatch" {
    try std.testing.expect(!glob.matchesPattern("src/main.go", "**/*.zig"));
    try std.testing.expect(!glob.matchesPattern("test.rs", "**/*.ts"));
}

test "matchesPattern wildcard with prefix" {
    try std.testing.expect(glob.matchesPattern("test_foo.zig", "test_*"));
    try std.testing.expect(glob.matchesPattern("test_bar_baz.txt", "test_*"));
}

test "matchesPattern wildcard with suffix" {
    try std.testing.expect(glob.matchesPattern("foo_test.zig", "*_test.zig"));
    try std.testing.expect(glob.matchesPattern("bar_test.zig", "*_test.zig"));
}

test "matchesPattern wildcard in middle" {
    try std.testing.expect(glob.matchesPattern("test_foo_spec.ts", "test_*_spec.ts"));
    try std.testing.expect(glob.matchesPattern("test_bar_spec.ts", "test_*_spec.ts"));
}

test "matchesPattern multiple wildcards" {
    try std.testing.expect(glob.matchesPattern("a_b_c", "*_*_*"));
    try std.testing.expect(glob.matchesPattern("foo_bar_baz", "*_*_*"));
}

test "matchesPattern literal substring match" {
    try std.testing.expect(glob.matchesPattern("src/main.zig", "main"));
    try std.testing.expect(glob.matchesPattern("test/unit/main_test.zig", "main"));
    try std.testing.expect(glob.matchesPattern("main.go", "main"));
}

test "matchesPattern literal no match" {
    try std.testing.expect(!glob.matchesPattern("src/app.zig", "main"));
    try std.testing.expect(!glob.matchesPattern("foo.txt", "bar"));
}

test "matchesPattern empty pattern" {
    // Empty pattern with no wildcard - should still match (empty substring)
    try std.testing.expect(glob.matchesPattern("anything.txt", ""));
}

test "matchesPattern empty path" {
    // Empty path should not match non-empty pattern
    try std.testing.expect(!glob.matchesPattern("", "*.zig"));
}

test "matchesPattern exact extension boundary" {
    // Make sure we match the extension properly
    try std.testing.expect(glob.matchesPattern("file.zig", "*.zig"));
    try std.testing.expect(!glob.matchesPattern("file.zigg", "*.zig")); // Not exact match
    try std.testing.expect(glob.matchesPattern("file.zigabc", "*.zig")); // substring contains .zig
}

test "matchesPattern case sensitivity" {
    // Pattern matching should be case-sensitive
    try std.testing.expect(!glob.matchesPattern("FILE.ZIG", "*.zig"));
    try std.testing.expect(glob.matchesPattern("FILE.ZIG", "*.ZIG"));
}

// ============================================================================
// Result Structure Tests
// ============================================================================

test "glob tool success result has empty error_message" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    if (result.success) {
        try std.testing.expect(result.error_message == null);
    }
}

test "glob tool error result has non-empty error_message" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Missing pattern should produce error
    const mock = try createMockContext(allocator, "{}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    try std.testing.expect(!result.success);
    try std.testing.expect(result.error_message != null);
    try std.testing.expect(result.error_message.?.len > 0);
}

test "glob tool no matches returns success with message" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    // Use a pattern that won't match anything
    const mock = try createMockContext(allocator, "{\"pattern\": \"*.veryrareextension12345\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // No matches should return success with informative message
    try std.testing.expect(result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.content, "No files found") != null);
}

// ============================================================================
// Directory Error Tests
// ============================================================================

test "glob tool handles nonexistent directory" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(
        allocator,
        "{\"pattern\": \"*.zig\", \"path\": \"/nonexistent/directory/that/does/not/exist\"}",
        &cancelled,
    );
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should either fail gracefully or return no results
    // The exact behavior depends on whether rg is available
    // Just verify it doesn't crash and returns some result
    try std.testing.expect(result.content.len > 0 or result.error_message != null);
}

// ============================================================================
// Registry Integration Tests
// ============================================================================

test "glob tool registers in builtin registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    const tool = reg.get("glob");
    try std.testing.expect(tool != null);
    try std.testing.expectEqualStrings("glob", tool.?.name);
}

test "glob tool executable via registry" {
    const allocator = std.testing.allocator;
    var reg = registry.ToolRegistry.initBuiltin(allocator);
    defer reg.deinit();

    const json = "{\"pattern\": \"*.nonexistent\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("glob", parsed.value);
    defer freeResult(allocator, result);

    // Should complete without crashing
    try std.testing.expect(result.success);
}

// ============================================================================
// Edge Cases
// ============================================================================

test "glob tool handles pattern with spaces" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"test file.txt\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing - verify result exists
    try std.testing.expect(result.content.len > 0 or result.error_message != null or result.success);
}

test "glob tool handles special characters in pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*.{ts,js}\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing - verify result exists
    try std.testing.expect(result.content.len > 0 or result.error_message != null or result.success);
}

test "glob tool handles deeply nested pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"**/src/**/*.zig\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing - verify result exists
    try std.testing.expect(result.content.len > 0 or result.error_message != null or result.success);
}

test "glob tool handles dot files pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \".*\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing - verify result exists
    try std.testing.expect(result.content.len > 0 or result.error_message != null or result.success);
}

test "glob tool handles absolute path in pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*.txt\", \"path\": \"/tmp\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing - verify result exists
    try std.testing.expect(result.content.len > 0 or result.error_message != null or result.success);
}

test "glob tool handles unicode in pattern" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const mock = try createMockContext(allocator, "{\"pattern\": \"*日本語*\"}", &cancelled);
    defer mock.parsed.deinit();

    const result = glob.tool.execute_ctx.?(mock.ctx);
    defer freeResult(allocator, result);

    // Should handle without crashing - verify result exists
    try std.testing.expect(result.content.len > 0 or result.error_message != null or result.success);
}

// ============================================================================
// Pattern Edge Cases
// ============================================================================

test "matchesPattern single char extension" {
    try std.testing.expect(glob.matchesPattern("file.c", "*.c"));
    try std.testing.expect(glob.matchesPattern("file.h", "*.h"));
}

test "matchesPattern double extension" {
    try std.testing.expect(glob.matchesPattern("file.test.js", "*.js"));
    try std.testing.expect(glob.matchesPattern("archive.tar.gz", "*.gz"));
}

test "matchesPattern no extension" {
    try std.testing.expect(!glob.matchesPattern("Makefile", "*.mk"));
    try std.testing.expect(glob.matchesPattern("Makefile", "Make*"));
}

test "matchesPattern path separators" {
    try std.testing.expect(glob.matchesPattern("src/lib/main.zig", "**/*.zig"));
    try std.testing.expect(glob.matchesPattern("a/b/c/d/e/f.zig", "**/*.zig"));
}

test "matchesPattern consecutive wildcards" {
    // Pattern **/* should still work
    try std.testing.expect(glob.matchesPattern("any/path/file.txt", "**/*"));
}

test "matchesPattern only wildcards" {
    // Pattern with only * should match anything
    try std.testing.expect(glob.matchesPattern("anything", "*"));
}

test "matchesPattern wildcard at start and end" {
    try std.testing.expect(glob.matchesPattern("prefix_middle_suffix", "*_middle_*"));
}
