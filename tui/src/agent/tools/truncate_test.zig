const std = @import("std");
const truncate = @import("truncate.zig");

test "truncateTail basic" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expect(result.truncated);
    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
    try std.testing.expectEqualStrings("line2\nline3", result.content);
}

test "truncateHead basic" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expect(result.truncated);
    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
    try std.testing.expectEqualStrings("line1\nline2", result.content);
}

test "no truncation needed" {
    const allocator = std.testing.allocator;
    const input = "short";
    const result = truncate.truncateHead(allocator, input, .{});
    defer allocator.free(result.content);

    try std.testing.expect(!result.truncated);
    try std.testing.expectEqualStrings("short", result.content);
}
