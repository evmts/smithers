const std = @import("std");
const parser = @import("parser.zig");

const MarkdownParser = parser.MarkdownParser;
const LineType = parser.LineType;
const Style = parser.Style;
const Color = parser.Color;

test "parse plain text" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("Hello world");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
    try std.testing.expectEqual(@as(usize, 1), result.lines[0].spans.len);
    try std.testing.expectEqualStrings("Hello world", result.lines[0].spans[0].text);
    try std.testing.expectEqual(LineType.paragraph, result.lines[0].line_type);
}

test "parse bold with asterisks" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("This is **bold** text");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
    try std.testing.expectEqual(@as(usize, 3), result.lines[0].spans.len);
    try std.testing.expectEqualStrings("This is ", result.lines[0].spans[0].text);
    try std.testing.expectEqualStrings("bold", result.lines[0].spans[1].text);
    try std.testing.expect(result.lines[0].spans[1].style.bold);
    try std.testing.expectEqualStrings(" text", result.lines[0].spans[2].text);
}

test "parse bold with underscores" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("This is __bold__ text");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 3), result.lines[0].spans.len);
    try std.testing.expect(result.lines[0].spans[1].style.bold);
    try std.testing.expectEqualStrings("bold", result.lines[0].spans[1].text);
}

test "parse italic with asterisk" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("This is *italic* text");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 3), result.lines[0].spans.len);
    try std.testing.expectEqualStrings("italic", result.lines[0].spans[1].text);
    try std.testing.expect(result.lines[0].spans[1].style.italic);
}

test "parse italic with underscore" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("This is _italic_ text");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 3), result.lines[0].spans.len);
    try std.testing.expect(result.lines[0].spans[1].style.italic);
}

test "parse inline code" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("Use `code` here");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 3), result.lines[0].spans.len);
    try std.testing.expectEqualStrings("code", result.lines[0].spans[1].text);
    try std.testing.expectEqual(Color.cyan, result.lines[0].spans[1].style.color);
}

test "parse code block" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("```js\nconst x = 1;\n```");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
    try std.testing.expectEqual(LineType.code_block, result.lines[0].line_type);
    try std.testing.expectEqualStrings("const x = 1;", result.lines[0].spans[0].text);
    try std.testing.expectEqual(Color.cyan, result.lines[0].spans[0].style.color);
    try std.testing.expectEqualStrings("js", result.lines[0].code_lang.?);
}

test "parse code block without language" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("```\nplain code\n```");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
    try std.testing.expectEqual(LineType.code_block, result.lines[0].line_type);
    try std.testing.expect(result.lines[0].code_lang == null);
}

test "parse heading level 1" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("# Heading 1");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
    try std.testing.expectEqual(LineType.heading1, result.lines[0].line_type);
    try std.testing.expectEqualStrings("Heading 1", result.lines[0].spans[0].text);
    try std.testing.expect(result.lines[0].spans[0].style.bold);
    try std.testing.expect(result.lines[0].spans[0].style.underline);
}

test "parse heading level 2" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("## Heading 2");
    defer result.deinit();

    try std.testing.expectEqual(LineType.heading2, result.lines[0].line_type);
    try std.testing.expect(result.lines[0].spans[0].style.bold);
    try std.testing.expect(!result.lines[0].spans[0].style.underline);
}

test "parse heading level 3" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("### Heading 3");
    defer result.deinit();

    try std.testing.expectEqual(LineType.heading3, result.lines[0].line_type);
    try std.testing.expect(result.lines[0].spans[0].style.bold);
    try std.testing.expect(result.lines[0].spans[0].style.italic);
}

test "parse heading level 4" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("#### Heading 4");
    defer result.deinit();

    try std.testing.expectEqual(LineType.heading4, result.lines[0].line_type);
    try std.testing.expect(result.lines[0].spans[0].style.italic);
    try std.testing.expect(!result.lines[0].spans[0].style.bold);
}

test "parse unordered list with dash" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("- Item one\n- Item two");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 2), result.lines.len);
    try std.testing.expectEqual(LineType.unordered_list, result.lines[0].line_type);
    try std.testing.expectEqual(LineType.unordered_list, result.lines[1].line_type);
    try std.testing.expectEqualStrings("Item one", result.lines[0].spans[0].text);
    try std.testing.expectEqualStrings("Item two", result.lines[1].spans[0].text);
}

test "parse unordered list with asterisk" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("* Item one\n* Item two");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 2), result.lines.len);
    try std.testing.expectEqual(LineType.unordered_list, result.lines[0].line_type);
}

test "parse ordered list" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("1. First\n2. Second\n10. Tenth");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 3), result.lines.len);
    try std.testing.expectEqual(LineType.ordered_list, result.lines[0].line_type);
    try std.testing.expectEqual(LineType.ordered_list, result.lines[1].line_type);
    try std.testing.expectEqual(LineType.ordered_list, result.lines[2].line_type);
    try std.testing.expectEqualStrings("First", result.lines[0].spans[0].text);
}

test "parse blockquote" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("> This is a quote");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
    try std.testing.expectEqual(LineType.blockquote, result.lines[0].line_type);
    try std.testing.expectEqualStrings("This is a quote", result.lines[0].spans[0].text);
    try std.testing.expectEqual(Color.green, result.lines[0].spans[0].style.color);
}

test "parse link" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("Click [here](https://example.com) now");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 3), result.lines[0].spans.len);
    try std.testing.expectEqualStrings("Click ", result.lines[0].spans[0].text);
    try std.testing.expectEqualStrings("here", result.lines[0].spans[1].text);
    try std.testing.expectEqual(Color.blue, result.lines[0].spans[1].style.color);
    try std.testing.expect(result.lines[0].spans[1].style.underline);
    try std.testing.expectEqualStrings(" now", result.lines[0].spans[2].text);
}

test "parse multiple inline styles" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("**bold** and *italic* and `code`");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 5), result.lines[0].spans.len);
    try std.testing.expect(result.lines[0].spans[0].style.bold);
    try std.testing.expectEqualStrings(" and ", result.lines[0].spans[1].text);
    try std.testing.expect(result.lines[0].spans[2].style.italic);
    try std.testing.expectEqualStrings(" and ", result.lines[0].spans[3].text);
    try std.testing.expectEqual(Color.cyan, result.lines[0].spans[4].style.color);
}

test "parse multiline content" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("# Title\n\nParagraph text.\n\n- List item");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 5), result.lines.len);
    try std.testing.expectEqual(LineType.heading1, result.lines[0].line_type);
    try std.testing.expectEqual(LineType.paragraph, result.lines[1].line_type); // empty line
    try std.testing.expectEqual(LineType.paragraph, result.lines[2].line_type);
    try std.testing.expectEqual(LineType.paragraph, result.lines[3].line_type); // empty line
    try std.testing.expectEqual(LineType.unordered_list, result.lines[4].line_type);
}

test "parse indented list" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("- Outer\n  - Inner");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 2), result.lines.len);
    try std.testing.expectEqual(@as(u8, 0), result.lines[0].indent_level);
    try std.testing.expectEqual(@as(u8, 1), result.lines[1].indent_level);
}

test "parse empty input" {
    var md_parser = MarkdownParser.init(std.testing.allocator);
    var result = try md_parser.parse("");
    defer result.deinit();

    try std.testing.expectEqual(@as(usize, 1), result.lines.len);
}

test "style merge" {
    const base = Style{ .color = Color.green };
    const overlay = Style{ .bold = true };
    const merged = base.merge(overlay);

    try std.testing.expect(merged.bold);
    try std.testing.expectEqual(Color.green, merged.color);
}

test "style equality" {
    const s1 = Style{ .bold = true, .color = Color.cyan };
    const s2 = Style{ .bold = true, .color = Color.cyan };
    const s3 = Style{ .bold = false, .color = Color.cyan };

    try std.testing.expect(s1.eql(s2));
    try std.testing.expect(!s1.eql(s3));
}
