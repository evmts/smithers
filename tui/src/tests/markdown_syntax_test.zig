const std = @import("std");
const syntax = @import("../markdown/syntax.zig");

const Color = syntax.Color;
const Language = syntax.Language;
const SyntaxHighlighter = syntax.SyntaxHighlighter;

// =============================================================================
// Color Constants Tests
// =============================================================================

test "syntax default color" {
    try std.testing.expectEqual(@as(u8, 7), Color.default);
}

test "syntax color constants" {
    try std.testing.expectEqual(@as(u8, 5), Color.keyword);
    try std.testing.expectEqual(@as(u8, 2), Color.string);
    try std.testing.expectEqual(@as(u8, 8), Color.comment);
    try std.testing.expectEqual(@as(u8, 3), Color.number);
    try std.testing.expectEqual(@as(u8, 4), Color.function);
}

// =============================================================================
// Language Detection Tests
// =============================================================================

test "language from string - exact match" {
    try std.testing.expectEqual(Language.zig, Language.fromString("zig"));
    try std.testing.expectEqual(Language.rust, Language.fromString("rust"));
    try std.testing.expectEqual(Language.typescript, Language.fromString("typescript"));
    try std.testing.expectEqual(Language.javascript, Language.fromString("javascript"));
    try std.testing.expectEqual(Language.python, Language.fromString("python"));
    try std.testing.expectEqual(Language.bash, Language.fromString("bash"));
    try std.testing.expectEqual(Language.shell, Language.fromString("shell"));
}

test "language from string - aliases" {
    try std.testing.expectEqual(Language.rust, Language.fromString("rs"));
    try std.testing.expectEqual(Language.typescript, Language.fromString("ts"));
    try std.testing.expectEqual(Language.javascript, Language.fromString("js"));
    try std.testing.expectEqual(Language.python, Language.fromString("py"));
    try std.testing.expectEqual(Language.shell, Language.fromString("sh"));
}

test "language from string - case insensitive" {
    try std.testing.expectEqual(Language.zig, Language.fromString("ZIG"));
    try std.testing.expectEqual(Language.zig, Language.fromString("Zig"));
    try std.testing.expectEqual(Language.rust, Language.fromString("RUST"));
    try std.testing.expectEqual(Language.rust, Language.fromString("RS"));
    try std.testing.expectEqual(Language.typescript, Language.fromString("TypeScript"));
    try std.testing.expectEqual(Language.typescript, Language.fromString("TS"));
    try std.testing.expectEqual(Language.python, Language.fromString("PYTHON"));
    try std.testing.expectEqual(Language.python, Language.fromString("PY"));
}

test "syntax unknown language uses default" {
    try std.testing.expectEqual(Language.unknown, Language.fromString("xyz"));
    try std.testing.expectEqual(Language.unknown, Language.fromString(""));
    try std.testing.expectEqual(Language.unknown, Language.fromString("cobol"));
    try std.testing.expectEqual(Language.unknown, Language.fromString("fortran"));
    try std.testing.expectEqual(Language.unknown, Language.fromString("12345"));
}

test "language from string - long input truncated" {
    const long_input = "a" ** 100;
    try std.testing.expectEqual(Language.unknown, Language.fromString(long_input));
}

// =============================================================================
// Keyword Highlighting Tests
// =============================================================================

test "syntax highlight keywords - zig" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("const x = 42;", .zig);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("const", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
}

test "syntax highlight keywords - multiple keywords" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("pub fn test() {}", .zig);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("pub", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
    try std.testing.expectEqualStrings("fn", spans[2].text);
    try std.testing.expectEqual(Color.keyword, spans[2].color);
}

test "syntax highlight keywords - rust" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("let mut x = 5;", .rust);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("let", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
    try std.testing.expectEqualStrings("mut", spans[2].text);
    try std.testing.expectEqual(Color.keyword, spans[2].color);
}

test "syntax highlight keywords - typescript" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("const x: number = 1;", .typescript);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("const", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
}

test "syntax highlight keywords - python" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("def foo():", .python);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("def", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
}

test "syntax highlight keywords - bash" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("if true; then", .bash);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("if", spans[0].text);
    try std.testing.expectEqual(Color.keyword, spans[0].color);
}

test "syntax highlight keywords - word boundary check" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("constant", .zig);
    defer hl.free(spans);

    // "constant" should NOT match "const" keyword
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "const")) {
            try std.testing.expect(false);
        }
    }
}

// =============================================================================
// String Highlighting Tests
// =============================================================================

test "syntax highlight strings - double quotes" {
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

test "syntax highlight strings - single quotes" {
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

test "syntax highlight strings - escaped quotes" {
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

test "syntax highlight strings - empty string" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = \"\"", .javascript);
    defer hl.free(spans);

    var found = false;
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "\"\"")) {
            try std.testing.expectEqual(Color.string, span.color);
            found = true;
        }
    }
    try std.testing.expect(found);
}

// =============================================================================
// Comment Highlighting Tests
// =============================================================================

test "syntax highlight comments - line comment c-style" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 1 // comment", .zig);
    defer hl.free(spans);

    var found_comment = false;
    for (spans) |span| {
        if (std.mem.startsWith(u8, span.text, "//")) {
            try std.testing.expectEqual(Color.comment, span.color);
            found_comment = true;
        }
    }
    try std.testing.expect(found_comment);
}

test "syntax highlight comments - line comment hash" {
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

test "syntax highlight comments - block comment" {
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

test "syntax highlight comments - unclosed block comment" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x /* unclosed", .javascript);
    defer hl.free(spans);

    var found_comment = false;
    for (spans) |span| {
        if (std.mem.startsWith(u8, span.text, "/*")) {
            try std.testing.expectEqual(Color.comment, span.color);
            found_comment = true;
        }
    }
    try std.testing.expect(found_comment);
}

test "syntax highlight comments - bash" {
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

// =============================================================================
// Number Highlighting Tests
// =============================================================================

test "syntax highlight numbers - integer" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 42", .zig);
    defer hl.free(spans);

    var found_num = false;
    for (spans) |s| {
        if (std.mem.eql(u8, s.text, "42")) {
            try std.testing.expectEqual(Color.number, s.color);
            found_num = true;
        }
    }
    try std.testing.expect(found_num);
}

test "syntax highlight numbers - hex" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 0xFF", .zig);
    defer hl.free(spans);

    var found_num = false;
    for (spans) |s| {
        if (std.mem.startsWith(u8, s.text, "0x") or std.mem.startsWith(u8, s.text, "0X")) {
            try std.testing.expectEqual(Color.number, s.color);
            found_num = true;
        }
    }
    try std.testing.expect(found_num);
}

test "syntax highlight numbers - float" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 3.14", .javascript);
    defer hl.free(spans);

    var found_num = false;
    for (spans) |s| {
        if (std.mem.eql(u8, s.text, "3.14")) {
            try std.testing.expectEqual(Color.number, s.color);
            found_num = true;
        }
    }
    try std.testing.expect(found_num);
}

test "syntax highlight numbers - multiple" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("let x = 0x1F + 3.14;", .javascript);
    defer hl.free(spans);

    var count: usize = 0;
    for (spans) |span| {
        if (span.color == Color.number) count += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), count);
}

test "syntax highlight numbers - binary" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 0b1010", .zig);
    defer hl.free(spans);

    var found_num = false;
    for (spans) |s| {
        if (std.mem.startsWith(u8, s.text, "0b")) {
            try std.testing.expectEqual(Color.number, s.color);
            found_num = true;
        }
    }
    try std.testing.expect(found_num);
}

test "syntax highlight numbers - octal" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("x = 0o755", .zig);
    defer hl.free(spans);

    var found_num = false;
    for (spans) |s| {
        if (std.mem.startsWith(u8, s.text, "0o")) {
            try std.testing.expectEqual(Color.number, s.color);
            found_num = true;
        }
    }
    try std.testing.expect(found_num);
}

// =============================================================================
// Function Highlighting Tests
// =============================================================================

test "syntax highlight function" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("fn main() {}", .rust);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("main", spans[2].text);
    try std.testing.expectEqual(Color.function, spans[2].color);
}

test "syntax highlight function - javascript" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("async function foo() {}", .javascript);
    defer hl.free(spans);

    try std.testing.expectEqualStrings("foo", spans[4].text);
    try std.testing.expectEqual(Color.function, spans[4].color);
}

test "syntax highlight function - not followed by paren" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("const foo = 1", .javascript);
    defer hl.free(spans);

    // "foo" should NOT be highlighted as function (no parenthesis)
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "foo")) {
            try std.testing.expectEqual(Color.default, span.color);
        }
    }
}

// =============================================================================
// Edge Cases
// =============================================================================

test "syntax empty code" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("", .zig);
    defer hl.free(spans);

    try std.testing.expectEqual(@as(usize, 0), spans.len);
}

test "syntax whitespace only" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("   \t\n  ", .zig);
    defer hl.free(spans);

    for (spans) |span| {
        try std.testing.expectEqual(Color.default, span.color);
    }
}

test "syntax unknown language highlights nothing special" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("const x = 42", .unknown);
    defer hl.free(spans);

    // Unknown language: no keywords, but numbers and strings should still work
    var found_num = false;
    for (spans) |span| {
        if (std.mem.eql(u8, span.text, "42")) {
            try std.testing.expectEqual(Color.number, span.color);
            found_num = true;
        }
        // "const" should NOT be keyword-colored for unknown language
        if (std.mem.eql(u8, span.text, "const")) {
            try std.testing.expectEqual(Color.default, span.color);
        }
    }
    try std.testing.expect(found_num);
}

test "syntax newlines preserved" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("a\nb", .zig);
    defer hl.free(spans);

    try std.testing.expectEqual(@as(usize, 3), spans.len);
    try std.testing.expectEqualStrings("a", spans[0].text);
    try std.testing.expectEqualStrings("\n", spans[1].text);
    try std.testing.expectEqualStrings("b", spans[2].text);
}

test "syntax special characters" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const spans = try hl.highlight("{}[]();,", .zig);
    defer hl.free(spans);

    for (spans) |span| {
        try std.testing.expectEqual(Color.default, span.color);
    }
}

// =============================================================================
// Integration Tests
// =============================================================================

test "syntax complex code" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const code =
        \\pub fn add(a: i32, b: i32) i32 {
        \\    // Add two numbers
        \\    return a + b;
        \\}
    ;
    const spans = try hl.highlight(code, .zig);
    defer hl.free(spans);

    var found_keyword = false;
    var found_function = false;
    var found_comment = false;

    for (spans) |span| {
        if (span.color == Color.keyword) found_keyword = true;
        if (span.color == Color.function) found_function = true;
        if (span.color == Color.comment) found_comment = true;
    }

    try std.testing.expect(found_keyword);
    try std.testing.expect(found_function);
    try std.testing.expect(found_comment);
}

test "syntax shell script" {
    var hl = SyntaxHighlighter.init(std.testing.allocator);
    const code =
        \\#!/bin/bash
        \\for i in 1 2 3; do
        \\    echo $i
        \\done
    ;
    const spans = try hl.highlight(code, .shell);
    defer hl.free(spans);

    var found_keyword = false;
    var found_comment = false;

    for (spans) |span| {
        if (span.color == Color.keyword) found_keyword = true;
        if (span.color == Color.comment) found_comment = true;
    }

    try std.testing.expect(found_keyword);
    try std.testing.expect(found_comment);
}
