const std = @import("std");
const registry = @import("registry.zig");
const ToolRegistry = registry.ToolRegistry;
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const ToolContext = registry.ToolContext;

test "ToolRegistry init and register" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    try std.testing.expectEqual(@as(usize, 0), reg.count());

    reg.register(.{
        .name = "test_tool",
        .description = "A test tool",
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("test result");
            }
        }.exec,
    });

    try std.testing.expectEqual(@as(usize, 1), reg.count());
    try std.testing.expect(reg.get("test_tool") != null);
    try std.testing.expect(reg.get("nonexistent") == null);
}

test "ToolRegistry execute with context" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "echo",
        .description = "Echo tool",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                if (ctx.isCancelled()) {
                    return ToolResult.err("Cancelled");
                }
                ctx.update("partial...");
                return ToolResult.ok("done");
            }
        }.exec,
    });

    const result = reg.execute("echo", .null);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("done", result.content);
}

test "ToolRegistry cancel" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "cancellable",
        .description = "Cancellable tool",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                if (ctx.isCancelled()) {
                    return ToolResult.err("Cancelled");
                }
                return ToolResult.ok("completed");
            }
        }.exec,
    });

    reg.cancel();
    const result = reg.execute("cancellable", .null);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Cancelled", result.error_message.?);

    reg.resetCancel();
    const result2 = reg.execute("cancellable", .null);
    try std.testing.expect(result2.success);
}

// ========== ToolResult details_json tests ==========

test "ToolResult.ok creates success result" {
    const result = ToolResult.ok("test content");
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("test content", result.content);
    try std.testing.expect(!result.owned);
    try std.testing.expect(result.details_json == null);
}

test "ToolResult.okOwnedWithDetails creates success with details" {
    const result = ToolResult.okOwnedWithDetails("content", "{\"diff\":\"...\"}");
    try std.testing.expect(result.success);
    try std.testing.expect(result.owned);
    try std.testing.expectEqualStrings("{\"diff\":\"...\"}", result.details_json.?);
}

test "ToolResult.okTruncatedWithDetails creates truncated with details" {
    const result = ToolResult.okTruncatedWithDetails("content", null, "{\"total_lines\":100}");
    try std.testing.expect(result.success);
    try std.testing.expect(result.truncated);
    try std.testing.expect(result.owned);
    try std.testing.expectEqualStrings("{\"total_lines\":100}", result.details_json.?);
}

test "ToolResult.deinit frees details_json" {
    const allocator = std.testing.allocator;

    const details = try allocator.dupe(u8, "{\"test\":true}");
    const content = try allocator.dupe(u8, "test content");

    var result = ToolResult{
        .success = true,
        .content = content,
        .details_json = details,
        .owned = true,
    };

    result.deinit(allocator);

    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("", result.content);
}
