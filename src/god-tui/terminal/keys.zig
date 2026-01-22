// Key parsing per God-TUI spec §6
const std = @import("std");
const ansi = @import("ansi.zig");

// Modifier flags (Kitty protocol: 1-indexed bitmask)
pub const Modifier = packed struct {
    shift: bool = false,
    alt: bool = false,
    ctrl: bool = false,
    super: bool = false,

    pub fn fromKitty(mods: u8) Modifier {
        // Kitty uses 1-indexed: actual_mods = reported - 1
        const m = if (mods > 0) mods - 1 else 0;
        return .{
            .shift = (m & 1) != 0,
            .alt = (m & 2) != 0,
            .ctrl = (m & 4) != 0,
            .super = (m & 8) != 0,
        };
    }

    pub fn toU8(self: Modifier) u8 {
        var result: u8 = 0;
        if (self.shift) result |= 1;
        if (self.alt) result |= 2;
        if (self.ctrl) result |= 4;
        if (self.super) result |= 8;
        return result;
    }

    pub fn none() Modifier {
        return .{};
    }

    pub fn eql(self: Modifier, other: Modifier) bool {
        return self.shift == other.shift and
            self.alt == other.alt and
            self.ctrl == other.ctrl and
            self.super == other.super;
    }
};

pub const EventType = enum {
    press,
    repeat,
    release,
};

pub const SpecialKey = enum {
    none,
    up,
    down,
    left,
    right,
    home,
    end,
    page_up,
    page_down,
    insert,
    delete,
    backspace,
    tab,
    enter,
    escape,
    f1,
    f2,
    f3,
    f4,
    f5,
    f6,
    f7,
    f8,
    f9,
    f10,
    f11,
    f12,
};

pub const Key = struct {
    codepoint: u21 = 0, // Unicode codepoint for printable keys
    special: SpecialKey = .none,
    modifiers: Modifier = .{},
    event_type: EventType = .press,

    pub fn char(c: u8) Key {
        return .{ .codepoint = c };
    }

    pub fn special_key(s: SpecialKey) Key {
        return .{ .special = s };
    }

    pub fn withMod(self: Key, m: Modifier) Key {
        var result = self;
        result.modifiers = m;
        return result;
    }

    pub fn eql(self: Key, other: Key) bool {
        return self.codepoint == other.codepoint and
            self.special == other.special and
            self.modifiers.eql(other.modifiers);
    }
};

// Parse Kitty CSI-u format: ESC [ codepoint ; modifiers u
// Or with event type: ESC [ codepoint ; modifiers : eventType u
fn parseKittySequence(data: []const u8) ?Key {
    // Must start with CSI and end with 'u'
    if (data.len < 4) return null;
    if (!std.mem.startsWith(u8, data, "\x1b[")) return null;
    if (data[data.len - 1] != 'u') return null;

    const inner = data[2 .. data.len - 1];

    // Parse codepoint;modifiers[:eventType]
    var codepoint: u21 = 0;
    var modifiers: u8 = 1;
    var event_type: EventType = .press;

    // Find semicolon separator
    if (std.mem.indexOf(u8, inner, ";")) |semi_pos| {
        codepoint = std.fmt.parseInt(u21, inner[0..semi_pos], 10) catch return null;

        const after_semi = inner[semi_pos + 1 ..];
        // Check for event type separator
        if (std.mem.indexOf(u8, after_semi, ":")) |colon_pos| {
            modifiers = std.fmt.parseInt(u8, after_semi[0..colon_pos], 10) catch 1;
            const event_str = after_semi[colon_pos + 1 ..];
            event_type = switch (std.fmt.parseInt(u8, event_str, 10) catch 1) {
                2 => .repeat,
                3 => .release,
                else => .press,
            };
        } else {
            modifiers = std.fmt.parseInt(u8, after_semi, 10) catch 1;
        }
    } else {
        codepoint = std.fmt.parseInt(u21, inner, 10) catch return null;
    }

    return .{
        .codepoint = codepoint,
        .modifiers = Modifier.fromKitty(modifiers),
        .event_type = event_type,
    };
}

// Parse legacy CSI sequences (arrows, function keys, etc)
fn parseLegacyCsi(data: []const u8) ?Key {
    if (data.len < 3) return null;
    if (!std.mem.startsWith(u8, data, "\x1b[")) return null;

    const inner = data[2..];

    // Arrow keys: ESC [ A/B/C/D
    if (inner.len == 1) {
        return switch (inner[0]) {
            'A' => Key.special_key(.up),
            'B' => Key.special_key(.down),
            'C' => Key.special_key(.right),
            'D' => Key.special_key(.left),
            'H' => Key.special_key(.home),
            'F' => Key.special_key(.end),
            else => null,
        };
    }

    // Modified arrows: ESC [ 1 ; mod A/B/C/D
    if (inner.len >= 3 and inner[0] == '1' and inner[1] == ';') {
        const mod = std.fmt.parseInt(u8, inner[2 .. inner.len - 1], 10) catch 1;
        const key_char = inner[inner.len - 1];
        const base = switch (key_char) {
            'A' => Key.special_key(.up),
            'B' => Key.special_key(.down),
            'C' => Key.special_key(.right),
            'D' => Key.special_key(.left),
            'H' => Key.special_key(.home),
            'F' => Key.special_key(.end),
            else => return null,
        };
        return base.withMod(Modifier.fromKitty(mod));
    }

    // Function keys: ESC [ N ~
    if (inner[inner.len - 1] == '~') {
        const num_str = inner[0 .. inner.len - 1];
        // Check for modifier
        if (std.mem.indexOf(u8, num_str, ";")) |semi_pos| {
            const key_num = std.fmt.parseInt(u8, num_str[0..semi_pos], 10) catch return null;
            const mod = std.fmt.parseInt(u8, num_str[semi_pos + 1 ..], 10) catch 1;
            const base = fkeyFromNum(key_num) orelse return null;
            return base.withMod(Modifier.fromKitty(mod));
        }
        const key_num = std.fmt.parseInt(u8, num_str, 10) catch return null;
        return fkeyFromNum(key_num);
    }

    return null;
}

fn fkeyFromNum(n: u8) ?Key {
    return switch (n) {
        2 => Key.special_key(.insert),
        3 => Key.special_key(.delete),
        5 => Key.special_key(.page_up),
        6 => Key.special_key(.page_down),
        15 => Key.special_key(.f5),
        17 => Key.special_key(.f6),
        18 => Key.special_key(.f7),
        19 => Key.special_key(.f8),
        20 => Key.special_key(.f9),
        21 => Key.special_key(.f10),
        23 => Key.special_key(.f11),
        24 => Key.special_key(.f12),
        else => null,
    };
}

// Parse SS3 sequences (F1-F4)
fn parseSs3(data: []const u8) ?Key {
    if (data.len != 3) return null;
    if (!std.mem.startsWith(u8, data, "\x1bO")) return null;

    return switch (data[2]) {
        'P' => Key.special_key(.f1),
        'Q' => Key.special_key(.f2),
        'R' => Key.special_key(.f3),
        'S' => Key.special_key(.f4),
        'A' => Key.special_key(.up),
        'B' => Key.special_key(.down),
        'C' => Key.special_key(.right),
        'D' => Key.special_key(.left),
        'H' => Key.special_key(.home),
        'F' => Key.special_key(.end),
        else => null,
    };
}

// Parse control characters (Ctrl+A-Z)
fn parseControlChar(data: []const u8) ?Key {
    if (data.len != 1) return null;
    const c = data[0];

    // Ctrl+A-Z: 0x01-0x1A
    if (c >= 0x01 and c <= 0x1A) {
        return Key.char('a' + c - 1).withMod(.{ .ctrl = true });
    }

    // Special control chars
    return switch (c) {
        0x00 => Key.char('@').withMod(.{ .ctrl = true }), // Ctrl+@
        0x1B => Key.special_key(.escape),
        0x1C => Key.char('\\').withMod(.{ .ctrl = true }),
        0x1D => Key.char(']').withMod(.{ .ctrl = true }),
        0x1E => Key.char('^').withMod(.{ .ctrl = true }),
        0x1F => Key.char('_').withMod(.{ .ctrl = true }),
        0x7F => Key.special_key(.backspace),
        '\t' => Key.special_key(.tab),
        '\r', '\n' => Key.special_key(.enter),
        else => null,
    };
}

// Main key parsing entry point
pub fn parseKey(data: []const u8) ?Key {
    if (data.len == 0) return null;

    // Try Kitty CSI-u format first
    if (parseKittySequence(data)) |k| return k;

    // Try legacy CSI sequences
    if (parseLegacyCsi(data)) |k| return k;

    // Try SS3 sequences
    if (parseSs3(data)) |k| return k;

    // Try control characters
    if (parseControlChar(data)) |k| return k;

    // Single printable ASCII
    if (data.len == 1 and data[0] >= 0x20 and data[0] <= 0x7E) {
        return Key.char(data[0]);
    }

    // Alt+char: ESC followed by printable
    if (data.len == 2 and data[0] == '\x1b' and data[1] >= 0x20 and data[1] <= 0x7E) {
        return Key.char(data[1]).withMod(.{ .alt = true });
    }

    return null;
}

// Check if data represents a key release (Kitty protocol)
pub fn isKeyRelease(data: []const u8) bool {
    // Don't treat paste content as release
    if (std.mem.indexOf(u8, data, ansi.PASTE_START) != null) return false;

    // Check for :3 before terminal char
    const release_patterns = [_][]const u8{ ":3u", ":3~", ":3A", ":3B", ":3C", ":3D", ":3H", ":3F" };
    for (release_patterns) |pattern| {
        if (std.mem.indexOf(u8, data, pattern) != null) return true;
    }
    return false;
}

// Check if data represents a key repeat (Kitty protocol)
pub fn isKeyRepeat(data: []const u8) bool {
    if (std.mem.indexOf(u8, data, ansi.PASTE_START) != null) return false;

    const repeat_patterns = [_][]const u8{ ":2u", ":2~", ":2A", ":2B", ":2C", ":2D", ":2H", ":2F" };
    for (repeat_patterns) |pattern| {
        if (std.mem.indexOf(u8, data, pattern) != null) return true;
    }
    return false;
}

// Match key against key ID string (e.g., "ctrl+c", "alt+left", "f5")
pub fn matchesKey(data: []const u8, key_id: []const u8) bool {
    const parsed = parseKey(data) orelse return false;
    const expected = parseKeyId(key_id) orelse return false;
    return parsed.eql(expected);
}

// Parse key ID string into Key
pub fn parseKeyId(id: []const u8) ?Key {
    var mods = Modifier{};
    var remaining = id;

    // Parse modifiers
    while (true) {
        if (std.mem.startsWith(u8, remaining, "ctrl+")) {
            mods.ctrl = true;
            remaining = remaining[5..];
        } else if (std.mem.startsWith(u8, remaining, "alt+")) {
            mods.alt = true;
            remaining = remaining[4..];
        } else if (std.mem.startsWith(u8, remaining, "shift+")) {
            mods.shift = true;
            remaining = remaining[6..];
        } else if (std.mem.startsWith(u8, remaining, "super+")) {
            mods.super = true;
            remaining = remaining[6..];
        } else break;
    }

    // Parse key name
    const key = if (std.mem.eql(u8, remaining, "up")) Key.special_key(.up) else if (std.mem.eql(u8, remaining, "down")) Key.special_key(.down) else if (std.mem.eql(u8, remaining, "left")) Key.special_key(.left) else if (std.mem.eql(u8, remaining, "right")) Key.special_key(.right) else if (std.mem.eql(u8, remaining, "home")) Key.special_key(.home) else if (std.mem.eql(u8, remaining, "end")) Key.special_key(.end) else if (std.mem.eql(u8, remaining, "pageup")) Key.special_key(.page_up) else if (std.mem.eql(u8, remaining, "pagedown")) Key.special_key(.page_down) else if (std.mem.eql(u8, remaining, "insert")) Key.special_key(.insert) else if (std.mem.eql(u8, remaining, "delete")) Key.special_key(.delete) else if (std.mem.eql(u8, remaining, "backspace")) Key.special_key(.backspace) else if (std.mem.eql(u8, remaining, "tab")) Key.special_key(.tab) else if (std.mem.eql(u8, remaining, "enter")) Key.special_key(.enter) else if (std.mem.eql(u8, remaining, "escape") or std.mem.eql(u8, remaining, "esc")) Key.special_key(.escape) else if (std.mem.eql(u8, remaining, "f1")) Key.special_key(.f1) else if (std.mem.eql(u8, remaining, "f2")) Key.special_key(.f2) else if (std.mem.eql(u8, remaining, "f3")) Key.special_key(.f3) else if (std.mem.eql(u8, remaining, "f4")) Key.special_key(.f4) else if (std.mem.eql(u8, remaining, "f5")) Key.special_key(.f5) else if (std.mem.eql(u8, remaining, "f6")) Key.special_key(.f6) else if (std.mem.eql(u8, remaining, "f7")) Key.special_key(.f7) else if (std.mem.eql(u8, remaining, "f8")) Key.special_key(.f8) else if (std.mem.eql(u8, remaining, "f9")) Key.special_key(.f9) else if (std.mem.eql(u8, remaining, "f10")) Key.special_key(.f10) else if (std.mem.eql(u8, remaining, "f11")) Key.special_key(.f11) else if (std.mem.eql(u8, remaining, "f12")) Key.special_key(.f12) else if (remaining.len == 1) Key.char(remaining[0]) else return null;

    return key.withMod(mods);
}

// === Tests ===

test "parseKey arrow up" {
    const k = parseKey("\x1b[A").?;
    try std.testing.expectEqual(SpecialKey.up, k.special);
}

test "parseKey arrow with shift" {
    const k = parseKey("\x1b[1;2A").?;
    try std.testing.expectEqual(SpecialKey.up, k.special);
    try std.testing.expect(k.modifiers.shift);
}

test "parseKey Ctrl+C" {
    const k = parseKey("\x03").?;
    try std.testing.expectEqual(@as(u21, 'c'), k.codepoint);
    try std.testing.expect(k.modifiers.ctrl);
}

test "parseKey F5" {
    const k = parseKey("\x1b[15~").?;
    try std.testing.expectEqual(SpecialKey.f5, k.special);
}

test "parseKey Kitty CSI-u" {
    const k = parseKey("\x1b[97;5u").?;
    try std.testing.expectEqual(@as(u21, 97), k.codepoint); // 'a'
    try std.testing.expect(k.modifiers.ctrl);
}

test "parseKey Kitty with event type" {
    const k = parseKey("\x1b[97;1:3u").?;
    try std.testing.expectEqual(EventType.release, k.event_type);
}

test "isKeyRelease" {
    try std.testing.expect(isKeyRelease("\x1b[97;1:3u"));
    try std.testing.expect(!isKeyRelease("\x1b[97;1u"));
    try std.testing.expect(!isKeyRelease("\x1b[200~text\x1b[97;1:3u"));
}

test "matchesKey ctrl+c" {
    try std.testing.expect(matchesKey("\x03", "ctrl+c"));
    try std.testing.expect(!matchesKey("\x03", "ctrl+d"));
}

test "matchesKey alt+left" {
    try std.testing.expect(matchesKey("\x1b\x1b[D", "alt+left") == false); // This specific encoding not supported
    // Alt+char
    try std.testing.expect(matchesKey("\x1ba", "alt+a"));
}

test "parseKeyId" {
    const k = parseKeyId("ctrl+shift+a").?;
    try std.testing.expectEqual(@as(u21, 'a'), k.codepoint);
    try std.testing.expect(k.modifiers.ctrl);
    try std.testing.expect(k.modifiers.shift);
}
