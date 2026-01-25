const std = @import("std");
const extension = @import("../extensions/extension.zig");

// ============ EventType tests ============

test "EventType enum has all variants" {
    const types = [_]extension.EventType{
        .session_start,
        .session_before_switch,
        .session_switch,
        .session_before_fork,
        .session_fork,
        .session_before_compact,
        .session_compact,
        .session_before_tree,
        .session_tree,
        .session_shutdown,
        .input,
        .before_agent_start,
        .agent_start,
        .agent_end,
        .context,
        .turn_start,
        .turn_end,
        .tool_call,
        .tool_result,
        .model_select,
        .user_bash,
    };
    try std.testing.expectEqual(@as(usize, 21), types.len);
}

test "EventType variants are distinct" {
    try std.testing.expect(extension.EventType.session_start != extension.EventType.session_switch);
    try std.testing.expect(extension.EventType.agent_start != extension.EventType.agent_end);
    try std.testing.expect(extension.EventType.tool_call != extension.EventType.tool_result);
}

// ============ Event tests ============

test "Event default data is null" {
    const event = extension.Event{
        .type = .session_start,
    };
    try std.testing.expect(event.data == null);
}

test "Event getData returns null for null data" {
    const event = extension.Event{
        .type = .input,
        .data = null,
    };
    try std.testing.expect(event.getData(u32) == null);
}

test "Event getData returns typed pointer" {
    var value: u32 = 42;
    var event = extension.Event{
        .type = .context,
    };
    event.setData(u32, &value);
    const ptr = event.getData(u32);
    try std.testing.expect(ptr != null);
    try std.testing.expectEqual(@as(u32, 42), ptr.?.*);
}

test "Event getData returns null for wrong type" {
    var value: u32 = 42;
    var event = extension.Event{
        .type = .context,
    };
    event.setData(u32, &value);
    const ptr = event.getData(i64);
    try std.testing.expect(ptr == null);
}

// ============ EventResult tests ============

test "EventResult default values" {
    const result = extension.EventResult{};
    try std.testing.expect(!result.cancel);
    try std.testing.expect(result.modified_data == null);
}

test "EventResult cancel flag" {
    const result = extension.EventResult{ .cancel = true };
    try std.testing.expect(result.cancel);
}

// ============ ToolResult tests ============

test "ToolResult default is_error false" {
    const result = extension.ToolResult{
        .content = "[]",
    };
    try std.testing.expect(!result.is_error);
}

test "ToolResult with error" {
    const result = extension.ToolResult{
        .content = "[{\"type\":\"text\",\"text\":\"Error message\"}]",
        .is_error = true,
    };
    try std.testing.expect(result.is_error);
}

// ============ ToolDefinition tests ============

test "ToolDefinition fields" {
    const tool = extension.ToolDefinition{
        .name = "my_tool",
        .description = "A test tool",
        .parameters = "{}",
        .execute = undefined, // Can't test function pointers in isolation
    };
    try std.testing.expectEqualStrings("my_tool", tool.name);
    try std.testing.expectEqualStrings("A test tool", tool.description);
    try std.testing.expect(tool.label == null);
    try std.testing.expect(tool.render_call == null);
    try std.testing.expect(tool.render_result == null);
}

test "ToolDefinition with label" {
    const tool = extension.ToolDefinition{
        .name = "bash",
        .label = "Run Command",
        .description = "Execute bash command",
        .parameters = "{}",
        .execute = undefined,
    };
    try std.testing.expectEqualStrings("Run Command", tool.label.?);
}

// ============ CommandOptions tests ============

test "CommandOptions fields" {
    const opts = extension.CommandOptions{
        .description = "Test command",
        .handler = undefined,
    };
    try std.testing.expectEqualStrings("Test command", opts.description);
    try std.testing.expect(opts.get_completions == null);
}

// ============ CompletionItem tests ============

test "CompletionItem fields" {
    const item = extension.CompletionItem{
        .value = "completion",
    };
    try std.testing.expectEqualStrings("completion", item.value);
}

// ============ Size tests ============

test "EventType size is minimal" {
    try std.testing.expect(@sizeOf(extension.EventType) <= 2);
}

test "Event size is reasonable" {
    try std.testing.expect(@sizeOf(extension.Event) <= 32);
}

test "EventResult size is reasonable" {
    try std.testing.expect(@sizeOf(extension.EventResult) <= 24);
}

test "ToolResult size is reasonable" {
    try std.testing.expect(@sizeOf(extension.ToolResult) <= 24);
}
