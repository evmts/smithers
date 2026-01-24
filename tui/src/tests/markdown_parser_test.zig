const std = @import("std");
const parser = @import("../markdown/parser.zig");

// Re-export tests from the main module (they're already defined there)
// Additional edge case tests below

test "Color constants are valid ANSI indices" {
    try std.testing.expect(parser.Color.default <= 255);
    try std.testing.expect(parser.Color.cyan <= 255);
    try std.testing.expect(parser.Color.green <= 255);
    try std.testing.expect(parser.Color.blue <= 255);
    try std.testing.expect(parser.Color.white <= 255);
}

test "Style default values" {
    const s = parser.Style{};
    try std.testing.expect(!s.bold);
    try std.testing.expect(!s.italic);
    try std.testing.expect(!s.underline);
    try std.testing.expectEqual(parser.Color.default, s.color);
}

test "Style merge preserves non-default color" {
    const base = parser.Style{ .color = parser.Color.green };
    const overlay = parser.Style{ .color = parser.Color.default };
    const merged = base.merge(overlay);
    try std.testing.expectEqual(parser.Color.green, merged.color);
}

test "Style merge takes overlay color when non-default" {
    const base = parser.Style{ .color = parser.Color.green };
    const overlay = parser.Style{ .color = parser.Color.blue };
    const merged = base.merge(overlay);
    try std.testing.expectEqual(parser.Color.blue, merged.color);
}

test "Style merge combines all boolean flags" {
    const base = parser.Style{ .bold = true };
    const overlay = parser.Style{ .italic = true };
    const merged = base.merge(overlay);
    try std.testing.expect(merged.bold);
    try std.testing.expect(merged.italic);
}

test "LineType enum has all expected variants" {
    const variants = [_]parser.LineType{
        .paragraph,
        .heading1,
        .heading2,
        .heading3,
        .heading4,
        .code_block,
        .blockquote,
        .unordered_list,
        .ordered_list,
    };
    try std.testing.expectEqual(@as(usize, 9), variants.len);
}

test "StyledSpan struct fields" {
    const span = parser.StyledSpan{
        .text = "hello",
        .style = .{ .bold = true },
    };
    try std.testing.expectEqualStrings("hello", span.text);
    try std.testing.expect(span.style.bold);
}

test "StyledLine struct fields" {
    const spans = [_]parser.StyledSpan{};
    const line = parser.StyledLine{
        .spans = &spans,
        .line_type = .paragraph,
        .indent_level = 2,
        .code_lang = "zig",
    };
    try std.testing.expectEqual(parser.LineType.paragraph, line.line_type);
    try std.testing.expectEqual(@as(u8, 2), line.indent_level);
    try std.testing.expectEqualStrings("zig", line.code_lang.?);
}

test "MarkdownParser init" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    _ = p;
}

test "parse only whitespace" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("   ");
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "parse unclosed bold" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("**unclosed bold");
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "parse unclosed code" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("`unclosed code");
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "parse unclosed link" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("[unclosed link");
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "parse special characters in text" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("Hello <world> & \"quoted\"");
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "parse unicode content" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("こんにちは 🎉 émoji");
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "parse deep indent" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("        - deeply indented");
    defer result.deinit();
    try std.testing.expectEqual(@as(u8, 4), result.lines[0].indent_level);
}

test "parse heading without space after hash" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("#NoSpace");
    defer result.deinit();
    try std.testing.expectEqual(parser.LineType.paragraph, result.lines[0].line_type);
}

test "ParseResult deinit cleans up" {
    var p = parser.MarkdownParser.init(std.testing.allocator);
    var result = try p.parse("# Title\n**bold**\n- list");
    result.deinit();
}
