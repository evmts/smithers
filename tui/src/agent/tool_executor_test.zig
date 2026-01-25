const std = @import("std");
const tool_executor = @import("tool_executor.zig");
const ToolExecutor = tool_executor.ToolExecutor;
const MockRegistryFactory = tool_executor.MockRegistryFactory;

test "ToolExecutor with mock registry" {
    const MockExecutor = ToolExecutor(MockRegistryFactory);
    var exec = MockExecutor.init(std.testing.allocator);
    defer exec.deinit();

    try std.testing.expect(!exec.isRunning());
}
