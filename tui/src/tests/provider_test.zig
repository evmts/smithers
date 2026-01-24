const std = @import("std");
const provider = @import("../agent/provider.zig");

// ============ Api enum tests ============

test "Api enum has expected variants" {
    const apis = [_]provider.Api{
        .anthropic_messages,
        .openai_completions,
        .openai_responses,
        .google_generative_ai,
        .bedrock_converse,
    };
    try std.testing.expectEqual(@as(usize, 5), apis.len);
}

// ============ Provider enum tests ============

test "Provider enum has expected variants" {
    const providers = [_]provider.Provider{
        .anthropic,
        .openai,
        .google,
        .bedrock,
        .openrouter,
    };
    try std.testing.expectEqual(@as(usize, 5), providers.len);
}

// ============ InputType enum tests ============

test "InputType enum has text and image" {
    const types = [_]provider.InputType{ .text, .image };
    try std.testing.expectEqual(@as(usize, 2), types.len);
}

// ============ ThinkingLevel tests ============

test "ThinkingLevel off returns 0 tokens" {
    try std.testing.expectEqual(@as(u32, 0), provider.ThinkingLevel.off.toBudgetTokens());
}

test "ThinkingLevel minimal returns 1024 tokens" {
    try std.testing.expectEqual(@as(u32, 1024), provider.ThinkingLevel.minimal.toBudgetTokens());
}

test "ThinkingLevel low returns 4096 tokens" {
    try std.testing.expectEqual(@as(u32, 4096), provider.ThinkingLevel.low.toBudgetTokens());
}

test "ThinkingLevel medium returns 16384 tokens" {
    try std.testing.expectEqual(@as(u32, 16384), provider.ThinkingLevel.medium.toBudgetTokens());
}

test "ThinkingLevel high returns 65536 tokens" {
    try std.testing.expectEqual(@as(u32, 65536), provider.ThinkingLevel.high.toBudgetTokens());
}

test "ThinkingLevel xhigh returns 131072 tokens" {
    try std.testing.expectEqual(@as(u32, 131072), provider.ThinkingLevel.xhigh.toBudgetTokens());
}

test "ThinkingLevel values increase" {
    const levels = [_]provider.ThinkingLevel{ .off, .minimal, .low, .medium, .high, .xhigh };
    var prev: u32 = 0;
    for (levels) |level| {
        const tokens = level.toBudgetTokens();
        try std.testing.expect(tokens >= prev);
        prev = tokens;
    }
}

// ============ StopReason tests ============

test "StopReason enum variants" {
    const reasons = [_]provider.StopReason{
        .stop,
        .length,
        .tool_use,
        .@"error",
        .aborted,
    };
    try std.testing.expectEqual(@as(usize, 5), reasons.len);
}

// ============ ToolCall struct tests ============

test "ToolCall struct fields" {
    const tc = provider.ToolCall{
        .id = "tool_123",
        .name = "bash",
        .arguments = "{\"command\": \"ls\"}",
    };
    try std.testing.expectEqualStrings("tool_123", tc.id);
    try std.testing.expectEqualStrings("bash", tc.name);
    try std.testing.expectEqualStrings("{\"command\": \"ls\"}", tc.arguments);
}

test "ToolCall with empty fields" {
    const tc = provider.ToolCall{
        .id = "",
        .name = "",
        .arguments = "",
    };
    try std.testing.expectEqual(@as(usize, 0), tc.id.len);
    try std.testing.expectEqual(@as(usize, 0), tc.name.len);
    try std.testing.expectEqual(@as(usize, 0), tc.arguments.len);
}

// ============ StreamEventType tests ============

test "StreamEventType has all event types" {
    const types = [_]provider.StreamEventType{
        .start,
        .text_start,
        .text_delta,
        .text_end,
        .thinking_start,
        .thinking_delta,
        .thinking_end,
        .toolcall_start,
        .toolcall_delta,
        .toolcall_end,
        .done,
        .@"error",
    };
    try std.testing.expectEqual(@as(usize, 12), types.len);
}

// ============ Model struct tests ============

test "Model struct basic fields" {
    const input_types = [_]provider.InputType{.text};
    const model = provider.Model{
        .id = "claude-3-opus",
        .name = "Claude 3 Opus",
        .api = .anthropic_messages,
        .provider = .anthropic,
        .base_url = "https://api.anthropic.com",
        .reasoning = true,
        .input = &input_types,
        .cost_input = 15.0,
        .cost_output = 75.0,
        .cost_cache_read = 1.5,
        .cost_cache_write = 18.75,
        .context_window = 200000,
        .max_tokens = 4096,
    };

    try std.testing.expectEqualStrings("claude-3-opus", model.id);
    try std.testing.expectEqualStrings("Claude 3 Opus", model.name);
    try std.testing.expect(model.reasoning);
    try std.testing.expectEqual(@as(u32, 200000), model.context_window);
}

test "Model reasoning defaults to false" {
    const input_types = [_]provider.InputType{.text};
    const model = provider.Model{
        .id = "test",
        .name = "Test",
        .api = .openai_completions,
        .provider = .openai,
        .base_url = "",
        .input = &input_types,
        .cost_input = 0,
        .cost_output = 0,
        .cost_cache_read = 0,
        .cost_cache_write = 0,
        .context_window = 0,
        .max_tokens = 0,
    };
    try std.testing.expect(!model.reasoning);
}

// ============ Size checks ============

test "ToolCall size is reasonable" {
    try std.testing.expect(@sizeOf(provider.ToolCall) <= 48);
}

test "ThinkingLevel size is minimal" {
    try std.testing.expect(@sizeOf(provider.ThinkingLevel) <= 2);
}
