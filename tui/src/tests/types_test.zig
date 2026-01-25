const std = @import("std");
const types = @import("../agent/types.zig");
const Role = types.Role;
const ToolCallInfo = types.ToolCallInfo;
const Message = types.Message;
const ThinkingLevel = types.ThinkingLevel;
const AgentConfig = types.AgentConfig;
const EventType = types.EventType;
const AgentEvent = types.AgentEvent;

// ============================================================================
// Role Enum Tests
// ============================================================================

test "Role enum has correct variants" {
    try std.testing.expectEqual(@as(u2, 0), @intFromEnum(Role.user));
    try std.testing.expectEqual(@as(u2, 1), @intFromEnum(Role.assistant));
    try std.testing.expectEqual(@as(u2, 2), @intFromEnum(Role.tool_result));
}

test "Role enum comparison" {
    const r1: Role = .user;
    const r2: Role = .user;
    const r3: Role = .assistant;

    try std.testing.expectEqual(r1, r2);
    try std.testing.expect(r1 != r3);
}

test "Role enum switch exhaustive" {
    const roles = [_]Role{ .user, .assistant, .tool_result };
    for (roles) |role| {
        const desc: []const u8 = switch (role) {
            .user => "user",
            .assistant => "assistant",
            .tool_result => "tool_result",
        };
        try std.testing.expect(desc.len > 0);
    }
}

// ============================================================================
// ToolCallInfo Struct Tests
// ============================================================================

test "ToolCallInfo struct initialization" {
    const info = ToolCallInfo{
        .id = "call_123",
        .name = "bash",
        .arguments = "{\"cmd\": \"ls\"}",
    };

    try std.testing.expectEqualStrings("call_123", info.id);
    try std.testing.expectEqualStrings("bash", info.name);
    try std.testing.expectEqualStrings("{\"cmd\": \"ls\"}", info.arguments);
}

test "ToolCallInfo with empty strings" {
    const info = ToolCallInfo{
        .id = "",
        .name = "",
        .arguments = "",
    };

    try std.testing.expectEqualStrings("", info.id);
    try std.testing.expectEqualStrings("", info.name);
    try std.testing.expectEqualStrings("", info.arguments);
}

test "ToolCallInfo struct size and alignment" {
    try std.testing.expectEqual(@as(usize, 48), @sizeOf(ToolCallInfo));
    try std.testing.expectEqual(@as(usize, 8), @alignOf(ToolCallInfo));
}

test "ToolCallInfo array creation" {
    const calls = [_]ToolCallInfo{
        .{ .id = "1", .name = "read", .arguments = "{}" },
        .{ .id = "2", .name = "write", .arguments = "{\"path\": \"/tmp\"}" },
    };

    try std.testing.expectEqual(@as(usize, 2), calls.len);
    try std.testing.expectEqualStrings("1", calls[0].id);
    try std.testing.expectEqualStrings("2", calls[1].id);
}

// ============================================================================
// Message Struct Tests
// ============================================================================

test "Message.user creates user message" {
    const msg = Message.user("hello world");

    try std.testing.expectEqual(Role.user, msg.role);
    try std.testing.expectEqualStrings("hello world", msg.content);
    try std.testing.expect(msg.tool_call_id == null);
    try std.testing.expect(msg.tool_calls == null);
}

test "Message.user with empty content" {
    const msg = Message.user("");

    try std.testing.expectEqual(Role.user, msg.role);
    try std.testing.expectEqualStrings("", msg.content);
}

test "Message.assistant creates assistant message" {
    const msg = Message.assistant("I can help");

    try std.testing.expectEqual(Role.assistant, msg.role);
    try std.testing.expectEqualStrings("I can help", msg.content);
    try std.testing.expect(msg.tool_call_id == null);
    try std.testing.expect(msg.tool_calls == null);
}

test "Message.assistantWithToolCalls creates message with tools" {
    const calls = [_]ToolCallInfo{
        .{ .id = "call_1", .name = "bash", .arguments = "{}" },
    };
    const msg = Message.assistantWithToolCalls("running command", &calls);

    try std.testing.expectEqual(Role.assistant, msg.role);
    try std.testing.expectEqualStrings("running command", msg.content);
    try std.testing.expect(msg.tool_call_id == null);
    try std.testing.expect(msg.tool_calls != null);
    try std.testing.expectEqual(@as(usize, 1), msg.tool_calls.?.len);
    try std.testing.expectEqualStrings("call_1", msg.tool_calls.?[0].id);
}

test "Message.assistantWithToolCalls with multiple tools" {
    const calls = [_]ToolCallInfo{
        .{ .id = "1", .name = "read", .arguments = "{\"path\": \"/a\"}" },
        .{ .id = "2", .name = "read", .arguments = "{\"path\": \"/b\"}" },
        .{ .id = "3", .name = "write", .arguments = "{}" },
    };
    const msg = Message.assistantWithToolCalls("", &calls);

    try std.testing.expectEqual(@as(usize, 3), msg.tool_calls.?.len);
    try std.testing.expectEqualStrings("write", msg.tool_calls.?[2].name);
}

test "Message.assistantWithToolCalls with empty tools slice" {
    const calls = [_]ToolCallInfo{};
    const msg = Message.assistantWithToolCalls("no tools", &calls);

    try std.testing.expect(msg.tool_calls != null);
    try std.testing.expectEqual(@as(usize, 0), msg.tool_calls.?.len);
}

test "Message.toolResult creates tool result message" {
    const msg = Message.toolResult("call_abc", "file contents here");

    try std.testing.expectEqual(Role.tool_result, msg.role);
    try std.testing.expectEqualStrings("file contents here", msg.content);
    try std.testing.expectEqualStrings("call_abc", msg.tool_call_id.?);
    try std.testing.expect(msg.tool_calls == null);
}

test "Message.toolResult with empty content" {
    const msg = Message.toolResult("id", "");

    try std.testing.expectEqual(Role.tool_result, msg.role);
    try std.testing.expectEqualStrings("", msg.content);
    try std.testing.expectEqualStrings("id", msg.tool_call_id.?);
}

test "Message direct struct initialization" {
    const msg = Message{
        .role = .assistant,
        .content = "direct init",
        .tool_call_id = "some_id",
        .tool_calls = null,
    };

    try std.testing.expectEqual(Role.assistant, msg.role);
    try std.testing.expectEqualStrings("direct init", msg.content);
    try std.testing.expectEqualStrings("some_id", msg.tool_call_id.?);
}

test "Message default values" {
    const msg = Message{
        .role = .user,
        .content = "test",
    };

    try std.testing.expect(msg.tool_call_id == null);
    try std.testing.expect(msg.tool_calls == null);
}

// ============================================================================
// ThinkingLevel Enum Tests
// ============================================================================

test "ThinkingLevel enum has correct variants" {
    try std.testing.expectEqual(@as(u3, 0), @intFromEnum(ThinkingLevel.off));
    try std.testing.expectEqual(@as(u3, 1), @intFromEnum(ThinkingLevel.minimal));
    try std.testing.expectEqual(@as(u3, 2), @intFromEnum(ThinkingLevel.low));
    try std.testing.expectEqual(@as(u3, 3), @intFromEnum(ThinkingLevel.medium));
    try std.testing.expectEqual(@as(u3, 4), @intFromEnum(ThinkingLevel.high));
}

test "ThinkingLevel comparison" {
    const low: ThinkingLevel = .low;
    const medium: ThinkingLevel = .medium;

    try std.testing.expect(low != medium);
    try std.testing.expectEqual(ThinkingLevel.low, low);
}

test "ThinkingLevel ordering via int conversion" {
    const off_val = @intFromEnum(ThinkingLevel.off);
    const minimal_val = @intFromEnum(ThinkingLevel.minimal);
    const low_val = @intFromEnum(ThinkingLevel.low);
    const medium_val = @intFromEnum(ThinkingLevel.medium);
    const high_val = @intFromEnum(ThinkingLevel.high);

    try std.testing.expect(off_val < minimal_val);
    try std.testing.expect(minimal_val < low_val);
    try std.testing.expect(low_val < medium_val);
    try std.testing.expect(medium_val < high_val);
}

test "ThinkingLevel.budgetTokens returns correct values" {
    try std.testing.expectEqual(@as(u32, 0), ThinkingLevel.off.budgetTokens());
    try std.testing.expectEqual(@as(u32, 1024), ThinkingLevel.minimal.budgetTokens());
    try std.testing.expectEqual(@as(u32, 2048), ThinkingLevel.low.budgetTokens());
    try std.testing.expectEqual(@as(u32, 8192), ThinkingLevel.medium.budgetTokens());
    try std.testing.expectEqual(@as(u32, 16384), ThinkingLevel.high.budgetTokens());
}

test "ThinkingLevel.isEnabled" {
    try std.testing.expect(!ThinkingLevel.off.isEnabled());
    try std.testing.expect(ThinkingLevel.minimal.isEnabled());
    try std.testing.expect(ThinkingLevel.low.isEnabled());
    try std.testing.expect(ThinkingLevel.medium.isEnabled());
    try std.testing.expect(ThinkingLevel.high.isEnabled());
}

test "ThinkingLevel.toString" {
    try std.testing.expectEqualStrings("off", ThinkingLevel.off.toString());
    try std.testing.expectEqualStrings("minimal", ThinkingLevel.minimal.toString());
    try std.testing.expectEqualStrings("low", ThinkingLevel.low.toString());
    try std.testing.expectEqualStrings("medium", ThinkingLevel.medium.toString());
    try std.testing.expectEqualStrings("high", ThinkingLevel.high.toString());
}

test "ThinkingLevel.parse valid inputs" {
    try std.testing.expectEqual(ThinkingLevel.off, ThinkingLevel.parse("off").?);
    try std.testing.expectEqual(ThinkingLevel.minimal, ThinkingLevel.parse("minimal").?);
    try std.testing.expectEqual(ThinkingLevel.low, ThinkingLevel.parse("low").?);
    try std.testing.expectEqual(ThinkingLevel.medium, ThinkingLevel.parse("medium").?);
    try std.testing.expectEqual(ThinkingLevel.high, ThinkingLevel.parse("high").?);
}

test "ThinkingLevel.parse invalid inputs" {
    try std.testing.expect(ThinkingLevel.parse("invalid") == null);
    try std.testing.expect(ThinkingLevel.parse("") == null);
    try std.testing.expect(ThinkingLevel.parse("OFF") == null);
    try std.testing.expect(ThinkingLevel.parse("xhigh") == null);
}

// ============================================================================
// AgentConfig Struct Tests
// ============================================================================

test "AgentConfig default values" {
    const config = AgentConfig{};

    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", config.model);
    try std.testing.expectEqual(@as(u32, 100), config.max_turns);
    try std.testing.expectEqual(ThinkingLevel.off, config.thinking_level);
    try std.testing.expect(config.system_prompt == null);
    try std.testing.expect(config.tools_enabled);
}

test "AgentConfig custom model" {
    const config = AgentConfig{
        .model = "claude-opus-4-20250514",
    };

    try std.testing.expectEqualStrings("claude-opus-4-20250514", config.model);
    try std.testing.expectEqual(@as(u32, 100), config.max_turns);
}

test "AgentConfig custom max_turns" {
    const config = AgentConfig{
        .max_turns = 50,
    };

    try std.testing.expectEqual(@as(u32, 50), config.max_turns);
}

test "AgentConfig max_turns boundary zero" {
    const config = AgentConfig{
        .max_turns = 0,
    };

    try std.testing.expectEqual(@as(u32, 0), config.max_turns);
}

test "AgentConfig max_turns boundary max" {
    const config = AgentConfig{
        .max_turns = std.math.maxInt(u32),
    };

    try std.testing.expectEqual(std.math.maxInt(u32), config.max_turns);
}

test "AgentConfig with thinking level" {
    const config = AgentConfig{
        .thinking_level = .high,
    };

    try std.testing.expectEqual(ThinkingLevel.high, config.thinking_level);
}

test "AgentConfig with system prompt" {
    const config = AgentConfig{
        .system_prompt = "You are a helpful assistant.",
    };

    try std.testing.expectEqualStrings("You are a helpful assistant.", config.system_prompt.?);
}

test "AgentConfig tools disabled" {
    const config = AgentConfig{
        .tools_enabled = false,
    };

    try std.testing.expect(!config.tools_enabled);
}

test "AgentConfig fully custom" {
    const config = AgentConfig{
        .model = "custom-model",
        .max_turns = 25,
        .thinking_level = .medium,
        .system_prompt = "Custom prompt",
        .tools_enabled = false,
    };

    try std.testing.expectEqualStrings("custom-model", config.model);
    try std.testing.expectEqual(@as(u32, 25), config.max_turns);
    try std.testing.expectEqual(ThinkingLevel.medium, config.thinking_level);
    try std.testing.expectEqualStrings("Custom prompt", config.system_prompt.?);
    try std.testing.expect(!config.tools_enabled);
}

// ============================================================================
// EventType Enum Tests
// ============================================================================

test "EventType enum has all variants" {
    const variants = [_]EventType{
        .turn_start,
        .turn_end,
        .text_delta,
        .tool_start,
        .tool_end,
        .agent_end,
        .agent_error,
    };

    try std.testing.expectEqual(@as(usize, 7), variants.len);
}

test "EventType enum values are distinct" {
    const turn_start = @intFromEnum(EventType.turn_start);
    const turn_end = @intFromEnum(EventType.turn_end);
    const text_delta = @intFromEnum(EventType.text_delta);
    const tool_start = @intFromEnum(EventType.tool_start);
    const tool_end = @intFromEnum(EventType.tool_end);
    const agent_end = @intFromEnum(EventType.agent_end);
    const agent_error = @intFromEnum(EventType.agent_error);

    var seen = std.AutoHashMap(u3, void).init(std.testing.allocator);
    defer seen.deinit();

    try seen.put(@intCast(turn_start), {});
    try seen.put(@intCast(turn_end), {});
    try seen.put(@intCast(text_delta), {});
    try seen.put(@intCast(tool_start), {});
    try seen.put(@intCast(tool_end), {});
    try seen.put(@intCast(agent_end), {});
    try seen.put(@intCast(agent_error), {});

    try std.testing.expectEqual(@as(usize, 7), seen.count());
}

test "EventType switch exhaustive" {
    const events = [_]EventType{
        .turn_start,
        .turn_end,
        .text_delta,
        .tool_start,
        .tool_end,
        .agent_end,
        .agent_error,
    };

    for (events) |event| {
        const category: []const u8 = switch (event) {
            .turn_start, .turn_end => "turn",
            .text_delta => "text",
            .tool_start, .tool_end => "tool",
            .agent_end, .agent_error => "agent",
        };
        try std.testing.expect(category.len > 0);
    }
}

// ============================================================================
// AgentEvent Struct Tests
// ============================================================================

test "AgentEvent minimal initialization" {
    const event = AgentEvent{
        .type = .turn_start,
    };

    try std.testing.expectEqual(EventType.turn_start, event.type);
    try std.testing.expectEqual(@as(u32, 0), event.turn);
    try std.testing.expect(event.text == null);
    try std.testing.expect(event.tool_name == null);
    try std.testing.expect(event.tool_id == null);
    try std.testing.expect(event.error_message == null);
}

test "AgentEvent turn_start with turn number" {
    const event = AgentEvent{
        .type = .turn_start,
        .turn = 5,
    };

    try std.testing.expectEqual(EventType.turn_start, event.type);
    try std.testing.expectEqual(@as(u32, 5), event.turn);
}

test "AgentEvent text_delta with text" {
    const event = AgentEvent{
        .type = .text_delta,
        .turn = 1,
        .text = "Hello ",
    };

    try std.testing.expectEqual(EventType.text_delta, event.type);
    try std.testing.expectEqualStrings("Hello ", event.text.?);
}

test "AgentEvent tool_start with tool info" {
    const event = AgentEvent{
        .type = .tool_start,
        .turn = 2,
        .tool_name = "bash",
        .tool_id = "call_xyz",
    };

    try std.testing.expectEqual(EventType.tool_start, event.type);
    try std.testing.expectEqualStrings("bash", event.tool_name.?);
    try std.testing.expectEqualStrings("call_xyz", event.tool_id.?);
}

test "AgentEvent tool_end with tool info" {
    const event = AgentEvent{
        .type = .tool_end,
        .turn = 2,
        .tool_name = "read",
        .tool_id = "call_123",
    };

    try std.testing.expectEqual(EventType.tool_end, event.type);
    try std.testing.expectEqualStrings("read", event.tool_name.?);
    try std.testing.expectEqualStrings("call_123", event.tool_id.?);
}

test "AgentEvent agent_end" {
    const event = AgentEvent{
        .type = .agent_end,
        .turn = 10,
    };

    try std.testing.expectEqual(EventType.agent_end, event.type);
    try std.testing.expectEqual(@as(u32, 10), event.turn);
}

test "AgentEvent agent_error with message" {
    const event = AgentEvent{
        .type = .agent_error,
        .turn = 3,
        .error_message = "API rate limit exceeded",
    };

    try std.testing.expectEqual(EventType.agent_error, event.type);
    try std.testing.expectEqualStrings("API rate limit exceeded", event.error_message.?);
}

test "AgentEvent turn boundary zero" {
    const event = AgentEvent{
        .type = .turn_start,
        .turn = 0,
    };

    try std.testing.expectEqual(@as(u32, 0), event.turn);
}

test "AgentEvent turn boundary max" {
    const event = AgentEvent{
        .type = .turn_end,
        .turn = std.math.maxInt(u32),
    };

    try std.testing.expectEqual(std.math.maxInt(u32), event.turn);
}

test "AgentEvent all fields populated" {
    const event = AgentEvent{
        .type = .tool_start,
        .turn = 7,
        .text = "Starting tool",
        .tool_name = "grep",
        .tool_id = "call_full",
        .error_message = null,
    };

    try std.testing.expectEqual(EventType.tool_start, event.type);
    try std.testing.expectEqual(@as(u32, 7), event.turn);
    try std.testing.expectEqualStrings("Starting tool", event.text.?);
    try std.testing.expectEqualStrings("grep", event.tool_name.?);
    try std.testing.expectEqualStrings("call_full", event.tool_id.?);
    try std.testing.expect(event.error_message == null);
}

test "AgentEvent empty strings" {
    const event = AgentEvent{
        .type = .text_delta,
        .text = "",
        .tool_name = "",
        .tool_id = "",
        .error_message = "",
    };

    try std.testing.expectEqualStrings("", event.text.?);
    try std.testing.expectEqualStrings("", event.tool_name.?);
    try std.testing.expectEqualStrings("", event.tool_id.?);
    try std.testing.expectEqualStrings("", event.error_message.?);
}

// ============================================================================
// Memory & Struct Layout Tests
// ============================================================================

test "Message struct size" {
    const size = @sizeOf(Message);
    try std.testing.expect(size > 0);
    try std.testing.expect(size <= 128);
}

test "AgentConfig struct size" {
    const size = @sizeOf(AgentConfig);
    try std.testing.expect(size > 0);
    try std.testing.expect(size <= 64);
}

test "AgentEvent struct size" {
    const size = @sizeOf(AgentEvent);
    try std.testing.expect(size > 0);
    try std.testing.expect(size <= 128);
}

// ============================================================================
// Integration-style Tests
// ============================================================================

test "Message conversation flow simulation" {
    var messages: [10]Message = undefined;
    var count: usize = 0;

    messages[count] = Message.user("What is 2+2?");
    count += 1;

    messages[count] = Message.assistant("2+2 equals 4.");
    count += 1;

    const tool_calls = [_]ToolCallInfo{
        .{ .id = "calc_1", .name = "calculator", .arguments = "{\"expr\": \"2+2\"}" },
    };
    messages[count] = Message.assistantWithToolCalls("Let me calculate", &tool_calls);
    count += 1;

    messages[count] = Message.toolResult("calc_1", "4");
    count += 1;

    messages[count] = Message.assistant("The result is 4.");
    count += 1;

    try std.testing.expectEqual(@as(usize, 5), count);
    try std.testing.expectEqual(Role.user, messages[0].role);
    try std.testing.expectEqual(Role.assistant, messages[1].role);
    try std.testing.expectEqual(Role.assistant, messages[2].role);
    try std.testing.expect(messages[2].tool_calls != null);
    try std.testing.expectEqual(Role.tool_result, messages[3].role);
    try std.testing.expectEqual(Role.assistant, messages[4].role);
}

test "AgentEvent sequence simulation" {
    const events = [_]AgentEvent{
        .{ .type = .turn_start, .turn = 1 },
        .{ .type = .text_delta, .turn = 1, .text = "Hello" },
        .{ .type = .text_delta, .turn = 1, .text = " world" },
        .{ .type = .tool_start, .turn = 1, .tool_name = "bash", .tool_id = "t1" },
        .{ .type = .tool_end, .turn = 1, .tool_name = "bash", .tool_id = "t1" },
        .{ .type = .turn_end, .turn = 1 },
        .{ .type = .agent_end, .turn = 1 },
    };

    try std.testing.expectEqual(@as(usize, 7), events.len);
    try std.testing.expectEqual(EventType.turn_start, events[0].type);
    try std.testing.expectEqual(EventType.agent_end, events[6].type);

    var text_count: usize = 0;
    for (events) |e| {
        if (e.type == .text_delta) text_count += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), text_count);
}

test "AgentConfig comparison for equality" {
    const config1 = AgentConfig{
        .model = "test",
        .max_turns = 10,
    };
    const config2 = AgentConfig{
        .model = "test",
        .max_turns = 10,
    };

    try std.testing.expectEqualStrings(config1.model, config2.model);
    try std.testing.expectEqual(config1.max_turns, config2.max_turns);
    try std.testing.expectEqual(config1.thinking_level, config2.thinking_level);
    try std.testing.expectEqual(config1.tools_enabled, config2.tools_enabled);
}
