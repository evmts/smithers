const std = @import("std");
const width = @import("width.zig");

const calculateWidth = width.calculateWidth;
const visibleWidthWithAllocator = width.visibleWidthWithAllocator;
const sliceByColumn = width.sliceByColumn;
const wrapTextWithAnsi = width.wrapTextWithAnsi;
const stripAnsi = width.stripAnsi;
const classifySequence = width.classifySequence;
const SequenceType = width.SequenceType;
const WidthCache = width.WidthCache;

test "visibleWidth ASCII" {
    const w = calculateWidth("Hello, World!");
    try std.testing.expectEqual(@as(u32, 13), w);
}

test "visibleWidth empty" {
    const w = calculateWidth("");
    try std.testing.expectEqual(@as(u32, 0), w);
}

test "visibleWidth tab" {
    const w = calculateWidth("a\tb");
    try std.testing.expectEqual(@as(u32, 5), w);
}

test "visibleWidth CJK" {
    const w = calculateWidth("你好");
    try std.testing.expectEqual(@as(u32, 4), w);
}

test "visibleWidth mixed ASCII and CJK" {
    const w = calculateWidth("Hello你好");
    try std.testing.expectEqual(@as(u32, 9), w);
}

test "visibleWidth emoji" {
    const w = calculateWidth("😀");
    try std.testing.expectEqual(@as(u32, 2), w);
}

test "visibleWidth combining marks" {
    const w = calculateWidth("e\u{0301}");
    try std.testing.expectEqual(@as(u32, 1), w);
}

test "visibleWidth with ANSI stripped" {
    const allocator = std.testing.allocator;
    const w = visibleWidthWithAllocator(allocator, "\x1b[31mRed\x1b[0m");
    try std.testing.expectEqual(@as(u32, 3), w);
}

test "visibleWidth multiple ANSI sequences" {
    const allocator = std.testing.allocator;
    const w = visibleWidthWithAllocator(allocator, "\x1b[1m\x1b[31mBold Red\x1b[0m");
    try std.testing.expectEqual(@as(u32, 8), w);
}

test "visibleWidth Hiragana" {
    const w = calculateWidth("こんにちは");
    try std.testing.expectEqual(@as(u32, 10), w);
}

test "visibleWidth Katakana" {
    const w = calculateWidth("カタカナ");
    try std.testing.expectEqual(@as(u32, 8), w);
}

test "visibleWidth Hangul" {
    const w = calculateWidth("한글");
    try std.testing.expectEqual(@as(u32, 4), w);
}

test "sliceByColumn basic" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "Hello, World!", 0, 5);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Hello", result);
}

test "sliceByColumn middle" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "Hello, World!", 7, 12);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("World", result);
}

test "sliceByColumn with ANSI" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "\x1b[31mRed\x1b[0m Text", 0, 3);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("\x1b[31mRed\x1b[0m", result);
}

test "sliceByColumn wide char" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "你好世界", 0, 4);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("你好", result);
}

test "wrapTextWithAnsi basic" {
    const allocator = std.testing.allocator;
    var lines = try wrapTextWithAnsi(allocator, "Hello World", 5);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 3), lines.items.len);
    try std.testing.expectEqualStrings("Hello", lines.items[0]);
    try std.testing.expectEqualStrings(" Worl", lines.items[1]);
    try std.testing.expectEqualStrings("d", lines.items[2]);
}

test "wrapTextWithAnsi preserves style" {
    const allocator = std.testing.allocator;
    var lines = try wrapTextWithAnsi(allocator, "\x1b[31mRedText\x1b[0m", 3);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 3), lines.items.len);
    try std.testing.expect(std.mem.startsWith(u8, lines.items[0], "\x1b[31m"));
    try std.testing.expect(std.mem.startsWith(u8, lines.items[1], "\x1b[31m"));
}

test "stripAnsi basic" {
    const allocator = std.testing.allocator;
    const result = try stripAnsi(allocator, "\x1b[31mRed\x1b[0m");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Red", result);
}

test "stripAnsi no escapes" {
    const allocator = std.testing.allocator;
    const result = try stripAnsi(allocator, "Plain text");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Plain text", result);
}

test "classifySequence CSI" {
    const result = classifySequence("\x1b[31m");
    try std.testing.expectEqual(SequenceType.csi, result.type);
    try std.testing.expectEqual(@as(usize, 5), result.len);
}

test "classifySequence OSC with BEL" {
    const result = classifySequence("\x1b]0;title\x07");
    try std.testing.expectEqual(SequenceType.osc, result.type);
    try std.testing.expectEqual(@as(usize, 10), result.len);
}

test "classifySequence not escape" {
    const result = classifySequence("hello");
    try std.testing.expectEqual(SequenceType.not_escape, result.type);
}

test "cache hit and miss" {
    var cache = WidthCache{};
    try std.testing.expectEqual(@as(?u32, null), cache.get(12345));
    cache.put(12345, 42);
    try std.testing.expectEqual(@as(?u32, 42), cache.get(12345));
}
