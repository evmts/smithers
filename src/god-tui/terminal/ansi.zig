// ANSI Escape Sequences
// Reference: issues/god-tui/08-ansi-sequences.md

const std = @import("std");

pub const ESC = "\x1b";
pub const CSI = "\x1b[";
pub const OSC = "\x1b]";
pub const DCS = "\x1bP";
pub const APC = "\x1b_";
pub const ST = "\x1b\\";
pub const BEL = "\x07";

// Cursor marker for IME positioning (zero-width APC sequence)
pub const CURSOR_MARKER = "\x1b_pi:c\x07";

// Line reset: SGR reset + hyperlink reset
pub const LINE_RESET = "\x1b[0m\x1b]8;;\x07";

// Synchronized output (DEC 2026)
pub const SYNC_START = "\x1b[?2026h";
pub const SYNC_END = "\x1b[?2026l";

// Cursor visibility
pub const HIDE_CURSOR = "\x1b[?25l";
pub const SHOW_CURSOR = "\x1b[?25h";

// Clear operations
pub const CLEAR_LINE = "\x1b[2K";
pub const CLEAR_TO_EOL = "\x1b[K";
pub const CLEAR_FROM_CURSOR = "\x1b[J";
pub const CLEAR_SCREEN = "\x1b[2J";
pub const CLEAR_SCROLLBACK = "\x1b[3J";
pub const HOME = "\x1b[H";
pub const CLEAR_ALL = "\x1b[2J\x1b[3J\x1b[H";

// Bracketed paste
pub const BRACKETED_PASTE_ENABLE = "\x1b[?2004h";
pub const BRACKETED_PASTE_DISABLE = "\x1b[?2004l";
pub const PASTE_START = "\x1b[200~";
pub const PASTE_END = "\x1b[201~";

// Kitty keyboard protocol
pub const KITTY_QUERY = "\x1b[?u";
pub const KITTY_ENABLE_FLAGS_7 = "\x1b[>7u"; // disambiguate + report-events + alternate-keys
pub const KITTY_POP = "\x1b[<u";

// Cell size query
pub const CELL_SIZE_QUERY = "\x1b[16t";

// SGR reset
pub const RESET = "\x1b[0m";

// SGR attributes
pub const BOLD = "\x1b[1m";
pub const DIM = "\x1b[2m";
pub const ITALIC = "\x1b[3m";
pub const UNDERLINE = "\x1b[4m";
pub const BLINK = "\x1b[5m";
pub const INVERSE = "\x1b[7m";
pub const HIDDEN = "\x1b[8m";
pub const STRIKETHROUGH = "\x1b[9m";

// SGR attribute reset
pub const RESET_BOLD = "\x1b[22m";
pub const RESET_ITALIC = "\x1b[23m";
pub const RESET_UNDERLINE = "\x1b[24m";
pub const RESET_BLINK = "\x1b[25m";
pub const RESET_INVERSE = "\x1b[27m";
pub const RESET_HIDDEN = "\x1b[28m";
pub const RESET_STRIKETHROUGH = "\x1b[29m";

// Default colors
pub const FG_DEFAULT = "\x1b[39m";
pub const BG_DEFAULT = "\x1b[49m";

// Move cursor
pub fn cursorUp(writer: anytype, n: u16) !void {
    if (n == 0) return;
    try writer.print("\x1b[{d}A", .{n});
}

pub fn cursorDown(writer: anytype, n: u16) !void {
    if (n == 0) return;
    try writer.print("\x1b[{d}B", .{n});
}

pub fn cursorForward(writer: anytype, n: u16) !void {
    if (n == 0) return;
    try writer.print("\x1b[{d}C", .{n});
}

pub fn cursorBack(writer: anytype, n: u16) !void {
    if (n == 0) return;
    try writer.print("\x1b[{d}D", .{n});
}

pub fn cursorColumn(writer: anytype, col: u16) !void {
    try writer.print("\x1b[{d}G", .{col + 1}); // 1-indexed
}

pub fn cursorPosition(writer: anytype, row: u16, col: u16) !void {
    try writer.print("\x1b[{d};{d}H", .{ row + 1, col + 1 }); // 1-indexed
}

// Move by lines (negative = up, positive = down)
pub fn moveBy(writer: anytype, lines: i32) !void {
    if (lines < 0) {
        try cursorUp(writer, @intCast(-lines));
    } else if (lines > 0) {
        try cursorDown(writer, @intCast(lines));
    }
}

// Colors (256-color mode)
pub fn fg256(writer: anytype, color: u8) !void {
    try writer.print("\x1b[38;5;{d}m", .{color});
}

pub fn bg256(writer: anytype, color: u8) !void {
    try writer.print("\x1b[48;5;{d}m", .{color});
}

// True color (24-bit RGB)
pub fn fgRgb(writer: anytype, r: u8, g: u8, b: u8) !void {
    try writer.print("\x1b[38;2;{d};{d};{d}m", .{ r, g, b });
}

pub fn bgRgb(writer: anytype, r: u8, g: u8, b: u8) !void {
    try writer.print("\x1b[48;2;{d};{d};{d}m", .{ r, g, b });
}

// Standard colors (foreground)
pub const FG_BLACK = "\x1b[30m";
pub const FG_RED = "\x1b[31m";
pub const FG_GREEN = "\x1b[32m";
pub const FG_YELLOW = "\x1b[33m";
pub const FG_BLUE = "\x1b[34m";
pub const FG_MAGENTA = "\x1b[35m";
pub const FG_CYAN = "\x1b[36m";
pub const FG_WHITE = "\x1b[37m";

// Standard colors (background)
pub const BG_BLACK = "\x1b[40m";
pub const BG_RED = "\x1b[41m";
pub const BG_GREEN = "\x1b[42m";
pub const BG_YELLOW = "\x1b[43m";
pub const BG_BLUE = "\x1b[44m";
pub const BG_MAGENTA = "\x1b[45m";
pub const BG_CYAN = "\x1b[46m";
pub const BG_WHITE = "\x1b[47m";

// Bright colors (foreground)
pub const FG_BRIGHT_BLACK = "\x1b[90m";
pub const FG_BRIGHT_RED = "\x1b[91m";
pub const FG_BRIGHT_GREEN = "\x1b[92m";
pub const FG_BRIGHT_YELLOW = "\x1b[93m";
pub const FG_BRIGHT_BLUE = "\x1b[94m";
pub const FG_BRIGHT_MAGENTA = "\x1b[95m";
pub const FG_BRIGHT_CYAN = "\x1b[96m";
pub const FG_BRIGHT_WHITE = "\x1b[97m";

// OSC 0: Set window title
pub fn setTitle(writer: anytype, title: []const u8) !void {
    try writer.print("\x1b]0;{s}\x07", .{title});
}

// OSC 8: Hyperlink
pub fn hyperlinkStart(writer: anytype, url: []const u8) !void {
    try writer.print("\x1b]8;;{s}\x07", .{url});
}

pub const HYPERLINK_END = "\x1b]8;;\x07";

// Check if line contains image protocols (skip LINE_RESET for these)
pub fn containsImage(line: []const u8) bool {
    // Kitty graphics: ESC_G
    if (std.mem.indexOf(u8, line, "\x1b_G") != null) return true;
    // iTerm2 inline images
    if (std.mem.indexOf(u8, line, "\x1b]1337;File=") != null) return true;
    return false;
}

// Check sequence completeness for parsing
pub const SequenceStatus = enum {
    complete,
    incomplete,
    not_escape,
};

pub fn isCompleteSequence(data: []const u8) SequenceStatus {
    if (data.len == 0) return .not_escape;
    if (data[0] != '\x1b') return .not_escape;
    if (data.len == 1) return .incomplete;

    const after = data[1];

    // CSI: ESC [
    if (after == '[') {
        if (data.len < 3) return .incomplete;
        // Check for final byte (0x40-0x7E)
        const last = data[data.len - 1];
        return if (last >= 0x40 and last <= 0x7e) .complete else .incomplete;
    }

    // OSC: ESC ]
    if (after == ']') {
        if (std.mem.endsWith(u8, data, "\x07")) return .complete;
        if (std.mem.endsWith(u8, data, "\x1b\\")) return .complete;
        return .incomplete;
    }

    // APC: ESC _
    if (after == '_') {
        if (std.mem.endsWith(u8, data, "\x07")) return .complete;
        if (std.mem.endsWith(u8, data, "\x1b\\")) return .complete;
        return .incomplete;
    }

    // DCS: ESC P
    if (after == 'P') {
        if (std.mem.endsWith(u8, data, "\x1b\\")) return .complete;
        return .incomplete;
    }

    // SS3: ESC O (single char follows)
    if (after == 'O') {
        return if (data.len >= 3) .complete else .incomplete;
    }

    // Meta: ESC + char
    return if (data.len >= 2) .complete else .incomplete;
}

test "ANSI sequence completeness" {
    const testing = std.testing;

    try testing.expectEqual(SequenceStatus.complete, isCompleteSequence("\x1b[A"));
    try testing.expectEqual(SequenceStatus.incomplete, isCompleteSequence("\x1b["));
    try testing.expectEqual(SequenceStatus.complete, isCompleteSequence("\x1b[1;5A"));
    try testing.expectEqual(SequenceStatus.not_escape, isCompleteSequence("hello"));
    try testing.expectEqual(SequenceStatus.incomplete, isCompleteSequence("\x1b"));
}

test "containsImage" {
    const testing = std.testing;

    try testing.expect(containsImage("\x1b_Ga=T,f=100;base64\x1b\\"));
    try testing.expect(containsImage("\x1b]1337;File=inline=1:base64\x07"));
    try testing.expect(!containsImage("Hello world"));
    try testing.expect(!containsImage("\x1b[31mRed\x1b[0m"));
}
