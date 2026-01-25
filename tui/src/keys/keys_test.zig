const std = @import("std");
const keys = @import("keys.zig");

const Key = keys.Key;
const KeyId = keys.KeyId;
const Modifiers = keys.Modifiers;
const parseLegacyKey = keys.parseLegacyKey;
const parseKittySequence = keys.parseKittySequence;
const isKeyRelease = keys.isKeyRelease;
const isKeyRepeat = keys.isKeyRepeat;

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
