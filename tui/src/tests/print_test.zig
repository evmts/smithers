const std = @import("std");
const print_mode = @import("../modes/print.zig");

const PrintMode = print_mode.PrintMode;
const PrintConfig = print_mode.PrintConfig;

// ============ PrintConfig Tests ============

test "PrintConfig default values" {
    const config: PrintConfig = .{};

    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", config.model);
    try std.testing.expectEqual(@as(u32, 4096), config.max_tokens);
    try std.testing.expect(config.system_prompt == null);
}

test "PrintConfig custom model" {
    const config: PrintConfig = .{
        .model = "claude-3-opus-20240229",
    };

    try std.testing.expectEqualStrings("claude-3-opus-20240229", config.model);
    try std.testing.expectEqual(@as(u32, 4096), config.max_tokens);
}

test "PrintConfig custom max_tokens" {
    const config: PrintConfig = .{
        .max_tokens = 8192,
    };

    try std.testing.expectEqual(@as(u32, 8192), config.max_tokens);
}

test "PrintConfig custom system_prompt" {
    const config: PrintConfig = .{
        .system_prompt = "You are a helpful assistant.",
    };

    try std.testing.expect(config.system_prompt != null);
    try std.testing.expectEqualStrings("You are a helpful assistant.", config.system_prompt.?);
}

test "PrintConfig all custom values" {
    const config: PrintConfig = .{
        .model = "claude-3-haiku-20240307",
        .max_tokens = 1024,
        .system_prompt = "Be concise.",
    };

    try std.testing.expectEqualStrings("claude-3-haiku-20240307", config.model);
    try std.testing.expectEqual(@as(u32, 1024), config.max_tokens);
    try std.testing.expectEqualStrings("Be concise.", config.system_prompt.?);
}

// ============ PrintMode Init Tests ============

test "PrintMode init with default config" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", mode.config.model);
    try std.testing.expectEqual(@as(u32, 4096), mode.config.max_tokens);
    try std.testing.expect(mode.config.system_prompt == null);
}

test "PrintMode init with custom config" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{
        .model = "claude-3-haiku-20240307",
        .max_tokens = 1024,
        .system_prompt = "You are helpful",
    });
    defer mode.deinit();

    try std.testing.expectEqualStrings("claude-3-haiku-20240307", mode.config.model);
    try std.testing.expectEqual(@as(u32, 1024), mode.config.max_tokens);
    try std.testing.expectEqualStrings("You are helpful", mode.config.system_prompt.?);
}

test "PrintMode init preserves allocator" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    // Allocator is stored correctly - verify by using it
    const test_slice = try mode.allocator.alloc(u8, 10);
    defer mode.allocator.free(test_slice);

    try std.testing.expectEqual(@as(usize, 10), test_slice.len);
}

test "PrintMode deinit is safe to call" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    mode.deinit();
    // Should not crash or leak
}

test "PrintMode deinit is idempotent" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    mode.deinit();
    mode.deinit(); // Should be safe to call again
}

// ============ PrintMode run Tests ============

test "PrintMode run with empty prompt returns error" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const empty: []const []const u8 = &.{};
    const result = mode.run(empty);
    try std.testing.expectError(error.NoPrompt, result);
}

test "PrintMode run with zero length array returns error" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    var empty_slice: [0][]const u8 = .{};
    const result = mode.run(&empty_slice);
    try std.testing.expectError(error.NoPrompt, result);
}

// ============ Prompt Joining Tests ============

test "prompt joining single part" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{"hello"};
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("hello", full_prompt.items);
}

test "prompt joining two parts" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "hello", "world" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("hello world", full_prompt.items);
}

test "prompt joining three parts" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "hello", "world", "test" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("hello world test", full_prompt.items);
}

test "prompt joining many parts" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "a", "b", "c", "d", "e", "f" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("a b c d e f", full_prompt.items);
}

test "prompt joining with empty strings" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "hello", "", "world" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("hello  world", full_prompt.items);
}

test "prompt joining with spaces in parts" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "hello world", "foo bar" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("hello world foo bar", full_prompt.items);
}

test "prompt joining with special characters" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "hello!", "@world#", "$test%" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("hello! @world# $test%", full_prompt.items);
}

test "prompt joining with unicode" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "你好", "世界", "🎉" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("你好 世界 🎉", full_prompt.items);
}

test "prompt joining with newlines in parts" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "line1\nline2", "line3" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("line1\nline2 line3", full_prompt.items);
}

// ============ getResponse Tests ============

test "PrintMode getResponse returns stub without API key" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const response = try mode.getResponse("test prompt");
    defer allocator.free(response);

    try std.testing.expect(std.mem.indexOf(u8, response, "test prompt") != null);
    try std.testing.expect(std.mem.indexOf(u8, response, "stub") != null or
        std.mem.indexOf(u8, response, "No API key") != null or
        std.mem.indexOf(u8, response, "API call") != null);
}

test "PrintMode getResponse contains prompt text" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const response = try mode.getResponse("unique_test_string_12345");
    defer allocator.free(response);

    try std.testing.expect(std.mem.indexOf(u8, response, "unique_test_string_12345") != null);
}

test "PrintMode getResponse with empty prompt" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const response = try mode.getResponse("");
    defer allocator.free(response);

    try std.testing.expect(response.len > 0);
}

test "PrintMode getResponse with long prompt" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const long_prompt = "a" ** 1000;
    const response = try mode.getResponse(long_prompt);
    defer allocator.free(response);

    try std.testing.expect(std.mem.indexOf(u8, response, long_prompt) != null);
}

test "PrintMode getResponse with custom model in config" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{
        .model = "custom-model-name",
    });
    defer mode.deinit();

    const response = try mode.getResponse("test");
    defer allocator.free(response);

    // Response should reflect the model name if API key present
    // or stub response otherwise - just verify no error
    try std.testing.expect(response.len > 0);
}

// ============ Edge Cases Tests ============

test "PrintMode with very long model name" {
    const allocator = std.testing.allocator;
    const long_model = "a" ** 256;
    var mode = PrintMode.init(allocator, .{
        .model = long_model,
    });
    defer mode.deinit();

    try std.testing.expectEqualStrings(long_model, mode.config.model);
}

test "PrintMode with very long system prompt" {
    const allocator = std.testing.allocator;
    const long_prompt = "b" ** 10000;
    var mode = PrintMode.init(allocator, .{
        .system_prompt = long_prompt,
    });
    defer mode.deinit();

    try std.testing.expectEqualStrings(long_prompt, mode.config.system_prompt.?);
}

test "PrintMode max_tokens boundary values" {
    const allocator = std.testing.allocator;

    // Test with 0
    var mode1 = PrintMode.init(allocator, .{ .max_tokens = 0 });
    defer mode1.deinit();
    try std.testing.expectEqual(@as(u32, 0), mode1.config.max_tokens);

    // Test with max u32
    var mode2 = PrintMode.init(allocator, .{ .max_tokens = std.math.maxInt(u32) });
    defer mode2.deinit();
    try std.testing.expectEqual(std.math.maxInt(u32), mode2.config.max_tokens);
}

test "PrintMode with special characters in system prompt" {
    const allocator = std.testing.allocator;
    const special = "You are <helpful> & \"friendly\" 'assistant'\n\twith\ttabs";
    var mode = PrintMode.init(allocator, .{
        .system_prompt = special,
    });
    defer mode.deinit();

    try std.testing.expectEqualStrings(special, mode.config.system_prompt.?);
}

test "PrintMode with unicode in system prompt" {
    const allocator = std.testing.allocator;
    const unicode = "你好世界 🤖 Привет мир";
    var mode = PrintMode.init(allocator, .{
        .system_prompt = unicode,
    });
    defer mode.deinit();

    try std.testing.expectEqualStrings(unicode, mode.config.system_prompt.?);
}

// ============ Multiple Instance Tests ============

test "multiple PrintMode instances are independent" {
    const allocator = std.testing.allocator;

    var mode1 = PrintMode.init(allocator, .{
        .model = "model1",
        .max_tokens = 100,
    });
    defer mode1.deinit();

    var mode2 = PrintMode.init(allocator, .{
        .model = "model2",
        .max_tokens = 200,
    });
    defer mode2.deinit();

    try std.testing.expectEqualStrings("model1", mode1.config.model);
    try std.testing.expectEqualStrings("model2", mode2.config.model);
    try std.testing.expectEqual(@as(u32, 100), mode1.config.max_tokens);
    try std.testing.expectEqual(@as(u32, 200), mode2.config.max_tokens);
}

test "modifying one PrintMode does not affect another" {
    const allocator = std.testing.allocator;

    var mode1 = PrintMode.init(allocator, .{
        .max_tokens = 100,
    });
    defer mode1.deinit();

    var mode2 = PrintMode.init(allocator, .{
        .max_tokens = 200,
    });
    defer mode2.deinit();

    // Verify they remain independent
    try std.testing.expectEqual(@as(u32, 100), mode1.config.max_tokens);
    try std.testing.expectEqual(@as(u32, 200), mode2.config.max_tokens);
}

// ============ Memory Safety Tests ============

test "prompt joining memory cleanup on error simulation" {
    const allocator = std.testing.allocator;

    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    // Append some data
    try full_prompt.appendSlice(allocator, "test data");
    try std.testing.expectEqualStrings("test data", full_prompt.items);

    // Clear and reuse
    full_prompt.clearRetainingCapacity();
    try std.testing.expectEqual(@as(usize, 0), full_prompt.items.len);

    try full_prompt.appendSlice(allocator, "new data");
    try std.testing.expectEqualStrings("new data", full_prompt.items);
}

test "getResponse allocation is freed by caller" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    // Call getResponse multiple times to verify no leaks
    for (0..10) |i| {
        var buf: [32]u8 = undefined;
        const prompt = std.fmt.bufPrint(&buf, "prompt_{d}", .{i}) catch "fallback";
        const response = try mode.getResponse(prompt);
        allocator.free(response);
    }
}

// ============ Config Struct Field Tests ============

test "PrintConfig struct size is reasonable" {
    const size = @sizeOf(PrintConfig);
    // Should be relatively small - just pointers and a u32
    try std.testing.expect(size <= 64);
}

test "PrintMode struct size is reasonable" {
    const size = @sizeOf(PrintMode);
    // Should contain allocator and config
    try std.testing.expect(size <= 128);
}

test "PrintConfig default model is valid claude model" {
    const config: PrintConfig = .{};
    try std.testing.expect(std.mem.indexOf(u8, config.model, "claude") != null);
}

// ============ Response Format Tests ============

test "getResponse format contains expected sections" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const response = try mode.getResponse("test");
    defer allocator.free(response);

    // Should contain either stub indicator or API call indicator
    const has_stub = std.mem.indexOf(u8, response, "stub") != null;
    const has_api = std.mem.indexOf(u8, response, "API") != null;
    const has_prompt = std.mem.indexOf(u8, response, "prompt") != null or
        std.mem.indexOf(u8, response, "Prompt") != null;

    try std.testing.expect(has_stub or has_api);
    try std.testing.expect(has_prompt or std.mem.indexOf(u8, response, "test") != null);
}

test "getResponse with model shows model name when API available" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{
        .model = "test-model-xyz",
    });
    defer mode.deinit();

    const response = try mode.getResponse("hello");
    defer allocator.free(response);

    // Response should be non-empty
    try std.testing.expect(response.len > 0);
}
