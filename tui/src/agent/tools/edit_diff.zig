const std = @import("std");

pub const LineEnding = enum {
    lf,
    crlf,

    pub fn bytes(self: LineEnding) []const u8 {
        return switch (self) {
            .lf => "\n",
            .crlf => "\r\n",
        };
    }
};

pub const FuzzyMatchResult = struct {
    found: bool,
    index: usize,
    match_length: usize,
    used_fuzzy_match: bool,
    content_for_replacement: []const u8,
};

pub const DiffResult = struct {
    diff: []const u8,
    first_changed_line: ?usize,
};

pub fn detectLineEnding(content: []const u8) LineEnding {
    const crlf_idx = std.mem.indexOf(u8, content, "\r\n");
    const lf_idx = std.mem.indexOf(u8, content, "\n");

    if (lf_idx == null) return .lf;
    if (crlf_idx == null) return .lf;
    return if (crlf_idx.? < lf_idx.?) .crlf else .lf;
}

pub fn normalizeToLF(allocator: std.mem.Allocator, text: []const u8) ![]const u8 {
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);

    var i: usize = 0;
    while (i < text.len) {
        if (i + 1 < text.len and text[i] == '\r' and text[i + 1] == '\n') {
            try result.append(allocator, '\n');
            i += 2;
        } else if (text[i] == '\r') {
            try result.append(allocator, '\n');
            i += 1;
        } else {
            try result.append(allocator, text[i]);
            i += 1;
        }
    }

    return result.toOwnedSlice(allocator);
}

pub fn restoreLineEndings(allocator: std.mem.Allocator, text: []const u8, ending: LineEnding) ![]const u8 {
    if (ending == .lf) {
        return allocator.dupe(u8, text);
    }

    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);

    for (text) |c| {
        if (c == '\n') {
            try result.appendSlice(allocator, "\r\n");
        } else {
            try result.append(allocator, c);
        }
    }

    return result.toOwnedSlice(allocator);
}

pub const StripBomResult = struct {
    has_bom: bool,
    text: []const u8,
};

pub fn stripBom(text: []const u8) StripBomResult {
    if (text.len >= 3 and text[0] == 0xEF and text[1] == 0xBB and text[2] == 0xBF) {
        return .{ .has_bom = true, .text = text[3..] };
    }
    return .{ .has_bom = false, .text = text };
}

pub fn restoreBom(allocator: std.mem.Allocator, text: []const u8, has_bom: bool) ![]const u8 {
    if (!has_bom) {
        return allocator.dupe(u8, text);
    }
    const bom: []const u8 = &[_]u8{ 0xEF, 0xBB, 0xBF };
    return std.mem.concat(allocator, u8, &.{ bom, text });
}

fn isUnicodeSmartQuote(c: u8, next_bytes: []const u8) ?struct { replacement: u8, skip: usize } {
    if (c < 0xC0) return null;

    if (next_bytes.len >= 2) {
        const b1 = c;
        const b2 = next_bytes[0];
        const b3 = next_bytes[1];

        if (b1 == 0xE2 and b2 == 0x80) {
            return switch (b3) {
                0x98, 0x99, 0x9A, 0x9B => .{ .replacement = '\'', .skip = 3 },
                0x9C, 0x9D, 0x9E, 0x9F => .{ .replacement = '"', .skip = 3 },
                0x90, 0x91, 0x92, 0x93, 0x94, 0x95 => .{ .replacement = '-', .skip = 3 },
                else => null,
            };
        }
        if (b1 == 0xE2 and b2 == 0x88 and b3 == 0x92) {
            return .{ .replacement = '-', .skip = 3 };
        }
    }

    if (next_bytes.len >= 1) {
        const b1 = c;
        const b2 = next_bytes[0];

        if (b1 == 0xC2 and b2 == 0xA0) {
            return .{ .replacement = ' ', .skip = 2 };
        }
    }

    return null;
}

pub fn normalizeForFuzzyMatch(allocator: std.mem.Allocator, text: []const u8) ![]const u8 {
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);

    var lines = std.mem.splitScalar(u8, text, '\n');
    var first = true;

    while (lines.next()) |line| {
        if (!first) {
            try result.append(allocator, '\n');
        }
        first = false;

        const trimmed = std.mem.trimRight(u8, line, " \t\r");

        var i: usize = 0;
        while (i < trimmed.len) {
            const remaining = if (i + 1 < trimmed.len) trimmed[i + 1 ..] else &[_]u8{};
            if (isUnicodeSmartQuote(trimmed[i], remaining)) |conv| {
                try result.append(allocator, conv.replacement);
                i += conv.skip;
            } else {
                try result.append(allocator, trimmed[i]);
                i += 1;
            }
        }
    }

    return result.toOwnedSlice(allocator);
}

pub fn fuzzyFindText(allocator: std.mem.Allocator, content: []const u8, needle: []const u8) !FuzzyMatchResult {
    if (std.mem.indexOf(u8, content, needle)) |idx| {
        return .{
            .found = true,
            .index = idx,
            .match_length = needle.len,
            .used_fuzzy_match = false,
            .content_for_replacement = content,
        };
    }

    const fuzzy_content = try normalizeForFuzzyMatch(allocator, content);
    const fuzzy_needle = try normalizeForFuzzyMatch(allocator, needle);
    defer allocator.free(fuzzy_needle);

    if (std.mem.indexOf(u8, fuzzy_content, fuzzy_needle)) |idx| {
        return .{
            .found = true,
            .index = idx,
            .match_length = fuzzy_needle.len,
            .used_fuzzy_match = true,
            .content_for_replacement = fuzzy_content,
        };
    }

    allocator.free(fuzzy_content);
    return .{
        .found = false,
        .index = 0,
        .match_length = 0,
        .used_fuzzy_match = false,
        .content_for_replacement = content,
    };
}

pub fn countOccurrences(allocator: std.mem.Allocator, content: []const u8, needle: []const u8) !usize {
    const fuzzy_content = try normalizeForFuzzyMatch(allocator, content);
    defer allocator.free(fuzzy_content);
    const fuzzy_needle = try normalizeForFuzzyMatch(allocator, needle);
    defer allocator.free(fuzzy_needle);

    if (fuzzy_needle.len == 0) return 0;

    var count: usize = 0;
    var pos: usize = 0;

    while (pos <= fuzzy_content.len - fuzzy_needle.len) {
        if (std.mem.indexOf(u8, fuzzy_content[pos..], fuzzy_needle)) |idx| {
            count += 1;
            pos += idx + fuzzy_needle.len;
        } else {
            break;
        }
    }

    return count;
}

pub fn generateDiff(allocator: std.mem.Allocator, old_content: []const u8, new_content: []const u8, context_lines: usize) !DiffResult {
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);

    var old_lines_list: std.ArrayList([]const u8) = .empty;
    defer old_lines_list.deinit(allocator);
    var new_lines_list: std.ArrayList([]const u8) = .empty;
    defer new_lines_list.deinit(allocator);

    var old_iter = std.mem.splitScalar(u8, old_content, '\n');
    while (old_iter.next()) |line| {
        try old_lines_list.append(allocator, line);
    }
    var new_iter = std.mem.splitScalar(u8, new_content, '\n');
    while (new_iter.next()) |line| {
        try new_lines_list.append(allocator, line);
    }

    const old_lines = old_lines_list.items;
    const new_lines = new_lines_list.items;

    const max_line_num = @max(old_lines.len, new_lines.len);
    const line_num_width = countDigits(max_line_num);

    var first_changed_line: ?usize = null;
    var old_idx: usize = 0;
    var new_idx: usize = 0;

    while (old_idx < old_lines.len or new_idx < new_lines.len) {
        if (old_idx < old_lines.len and new_idx < new_lines.len and
            std.mem.eql(u8, old_lines[old_idx], new_lines[new_idx]))
        {
            old_idx += 1;
            new_idx += 1;
            continue;
        }

        if (first_changed_line == null) {
            first_changed_line = new_idx + 1;
        }

        const context_start = if (old_idx >= context_lines) old_idx - context_lines else 0;
        if (context_start < old_idx) {
            if (result.items.len > 0) {
                try result.appendSlice(allocator, "\n");
            }
            for (context_start..old_idx) |i| {
                try appendLine(allocator, &result, ' ', i + 1, old_lines[i], line_num_width);
            }
        }

        var old_end = old_idx;
        var new_end = new_idx;

        while (old_end < old_lines.len and new_end < new_lines.len) {
            if (std.mem.eql(u8, old_lines[old_end], new_lines[new_end])) {
                var match_len: usize = 0;
                while (old_end + match_len < old_lines.len and
                    new_end + match_len < new_lines.len and
                    std.mem.eql(u8, old_lines[old_end + match_len], new_lines[new_end + match_len]))
                {
                    match_len += 1;
                    if (match_len >= context_lines * 2) break;
                }
                if (match_len >= context_lines * 2) break;
            }
            if (old_end < old_lines.len) old_end += 1;
            if (new_end < new_lines.len) new_end += 1;
        }

        for (old_idx..old_end) |i| {
            try appendLine(allocator, &result, '-', i + 1, old_lines[i], line_num_width);
        }
        for (new_idx..new_end) |i| {
            try appendLine(allocator, &result, '+', i + 1, new_lines[i], line_num_width);
        }

        const trailing_context_end = @min(old_end + context_lines, old_lines.len);
        for (old_end..trailing_context_end) |i| {
            try appendLine(allocator, &result, ' ', i + 1, old_lines[i], line_num_width);
        }

        old_idx = trailing_context_end;
        new_idx = new_end + (trailing_context_end - old_end);
    }

    return .{
        .diff = try result.toOwnedSlice(allocator),
        .first_changed_line = first_changed_line,
    };
}

fn appendLine(allocator: std.mem.Allocator, result: *std.ArrayList(u8), prefix: u8, line_num: usize, line: []const u8, width: usize) !void {
    if (result.items.len > 0 and result.items[result.items.len - 1] != '\n') {
        try result.append(allocator, '\n');
    }
    try result.append(allocator, prefix);

    var buf: [20]u8 = undefined;
    const num_str = std.fmt.bufPrint(&buf, "{d}", .{line_num}) catch unreachable;
    const padding = width - num_str.len;
    for (0..padding) |_| {
        try result.append(allocator, ' ');
    }
    try result.appendSlice(allocator, num_str);
    try result.append(allocator, ' ');
    try result.appendSlice(allocator, line);
}

fn countDigits(n: usize) usize {
    if (n == 0) return 1;
    var count: usize = 0;
    var val = n;
    while (val > 0) {
        count += 1;
        val /= 10;
    }
    return count;
}

/// Build JSON details for edit tool: {"diff": "...", "first_changed_line": N}
pub fn buildEditDetailsJson(allocator: std.mem.Allocator, diff: []const u8, first_line: ?usize) ![]const u8 {
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);

    try result.appendSlice(allocator, "{\"diff\":");
    try appendJsonString(allocator, &result, diff);

    if (first_line) |line| {
        var buf: [32]u8 = undefined;
        const line_str = std.fmt.bufPrint(&buf, ",\"first_changed_line\":{d}", .{line}) catch unreachable;
        try result.appendSlice(allocator, line_str);
    }

    try result.append(allocator, '}');
    return result.toOwnedSlice(allocator);
}

/// Append a JSON-escaped string
pub fn appendJsonString(allocator: std.mem.Allocator, result: *std.ArrayList(u8), s: []const u8) !void {
    try result.append(allocator, '"');
    for (s) |c| {
        switch (c) {
            '"' => try result.appendSlice(allocator, "\\\""),
            '\\' => try result.appendSlice(allocator, "\\\\"),
            '\n' => try result.appendSlice(allocator, "\\n"),
            '\r' => try result.appendSlice(allocator, "\\r"),
            '\t' => try result.appendSlice(allocator, "\\t"),
            else => {
                if (c < 0x20) {
                    var buf: [6]u8 = undefined;
                    const hex = std.fmt.bufPrint(&buf, "\\u{x:0>4}", .{c}) catch continue;
                    try result.appendSlice(allocator, hex);
                } else {
                    try result.append(allocator, c);
                }
            },
        }
    }
    try result.append(allocator, '"');
}

test "detectLineEnding" {
    try std.testing.expectEqual(LineEnding.lf, detectLineEnding("hello\nworld"));
    try std.testing.expectEqual(LineEnding.crlf, detectLineEnding("hello\r\nworld"));
    try std.testing.expectEqual(LineEnding.lf, detectLineEnding("no newlines"));
    try std.testing.expectEqual(LineEnding.crlf, detectLineEnding("first\r\nsecond\nthird"));
}

test "normalizeToLF" {
    const allocator = std.testing.allocator;

    const result1 = try normalizeToLF(allocator, "hello\r\nworld\r\n");
    defer allocator.free(result1);
    try std.testing.expectEqualStrings("hello\nworld\n", result1);

    const result2 = try normalizeToLF(allocator, "hello\rworld");
    defer allocator.free(result2);
    try std.testing.expectEqualStrings("hello\nworld", result2);
}

test "restoreLineEndings" {
    const allocator = std.testing.allocator;

    const result = try restoreLineEndings(allocator, "hello\nworld\n", .crlf);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\r\nworld\r\n", result);
}

test "stripBom" {
    const with_bom = "\xEF\xBB\xBFhello";
    const result = stripBom(with_bom);
    try std.testing.expect(result.has_bom);
    try std.testing.expectEqualStrings("hello", result.text);

    const without_bom = "hello";
    const result2 = stripBom(without_bom);
    try std.testing.expect(!result2.has_bom);
    try std.testing.expectEqualStrings("hello", result2.text);
}

test "restoreBom" {
    const allocator = std.testing.allocator;

    const result = try restoreBom(allocator, "hello", true);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("\xEF\xBB\xBFhello", result);
}

test "normalizeForFuzzyMatch strips trailing whitespace" {
    const allocator = std.testing.allocator;

    const result = try normalizeForFuzzyMatch(allocator, "hello   \nworld\t\t\n");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld\n", result);
}

test "fuzzyFindText exact match" {
    const allocator = std.testing.allocator;

    const result = try fuzzyFindText(allocator, "hello world", "world");
    try std.testing.expect(result.found);
    try std.testing.expectEqual(@as(usize, 6), result.index);
    try std.testing.expect(!result.used_fuzzy_match);
}

test "fuzzyFindText fuzzy match with trailing whitespace" {
    const allocator = std.testing.allocator;

    const result = try fuzzyFindText(allocator, "hello   \nworld", "hello\nworld");
    if (result.used_fuzzy_match) {
        defer allocator.free(result.content_for_replacement);
    }
    try std.testing.expect(result.found);
    try std.testing.expect(result.used_fuzzy_match);
}

test "fuzzyFindText not found" {
    const allocator = std.testing.allocator;

    const result = try fuzzyFindText(allocator, "hello world", "xyz");
    try std.testing.expect(!result.found);
}

test "countOccurrences" {
    const allocator = std.testing.allocator;

    const count = try countOccurrences(allocator, "hello hello hello", "hello");
    try std.testing.expectEqual(@as(usize, 3), count);

    const count2 = try countOccurrences(allocator, "hello   \nhello", "hello\nhello");
    try std.testing.expectEqual(@as(usize, 1), count2);
}

test "generateDiff" {
    const allocator = std.testing.allocator;

    const result = try generateDiff(allocator, "line1\nline2\nline3", "line1\nmodified\nline3", 2);
    defer allocator.free(result.diff);

    try std.testing.expect(result.first_changed_line != null);
    try std.testing.expect(std.mem.indexOf(u8, result.diff, "-") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.diff, "+") != null);
}

test "buildEditDetailsJson with first_changed_line" {
    const allocator = std.testing.allocator;

    const details = try buildEditDetailsJson(allocator, "-1 old\n+1 new", 1);
    defer allocator.free(details);

    try std.testing.expect(std.mem.indexOf(u8, details, "\"diff\":") != null);
    try std.testing.expect(std.mem.indexOf(u8, details, "\\n") != null);
    try std.testing.expect(std.mem.indexOf(u8, details, "\"first_changed_line\":1") != null);
}

test "buildEditDetailsJson without first_changed_line" {
    const allocator = std.testing.allocator;

    const details = try buildEditDetailsJson(allocator, "no changes", null);
    defer allocator.free(details);

    try std.testing.expect(std.mem.indexOf(u8, details, "\"diff\":") != null);
    try std.testing.expect(std.mem.indexOf(u8, details, "first_changed_line") == null);
}

test "appendJsonString escapes special characters" {
    const allocator = std.testing.allocator;
    var result: std.ArrayList(u8) = .empty;
    defer result.deinit(allocator);

    try appendJsonString(allocator, &result, "line1\nline2\ttab\"quote\\backslash");

    const str = result.items;
    try std.testing.expect(std.mem.indexOf(u8, str, "\\n") != null);
    try std.testing.expect(std.mem.indexOf(u8, str, "\\t") != null);
    try std.testing.expect(std.mem.indexOf(u8, str, "\\\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, str, "\\\\") != null);
}
