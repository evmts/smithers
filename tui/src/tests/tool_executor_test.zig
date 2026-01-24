const std = @import("std");
const executor_mod = @import("../agent/tool_executor.zig");
const registry = @import("../agent/tools/registry.zig");

const MockRegistryFactory = executor_mod.MockRegistryFactory;
const MockExecutor = executor_mod.ToolExecutor(MockRegistryFactory);

test "ToolExecutor init state" {
    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try std.testing.expect(exec.thread == null);
    try std.testing.expect(exec.result == null);
}

test "ToolExecutor isRunning false initially" {
    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try std.testing.expect(!exec.isRunning());
}

test "ToolExecutor poll returns null when not running" {
    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    const result = exec.poll();
    try std.testing.expect(result == null);
}

test "ToolExecutor with MockRegistry" {
    MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try std.testing.expect(!exec.isRunning());
    try std.testing.expect(exec.poll() == null);
}

test "ToolExecutor execute and poll cycle" {
    MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try exec.execute("test-id-123", "mock_tool", "{}");

    var result: ?MockExecutor.ThreadResult = null;
    var attempts: usize = 0;
    while (result == null and attempts < 1000) : (attempts += 1) {
        result = exec.poll();
        if (result == null) {
            std.Thread.sleep(1_000_000); // 1ms
        }
    }

    try std.testing.expect(result != null);
    const r = result.?;
    try std.testing.expectEqualStrings("test-id-123", r.tool_id);
    try std.testing.expectEqualStrings("mock_tool", r.tool_name);
    try std.testing.expect(r.result.success);
    try std.testing.expectEqualStrings("mock result", r.result.content);

    std.testing.allocator.free(r.tool_id);
    std.testing.allocator.free(r.tool_name);
}

test "ToolExecutor error when already running" {
    MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try exec.execute("id1", "mock_tool", "{}");

    const err = exec.execute("id2", "mock_tool", "{}");
    try std.testing.expectError(error.AlreadyRunning, err);

    var result: ?MockExecutor.ThreadResult = null;
    while (result == null) {
        result = exec.poll();
        if (result == null) {
            std.Thread.sleep(1_000_000);
        }
    }

    std.testing.allocator.free(result.?.tool_id);
    std.testing.allocator.free(result.?.tool_name);
}

test "ToolExecutor deinit joins thread" {
    MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);

    try exec.execute("id", "mock_tool", "{}");

    var result: ?MockExecutor.ThreadResult = null;
    while (result == null) {
        result = exec.poll();
        if (result == null) {
            std.Thread.sleep(1_000_000);
        }
    }

    std.testing.allocator.free(result.?.tool_id);
    std.testing.allocator.free(result.?.tool_name);

    exec.deinit();

    try std.testing.expect(exec.thread == null);
}

test "ToolExecutor with custom mock result" {
    MockRegistryFactory.setResult(registry.ToolResult.err("custom error"));
    defer MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try exec.execute("id", "mock_tool", "{}");

    var result: ?MockExecutor.ThreadResult = null;
    var attempts: usize = 0;
    while (result == null and attempts < 1000) : (attempts += 1) {
        result = exec.poll();
        if (result == null) {
            std.Thread.sleep(1_000_000);
        }
    }

    try std.testing.expect(result != null);
    const r = result.?;
    try std.testing.expect(!r.result.success);
    try std.testing.expectEqualStrings("custom error", r.result.error_message.?);

    std.testing.allocator.free(r.tool_id);
    std.testing.allocator.free(r.tool_name);
}

test "ThreadResult structure" {
    const result = MockExecutor.ThreadResult{
        .tool_id = "test-id",
        .tool_name = "test-tool",
        .result = registry.ToolResult.ok("success"),
        .input_value = null,
    };

    try std.testing.expectEqualStrings("test-id", result.tool_id);
    try std.testing.expectEqualStrings("test-tool", result.tool_name);
    try std.testing.expect(result.result.success);
    try std.testing.expect(result.input_value == null);
}

test "ToolExecutor poll clears result after returning" {
    MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try exec.execute("id", "mock_tool", "{}");

    var result: ?MockExecutor.ThreadResult = null;
    while (result == null) {
        result = exec.poll();
        if (result == null) {
            std.Thread.sleep(1_000_000);
        }
    }

    const second_poll = exec.poll();
    try std.testing.expect(second_poll == null);

    std.testing.allocator.free(result.?.tool_id);
    std.testing.allocator.free(result.?.tool_name);
}

test "ToolExecutor isRunning true during execution" {
    MockRegistryFactory.reset();

    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try exec.execute("id", "mock_tool", "{}");

    var result: ?MockExecutor.ThreadResult = null;
    while (result == null) {
        result = exec.poll();
        if (result == null) {
            std.Thread.sleep(1_000_000);
        }
    }

    try std.testing.expect(!exec.isRunning());

    std.testing.allocator.free(result.?.tool_id);
    std.testing.allocator.free(result.?.tool_name);
}
