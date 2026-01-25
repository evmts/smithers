// Tests for multi-provider interface

const std = @import("std");
const testing = std.testing;
const provider_interface = @import("provider_interface.zig");
const ProviderType = provider_interface.ProviderType;
const ModelConfig = provider_interface.ModelConfig;

test "ProviderType.fromString parses known providers" {
    try testing.expectEqual(ProviderType.anthropic, ProviderType.fromString("anthropic").?);
    try testing.expectEqual(ProviderType.openai, ProviderType.fromString("openai").?);
    try testing.expectEqual(ProviderType.google, ProviderType.fromString("google").?);
    try testing.expectEqual(ProviderType.google, ProviderType.fromString("gemini").?);
    try testing.expect(ProviderType.fromString("unknown") == null);
}

test "ProviderType.toString returns correct strings" {
    try testing.expectEqualStrings("anthropic", ProviderType.anthropic.toString());
    try testing.expectEqualStrings("openai", ProviderType.openai.toString());
    try testing.expectEqualStrings("google", ProviderType.google.toString());
}

test "ModelConfig.parse handles anthropic models" {
    const config = ModelConfig.parse("anthropic/claude-sonnet-4-20250514");
    try testing.expectEqual(ProviderType.anthropic, config.provider);
    try testing.expectEqualStrings("claude-sonnet-4-20250514", config.model_id);
    try testing.expectEqual(@as(u32, 200000), config.context_window);
}

test "ModelConfig.parse handles openai models" {
    const config = ModelConfig.parse("openai/gpt-4o");
    try testing.expectEqual(ProviderType.openai, config.provider);
    try testing.expectEqualStrings("gpt-4o", config.model_id);
    try testing.expectEqual(@as(u32, 128000), config.context_window);
}

test "ModelConfig.parse handles google/gemini models" {
    {
        const config = ModelConfig.parse("google/gemini-2.0-flash");
        try testing.expectEqual(ProviderType.google, config.provider);
        try testing.expectEqualStrings("gemini-2.0-flash", config.model_id);
        try testing.expectEqual(@as(u32, 1000000), config.context_window);
    }
    {
        const config = ModelConfig.parse("gemini/gemini-pro");
        try testing.expectEqual(ProviderType.google, config.provider);
        try testing.expectEqualStrings("gemini-pro", config.model_id);
    }
}

test "ModelConfig.parse defaults to anthropic for invalid input" {
    const config = ModelConfig.parse("invalid-format");
    try testing.expectEqual(ProviderType.anthropic, config.provider);
    try testing.expectEqualStrings(ModelConfig.DEFAULT_ANTHROPIC_MODEL, config.model_id);
}

test "ModelConfig.parse handles unknown provider" {
    const config = ModelConfig.parse("unknown/some-model");
    try testing.expectEqual(ProviderType.anthropic, config.provider);
    try testing.expectEqualStrings(ModelConfig.DEFAULT_ANTHROPIC_MODEL, config.model_id);
}

test "ModelConfig.parse handles model with multiple slashes" {
    const config = ModelConfig.parse("openai/gpt-4o/fine-tuned");
    try testing.expectEqual(ProviderType.openai, config.provider);
    try testing.expectEqualStrings("gpt-4o/fine-tuned", config.model_id);
}
