const std = @import("std");
const mem = std.mem;
const Allocator = std.mem.Allocator;

/// ANSI 256 color indices
pub const Color = struct {
    pub const default: u8 = 0;
    pub const cyan: u8 = 6; // code
    pub const green: u8 = 2; // blockquote
    pub const blue: u8 = 4; // links
    pub const white: u8 = 7;
};

pub const Style = struct {
    bold: bool = false,
    italic: bool = false,
    underline: bool = false,
    color: u8 = Color.default,

    pub fn merge(self: Style, other: Style) Style {
        return .{
            .bold = self.bold or other.bold,
            .italic = self.italic or other.italic,
            .underline = self.underline or other.underline,
            .color = if (other.color != Color.default) other.color else self.color,
        };
    }

    pub fn eql(self: Style, other: Style) bool {
        return self.bold == other.bold and
            self.italic == other.italic and
            self.underline == other.underline and
            self.color == other.color;
    }
};

pub const StyledSpan = struct {
    text: []const u8,
    style: Style,
};

pub const LineType = enum {
    paragraph,
    heading1,
    heading2,
    heading3,
    heading4,
    code_block,
    blockquote,
    unordered_list,
    ordered_list,
};

pub const StyledLine = struct {
    spans: []StyledSpan,
    line_type: LineType,
    indent_level: u8,
    code_lang: ?[]const u8,
};

pub const ParseResult = struct {
    lines: []StyledLine,
    allocator: Allocator,

    pub fn deinit(self: *ParseResult) void {
        for (self.lines) |line| {
            self.allocator.free(line.spans);
        }
        self.allocator.free(self.lines);
    }
};

pub const MarkdownParser = struct {
    allocator: Allocator,

    pub fn init(allocator: Allocator) MarkdownParser {
        return .{ .allocator = allocator };
    }

    pub fn parse(self: *MarkdownParser, input: []const u8) !ParseResult {
        var lines: std.ArrayListUnmanaged(StyledLine) = .empty;
        errdefer {
            for (lines.items) |line| {
                self.allocator.free(line.spans);
            }
            lines.deinit(self.allocator);
        }

        var line_iter = mem.splitSequence(u8, input, "\n");
        var in_code_block = false;
        var code_lang: ?[]const u8 = null;

        while (line_iter.next()) |raw_line| {
            // Handle code block boundaries
            if (mem.startsWith(u8, raw_line, "```")) {
                if (!in_code_block) {
                    in_code_block = true;
                    code_lang = if (raw_line.len > 3) raw_line[3..] else null;
                    continue;
                } else {
                    in_code_block = false;
                    code_lang = null;
                    continue;
                }
            }

            if (in_code_block) {
                const styled_line = try self.parseCodeLine(raw_line, code_lang);
                try lines.append(self.allocator, styled_line);
                continue;
            }

            const styled_line = try self.parseLine(raw_line);
            try lines.append(self.allocator, styled_line);
        }

        return .{
            .lines = try lines.toOwnedSlice(self.allocator),
            .allocator = self.allocator,
        };
    }

    fn parseCodeLine(self: *MarkdownParser, line: []const u8, lang: ?[]const u8) !StyledLine {
        var spans: std.ArrayListUnmanaged(StyledSpan) = .empty;
        errdefer spans.deinit(self.allocator);

        try spans.append(self.allocator, .{
            .text = line,
            .style = .{ .color = Color.cyan },
        });

        return .{
            .spans = try spans.toOwnedSlice(self.allocator),
            .line_type = .code_block,
            .indent_level = 0,
            .code_lang = lang,
        };
    }

    fn parseLine(self: *MarkdownParser, line: []const u8) !StyledLine {
        var trimmed = line;
        var indent_level: u8 = 0;

        // Count leading spaces for indent
        while (trimmed.len > 0 and trimmed[0] == ' ') {
            trimmed = trimmed[1..];
            indent_level += 1;
        }
        indent_level = indent_level / 2; // Convert to indent levels

        // Check line type
        if (mem.startsWith(u8, trimmed, "#### ")) {
            return self.parseHeading(trimmed[5..], .heading4, indent_level);
        } else if (mem.startsWith(u8, trimmed, "### ")) {
            return self.parseHeading(trimmed[4..], .heading3, indent_level);
        } else if (mem.startsWith(u8, trimmed, "## ")) {
            return self.parseHeading(trimmed[3..], .heading2, indent_level);
        } else if (mem.startsWith(u8, trimmed, "# ")) {
            return self.parseHeading(trimmed[2..], .heading1, indent_level);
        } else if (mem.startsWith(u8, trimmed, "> ")) {
            return self.parseBlockquote(trimmed[2..], indent_level);
        } else if (mem.startsWith(u8, trimmed, "- ") or mem.startsWith(u8, trimmed, "* ")) {
            return self.parseUnorderedList(trimmed[2..], indent_level);
        } else if (self.startsWithOrderedListMarker(trimmed)) |after_marker| {
            return self.parseOrderedList(after_marker, indent_level);
        } else {
            return self.parseParagraph(trimmed, indent_level);
        }
    }

    fn startsWithOrderedListMarker(self: *MarkdownParser, text: []const u8) ?[]const u8 {
        _ = self;
        var i: usize = 0;
        while (i < text.len and text[i] >= '0' and text[i] <= '9') : (i += 1) {}
        if (i > 0 and i < text.len and text[i] == '.' and i + 1 < text.len and text[i + 1] == ' ') {
            return text[i + 2 ..];
        }
        return null;
    }

    fn parseHeading(self: *MarkdownParser, content: []const u8, level: LineType, indent: u8) !StyledLine {
        const style: Style = switch (level) {
            .heading1 => .{ .bold = true, .underline = true },
            .heading2 => .{ .bold = true },
            .heading3 => .{ .bold = true, .italic = true },
            .heading4 => .{ .italic = true },
            else => .{},
        };

        var spans: std.ArrayListUnmanaged(StyledSpan) = .empty;
        errdefer spans.deinit(self.allocator);

        try self.parseInlineContent(&spans, content, style);

        return .{
            .spans = try spans.toOwnedSlice(self.allocator),
            .line_type = level,
            .indent_level = indent,
            .code_lang = null,
        };
    }

    fn parseBlockquote(self: *MarkdownParser, content: []const u8, indent: u8) !StyledLine {
        var spans: std.ArrayListUnmanaged(StyledSpan) = .empty;
        errdefer spans.deinit(self.allocator);

        try self.parseInlineContent(&spans, content, .{ .color = Color.green });

        return .{
            .spans = try spans.toOwnedSlice(self.allocator),
            .line_type = .blockquote,
            .indent_level = indent,
            .code_lang = null,
        };
    }

    fn parseUnorderedList(self: *MarkdownParser, content: []const u8, indent: u8) !StyledLine {
        var spans: std.ArrayListUnmanaged(StyledSpan) = .empty;
        errdefer spans.deinit(self.allocator);

        try self.parseInlineContent(&spans, content, .{});

        return .{
            .spans = try spans.toOwnedSlice(self.allocator),
            .line_type = .unordered_list,
            .indent_level = indent,
            .code_lang = null,
        };
    }

    fn parseOrderedList(self: *MarkdownParser, content: []const u8, indent: u8) !StyledLine {
        var spans: std.ArrayListUnmanaged(StyledSpan) = .empty;
        errdefer spans.deinit(self.allocator);

        try self.parseInlineContent(&spans, content, .{});

        return .{
            .spans = try spans.toOwnedSlice(self.allocator),
            .line_type = .ordered_list,
            .indent_level = indent,
            .code_lang = null,
        };
    }

    fn parseParagraph(self: *MarkdownParser, content: []const u8, indent: u8) !StyledLine {
        var spans: std.ArrayListUnmanaged(StyledSpan) = .empty;
        errdefer spans.deinit(self.allocator);

        try self.parseInlineContent(&spans, content, .{});

        return .{
            .spans = try spans.toOwnedSlice(self.allocator),
            .line_type = .paragraph,
            .indent_level = indent,
            .code_lang = null,
        };
    }

    fn parseInlineContent(self: *MarkdownParser, spans: *std.ArrayListUnmanaged(StyledSpan), content: []const u8, base_style: Style) !void {
        var i: usize = 0;
        var current_start: usize = 0;

        while (i < content.len) {
            // Check for inline code
            if (content[i] == '`') {
                if (i > current_start) {
                    try spans.append(self.allocator, .{ .text = content[current_start..i], .style = base_style });
                }
                if (self.findClosingBacktick(content, i + 1)) |end| {
                    try spans.append(self.allocator, .{
                        .text = content[i + 1 .. end],
                        .style = base_style.merge(.{ .color = Color.cyan }),
                    });
                    i = end + 1;
                    current_start = i;
                    continue;
                }
            }

            // Check for bold (**text** or __text__)
            if (i + 1 < content.len) {
                if ((content[i] == '*' and content[i + 1] == '*') or
                    (content[i] == '_' and content[i + 1] == '_'))
                {
                    const marker = content[i .. i + 2];
                    if (i > current_start) {
                        try spans.append(self.allocator, .{ .text = content[current_start..i], .style = base_style });
                    }
                    if (self.findClosingMarker(content, i + 2, marker)) |end| {
                        try spans.append(self.allocator, .{
                            .text = content[i + 2 .. end],
                            .style = base_style.merge(.{ .bold = true }),
                        });
                        i = end + 2;
                        current_start = i;
                        continue;
                    }
                }
            }

            // Check for italic (*text* or _text_) - single char markers
            if (content[i] == '*' or content[i] == '_') {
                // Skip if part of bold marker
                if (i + 1 < content.len and content[i + 1] == content[i]) {
                    i += 1;
                    continue;
                }
                const marker = content[i .. i + 1];
                if (i > current_start) {
                    try spans.append(self.allocator, .{ .text = content[current_start..i], .style = base_style });
                }
                if (self.findClosingSingleMarker(content, i + 1, marker[0])) |end| {
                    try spans.append(self.allocator, .{
                        .text = content[i + 1 .. end],
                        .style = base_style.merge(.{ .italic = true }),
                    });
                    i = end + 1;
                    current_start = i;
                    continue;
                }
            }

            // Check for links [text](url)
            if (content[i] == '[') {
                if (i > current_start) {
                    try spans.append(self.allocator, .{ .text = content[current_start..i], .style = base_style });
                }
                if (self.parseLink(content, i)) |link_result| {
                    try spans.append(self.allocator, .{
                        .text = link_result.text,
                        .style = base_style.merge(.{ .color = Color.blue, .underline = true }),
                    });
                    i = link_result.end;
                    current_start = i;
                    continue;
                }
            }

            i += 1;
        }

        if (current_start < content.len) {
            try spans.append(self.allocator, .{ .text = content[current_start..], .style = base_style });
        }
    }

    fn findClosingBacktick(self: *MarkdownParser, content: []const u8, start: usize) ?usize {
        _ = self;
        var i = start;
        while (i < content.len) : (i += 1) {
            if (content[i] == '`') return i;
        }
        return null;
    }

    fn findClosingMarker(self: *MarkdownParser, content: []const u8, start: usize, marker: []const u8) ?usize {
        _ = self;
        if (start >= content.len) return null;
        if (mem.indexOf(u8, content[start..], marker)) |rel_pos| {
            return start + rel_pos;
        }
        return null;
    }

    fn findClosingSingleMarker(self: *MarkdownParser, content: []const u8, start: usize, marker: u8) ?usize {
        _ = self;
        var i = start;
        while (i < content.len) : (i += 1) {
            if (content[i] == marker) {
                // Make sure it's not a double marker (bold)
                if (i + 1 < content.len and content[i + 1] == marker) {
                    i += 1;
                    continue;
                }
                return i;
            }
        }
        return null;
    }

    const LinkResult = struct {
        text: []const u8,
        end: usize,
    };

    fn parseLink(self: *MarkdownParser, content: []const u8, start: usize) ?LinkResult {
        _ = self;
        // Find closing bracket
        var bracket_end: ?usize = null;
        var i = start + 1;
        while (i < content.len) : (i += 1) {
            if (content[i] == ']') {
                bracket_end = i;
                break;
            }
        }

        if (bracket_end) |be| {
            // Check for opening paren
            if (be + 1 < content.len and content[be + 1] == '(') {
                // Find closing paren
                var paren_end: ?usize = null;
                var j = be + 2;
                while (j < content.len) : (j += 1) {
                    if (content[j] == ')') {
                        paren_end = j;
                        break;
                    }
                }

                if (paren_end) |pe| {
                    return .{
                        .text = content[start + 1 .. be],
                        .end = pe + 1,
                    };
                }
            }
        }
        return null;
    }
};
