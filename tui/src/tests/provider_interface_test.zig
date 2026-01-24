const std = @import("std");
const testing = std.testing;
const provider = @import("../agent/provider_interface.zig");

// Mock provider for testing - satisfies the AgentProvider interface
const MockProvider = struct {
    pub const StreamingState = struct {
        allocator: std.mem.Allocator,
        text: []const u8,
        tool_calls: []const provider.ToolCallInfo,
        poll_count: usize,
        is_done: bool,

        pub fn init(alloc: std.mem.Allocator) StreamingState {
            return .{
                .allocator = alloc,
                .text = "mock response text",
                .tool_calls = &[_]provider.ToolCallInfo{},
                .poll_count = 0,
                .is_done = false,
            };
        }
    };

    pub fn startStream(alloc: std.mem.Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
        _ = api_key;
        _ = request_body;
        return StreamingState.init(alloc);
    }

    pub fn poll(state: *StreamingState) !bool {
        state.poll_count += 1;
        if (state.poll_count >= 3) {
            state.is_done = true;
            return true;
        }
        return false;
    }

    pub fn getText(state: *StreamingState) []const u8 {
        return state.text;
    }

    pub fn hasToolCalls(state: *StreamingState) bool {
        return state.tool_calls.len > 0;
    }

    pub fn getToolCalls(state: *StreamingState) []const provider.ToolCallInfo {
        return state.tool_calls;
    }

    pub fn cleanup(state: *StreamingState, alloc: std.mem.Allocator) void {
        _ = alloc;
        state.* = undefined;
    }
};

// Mock provider with tool calls for testing
const MockProviderWithTools = struct {
    pub const StreamingState = struct {
        allocator: std.mem.Allocator,
        text: []const u8,
        tool_calls: [2]provider.ToolCallInfo,
        is_done: bool,
    };

    pub fn startStream(alloc: std.mem.Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
        _ = api_key;
        _ = request_body;
        return .{
            .allocator = alloc,
            .text = "",
            .tool_calls = .{
                .{
                    .id = "tool_001",
                    .name = "bash",
                    .input_json = "{\"command\": \"ls -la\"}",
                },
                .{
                    .id = "tool_002",
                    .name = "read_file",
                    .input_json = "{\"path\": \"/tmp/test.txt\"}",
                },
            },
            .is_done = false,
        };
    }

    pub fn poll(state: *StreamingState) !bool {
        state.is_done = true;
        return true;
    }

    pub fn getText(state: *StreamingState) []const u8 {
        return state.text;
    }

    pub fn hasToolCalls(state: *StreamingState) bool {
        return state.tool_calls.len > 0;
    }

    pub fn getToolCalls(state: *StreamingState) []const provider.ToolCallInfo {
        return &state.tool_calls;
    }

    pub fn cleanup(state: *StreamingState, alloc: std.mem.Allocator) void {
        _ = alloc;
        state.* = undefined;
    }
};

// ============================================================================
// ToolCallInfo struct tests
// ============================================================================

test "ToolCallInfo struct fields exist and have correct types" {
    const info = provider.ToolCallInfo{
        .id = "call_123",
        .name = "bash",
        .input_json = "{\"command\": \"echo hello\"}",
    };

    try testing.expectEqualStrings("call_123", info.id);
    try testing.expectEqualStrings("bash", info.name);
    try testing.expectEqualStrings("{\"command\": \"echo hello\"}", info.input_json);
}

test "ToolCallInfo can be stored in array" {
    const calls = [_]provider.ToolCallInfo{
        .{ .id = "id1", .name = "tool1", .input_json = "{}" },
        .{ .id = "id2", .name = "tool2", .input_json = "{\"key\": \"value\"}" },
    };

    try testing.expectEqual(@as(usize, 2), calls.len);
    try testing.expectEqualStrings("id1", calls[0].id);
    try testing.expectEqualStrings("tool2", calls[1].name);
}

test "ToolCallInfo with empty fields" {
    const info = provider.ToolCallInfo{
        .id = "",
        .name = "",
        .input_json = "",
    };

    try testing.expectEqual(@as(usize, 0), info.id.len);
    try testing.expectEqual(@as(usize, 0), info.name.len);
    try testing.expectEqual(@as(usize, 0), info.input_json.len);
}

// ============================================================================
// AgentProvider wrapper tests
// ============================================================================

test "AgentProvider wraps mock correctly - type exists" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    _ = WrappedProvider;
}

test "AgentProvider exposes StreamingState type" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const state_type_info = @typeInfo(WrappedProvider.StreamingState);
    try testing.expect(state_type_info == .@"struct");
}

test "AgentProvider startStream creates valid state" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "test-api-key", "{\"model\": \"test\"}");
    defer WrappedProvider.cleanup(&state, allocator);

    try testing.expectEqual(@as(usize, 0), state.poll_count);
    try testing.expect(!state.is_done);
}

test "AgentProvider poll advances state" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "key", "{}");
    defer WrappedProvider.cleanup(&state, allocator);

    // First two polls return false
    try testing.expect(!try WrappedProvider.poll(&state));
    try testing.expectEqual(@as(usize, 1), state.poll_count);

    try testing.expect(!try WrappedProvider.poll(&state));
    try testing.expectEqual(@as(usize, 2), state.poll_count);

    // Third poll completes
    try testing.expect(try WrappedProvider.poll(&state));
    try testing.expectEqual(@as(usize, 3), state.poll_count);
    try testing.expect(state.is_done);
}

test "AgentProvider getText returns response text" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "key", "{}");
    defer WrappedProvider.cleanup(&state, allocator);

    const text = WrappedProvider.getText(&state);
    try testing.expectEqualStrings("mock response text", text);
}

test "AgentProvider hasToolCalls returns false when no tools" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "key", "{}");
    defer WrappedProvider.cleanup(&state, allocator);

    try testing.expect(!WrappedProvider.hasToolCalls(&state));
}

test "AgentProvider getToolCalls returns empty slice when no tools" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "key", "{}");
    defer WrappedProvider.cleanup(&state, allocator);

    const tool_calls = WrappedProvider.getToolCalls(&state);
    try testing.expectEqual(@as(usize, 0), tool_calls.len);
}

test "AgentProvider with tool calls - hasToolCalls returns true" {
    const WrappedProvider = provider.AgentProvider(MockProviderWithTools);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "key", "{}");
    defer WrappedProvider.cleanup(&state, allocator);

    try testing.expect(WrappedProvider.hasToolCalls(&state));
}

test "AgentProvider with tool calls - getToolCalls returns correct data" {
    const WrappedProvider = provider.AgentProvider(MockProviderWithTools);
    const allocator = testing.allocator;

    var state = try WrappedProvider.startStream(allocator, "key", "{}");
    defer WrappedProvider.cleanup(&state, allocator);

    const tool_calls = WrappedProvider.getToolCalls(&state);
    try testing.expectEqual(@as(usize, 2), tool_calls.len);

    try testing.expectEqualStrings("tool_001", tool_calls[0].id);
    try testing.expectEqualStrings("bash", tool_calls[0].name);
    try testing.expectEqualStrings("{\"command\": \"ls -la\"}", tool_calls[0].input_json);

    try testing.expectEqualStrings("tool_002", tool_calls[1].id);
    try testing.expectEqualStrings("read_file", tool_calls[1].name);
}

// ============================================================================
// validateProviderInterface tests
// ============================================================================

test "validateProviderInterface accepts valid provider" {
    // This should compile without error
    provider.validateProviderInterface(MockProvider);
}

test "validateProviderInterface accepts provider with tool calls" {
    provider.validateProviderInterface(MockProviderWithTools);
}

// Minimal valid provider - tests that only required declarations are needed
const MinimalValidProvider = struct {
    pub const StreamingState = struct {};

    pub fn startStream(alloc: std.mem.Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
        _ = alloc;
        _ = api_key;
        _ = request_body;
        return .{};
    }

    pub fn poll(state: *StreamingState) !bool {
        _ = state;
        return true;
    }

    pub fn getText(state: *StreamingState) []const u8 {
        _ = state;
        return "";
    }

    pub fn hasToolCalls(state: *StreamingState) bool {
        _ = state;
        return false;
    }

    pub fn getToolCalls(state: *StreamingState) []const provider.ToolCallInfo {
        _ = state;
        return &[_]provider.ToolCallInfo{};
    }

    pub fn cleanup(state: *StreamingState, alloc: std.mem.Allocator) void {
        _ = state;
        _ = alloc;
    }
};

test "validateProviderInterface accepts minimal valid provider" {
    provider.validateProviderInterface(MinimalValidProvider);
}

// ============================================================================
// Integration tests - full streaming workflow
// ============================================================================

test "full streaming workflow without tools" {
    const WrappedProvider = provider.AgentProvider(MockProvider);
    const allocator = testing.allocator;

    // Start stream
    var state = try WrappedProvider.startStream(allocator, "sk-test", "{\"messages\": []}");
    defer WrappedProvider.cleanup(&state, allocator);

    // Poll until done
    var iterations: usize = 0;
    while (!try WrappedProvider.poll(&state)) {
        iterations += 1;
        if (iterations > 10) {
            return error.TooManyIterations;
        }
    }

    // Verify final state
    try testing.expect(state.is_done);
    try testing.expectEqualStrings("mock response text", WrappedProvider.getText(&state));
    try testing.expect(!WrappedProvider.hasToolCalls(&state));
}

test "full streaming workflow with tools" {
    const WrappedProvider = provider.AgentProvider(MockProviderWithTools);
    const allocator = testing.allocator;

    // Start stream
    var state = try WrappedProvider.startStream(allocator, "sk-test", "{\"messages\": []}");
    defer WrappedProvider.cleanup(&state, allocator);

    // Poll until done (MockProviderWithTools completes immediately)
    _ = try WrappedProvider.poll(&state);

    // Verify tool calls
    try testing.expect(WrappedProvider.hasToolCalls(&state));
    const tools = WrappedProvider.getToolCalls(&state);
    try testing.expectEqual(@as(usize, 2), tools.len);

    // Execute tool calls (simulated)
    for (tools) |tool| {
        try testing.expect(tool.id.len > 0);
        try testing.expect(tool.name.len > 0);
        try testing.expect(tool.input_json.len > 0);
    }
}
