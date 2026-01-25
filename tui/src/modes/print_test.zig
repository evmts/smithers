const std = @import("std");
const print = @import("print.zig");

const PrintMode = print.PrintMode;

test "PrintMode init" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", mode.config.model);
    try std.testing.expectEqual(@as(u32, 4096), mode.config.max_tokens);
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

test "PrintMode run with empty prompt returns error" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const empty: []const []const u8 = &.{};
    const result = mode.run(empty);
    try std.testing.expectError(error.NoPrompt, result);
}

test "PrintMode joins prompt parts" {
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

test "PrintMode getResponse returns stub without API key" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator, .{});
    defer mode.deinit();

    const response = try mode.getResponse("test prompt");
    defer allocator.free(response);

    try std.testing.expect(std.mem.indexOf(u8, response, "test prompt") != null);
}
