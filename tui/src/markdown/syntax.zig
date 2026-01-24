const std = @import("std");

/// ANSI 256 color indices for syntax highlighting
pub const Color = struct {
    pub const keyword: u8 = 5; // Magenta
    pub const string: u8 = 2; // Green
    pub const comment: u8 = 8; // Gray
    pub const number: u8 = 3; // Yellow
    pub const function: u8 = 4; // Blue
    pub const default: u8 = 7; // White
};

/// A styled span of text with color
pub const StyledSpan = struct {
    text: []const u8,
    color: u8,
};

/// Supported languages
pub const Language = enum {
    zig,
    rust,
    typescript,
    javascript,
    python,
    bash,
    shell,
    unknown,

    pub fn fromString(lang: []const u8) Language {
        const lower = blk: {
            var buf: [32]u8 = undefined;
            const len = @min(lang.len, buf.len);
            for (0..len) |i| {
                buf[i] = std.ascii.toLower(lang[i]);
            }
            break :blk buf[0..len];
        };

        if (std.mem.eql(u8, lower, "zig")) return .zig;
        if (std.mem.eql(u8, lower, "rust") or std.mem.eql(u8, lower, "rs")) return .rust;
        if (std.mem.eql(u8, lower, "typescript") or std.mem.eql(u8, lower, "ts")) return .typescript;
        if (std.mem.eql(u8, lower, "javascript") or std.mem.eql(u8, lower, "js")) return .javascript;
        if (std.mem.eql(u8, lower, "python") or std.mem.eql(u8, lower, "py")) return .python;
        if (std.mem.eql(u8, lower, "bash")) return .bash;
        if (std.mem.eql(u8, lower, "shell") or std.mem.eql(u8, lower, "sh")) return .shell;
        return .unknown;
    }
};

/// Syntax highlighter for code blocks
pub const SyntaxHighlighter = struct {
    allocator: std.mem.Allocator,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{ .allocator = allocator };
    }

    /// Highlight code and return array of styled spans. Caller owns memory.
    pub fn highlight(self: *Self, code: []const u8, lang: Language) ![]StyledSpan {
        var spans: std.ArrayListUnmanaged(StyledSpan) = .{};
        errdefer spans.deinit(self.allocator);

        var i: usize = 0;
        while (i < code.len) {
            // Try to match in order: comments, strings, numbers, keywords, functions, default
            if (try self.matchComment(code, i, lang)) |span| {
                try spans.append(self.allocator, span);
                i += span.text.len;
            } else if (try self.matchString(code, i)) |span| {
                try spans.append(self.allocator, span);
                i += span.text.len;
            } else if (try self.matchNumber(code, i)) |span| {
                try spans.append(self.allocator, span);
                i += span.text.len;
            } else if (try self.matchKeyword(code, i, lang)) |span| {
                try spans.append(self.allocator, span);
                i += span.text.len;
            } else if (try self.matchFunction(code, i)) |span| {
                try spans.append(self.allocator, span);
                i += span.text.len;
            } else {
                // Default: single character
                try spans.append(self.allocator, .{ .text = code[i .. i + 1], .color = Color.default });
                i += 1;
            }
        }

        return spans.toOwnedSlice(self.allocator);
    }

    fn matchComment(self: *Self, code: []const u8, start: usize, lang: Language) !?StyledSpan {
        _ = self;
        const rest = code[start..];

        // Line comments
        const line_comment_prefix: ?[]const u8 = switch (lang) {
            .zig, .rust, .typescript, .javascript => "//",
            .python, .bash, .shell => "#",
            .unknown => null,
        };

        if (line_comment_prefix) |prefix| {
            if (std.mem.startsWith(u8, rest, prefix)) {
                // Find end of line
                var end = start + prefix.len;
                while (end < code.len and code[end] != '\n') : (end += 1) {}
                return .{ .text = code[start..end], .color = Color.comment };
            }
        }

        // Block comments /* */
        if (lang == .zig or lang == .rust or lang == .typescript or lang == .javascript) {
            if (std.mem.startsWith(u8, rest, "/*")) {
                var end = start + 2;
                while (end + 1 < code.len) : (end += 1) {
                    if (code[end] == '*' and code[end + 1] == '/') {
                        return .{ .text = code[start .. end + 2], .color = Color.comment };
                    }
                }
                // Unclosed block comment - treat rest as comment
                return .{ .text = code[start..], .color = Color.comment };
            }
        }

        return null;
    }

    fn matchString(self: *Self, code: []const u8, start: usize) !?StyledSpan {
        _ = self;
        const c = code[start];
        if (c != '"' and c != '\'') return null;

        var end = start + 1;
        while (end < code.len) : (end += 1) {
            if (code[end] == '\\' and end + 1 < code.len) {
                end += 1; // Skip escaped char
                continue;
            }
            if (code[end] == c) {
                return .{ .text = code[start .. end + 1], .color = Color.string };
            }
            if (code[end] == '\n') break; // Unclosed string on line
        }

        // Unclosed string - return what we have
        return .{ .text = code[start..end], .color = Color.string };
    }

    fn matchNumber(self: *Self, code: []const u8, start: usize) !?StyledSpan {
        _ = self;
        const c = code[start];

        // Must start with digit or be negative number
        if (!std.ascii.isDigit(c)) return null;

        var end = start;

        // Handle hex/octal/binary prefixes
        if (c == '0' and end + 1 < code.len) {
            const next = code[end + 1];
            if (next == 'x' or next == 'X' or next == 'o' or next == 'O' or next == 'b' or next == 'B') {
                end += 2;
            }
        }

        // Consume digits, underscores, dots, and hex chars
        while (end < code.len) : (end += 1) {
            const ch = code[end];
            if (std.ascii.isDigit(ch) or ch == '_' or ch == '.' or
                (ch >= 'a' and ch <= 'f') or (ch >= 'A' and ch <= 'F'))
            {
                continue;
            }
            break;
        }

        if (end > start) {
            return .{ .text = code[start..end], .color = Color.number };
        }
        return null;
    }

    fn matchKeyword(self: *Self, code: []const u8, start: usize, lang: Language) !?StyledSpan {
        _ = self;
        const keywords = getKeywords(lang);

        for (keywords) |kw| {
            if (start + kw.len > code.len) continue;
            if (!std.mem.eql(u8, code[start .. start + kw.len], kw)) continue;

            // Check word boundary
            if (start + kw.len < code.len) {
                const next = code[start + kw.len];
                if (std.ascii.isAlphanumeric(next) or next == '_') continue;
            }
            if (start > 0) {
                const prev = code[start - 1];
                if (std.ascii.isAlphanumeric(prev) or prev == '_') continue;
            }

            return .{ .text = code[start .. start + kw.len], .color = Color.keyword };
        }
        return null;
    }

    fn matchFunction(self: *Self, code: []const u8, start: usize) !?StyledSpan {
        _ = self;
        const c = code[start];
        if (!std.ascii.isAlphabetic(c) and c != '_') return null;

        // Check word boundary at start
        if (start > 0) {
            const prev = code[start - 1];
            if (std.ascii.isAlphanumeric(prev) or prev == '_') return null;
        }

        var end = start + 1;
        while (end < code.len and (std.ascii.isAlphanumeric(code[end]) or code[end] == '_')) : (end += 1) {}

        // Check if followed by (
        if (end < code.len and code[end] == '(') {
            return .{ .text = code[start..end], .color = Color.function };
        }
        return null;
    }

    pub fn free(self: *Self, spans: []StyledSpan) void {
        self.allocator.free(spans);
    }
};

fn getKeywords(lang: Language) []const []const u8 {
    return switch (lang) {
        .zig => &zig_keywords,
        .rust => &rust_keywords,
        .typescript, .javascript => &ts_keywords,
        .python => &python_keywords,
        .bash, .shell => &bash_keywords,
        .unknown => &[_][]const u8{},
    };
}

const zig_keywords = [_][]const u8{
    "const",     "var",       "fn",        "pub",       "return",
    "if",        "else",      "while",     "for",       "break",
    "continue",  "switch",    "try",       "catch",     "defer",
    "errdefer",  "error",     "struct",    "enum",      "union",
    "test",      "comptime",  "inline",    "async",     "await",
    "suspend",   "resume",    "null",      "undefined", "true",
    "false",     "and",       "or",        "orelse",    "unreachable",
    "threadlocal", "volatile", "extern",   "export",    "align",
    "anytype",   "usingnamespace",
};

const rust_keywords = [_][]const u8{
    "fn",        "let",       "mut",       "const",     "pub",
    "return",    "if",        "else",      "while",     "for",
    "loop",      "break",     "continue",  "match",     "struct",
    "enum",      "impl",      "trait",     "type",      "where",
    "use",       "mod",       "crate",     "self",      "Self",
    "super",     "async",     "await",     "move",      "ref",
    "static",    "unsafe",    "extern",    "dyn",       "true",
    "false",     "Some",      "None",      "Ok",        "Err",
    "Result",    "Option",    "Box",       "Vec",       "String",
};

const ts_keywords = [_][]const u8{
    "const",     "let",       "var",       "function",  "return",
    "if",        "else",      "while",     "for",       "do",
    "break",     "continue",  "switch",    "case",      "default",
    "try",       "catch",     "finally",   "throw",     "class",
    "extends",   "implements", "interface", "type",     "enum",
    "import",    "export",    "from",      "async",     "await",
    "new",       "this",      "super",     "static",    "public",
    "private",   "protected", "readonly",  "abstract",  "true",
    "false",     "null",      "undefined", "typeof",    "instanceof",
    "in",        "of",        "as",        "is",        "keyof",
    "never",     "void",      "any",       "unknown",   "string",
    "number",    "boolean",   "object",    "symbol",    "bigint",
};

const python_keywords = [_][]const u8{
    "def",       "class",     "return",    "if",        "elif",
    "else",      "while",     "for",       "break",     "continue",
    "pass",      "try",       "except",    "finally",   "raise",
    "import",    "from",      "as",        "with",      "async",
    "await",     "lambda",    "yield",     "global",    "nonlocal",
    "True",      "False",     "None",      "and",       "or",
    "not",       "in",        "is",        "assert",    "del",
};

const bash_keywords = [_][]const u8{
    "if",        "then",      "else",      "elif",      "fi",
    "for",       "while",     "do",        "done",      "case",
    "esac",      "in",        "function",  "return",    "exit",
    "break",     "continue",  "local",     "export",    "readonly",
    "declare",   "typeset",   "source",    "alias",     "unalias",
    "set",       "unset",     "shift",     "trap",      "eval",
    "exec",      "true",      "false",     "test",
};

// Tests
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
