// ANSI Escape Sequences per God-TUI spec §8
const std = @import("std");

pub const ESC = "\x1b";
pub const CSI = "\x1b[";
pub const OSC = "\x1b]";
pub const DCS = "\x1bP";
pub const APC = "\x1b_";
pub const ST = "\x1b\\";
pub const BEL = "\x07";

// Cursor marker for IME positioning (stripped before write)
pub const CURSOR_MARKER = "\x1b_pi:c\x07";

// Line reset: SGR reset + hyperlink reset
pub const LINE_RESET = "\x1b[0m\x1b]8;;\x07";

// === DEC Private Modes ===
pub const SYNC_START = "\x1b[?2026h";
pub const SYNC_END = "\x1b[?2026l";
pub const BRACKETED_PASTE_ON = "\x1b[?2004h";
pub const BRACKETED_PASTE_OFF = "\x1b[?2004l";
pub const ALT_SCREEN_ON = "\x1b[?1049h";
pub const ALT_SCREEN_OFF = "\x1b[?1049l";

// === Cursor Control ===
pub const HIDE_CURSOR = "\x1b[?25l";
pub const SHOW_CURSOR = "\x1b[?25h";
pub const SAVE_CURSOR = "\x1b[s";
pub const RESTORE_CURSOR = "\x1b[u";
pub const HOME = "\x1b[H";

// === Clear Operations ===
pub const CLEAR_TO_EOL = "\x1b[K";
pub const CLEAR_LINE = "\x1b[2K";
pub const CLEAR_TO_EOS = "\x1b[J";
pub const CLEAR_SCREEN = "\x1b[2J";
pub const CLEAR_SCROLLBACK = "\x1b[3J";
pub const CLEAR_ALL = "\x1b[2J\x1b[3J\x1b[H"; // Screen + scrollback + home

// === Kitty Keyboard Protocol ===
pub const KITTY_QUERY = "\x1b[?u";
pub const KITTY_PUSH_FLAGS_7 = "\x1b[>7u"; // disambiguate + report-events + alternate-keys
pub const KITTY_POP = "\x1b[<u";

// === Terminal Queries ===
pub const QUERY_CELL_SIZE = "\x1b[16t";
pub const QUERY_CURSOR_POS = "\x1b[6n";
pub const QUERY_XTVERSION = "\x1b[>0q";

// === SGR (Select Graphic Rendition) ===
pub const RESET = "\x1b[0m";
pub const BOLD = "\x1b[1m";
pub const DIM = "\x1b[2m";
pub const ITALIC = "\x1b[3m";
pub const UNDERLINE = "\x1b[4m";
pub const BLINK = "\x1b[5m";
pub const INVERSE = "\x1b[7m";
pub const HIDDEN = "\x1b[8m";
pub const STRIKETHROUGH = "\x1b[9m";

// Reset attributes
pub const RESET_BOLD = "\x1b[22m";
pub const RESET_ITALIC = "\x1b[23m";
pub const RESET_UNDERLINE = "\x1b[24m";
pub const RESET_BLINK = "\x1b[25m";
pub const RESET_INVERSE = "\x1b[27m";
pub const RESET_HIDDEN = "\x1b[28m";
pub const RESET_STRIKETHROUGH = "\x1b[29m";

// === Bracketed Paste Markers ===
pub const PASTE_START = "\x1b[200~";
pub const PASTE_END = "\x1b[201~";

// Write cursor movement up N lines
pub fn cursorUp(writer: anytype, n: u16) !void {
    if (n > 0) try writer.print("\x1b[{d}A", .{n});
}

// Write cursor movement down N lines
pub fn cursorDown(writer: anytype, n: u16) !void {
    if (n > 0) try writer.print("\x1b[{d}B", .{n});
}

// Write cursor movement right N columns
pub fn cursorRight(writer: anytype, n: u16) !void {
    if (n > 0) try writer.print("\x1b[{d}C", .{n});
}

// Write cursor movement left N columns
pub fn cursorLeft(writer: anytype, n: u16) !void {
    if (n > 0) try writer.print("\x1b[{d}D", .{n});
}

// Move cursor to specific column (1-indexed)
pub fn cursorColumn(writer: anytype, col: u16) !void {
    try writer.print("\x1b[{d}G", .{col});
}

// Move cursor to specific position (1-indexed)
pub fn cursorPosition(writer: anytype, row: u16, col: u16) !void {
    try writer.print("\x1b[{d};{d}H", .{ row, col });
}

// Set window title via OSC 0
pub fn setTitle(writer: anytype, title: []const u8) !void {
    try writer.print("\x1b]0;{s}\x07", .{title});
}

// 256-color foreground
pub fn fg256(writer: anytype, color: u8) !void {
    try writer.print("\x1b[38;5;{d}m", .{color});
}

// 256-color background
pub fn bg256(writer: anytype, color: u8) !void {
    try writer.print("\x1b[48;5;{d}m", .{color});
}

// True color foreground
pub fn fgRgb(writer: anytype, r: u8, g: u8, b: u8) !void {
    try writer.print("\x1b[38;2;{d};{d};{d}m", .{ r, g, b });
}

// True color background
pub fn bgRgb(writer: anytype, r: u8, g: u8, b: u8) !void {
    try writer.print("\x1b[48;2;{d};{d};{d}m", .{ r, g, b });
}

// OSC 8 hyperlink
pub fn hyperlink(writer: anytype, url: []const u8, text: []const u8) !void {
    try writer.print("\x1b]8;;{s}\x07{s}\x1b]8;;\x07", .{ url, text });
}

// === Sequence Detection ===

pub const SequenceType = enum {
    not_escape,
    incomplete,
    csi,
    osc,
    dcs,
    apc,
    ss3,
    single_char,
};

// Check if data is a complete escape sequence
pub fn classifySequence(data: []const u8) struct { type: SequenceType, len: usize } {
    if (data.len == 0) return .{ .type = .not_escape, .len = 0 };
    if (data[0] != '\x1b') return .{ .type = .not_escape, .len = 0 };
    if (data.len == 1) return .{ .type = .incomplete, .len = 1 };

    const after = data[1];

    // CSI: ESC [
    if (after == '[') {
        // Find terminator (0x40-0x7E)
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            const c = data[i];
            if (c >= 0x40 and c <= 0x7E) {
                return .{ .type = .csi, .len = i + 1 };
            }
        }
        return .{ .type = .incomplete, .len = data.len };
    }

    // OSC: ESC ]
    if (after == ']') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            if (data[i] == '\x07') return .{ .type = .osc, .len = i + 1 };
            if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') {
                return .{ .type = .osc, .len = i + 2 };
            }
        }
        return .{ .type = .incomplete, .len = data.len };
    }

    // DCS: ESC P
    if (after == 'P') {
        var i: usize = 2;
        while (i + 1 < data.len) : (i += 1) {
            if (data[i] == '\x1b' and data[i + 1] == '\\') {
                return .{ .type = .dcs, .len = i + 2 };
            }
        }
        return .{ .type = .incomplete, .len = data.len };
    }

    // APC: ESC _
    if (after == '_') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            if (data[i] == '\x07') return .{ .type = .apc, .len = i + 1 };
            if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') {
                return .{ .type = .apc, .len = i + 2 };
            }
        }
        return .{ .type = .incomplete, .len = data.len };
    }

    // SS3: ESC O + single char
    if (after == 'O') {
        if (data.len >= 3) return .{ .type = .ss3, .len = 3 };
        return .{ .type = .incomplete, .len = data.len };
    }

    // Meta/Alt: ESC + single char
    return .{ .type = .single_char, .len = 2 };
}

// Check if line contains image protocol sequences (skip LINE_RESET)
pub fn containsImage(line: []const u8) bool {
    // Kitty graphics: ESC_G
    if (std.mem.indexOf(u8, line, "\x1b_G") != null) return true;
    // iTerm2 inline images
    if (std.mem.indexOf(u8, line, "\x1b]1337;File=") != null) return true;
    return false;
}

// Strip ANSI escape sequences from text (for width calculation)
pub fn stripAnsi(allocator: std.mem.Allocator, text: []const u8) ![]u8 {
    var result = std.ArrayListUnmanaged(u8){};
    errdefer result.deinit(allocator);

    var i: usize = 0;
    while (i < text.len) {
        if (text[i] == '\x1b') {
            const seq = classifySequence(text[i..]);
            if (seq.type != .not_escape and seq.type != .incomplete) {
                i += seq.len;
                continue;
            }
        }
        try result.append(allocator, text[i]);
        i += 1;
    }

    return result.toOwnedSlice(allocator);
}

test "classifySequence CSI" {
    const result = classifySequence("\x1b[A");
    try std.testing.expectEqual(SequenceType.csi, result.type);
    try std.testing.expectEqual(@as(usize, 3), result.len);
}

test "classifySequence CSI with params" {
    const result = classifySequence("\x1b[1;5A");
    try std.testing.expectEqual(SequenceType.csi, result.type);
    try std.testing.expectEqual(@as(usize, 6), result.len);
}

test "classifySequence incomplete" {
    const result = classifySequence("\x1b[");
    try std.testing.expectEqual(SequenceType.incomplete, result.type);
}

test "classifySequence OSC" {
    const result = classifySequence("\x1b]0;title\x07");
    try std.testing.expectEqual(SequenceType.osc, result.type);
    try std.testing.expectEqual(@as(usize, 10), result.len);
}

test "classifySequence APC cursor marker" {
    const result = classifySequence(CURSOR_MARKER);
    try std.testing.expectEqual(SequenceType.apc, result.type);
    try std.testing.expectEqual(@as(usize, 7), result.len);
}

test "classifySequence SS3" {
    const result = classifySequence("\x1bOA");
    try std.testing.expectEqual(SequenceType.ss3, result.type);
    try std.testing.expectEqual(@as(usize, 3), result.len);
}

test "containsImage kitty" {
    try std.testing.expect(containsImage("text\x1b_Ga=T;base64\x1b\\more"));
    try std.testing.expect(!containsImage("normal text"));
}

test "stripAnsi basic" {
    const allocator = std.testing.allocator;
    const result = try stripAnsi(allocator, "\x1b[31mRed\x1b[0m");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Red", result);
}
