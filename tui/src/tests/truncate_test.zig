const std = @import("std");
const truncate = @import("../agent/tools/truncate.zig");

// Constants tests
test "MAX_BYTES is 30KB" {
    try std.testing.expectEqual(@as(usize, 30 * 1024), truncate.MAX_BYTES);
}

test "MAX_LINES is 500" {
    try std.testing.expectEqual(@as(usize, 500), truncate.MAX_LINES);
}

test "MAX_LINE_LENGTH is 300" {
    try std.testing.expectEqual(@as(usize, 300), truncate.MAX_LINE_LENGTH);
}

// truncateTail tests
test "truncateTail empty input" {
    const allocator = std.testing.allocator;
    const result = truncate.truncateTail(allocator, "", .{});

    try std.testing.expectEqualStrings("", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 0), result.total_lines);
    try std.testing.expectEqual(@as(usize, 0), result.output_lines);
    try std.testing.expectEqual(@as(usize, 0), result.total_bytes);
    try std.testing.expectEqual(@as(usize, 0), result.output_bytes);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.none, result.truncated_by);
}

test "truncateTail single line under limit returns unchanged" {
    const allocator = std.testing.allocator;
    const result = truncate.truncateTail(allocator, "hello world", .{ .max_lines = 10, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("hello world", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 1), result.total_lines);
    try std.testing.expectEqual(@as(usize, 1), result.output_lines);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.none, result.truncated_by);
}

test "truncateTail under limit returns unchanged" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 10, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("line1\nline2\nline3", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
    try std.testing.expectEqual(@as(usize, 3), result.output_lines);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.none, result.truncated_by);
}

test "truncateTail exact limit returns unchanged" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 3, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("line1\nline2\nline3", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
    try std.testing.expectEqual(@as(usize, 3), result.output_lines);
}

test "truncateTail over limit truncates from head" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3\nline4\nline5";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("line4\nline5", result.content);
    try std.testing.expect(result.truncated);
    try std.testing.expectEqual(@as(usize, 5), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.lines, result.truncated_by);
}

test "truncateTail reports correct line counts" {
    const allocator = std.testing.allocator;
    const input = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 3, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 10), result.total_lines);
    try std.testing.expectEqual(@as(usize, 3), result.output_lines);
    try std.testing.expectEqualStrings("h\ni\nj", result.content);
}

test "truncateTail truncates by bytes" {
    const allocator = std.testing.allocator;
    const input = "aaaa\nbbbb\ncccc\ndddd";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 100, .max_bytes = 10 });
    defer allocator.free(result.content);

    try std.testing.expect(result.truncated);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.bytes, result.truncated_by);
    try std.testing.expect(result.output_bytes <= 10);
}

test "truncateTail reports total_bytes correctly" {
    const allocator = std.testing.allocator;
    const input = "hello\nworld";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 1, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 11), result.total_bytes);
}

// truncateHead tests
test "truncateHead empty input" {
    const allocator = std.testing.allocator;
    const result = truncate.truncateHead(allocator, "", .{});

    try std.testing.expectEqualStrings("", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 0), result.total_lines);
    try std.testing.expectEqual(@as(usize, 0), result.output_lines);
    try std.testing.expectEqual(@as(usize, 0), result.total_bytes);
    try std.testing.expectEqual(@as(usize, 0), result.output_bytes);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.none, result.truncated_by);
}

test "truncateHead single line under limit returns unchanged" {
    const allocator = std.testing.allocator;
    const result = truncate.truncateHead(allocator, "hello world", .{ .max_lines = 10, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("hello world", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 1), result.total_lines);
    try std.testing.expectEqual(@as(usize, 1), result.output_lines);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.none, result.truncated_by);
}

test "truncateHead under limit returns unchanged" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 10, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("line1\nline2\nline3", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
    try std.testing.expectEqual(@as(usize, 3), result.output_lines);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.none, result.truncated_by);
}

test "truncateHead exact limit returns unchanged" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 3, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("line1\nline2\nline3", result.content);
    try std.testing.expect(!result.truncated);
    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
    try std.testing.expectEqual(@as(usize, 3), result.output_lines);
}

test "truncateHead over limit truncates from tail" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\nline3\nline4\nline5";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqualStrings("line1\nline2", result.content);
    try std.testing.expect(result.truncated);
    try std.testing.expectEqual(@as(usize, 5), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.lines, result.truncated_by);
}

test "truncateHead reports correct line counts" {
    const allocator = std.testing.allocator;
    const input = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 3, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 10), result.total_lines);
    try std.testing.expectEqual(@as(usize, 3), result.output_lines);
    try std.testing.expectEqualStrings("a\nb\nc", result.content);
}

test "truncateHead truncates by bytes" {
    const allocator = std.testing.allocator;
    const input = "aaaa\nbbbb\ncccc\ndddd";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 100, .max_bytes = 10 });
    defer allocator.free(result.content);

    try std.testing.expect(result.truncated);
    try std.testing.expectEqual(truncate.TruncateResult.TruncatedBy.bytes, result.truncated_by);
    try std.testing.expect(result.output_bytes <= 10);
}

test "truncateHead reports total_bytes correctly" {
    const allocator = std.testing.allocator;
    const input = "hello\nworld";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 1, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 11), result.total_bytes);
}

test "truncateHead counts all lines even when truncated" {
    const allocator = std.testing.allocator;
    const input = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 10), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
}

// truncateLine tests
test "truncateLine under limit returns unchanged" {
    const result = truncate.truncateLine("short line", 100);
    try std.testing.expectEqualStrings("short line", result.text);
    try std.testing.expect(!result.was_truncated);
}

test "truncateLine exact limit returns unchanged" {
    const result = truncate.truncateLine("12345", 5);
    try std.testing.expectEqualStrings("12345", result.text);
    try std.testing.expect(!result.was_truncated);
}

test "truncateLine over limit truncates" {
    const result = truncate.truncateLine("hello world", 5);
    try std.testing.expectEqualStrings("hello", result.text);
    try std.testing.expect(result.was_truncated);
}

test "truncateLine empty string" {
    const result = truncate.truncateLine("", 10);
    try std.testing.expectEqualStrings("", result.text);
    try std.testing.expect(!result.was_truncated);
}

// formatSize tests
test "formatSize bytes" {
    const allocator = std.testing.allocator;
    const result = truncate.formatSize(allocator, 512);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("512B", result);
}

test "formatSize kilobytes" {
    const allocator = std.testing.allocator;
    const result = truncate.formatSize(allocator, 2048);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("2.0KB", result);
}

test "formatSize megabytes" {
    const allocator = std.testing.allocator;
    const result = truncate.formatSize(allocator, 2 * 1024 * 1024);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("2.0MB", result);
}

test "formatSize zero bytes" {
    const allocator = std.testing.allocator;
    const result = truncate.formatSize(allocator, 0);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("0B", result);
}

test "formatSize boundary 1023 bytes" {
    const allocator = std.testing.allocator;
    const result = truncate.formatSize(allocator, 1023);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("1023B", result);
}

test "formatSize boundary 1024 bytes" {
    const allocator = std.testing.allocator;
    const result = truncate.formatSize(allocator, 1024);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("1.0KB", result);
}

// TruncateResult struct tests
test "TruncatedBy enum values" {
    try std.testing.expectEqual(@as(usize, 0), @intFromEnum(truncate.TruncateResult.TruncatedBy.none));
    try std.testing.expectEqual(@as(usize, 1), @intFromEnum(truncate.TruncateResult.TruncatedBy.lines));
    try std.testing.expectEqual(@as(usize, 2), @intFromEnum(truncate.TruncateResult.TruncatedBy.bytes));
}

// Edge case: trailing newline
test "truncateTail with trailing newline" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\n";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 10, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
}

test "truncateHead with trailing newline" {
    const allocator = std.testing.allocator;
    const input = "line1\nline2\n";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 10, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 3), result.total_lines);
}

// Edge case: only newlines
test "truncateTail only newlines" {
    const allocator = std.testing.allocator;
    const input = "\n\n\n";
    const result = truncate.truncateTail(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 4), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
    try std.testing.expect(result.truncated);
}

test "truncateHead only newlines" {
    const allocator = std.testing.allocator;
    const input = "\n\n\n";
    const result = truncate.truncateHead(allocator, input, .{ .max_lines = 2, .max_bytes = 1024 });
    defer allocator.free(result.content);

    try std.testing.expectEqual(@as(usize, 4), result.total_lines);
    try std.testing.expectEqual(@as(usize, 2), result.output_lines);
    try std.testing.expect(result.truncated);
}
