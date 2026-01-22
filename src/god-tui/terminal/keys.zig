// Key Parsing and Matching
// Reference: issues/god-tui/06-input-handling.md

const std = @import("std");

// Key identifiers for matching
pub const KeyId = enum {
    // Letters (ctrl+letter produces \x01-\x1a)
    a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z,

    // Numbers
    @"0", @"1", @"2", @"3", @"4", @"5", @"6", @"7", @"8", @"9",

    // Special keys
    escape,
    enter,
    tab,
    backspace,
    delete,
    space,

    // Arrow keys
    up,
    down,
    left,
    right,

    // Navigation
    home,
    end,
    page_up,
    page_down,
    insert,

    // Function keys
    f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12,

    // Unknown
    unknown,
};

// Modifier flags
pub const Modifiers = packed struct {
    shift: bool = false,
    alt: bool = false,
    ctrl: bool = false,
    super: bool = false,
};

// Parsed key event
pub const KeyEvent = struct {
    key: KeyId,
    modifiers: Modifiers,
    is_release: bool = false,
    is_repeat: bool = false,
    raw: []const u8,
};

// Kitty modifier bitmask (1-indexed in protocol)
// 1=shift, 2=alt, 4=ctrl, 8=super
fn parseKittyModifiers(mod_byte: u8) Modifiers {
    const mod = if (mod_byte > 0) mod_byte - 1 else 0; // Convert from 1-indexed
    return .{
        .shift = (mod & 1) != 0,
        .alt = (mod & 2) != 0,
        .ctrl = (mod & 4) != 0,
        .super = (mod & 8) != 0,
    };
}

// Parse Kitty CSI-u format: ESC [ codepoint ; modifiers [: eventType ] u
pub fn parseKittySequence(data: []const u8) ?KeyEvent {
    if (data.len < 4) return null;
    if (!std.mem.startsWith(u8, data, "\x1b[")) return null;
    if (data[data.len - 1] != 'u') return null;

    const inner = data[2 .. data.len - 1];

    // Find semicolon separating codepoint from modifiers
    const semi_pos = std.mem.indexOf(u8, inner, ";") orelse return null;

    const codepoint = std.fmt.parseInt(u21, inner[0..semi_pos], 10) catch return null;

    // Parse modifiers and optional event type
    const mod_part = inner[semi_pos + 1 ..];
    var modifier_val: u8 = 1;
    var event_type: u8 = 1; // 1=press, 2=repeat, 3=release

    if (std.mem.indexOf(u8, mod_part, ":")) |colon_pos| {
        modifier_val = std.fmt.parseInt(u8, mod_part[0..colon_pos], 10) catch 1;
        event_type = std.fmt.parseInt(u8, mod_part[colon_pos + 1 ..], 10) catch 1;
    } else {
        modifier_val = std.fmt.parseInt(u8, mod_part, 10) catch 1;
    }

    const key = codepointToKeyId(codepoint);
    const modifiers = parseKittyModifiers(modifier_val);

    return .{
        .key = key,
        .modifiers = modifiers,
        .is_release = event_type == 3,
        .is_repeat = event_type == 2,
        .raw = data,
    };
}

fn codepointToKeyId(cp: u21) KeyId {
    return switch (cp) {
        'a'...'z' => @enumFromInt(@as(u8, @intCast(cp - 'a'))),
        'A'...'Z' => @enumFromInt(@as(u8, @intCast(cp - 'A'))),
        '0'...'9' => @enumFromInt(@as(u8, @intCast(cp - '0' + 26))),
        27 => .escape,
        13 => .enter,
        9 => .tab,
        127 => .backspace,
        32 => .space,
        else => .unknown,
    };
}

// Check if data represents a key release (Kitty protocol)
pub fn isKeyRelease(data: []const u8) bool {
    // Don't treat paste content as release
    if (std.mem.indexOf(u8, data, "\x1b[200~") != null) return false;

    // Check for release event marker :3 before final byte
    const release_patterns = [_][]const u8{ ":3u", ":3~", ":3A", ":3B", ":3C", ":3D", ":3H", ":3F" };
    for (release_patterns) |pattern| {
        if (std.mem.indexOf(u8, data, pattern) != null) return true;
    }
    return false;
}

// Check if data represents a key repeat
pub fn isKeyRepeat(data: []const u8) bool {
    if (std.mem.indexOf(u8, data, "\x1b[200~") != null) return false;

    const repeat_patterns = [_][]const u8{ ":2u", ":2~", ":2A", ":2B", ":2C", ":2D", ":2H", ":2F" };
    for (repeat_patterns) |pattern| {
        if (std.mem.indexOf(u8, data, pattern) != null) return true;
    }
    return false;
}

// Parse legacy key sequences
pub fn parseLegacyKey(data: []const u8) KeyEvent {
    // Control characters
    if (data.len == 1) {
        const c = data[0];
        if (c >= 1 and c <= 26) {
            // Ctrl+A through Ctrl+Z
            return .{
                .key = @enumFromInt(@as(u8, c - 1)),
                .modifiers = .{ .ctrl = true },
                .raw = data,
            };
        }
        if (c == 27) return .{ .key = .escape, .modifiers = .{}, .raw = data };
        if (c == 13) return .{ .key = .enter, .modifiers = .{}, .raw = data };
        if (c == 9) return .{ .key = .tab, .modifiers = .{}, .raw = data };
        if (c == 127) return .{ .key = .backspace, .modifiers = .{}, .raw = data };
        if (c == 32) return .{ .key = .space, .modifiers = .{}, .raw = data };
        if (c >= 'a' and c <= 'z') return .{ .key = @enumFromInt(@as(u8, c - 'a')), .modifiers = .{}, .raw = data };
        if (c >= 'A' and c <= 'Z') return .{ .key = @enumFromInt(@as(u8, c - 'A')), .modifiers = .{ .shift = true }, .raw = data };
        if (c >= '0' and c <= '9') return .{ .key = @enumFromInt(@as(u8, c - '0' + 26)), .modifiers = .{}, .raw = data };
    }

    // Arrow keys and other CSI sequences
    if (std.mem.startsWith(u8, data, "\x1b[") or std.mem.startsWith(u8, data, "\x1bO")) {
        const is_ss3 = data[1] == 'O';
        const seq = if (is_ss3) data[2..] else data[2..];

        // Simple arrow keys: ESC[A, ESC[B, etc. or ESCOA, ESCOB
        if (seq.len == 1) {
            const key: KeyId = switch (seq[0]) {
                'A' => .up,
                'B' => .down,
                'C' => .right,
                'D' => .left,
                'H' => .home,
                'F' => .end,
                'P' => .f1,
                'Q' => .f2,
                'R' => .f3,
                'S' => .f4,
                else => .unknown,
            };
            return .{ .key = key, .modifiers = .{}, .raw = data };
        }

        // Modified arrows: ESC[1;2A (shift+up), etc.
        if (seq.len >= 3 and seq[0] == '1' and seq[1] == ';') {
            const mod_char = seq[2];
            const final = seq[seq.len - 1];
            const mod_val = mod_char - '0';
            const modifiers = parseKittyModifiers(@intCast(mod_val));

            const key: KeyId = switch (final) {
                'A' => .up,
                'B' => .down,
                'C' => .right,
                'D' => .left,
                'H' => .home,
                'F' => .end,
                else => .unknown,
            };
            return .{ .key = key, .modifiers = modifiers, .raw = data };
        }

        // Function keys: ESC[15~ (F5), etc.
        if (seq[seq.len - 1] == '~') {
            const num_end = std.mem.indexOf(u8, seq, "~") orelse seq.len;
            const num_str = seq[0..num_end];
            const num = std.fmt.parseInt(u8, num_str, 10) catch 0;

            const key: KeyId = switch (num) {
                1, 7 => .home,
                2 => .insert,
                3 => .delete,
                4, 8 => .end,
                5 => .page_up,
                6 => .page_down,
                15 => .f5,
                17 => .f6,
                18 => .f7,
                19 => .f8,
                20 => .f9,
                21 => .f10,
                23 => .f11,
                24 => .f12,
                else => .unknown,
            };
            return .{ .key = key, .modifiers = .{}, .raw = data };
        }
    }

    // Alt+letter: ESC followed by letter
    if (data.len == 2 and data[0] == '\x1b') {
        const c = data[1];
        if (c >= 'a' and c <= 'z') {
            return .{
                .key = @enumFromInt(@as(u8, c - 'a')),
                .modifiers = .{ .alt = true },
                .raw = data,
            };
        }
    }

    return .{ .key = .unknown, .modifiers = .{}, .raw = data };
}

// Parse any key sequence (tries Kitty first, then legacy)
pub fn parseKey(data: []const u8) KeyEvent {
    if (parseKittySequence(data)) |event| return event;
    return parseLegacyKey(data);
}

// Match key against identifier (supports "ctrl+c", "shift+enter", etc.)
pub fn matchesKey(data: []const u8, key_str: []const u8) bool {
    const event = parseKey(data);

    // Parse the key string
    var parts = std.mem.splitSequence(u8, key_str, "+");
    var expected_mods = Modifiers{};
    var expected_key: ?KeyId = null;

    while (parts.next()) |part| {
        if (std.mem.eql(u8, part, "ctrl")) {
            expected_mods.ctrl = true;
        } else if (std.mem.eql(u8, part, "alt")) {
            expected_mods.alt = true;
        } else if (std.mem.eql(u8, part, "shift")) {
            expected_mods.shift = true;
        } else if (std.mem.eql(u8, part, "super")) {
            expected_mods.super = true;
        } else {
            expected_key = stringToKeyId(part);
        }
    }

    if (expected_key) |k| {
        return event.key == k and
            event.modifiers.ctrl == expected_mods.ctrl and
            event.modifiers.alt == expected_mods.alt and
            event.modifiers.shift == expected_mods.shift and
            event.modifiers.super == expected_mods.super;
    }
    return false;
}

fn stringToKeyId(s: []const u8) ?KeyId {
    if (s.len == 1) {
        const c = s[0];
        if (c >= 'a' and c <= 'z') return @enumFromInt(@as(u8, c - 'a'));
        if (c >= '0' and c <= '9') return @enumFromInt(@as(u8, c - '0' + 26));
    }

    const map = std.StaticStringMap(KeyId).initComptime(.{
        .{ "escape", .escape },
        .{ "esc", .escape },
        .{ "enter", .enter },
        .{ "return", .enter },
        .{ "tab", .tab },
        .{ "backspace", .backspace },
        .{ "delete", .delete },
        .{ "space", .space },
        .{ "up", .up },
        .{ "down", .down },
        .{ "left", .left },
        .{ "right", .right },
        .{ "home", .home },
        .{ "end", .end },
        .{ "pageup", .page_up },
        .{ "pagedown", .page_down },
        .{ "insert", .insert },
        .{ "f1", .f1 },
        .{ "f2", .f2 },
        .{ "f3", .f3 },
        .{ "f4", .f4 },
        .{ "f5", .f5 },
        .{ "f6", .f6 },
        .{ "f7", .f7 },
        .{ "f8", .f8 },
        .{ "f9", .f9 },
        .{ "f10", .f10 },
        .{ "f11", .f11 },
        .{ "f12", .f12 },
    });

    return map.get(s);
}

test "Ctrl+C matching" {
    const testing = std.testing;
    try testing.expect(matchesKey("\x03", "ctrl+c"));
    try testing.expect(!matchesKey("c", "ctrl+c"));
}

test "Kitty CSI-u parsing" {
    const testing = std.testing;

    const event = parseKittySequence("\x1b[97;5u");
    try testing.expect(event != null);
    try testing.expectEqual(KeyId.a, event.?.key);
    try testing.expect(event.?.modifiers.ctrl);
    try testing.expect(!event.?.modifiers.shift);
    try testing.expect(!event.?.is_release);
}

test "Legacy arrow keys" {
    const testing = std.testing;

    var event = parseLegacyKey("\x1b[A");
    try testing.expectEqual(KeyId.up, event.key);

    event = parseLegacyKey("\x1b[1;2A");
    try testing.expectEqual(KeyId.up, event.key);
    try testing.expect(event.modifiers.shift);
}

test "Key release detection" {
    const testing = std.testing;

    try testing.expect(isKeyRelease("\x1b[97;5:3u"));
    try testing.expect(!isKeyRelease("\x1b[97;5u"));
    try testing.expect(!isKeyRelease("\x1b[200~hello\x1b[201~"));
}
