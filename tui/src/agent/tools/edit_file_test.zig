const std = @import("std");
const edit_file = @import("edit_file.zig");
const edit_diff = @import("edit_diff.zig");

test "edit_file tool definition" {
    try std.testing.expectEqualStrings("edit_file", edit_file.tool.name);
    try std.testing.expect(edit_file.tool.execute_ctx != null);
}

test "detectLineEnding - LF" {
    try std.testing.expectEqual(edit_diff.LineEnding.lf, edit_diff.detectLineEnding("hello\nworld"));
}

test "detectLineEnding - CRLF" {
    try std.testing.expectEqual(edit_diff.LineEnding.crlf, edit_diff.detectLineEnding("hello\r\nworld"));
}

test "detectLineEnding - no newlines defaults to LF" {
    try std.testing.expectEqual(edit_diff.LineEnding.lf, edit_diff.detectLineEnding("no newlines"));
}

test "normalizeToLF - converts CRLF" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.normalizeToLF(allocator, "hello\r\nworld\r\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld\n", result);
}

test "normalizeToLF - converts standalone CR" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.normalizeToLF(allocator, "hello\rworld");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld", result);
}

test "restoreLineEndings - LF unchanged" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.restoreLineEndings(allocator, "hello\nworld", .lf);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld", result);
}

test "restoreLineEndings - CRLF conversion" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.restoreLineEndings(allocator, "hello\nworld\n", .crlf);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\r\nworld\r\n", result);
}

test "stripBom - with BOM" {
    const with_bom = "\xEF\xBB\xBFhello world";
    const result = edit_diff.stripBom(with_bom);
    try std.testing.expect(result.has_bom);
    try std.testing.expectEqualStrings("hello world", result.text);
}

test "stripBom - without BOM" {
    const without_bom = "hello world";
    const result = edit_diff.stripBom(without_bom);
    try std.testing.expect(!result.has_bom);
    try std.testing.expectEqualStrings("hello world", result.text);
}

test "restoreBom - with BOM" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.restoreBom(allocator, "hello", true);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("\xEF\xBB\xBFhello", result);
}

test "restoreBom - without BOM" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.restoreBom(allocator, "hello", false);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello", result);
}

test "normalizeForFuzzyMatch - strips trailing whitespace" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.normalizeForFuzzyMatch(allocator, "hello   \nworld\t\t\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld\n", result);
}

test "normalizeForFuzzyMatch - preserves leading whitespace" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.normalizeForFuzzyMatch(allocator, "  hello\n  world");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("  hello\n  world", result);
}

test "fuzzyFindText - exact match" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.fuzzyFindText(allocator, "hello world", "world");
    try std.testing.expect(result.found);
    try std.testing.expectEqual(@as(usize, 6), result.index);
    try std.testing.expectEqual(@as(usize, 5), result.match_length);
    try std.testing.expect(!result.used_fuzzy_match);
}

test "fuzzyFindText - fuzzy match with trailing whitespace difference" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.fuzzyFindText(allocator, "hello   \nworld", "hello\nworld");
    if (result.used_fuzzy_match) {
        defer allocator.free(result.content_for_replacement);
    }
    try std.testing.expect(result.found);
    try std.testing.expect(result.used_fuzzy_match);
}

test "fuzzyFindText - not found" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.fuzzyFindText(allocator, "hello world", "xyz");
    try std.testing.expect(!result.found);
}

test "countOccurrences - multiple matches" {
    const allocator = std.testing.allocator;
    const count = try edit_diff.countOccurrences(allocator, "hello hello hello", "hello");
    try std.testing.expectEqual(@as(usize, 3), count);
}

test "countOccurrences - single fuzzy match" {
    const allocator = std.testing.allocator;
    const count = try edit_diff.countOccurrences(allocator, "hello   \nhello", "hello\nhello");
    try std.testing.expectEqual(@as(usize, 1), count);
}

test "countOccurrences - no match" {
    const allocator = std.testing.allocator;
    const count = try edit_diff.countOccurrences(allocator, "hello world", "xyz");
    try std.testing.expectEqual(@as(usize, 0), count);
}

test "generateDiff - basic change" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.generateDiff(allocator, "line1\nline2\nline3", "line1\nmodified\nline3", 2);
    defer allocator.free(result.diff);

    try std.testing.expect(result.first_changed_line != null);
    try std.testing.expectEqual(@as(usize, 2), result.first_changed_line.?);
    try std.testing.expect(std.mem.indexOf(u8, result.diff, "-") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.diff, "+") != null);
}

test "generateDiff - no changes" {
    const allocator = std.testing.allocator;
    const result = try edit_diff.generateDiff(allocator, "line1\nline2", "line1\nline2", 2);
    defer allocator.free(result.diff);

    try std.testing.expect(result.first_changed_line == null);
}
