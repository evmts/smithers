const std = @import("std");
const syntax = @import("syntax.zig");

const SyntaxHighlighter = syntax.SyntaxHighlighter;
const Language = syntax.Language;
const Color = syntax.Color;

test "highlight zig keywords" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("const x = 42;", .zig);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("const", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
    // Verify number is highlighted
    var found_num = false;
    for (spans) |s| {
        if (std.mem.eql(u8, s.text, "42")) {
            try std.testing.expectEqual(Color.number, s.color);
            found_num = true;
        }
    }
    try std.testing.expect(found_num);
}

test "highlight rust function" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("fn main() {}", .rust);
    defer hl.free(spans);

    // fn = keyword, main = function (followed by paren)
    try std.testing.expectEqualStrings("fn", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
    try std.testing.expectEqualStrings("main", spans[2].text);
    try std.testing.expectEqual(Color.function, spans[2].color);
}

test "highlight typescript strings" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("const s = \"hello\";", .typescript);
    defer hl.free(spans);

    var found_string = false;
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "\"hello\"")) {
            try std.testing.expectEqual(Color.string, span.color);
            found_string = true;
        }
    }
    try std.testing.expect(found_string);
}

test "highlight python comments" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 1 # comment", .python);
    defer hl.free(spans);

    var found_comment = false;
    for (spans) |span| {
        if (std.mem.startsWith(u8, span.text, "#")) {
            try std.testing.expectEqual(Color.comment, span.color);
            found_comment = true;
        }
    }
    try std.testing.expect(found_comment);
}

test "highlight bash line comment" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("echo hi # test", .bash);
    defer hl.free(spans);

    var found_comment = false;
    for (spans) |span| {
        if (std.mem.startsWith(u8, span.text, "#")) {
            try std.testing.expectEqual(Color.comment, span.color);
            found_comment = true;
        }
    }
    try std.testing.expect(found_comment);
}

test "highlight block comment" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x /* comment */ y", .rust);
    defer hl.free(spans);

    var found_comment = false;
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "/* comment */")) {
            try std.testing.expectEqual(Color.comment, span.color);
            found_comment = true;
        }
    }
    try std.testing.expect(found_comment);
}

test "highlight numbers" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("let x = 0x1F + 3.14;", .javascript);
    defer hl.free(spans);

    var count: usize = 0;
    for (spans) |span| {
        if (span.color == Color.number) count += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), count);
}

test "language from string" {
    try std.testing.expectEqual(Language.zig, Language.fromString("zig"));
    try std.testing.expectEqual(Language.zig, Language.fromString("ZIG"));
    try std.testing.expectEqual(Language.rust, Language.fromString("rs"));
    try std.testing.expectEqual(Language.typescript, Language.fromString("ts"));
    try std.testing.expectEqual(Language.python, Language.fromString("py"));
    try std.testing.expectEqual(Language.bash, Language.fromString("bash"));
    try std.testing.expectEqual(Language.shell, Language.fromString("sh"));
    try std.testing.expectEqual(Language.unknown, Language.fromString("xyz"));
}

test "single quoted strings" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 'hello'", .python);
    defer hl.free(spans);

    var found = false;
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "'hello'")) {
            try std.testing.expectEqual(Color.string, span.color);
            found = true;
        }
    }
    try std.testing.expect(found);
}

test "escaped strings" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("s = \"a\\\"b\"", .javascript);
    defer hl.free(spans);

    var found = false;
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "\"a\\\"b\"")) {
            try std.testing.expectEqual(Color.string, span.color);
            found = true;
        }
    }
    try std.testing.expect(found);
}

test "javascript keywords" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("async function foo() {}", .javascript);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("async", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
    try std.testing.expectEqualStrings("function", spans[2].text);
    try std.testing.expectEqual(Color.keyword, spans[2].color);
    try std.testing.expectEqualStrings("foo", spans[4].text);
    try std.testing.expectEqual(Color.function, spans[4].color);
}
