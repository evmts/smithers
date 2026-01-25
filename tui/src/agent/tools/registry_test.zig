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
