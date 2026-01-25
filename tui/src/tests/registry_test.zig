const std = @import("std");
const registry = @import("../agent/tools/registry.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const ToolParams = registry.ToolParams;
const ToolRegistry = registry.ToolRegistry;

// ============================================================================
// ToolResult Tests
// ============================================================================

test "ToolResult ok creates success result" {
    const result = ToolResult.ok("success message");
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("success message", result.content);
    try std.testing.expect(result.error_message == null);
    try std.testing.expect(!result.truncated);
    try std.testing.expect(result.full_output_path == null);
}

test "ToolResult okTruncated creates truncated success result" {
    const result = ToolResult.okTruncated("partial content", "/tmp/full.txt");
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("partial content", result.content);
    try std.testing.expect(result.truncated);
    try std.testing.expectEqualStrings("/tmp/full.txt", result.full_output_path.?);
    try std.testing.expect(result.error_message == null);
}

test "ToolResult okTruncated with null path" {
    const result = ToolResult.okTruncated("partial", null);
    try std.testing.expect(result.success);
    try std.testing.expect(result.truncated);
    try std.testing.expect(result.full_output_path == null);
}

test "ToolResult err creates failure result" {
    const result = ToolResult.err("something went wrong");
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("", result.content);
    try std.testing.expectEqualStrings("something went wrong", result.error_message.?);
    try std.testing.expect(!result.truncated);
}

// ============================================================================
// ToolContext Tests
// ============================================================================

fn createTestContext(allocator: std.mem.Allocator, json_str: []const u8, cancelled: *std.atomic.Value(bool)) !ToolContext {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json_str, .{});
    return ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = cancelled,
        .cwd = "/test/dir",
    };
}

test "ToolContext getString extracts value" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"name\": \"test\", \"path\": \"/foo/bar\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expectEqualStrings("test", ctx.getString("name").?);
    try std.testing.expectEqualStrings("/foo/bar", ctx.getString("path").?);
}

test "ToolContext getString returns null for missing" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"name\": \"test\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getString("nonexistent") == null);
}

test "ToolContext getString returns null for non-string type" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"count\": 42}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getString("count") == null);
}

test "ToolContext getString returns null for non-object args" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const ctx = ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getString("anything") == null);
}

test "ToolContext getInt extracts integer value" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"count\": 42, \"negative\": -10}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expectEqual(@as(i64, 42), ctx.getInt("count").?);
    try std.testing.expectEqual(@as(i64, -10), ctx.getInt("negative").?);
}

test "ToolContext getInt returns null for missing" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"count\": 42}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getInt("missing") == null);
}

test "ToolContext getInt returns null for non-integer type" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"name\": \"test\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getInt("name") == null);
}

test "ToolContext getBool extracts boolean value" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"enabled\": true, \"disabled\": false}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expectEqual(true, ctx.getBool("enabled").?);
    try std.testing.expectEqual(false, ctx.getBool("disabled").?);
}

test "ToolContext getBool returns null for missing" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"enabled\": true}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getBool("missing") == null);
}

test "ToolContext getBool returns null for non-boolean type" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    const json = "{\"count\": 1}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const ctx = ToolContext{
        .allocator = allocator,
        .args = parsed.value,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.getBool("count") == null);
}

test "ToolContext isCancelled returns false initially" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const ctx = ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };

    try std.testing.expect(!ctx.isCancelled());
}

test "ToolContext isCancelled returns true when set" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(true);

    const ctx = ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
    };

    try std.testing.expect(ctx.isCancelled());
}

test "ToolContext update calls callback" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);
    var callback_called: bool = false;

    const ctx = ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
        .on_update = struct {
            fn cb(_: []const u8, ctx_ptr: ?*anyopaque) void {
                const ptr: *bool = @ptrCast(@alignCast(ctx_ptr.?));
                ptr.* = true;
            }
        }.cb,
        .on_update_ctx = &callback_called,
    };

    ctx.update("partial data");
    try std.testing.expect(callback_called);
}

test "ToolContext update with no callback is safe" {
    const allocator = std.testing.allocator;
    var cancelled = std.atomic.Value(bool).init(false);

    const ctx = ToolContext{
        .allocator = allocator,
        .args = .null,
        .cancelled = &cancelled,
        .on_update = null,
        .on_update_ctx = null,
    };

    ctx.update("partial data");
}

// ============================================================================
// ToolParams Tests
// ============================================================================

test "ToolParams getString extracts value" {
    const allocator = std.testing.allocator;
    const json = "{\"key\": \"value\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const params = ToolParams{
        .allocator = allocator,
        .args = parsed.value,
    };

    try std.testing.expectEqualStrings("value", params.getString("key").?);
}

test "ToolParams getString returns null for missing" {
    const allocator = std.testing.allocator;
    const json = "{\"key\": \"value\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const params = ToolParams{
        .allocator = allocator,
        .args = parsed.value,
    };

    try std.testing.expect(params.getString("other") == null);
}

test "ToolParams getInt extracts integer value" {
    const allocator = std.testing.allocator;
    const json = "{\"num\": 123}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const params = ToolParams{
        .allocator = allocator,
        .args = parsed.value,
    };

    try std.testing.expectEqual(@as(i64, 123), params.getInt("num").?);
}

test "ToolParams getInt returns null for missing" {
    const allocator = std.testing.allocator;
    const json = "{\"num\": 123}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const params = ToolParams{
        .allocator = allocator,
        .args = parsed.value,
    };

    try std.testing.expect(params.getInt("other") == null);
}

test "ToolParams getBool extracts boolean value" {
    const allocator = std.testing.allocator;
    const json = "{\"flag\": true}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const params = ToolParams{
        .allocator = allocator,
        .args = parsed.value,
    };

    try std.testing.expectEqual(true, params.getBool("flag").?);
}

test "ToolParams getBool returns null for missing" {
    const allocator = std.testing.allocator;
    const json = "{\"flag\": true}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const params = ToolParams{
        .allocator = allocator,
        .args = parsed.value,
    };

    try std.testing.expect(params.getBool("other") == null);
}

test "ToolParams with non-object args returns null" {
    const allocator = std.testing.allocator;

    const params = ToolParams{
        .allocator = allocator,
        .args = .null,
    };

    try std.testing.expect(params.getString("any") == null);
    try std.testing.expect(params.getInt("any") == null);
    try std.testing.expect(params.getBool("any") == null);
}

// ============================================================================
// ToolRegistry Tests
// ============================================================================

test "ToolRegistry init creates empty registry" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    try std.testing.expectEqual(@as(usize, 0), reg.count());
}

test "ToolRegistry register and get" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "my_tool",
        .description = "My test tool",
        .execute = null,
    });

    try std.testing.expectEqual(@as(usize, 1), reg.count());
    const tool = reg.get("my_tool");
    try std.testing.expect(tool != null);
    try std.testing.expectEqualStrings("my_tool", tool.?.name);
    try std.testing.expectEqualStrings("My test tool", tool.?.description);
}

test "ToolRegistry get returns null for unknown tool" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    try std.testing.expect(reg.get("unknown") == null);
}

test "ToolRegistry register multiple tools" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{ .name = "tool1", .description = "Tool 1" });
    reg.register(.{ .name = "tool2", .description = "Tool 2" });
    reg.register(.{ .name = "tool3", .description = "Tool 3" });

    try std.testing.expectEqual(@as(usize, 3), reg.count());
    try std.testing.expect(reg.get("tool1") != null);
    try std.testing.expect(reg.get("tool2") != null);
    try std.testing.expect(reg.get("tool3") != null);
}

test "ToolRegistry execute unknown returns error" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    const result = reg.execute("nonexistent", .null);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Unknown tool", result.error_message.?);
}

test "ToolRegistry execute with legacy execute function" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "legacy",
        .description = "Legacy tool",
        .execute = struct {
            fn exec(params: ToolParams) ToolResult {
                const val = params.getString("input") orelse "default";
                return ToolResult.ok(val);
            }
        }.exec,
    });

    const json = "{\"input\": \"hello\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("legacy", parsed.value);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("hello", result.content);
}

test "ToolRegistry execute with context function" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "modern",
        .description = "Modern tool",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                const val = ctx.getString("msg") orelse "none";
                return ToolResult.ok(val);
            }
        }.exec,
    });

    const json = "{\"msg\": \"world\"}";
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, json, .{});
    defer parsed.deinit();

    const result = reg.execute("modern", parsed.value);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("world", result.content);
}

test "ToolRegistry execute prefers execute_ctx over execute" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "both",
        .description = "Has both functions",
        .execute_ctx = struct {
            fn exec(_: ToolContext) ToolResult {
                return ToolResult.ok("ctx");
            }
        }.exec,
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("legacy");
            }
        }.exec,
    });

    const result = reg.execute("both", .null);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("ctx", result.content);
}

test "ToolRegistry execute returns error when no execute function" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "empty",
        .description = "No execute function",
        .execute_ctx = null,
        .execute = null,
    });

    const result = reg.execute("empty", .null);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Tool has no execute function", result.error_message.?);
}

test "ToolRegistry executeWithContext passes callback" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    var update_received: bool = false;

    reg.register(.{
        .name = "streaming",
        .description = "Streaming tool",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                ctx.update("progress");
                return ToolResult.ok("done");
            }
        }.exec,
    });

    const result = reg.executeWithContext(
        "streaming",
        .null,
        struct {
            fn cb(_: []const u8, ctx_ptr: ?*anyopaque) void {
                const ptr: *bool = @ptrCast(@alignCast(ctx_ptr.?));
                ptr.* = true;
            }
        }.cb,
        &update_received,
    );

    try std.testing.expect(result.success);
    try std.testing.expect(update_received);
}

test "ToolRegistry cancel stops execution" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "cancellable",
        .description = "Can be cancelled",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                if (ctx.isCancelled()) {
                    return ToolResult.err("Operation cancelled");
                }
                return ToolResult.ok("completed");
            }
        }.exec,
    });

    reg.cancel();
    const result = reg.execute("cancellable", .null);
    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("Operation cancelled", result.error_message.?);
}

test "ToolRegistry resetCancel allows execution" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "cancellable",
        .description = "Can be cancelled",
        .execute_ctx = struct {
            fn exec(ctx: ToolContext) ToolResult {
                if (ctx.isCancelled()) {
                    return ToolResult.err("Cancelled");
                }
                return ToolResult.ok("success");
            }
        }.exec,
    });

    reg.cancel();
    const result1 = reg.execute("cancellable", .null);
    try std.testing.expect(!result1.success);

    reg.resetCancel();
    const result2 = reg.execute("cancellable", .null);
    try std.testing.expect(result2.success);
    try std.testing.expectEqualStrings("success", result2.content);
}



test "ToolRegistry register overwrites existing tool" {
    const allocator = std.testing.allocator;
    var reg = ToolRegistry.init(allocator);
    defer reg.deinit();

    reg.register(.{
        .name = "tool",
        .description = "Original",
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("original");
            }
        }.exec,
    });

    reg.register(.{
        .name = "tool",
        .description = "Updated",
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("updated");
            }
        }.exec,
    });

    try std.testing.expectEqual(@as(usize, 1), reg.count());
    const result = reg.execute("tool", .null);
    try std.testing.expectEqualStrings("updated", result.content);
}

// ============================================================================
// ToolResult.details_json Tests (Issue 008)
// ============================================================================

test "ToolResult ok has null details_json by default" {
    const result = ToolResult.ok("content");
    try std.testing.expect(result.details_json == null);
}

test "ToolResult okOwned has null details_json by default" {
    const allocator = std.testing.allocator;
    const content = try allocator.dupe(u8, "owned content");
    var result = ToolResult.okOwned(content);
    defer result.deinit(allocator);

    try std.testing.expect(result.details_json == null);
    try std.testing.expect(result.owned);
}

test "ToolResult okOwnedWithDetails sets details_json" {
    const allocator = std.testing.allocator;
    const content = try allocator.dupe(u8, "content");
    const details = try allocator.dupe(u8, "{\"diff\": \"+ line\", \"first_changed_line\": 42}");
    var result = ToolResult.okOwnedWithDetails(content, details);
    defer result.deinit(allocator);

    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("content", result.content);
    try std.testing.expectEqualStrings("{\"diff\": \"+ line\", \"first_changed_line\": 42}", result.details_json.?);
    try std.testing.expect(result.owned);
}

test "ToolResult okTruncatedWithDetails sets both truncated and details" {
    const allocator = std.testing.allocator;
    const content = try allocator.dupe(u8, "partial");
    const path = try allocator.dupe(u8, "/tmp/full.txt");
    const details = try allocator.dupe(u8, "{\"total_lines\": 1000, \"truncated\": true}");
    var result = ToolResult.okTruncatedWithDetails(content, path, details);
    defer result.deinit(allocator);

    try std.testing.expect(result.success);
    try std.testing.expect(result.truncated);
    try std.testing.expectEqualStrings("/tmp/full.txt", result.full_output_path.?);
    try std.testing.expectEqualStrings("{\"total_lines\": 1000, \"truncated\": true}", result.details_json.?);
    try std.testing.expect(result.owned);
}

test "ToolResult deinit frees details_json when owned" {
    const allocator = std.testing.allocator;
    const content = try allocator.dupe(u8, "c");
    const details = try allocator.dupe(u8, "{}");
    var result = ToolResult.okOwnedWithDetails(content, details);

    result.deinit(allocator);

    try std.testing.expect(!result.success);
    try std.testing.expectEqualStrings("", result.content);
}

test "ToolResult err has null details_json" {
    const result = ToolResult.err("error");
    try std.testing.expect(result.details_json == null);
}

test "ToolResult errOwned has null details_json" {
    const allocator = std.testing.allocator;
    const msg = try allocator.dupe(u8, "error message");
    var result = ToolResult.errOwned(msg);
    defer result.deinit(allocator);

    try std.testing.expect(result.details_json == null);
    try std.testing.expect(!result.success);
}
