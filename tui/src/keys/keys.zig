// Key Matching Utilities
// Supplements vaxis key parsing with higher-level matching helpers
// Port from: src/god-tui/terminal/keys.zig

const std = @import("std");

/// Key identifiers for typed key matching
pub const KeyId = enum(u8) {
    // Letters (a-z map to 0-25)
    a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z,

    // Numbers (0-9 map to 26-35)
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

    /// Convert from codepoint
    pub fn fromCodepoint(cp: u21) KeyId {
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

    /// Convert from string name
    pub fn fromString(s: []const u8) ?KeyId {
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
};

/// Modifier flags (matches Kitty protocol bitmask)
pub const Modifiers = packed struct {
    shift: bool = false,
    alt: bool = false,
    ctrl: bool = false,
    super: bool = false,

    pub const none = Modifiers{};

    /// Parse from Kitty modifier byte (1-indexed in protocol)
    pub fn fromKitty(mod_byte: u8) Modifiers {
        const mod = if (mod_byte > 0) mod_byte - 1 else 0;
        return .{
            .shift = (mod & 1) != 0,
            .alt = (mod & 2) != 0,
            .ctrl = (mod & 4) != 0,
            .super = (mod & 8) != 0,
        };
    }

    pub fn eql(self: Modifiers, other: Modifiers) bool {
        return self.shift == other.shift and
            self.alt == other.alt and
            self.ctrl == other.ctrl and
            self.super == other.super;
    }
};

/// Key event with optional text for printable characters
pub const Key = struct {
    code: KeyId,
    modifiers: Modifiers,
    text: ?[]const u8 = null,

    /// Check if key matches expected key and modifiers
    pub fn matches(self: Key, expected_key: KeyId, expected_mods: Modifiers) bool {
        return self.code == expected_key and self.modifiers.eql(expected_mods);
    }

    /// Check if key matches a key string like "ctrl+c", "shift+enter"
    pub fn matchesString(self: Key, key_str: []const u8) bool {
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
                expected_key = KeyId.fromString(part);
            }
        }

        if (expected_key) |k| {
            return self.matches(k, expected_mods);
        }
        return false;
    }

    /// Is Ctrl+C (common interrupt)
    pub fn isInterrupt(self: Key) bool {
        return self.matches(.c, .{ .ctrl = true });
    }

    /// Is Escape
    pub fn isEscape(self: Key) bool {
        return self.code == .escape and self.modifiers.eql(Modifiers.none);
    }

    /// Is Enter/Return
    pub fn isEnter(self: Key) bool {
        return self.code == .enter and self.modifiers.eql(Modifiers.none);
    }

    /// Is a navigation key (arrows, home, end, page up/down)
    pub fn isNavigation(self: Key) bool {
        return switch (self.code) {
            .up, .down, .left, .right, .home, .end, .page_up, .page_down => true,
            else => false,
        };
    }

    /// Is a function key (F1-F12)
    pub fn isFunctionKey(self: Key) bool {
        return switch (self.code) {
            .f1, .f2, .f3, .f4, .f5, .f6, .f7, .f8, .f9, .f10, .f11, .f12 => true,
            else => false,
        };
    }

    /// Is a printable character
    pub fn isPrintable(self: Key) bool {
        return self.text != null and self.text.?.len > 0;
    }
};

/// Parse Kitty CSI-u format: ESC [ codepoint ; modifiers [: eventType ] u
pub fn parseKittySequence(data: []const u8) ?Key {
    if (data.len < 4) return null;
    if (!std.mem.startsWith(u8, data, "\x1b[")) return null;
    if (data[data.len - 1] != 'u') return null;

    const inner = data[2 .. data.len - 1];
    const semi_pos = std.mem.indexOf(u8, inner, ";") orelse return null;

    const codepoint = std.fmt.parseInt(u21, inner[0..semi_pos], 10) catch return null;

    const mod_part = inner[semi_pos + 1 ..];
    var modifier_val: u8 = 1;

    if (std.mem.indexOf(u8, mod_part, ":")) |colon_pos| {
        modifier_val = std.fmt.parseInt(u8, mod_part[0..colon_pos], 10) catch 1;
    } else {
        modifier_val = std.fmt.parseInt(u8, mod_part, 10) catch 1;
    }

    return .{
        .code = KeyId.fromCodepoint(codepoint),
        .modifiers = Modifiers.fromKitty(modifier_val),
    };
}

/// Check if data represents a key release (Kitty protocol :3 marker)
pub fn isKeyRelease(data: []const u8) bool {
    if (std.mem.indexOf(u8, data, "\x1b[200~") != null) return false;

    const release_patterns = [_][]const u8{ ":3u", ":3~", ":3A", ":3B", ":3C", ":3D", ":3H", ":3F" };
    for (release_patterns) |pattern| {
        if (std.mem.indexOf(u8, data, pattern) != null) return true;
    }
    return false;
}

/// Check if data represents a key repeat (Kitty protocol :2 marker)
pub fn isKeyRepeat(data: []const u8) bool {
    if (std.mem.indexOf(u8, data, "\x1b[200~") != null) return false;

    const repeat_patterns = [_][]const u8{ ":2u", ":2~", ":2A", ":2B", ":2C", ":2D", ":2H", ":2F" };
    for (repeat_patterns) |pattern| {
        if (std.mem.indexOf(u8, data, pattern) != null) return true;
    }
    return false;
}

/// Parse legacy key from raw bytes (Ctrl+letter, single chars, etc.)
pub fn parseLegacyKey(data: []const u8) Key {
    if (data.len == 1) {
        const c = data[0];
        // Special keys
        if (c == 27) return .{ .code = .escape, .modifiers = .{} };
        if (c == 13) return .{ .code = .enter, .modifiers = .{} };
        if (c == 9) return .{ .code = .tab, .modifiers = .{} };
        if (c == 127) return .{ .code = .backspace, .modifiers = .{} };
        if (c == 32) return .{ .code = .space, .modifiers = .{} };
        // Ctrl+A through Ctrl+Z
        if (c >= 1 and c <= 26) {
            return .{
                .code = @enumFromInt(@as(u8, c - 1)),
                .modifiers = .{ .ctrl = true },
            };
        }
        // Lowercase letters
        if (c >= 'a' and c <= 'z') {
            return .{ .code = @enumFromInt(@as(u8, c - 'a')), .modifiers = .{}, .text = data };
        }
        // Uppercase letters (shift)
        if (c >= 'A' and c <= 'Z') {
            return .{ .code = @enumFromInt(@as(u8, c - 'A')), .modifiers = .{ .shift = true }, .text = data };
        }
        // Digits
        if (c >= '0' and c <= '9') {
            return .{ .code = @enumFromInt(@as(u8, c - '0' + 26)), .modifiers = .{}, .text = data };
        }
    }

    // Alt+letter: ESC followed by letter
    if (data.len == 2 and data[0] == '\x1b') {
        const c = data[1];
        if (c >= 'a' and c <= 'z') {
            return .{
                .code = @enumFromInt(@as(u8, c - 'a')),
                .modifiers = .{ .alt = true },
            };
        }
    }

    return .{ .code = .unknown, .modifiers = .{} };
}

/// Parse any key sequence (tries Kitty first, then legacy)
pub fn parseKey(data: []const u8) Key {
    if (parseKittySequence(data)) |key| return key;
    return parseLegacyKey(data);
}

// ============================================================================
// Tests
// ============================================================================

test "Ctrl+C detection" {
    const key = parseLegacyKey("\x03");
    try std.testing.expect(key.isInterrupt());
    try std.testing.expect(key.matchesString("ctrl+c"));
    try std.testing.expect(!key.matchesString("c"));
}

test "Ctrl+D detection" {
    const key = parseLegacyKey("\x04");
    try std.testing.expect(key.matches(.d, .{ .ctrl = true }));
    try std.testing.expect(key.matchesString("ctrl+d"));
}

test "Escape key detection" {
    const key = parseLegacyKey("\x1b");
    try std.testing.expect(key.isEscape());
    try std.testing.expect(key.matchesString("escape"));
    try std.testing.expect(key.matchesString("esc"));
}

test "Enter key detection" {
    const key = parseLegacyKey("\r");
    try std.testing.expect(key.isEnter());
    try std.testing.expect(key.matchesString("enter"));
    try std.testing.expect(key.matchesString("return"));
}

test "Alt+letter detection" {
    const key = parseLegacyKey("\x1bx");
    try std.testing.expect(key.matches(.x, .{ .alt = true }));
    try std.testing.expect(key.matchesString("alt+x"));
}

test "Shift+letter detection" {
    const key = parseLegacyKey("A");
    try std.testing.expect(key.matches(.a, .{ .shift = true }));
    try std.testing.expect(key.matchesString("shift+a"));
}

test "Kitty CSI-u parsing" {
    const key = parseKittySequence("\x1b[97;5u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.ctrl);
    try std.testing.expect(!key.?.modifiers.shift);
}

test "Kitty CSI-u with shift" {
    const key = parseKittySequence("\x1b[65;2u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.shift);
    try std.testing.expect(!key.?.modifiers.ctrl);
}

test "Kitty CSI-u with event type" {
    const key = parseKittySequence("\x1b[97;5:1u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.ctrl);
}

test "Key release detection" {
    try std.testing.expect(isKeyRelease("\x1b[97;5:3u"));
    try std.testing.expect(!isKeyRelease("\x1b[97;5u"));
    try std.testing.expect(!isKeyRelease("\x1b[200~hello\x1b[201~")); // Paste, not release
}

test "Key repeat detection" {
    try std.testing.expect(isKeyRepeat("\x1b[97;5:2u"));
    try std.testing.expect(!isKeyRepeat("\x1b[97;5u"));
}

test "Navigation key detection" {
    const up_key = Key{ .code = .up, .modifiers = .{} };
    try std.testing.expect(up_key.isNavigation());

    const a_key = Key{ .code = .a, .modifiers = .{} };
    try std.testing.expect(!a_key.isNavigation());
}

test "Function key detection" {
    const f1_key = Key{ .code = .f1, .modifiers = .{} };
    try std.testing.expect(f1_key.isFunctionKey());

    const enter_key = Key{ .code = .enter, .modifiers = .{} };
    try std.testing.expect(!enter_key.isFunctionKey());
}

test "Modifier equality" {
    const mods1 = Modifiers{ .ctrl = true };
    const mods2 = Modifiers{ .ctrl = true };
    const mods3 = Modifiers{ .alt = true };

    try std.testing.expect(mods1.eql(mods2));
    try std.testing.expect(!mods1.eql(mods3));
}

test "KeyId fromString" {
    try std.testing.expectEqual(KeyId.a, KeyId.fromString("a").?);
    try std.testing.expectEqual(KeyId.escape, KeyId.fromString("escape").?);
    try std.testing.expectEqual(KeyId.escape, KeyId.fromString("esc").?);
    try std.testing.expectEqual(KeyId.enter, KeyId.fromString("enter").?);
    try std.testing.expectEqual(KeyId.enter, KeyId.fromString("return").?);
    try std.testing.expectEqual(KeyId.f1, KeyId.fromString("f1").?);
}

test "Complex modifier string matching" {
    const key = Key{ .code = .a, .modifiers = .{ .ctrl = true, .shift = true } };
    try std.testing.expect(key.matchesString("ctrl+shift+a"));
    try std.testing.expect(key.matchesString("shift+ctrl+a"));
    try std.testing.expect(!key.matchesString("ctrl+a"));
    try std.testing.expect(!key.matchesString("shift+a"));
}

test "Printable character detection" {
    const printable = Key{ .code = .a, .modifiers = .{}, .text = "a" };
    try std.testing.expect(printable.isPrintable());

    const non_printable = Key{ .code = .escape, .modifiers = .{} };
    try std.testing.expect(!non_printable.isPrintable());
}
