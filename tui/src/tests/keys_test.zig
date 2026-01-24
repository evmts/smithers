const std = @import("std");
const keys = @import("../keys/keys.zig");

const KeyId = keys.KeyId;
const Modifiers = keys.Modifiers;
const Key = keys.Key;

// ============================================================================
// KeyId.fromCodepoint tests
// ============================================================================

test "KeyId.fromCodepoint - lowercase letters a-z" {
    try std.testing.expectEqual(KeyId.a, KeyId.fromCodepoint('a'));
    try std.testing.expectEqual(KeyId.m, KeyId.fromCodepoint('m'));
    try std.testing.expectEqual(KeyId.z, KeyId.fromCodepoint('z'));
}

test "KeyId.fromCodepoint - uppercase letters A-Z map to same as lowercase" {
    try std.testing.expectEqual(KeyId.a, KeyId.fromCodepoint('A'));
    try std.testing.expectEqual(KeyId.m, KeyId.fromCodepoint('M'));
    try std.testing.expectEqual(KeyId.z, KeyId.fromCodepoint('Z'));
}

test "KeyId.fromCodepoint - digits 0-9" {
    try std.testing.expectEqual(KeyId.@"0", KeyId.fromCodepoint('0'));
    try std.testing.expectEqual(KeyId.@"5", KeyId.fromCodepoint('5'));
    try std.testing.expectEqual(KeyId.@"9", KeyId.fromCodepoint('9'));
}

test "KeyId.fromCodepoint - special keys" {
    try std.testing.expectEqual(KeyId.escape, KeyId.fromCodepoint(27));
    try std.testing.expectEqual(KeyId.enter, KeyId.fromCodepoint(13));
    try std.testing.expectEqual(KeyId.tab, KeyId.fromCodepoint(9));
    try std.testing.expectEqual(KeyId.backspace, KeyId.fromCodepoint(127));
    try std.testing.expectEqual(KeyId.space, KeyId.fromCodepoint(32));
}

test "KeyId.fromCodepoint - unknown codepoints" {
    try std.testing.expectEqual(KeyId.unknown, KeyId.fromCodepoint(0));
    try std.testing.expectEqual(KeyId.unknown, KeyId.fromCodepoint(128));
    try std.testing.expectEqual(KeyId.unknown, KeyId.fromCodepoint(0x1F600)); // emoji
    try std.testing.expectEqual(KeyId.unknown, KeyId.fromCodepoint('!'));
    try std.testing.expectEqual(KeyId.unknown, KeyId.fromCodepoint('@'));
}

// ============================================================================
// KeyId.fromString tests
// ============================================================================

test "KeyId.fromString - single lowercase letters" {
    try std.testing.expectEqual(KeyId.a, KeyId.fromString("a").?);
    try std.testing.expectEqual(KeyId.z, KeyId.fromString("z").?);
    try std.testing.expectEqual(KeyId.m, KeyId.fromString("m").?);
}

test "KeyId.fromString - single digits" {
    try std.testing.expectEqual(KeyId.@"0", KeyId.fromString("0").?);
    try std.testing.expectEqual(KeyId.@"5", KeyId.fromString("5").?);
    try std.testing.expectEqual(KeyId.@"9", KeyId.fromString("9").?);
}

test "KeyId.fromString - escape aliases" {
    try std.testing.expectEqual(KeyId.escape, KeyId.fromString("escape").?);
    try std.testing.expectEqual(KeyId.escape, KeyId.fromString("esc").?);
}

test "KeyId.fromString - enter aliases" {
    try std.testing.expectEqual(KeyId.enter, KeyId.fromString("enter").?);
    try std.testing.expectEqual(KeyId.enter, KeyId.fromString("return").?);
}

test "KeyId.fromString - navigation keys" {
    try std.testing.expectEqual(KeyId.up, KeyId.fromString("up").?);
    try std.testing.expectEqual(KeyId.down, KeyId.fromString("down").?);
    try std.testing.expectEqual(KeyId.left, KeyId.fromString("left").?);
    try std.testing.expectEqual(KeyId.right, KeyId.fromString("right").?);
    try std.testing.expectEqual(KeyId.home, KeyId.fromString("home").?);
    try std.testing.expectEqual(KeyId.end, KeyId.fromString("end").?);
    try std.testing.expectEqual(KeyId.page_up, KeyId.fromString("pageup").?);
    try std.testing.expectEqual(KeyId.page_down, KeyId.fromString("pagedown").?);
    try std.testing.expectEqual(KeyId.insert, KeyId.fromString("insert").?);
}

test "KeyId.fromString - other special keys" {
    try std.testing.expectEqual(KeyId.tab, KeyId.fromString("tab").?);
    try std.testing.expectEqual(KeyId.backspace, KeyId.fromString("backspace").?);
    try std.testing.expectEqual(KeyId.delete, KeyId.fromString("delete").?);
    try std.testing.expectEqual(KeyId.space, KeyId.fromString("space").?);
}

test "KeyId.fromString - function keys f1-f12" {
    try std.testing.expectEqual(KeyId.f1, KeyId.fromString("f1").?);
    try std.testing.expectEqual(KeyId.f2, KeyId.fromString("f2").?);
    try std.testing.expectEqual(KeyId.f3, KeyId.fromString("f3").?);
    try std.testing.expectEqual(KeyId.f4, KeyId.fromString("f4").?);
    try std.testing.expectEqual(KeyId.f5, KeyId.fromString("f5").?);
    try std.testing.expectEqual(KeyId.f6, KeyId.fromString("f6").?);
    try std.testing.expectEqual(KeyId.f7, KeyId.fromString("f7").?);
    try std.testing.expectEqual(KeyId.f8, KeyId.fromString("f8").?);
    try std.testing.expectEqual(KeyId.f9, KeyId.fromString("f9").?);
    try std.testing.expectEqual(KeyId.f10, KeyId.fromString("f10").?);
    try std.testing.expectEqual(KeyId.f11, KeyId.fromString("f11").?);
    try std.testing.expectEqual(KeyId.f12, KeyId.fromString("f12").?);
}

test "KeyId.fromString - unknown strings" {
    try std.testing.expect(KeyId.fromString("invalid") == null);
    try std.testing.expect(KeyId.fromString("") == null);
    try std.testing.expect(KeyId.fromString("ESCAPE") == null); // case-sensitive
    try std.testing.expect(KeyId.fromString("A") == null); // uppercase single char
    try std.testing.expect(KeyId.fromString("f13") == null);
}

// ============================================================================
// Modifiers tests
// ============================================================================

test "Modifiers.none is all false" {
    const none = Modifiers.none;
    try std.testing.expect(!none.shift);
    try std.testing.expect(!none.alt);
    try std.testing.expect(!none.ctrl);
    try std.testing.expect(!none.super);
}

test "Modifiers.fromKitty - no modifiers (1)" {
    const mods = Modifiers.fromKitty(1);
    try std.testing.expect(!mods.shift);
    try std.testing.expect(!mods.alt);
    try std.testing.expect(!mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.fromKitty - shift (2)" {
    const mods = Modifiers.fromKitty(2);
    try std.testing.expect(mods.shift);
    try std.testing.expect(!mods.alt);
    try std.testing.expect(!mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.fromKitty - alt (3)" {
    const mods = Modifiers.fromKitty(3);
    try std.testing.expect(!mods.shift);
    try std.testing.expect(mods.alt);
    try std.testing.expect(!mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.fromKitty - ctrl (5)" {
    const mods = Modifiers.fromKitty(5);
    try std.testing.expect(!mods.shift);
    try std.testing.expect(!mods.alt);
    try std.testing.expect(mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.fromKitty - super (9)" {
    const mods = Modifiers.fromKitty(9);
    try std.testing.expect(!mods.shift);
    try std.testing.expect(!mods.alt);
    try std.testing.expect(!mods.ctrl);
    try std.testing.expect(mods.super);
}

test "Modifiers.fromKitty - shift+alt (4)" {
    const mods = Modifiers.fromKitty(4);
    try std.testing.expect(mods.shift);
    try std.testing.expect(mods.alt);
    try std.testing.expect(!mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.fromKitty - ctrl+shift (6)" {
    const mods = Modifiers.fromKitty(6);
    try std.testing.expect(mods.shift);
    try std.testing.expect(!mods.alt);
    try std.testing.expect(mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.fromKitty - all modifiers (16)" {
    const mods = Modifiers.fromKitty(16);
    try std.testing.expect(mods.shift);
    try std.testing.expect(mods.alt);
    try std.testing.expect(mods.ctrl);
    try std.testing.expect(mods.super);
}

test "Modifiers.fromKitty - zero treated as no modifiers" {
    const mods = Modifiers.fromKitty(0);
    try std.testing.expect(!mods.shift);
    try std.testing.expect(!mods.alt);
    try std.testing.expect(!mods.ctrl);
    try std.testing.expect(!mods.super);
}

test "Modifiers.eql - same modifiers" {
    const mods1 = Modifiers{ .ctrl = true, .shift = true };
    const mods2 = Modifiers{ .ctrl = true, .shift = true };
    try std.testing.expect(mods1.eql(mods2));
}

test "Modifiers.eql - different modifiers" {
    const mods1 = Modifiers{ .ctrl = true };
    const mods2 = Modifiers{ .alt = true };
    try std.testing.expect(!mods1.eql(mods2));
}

test "Modifiers.eql - none equals none" {
    try std.testing.expect(Modifiers.none.eql(Modifiers{}));
    try std.testing.expect(Modifiers{}.eql(Modifiers.none));
}

// ============================================================================
// Key.matches tests
// ============================================================================

test "Key.matches - exact match" {
    const key = Key{ .code = .a, .modifiers = .{ .ctrl = true } };
    try std.testing.expect(key.matches(.a, .{ .ctrl = true }));
}

test "Key.matches - wrong key" {
    const key = Key{ .code = .a, .modifiers = .{ .ctrl = true } };
    try std.testing.expect(!key.matches(.b, .{ .ctrl = true }));
}

test "Key.matches - wrong modifiers" {
    const key = Key{ .code = .a, .modifiers = .{ .ctrl = true } };
    try std.testing.expect(!key.matches(.a, .{ .alt = true }));
    try std.testing.expect(!key.matches(.a, .{}));
}

// ============================================================================
// Key.matchesString tests
// ============================================================================

test "Key.matchesString - simple key" {
    const key = Key{ .code = .a, .modifiers = .{} };
    try std.testing.expect(key.matchesString("a"));
    try std.testing.expect(!key.matchesString("b"));
}

test "Key.matchesString - ctrl+key" {
    const key = Key{ .code = .c, .modifiers = .{ .ctrl = true } };
    try std.testing.expect(key.matchesString("ctrl+c"));
    try std.testing.expect(!key.matchesString("c"));
    try std.testing.expect(!key.matchesString("alt+c"));
}

test "Key.matchesString - alt+key" {
    const key = Key{ .code = .x, .modifiers = .{ .alt = true } };
    try std.testing.expect(key.matchesString("alt+x"));
    try std.testing.expect(!key.matchesString("x"));
}

test "Key.matchesString - shift+key" {
    const key = Key{ .code = .a, .modifiers = .{ .shift = true } };
    try std.testing.expect(key.matchesString("shift+a"));
}

test "Key.matchesString - super+key" {
    const key = Key{ .code = .s, .modifiers = .{ .super = true } };
    try std.testing.expect(key.matchesString("super+s"));
}

test "Key.matchesString - multiple modifiers order independent" {
    const key = Key{ .code = .a, .modifiers = .{ .ctrl = true, .shift = true } };
    try std.testing.expect(key.matchesString("ctrl+shift+a"));
    try std.testing.expect(key.matchesString("shift+ctrl+a"));
}

test "Key.matchesString - three modifiers" {
    const key = Key{ .code = .z, .modifiers = .{ .ctrl = true, .alt = true, .shift = true } };
    try std.testing.expect(key.matchesString("ctrl+alt+shift+z"));
    try std.testing.expect(key.matchesString("shift+alt+ctrl+z"));
}

test "Key.matchesString - special keys" {
    try std.testing.expect((Key{ .code = .escape, .modifiers = .{} }).matchesString("escape"));
    try std.testing.expect((Key{ .code = .escape, .modifiers = .{} }).matchesString("esc"));
    try std.testing.expect((Key{ .code = .enter, .modifiers = .{} }).matchesString("enter"));
    try std.testing.expect((Key{ .code = .enter, .modifiers = .{} }).matchesString("return"));
    try std.testing.expect((Key{ .code = .tab, .modifiers = .{} }).matchesString("tab"));
    try std.testing.expect((Key{ .code = .space, .modifiers = .{} }).matchesString("space"));
}

test "Key.matchesString - function keys" {
    try std.testing.expect((Key{ .code = .f1, .modifiers = .{} }).matchesString("f1"));
    try std.testing.expect((Key{ .code = .f12, .modifiers = .{} }).matchesString("f12"));
}

test "Key.matchesString - invalid string returns false" {
    const key = Key{ .code = .a, .modifiers = .{} };
    try std.testing.expect(!key.matchesString("invalid"));
    try std.testing.expect(!key.matchesString(""));
}

// ============================================================================
// Key helper methods tests
// ============================================================================

test "Key.isInterrupt - ctrl+c" {
    const key = Key{ .code = .c, .modifiers = .{ .ctrl = true } };
    try std.testing.expect(key.isInterrupt());
}

test "Key.isInterrupt - just c is not interrupt" {
    const key = Key{ .code = .c, .modifiers = .{} };
    try std.testing.expect(!key.isInterrupt());
}

test "Key.isInterrupt - ctrl+other is not interrupt" {
    const key = Key{ .code = .d, .modifiers = .{ .ctrl = true } };
    try std.testing.expect(!key.isInterrupt());
}

test "Key.isEscape" {
    try std.testing.expect((Key{ .code = .escape, .modifiers = .{} }).isEscape());
    try std.testing.expect(!(Key{ .code = .escape, .modifiers = .{ .shift = true } }).isEscape());
    try std.testing.expect(!(Key{ .code = .a, .modifiers = .{} }).isEscape());
}

test "Key.isEnter" {
    try std.testing.expect((Key{ .code = .enter, .modifiers = .{} }).isEnter());
    try std.testing.expect(!(Key{ .code = .enter, .modifiers = .{ .ctrl = true } }).isEnter());
    try std.testing.expect(!(Key{ .code = .a, .modifiers = .{} }).isEnter());
}

test "Key.isNavigation" {
    const nav_keys = [_]KeyId{ .up, .down, .left, .right, .home, .end, .page_up, .page_down };
    for (nav_keys) |k| {
        const key = Key{ .code = k, .modifiers = .{} };
        try std.testing.expect(key.isNavigation());
    }

    const non_nav_keys = [_]KeyId{ .a, .enter, .escape, .f1, .space };
    for (non_nav_keys) |k| {
        const key = Key{ .code = k, .modifiers = .{} };
        try std.testing.expect(!key.isNavigation());
    }
}

test "Key.isFunctionKey" {
    const fn_keys = [_]KeyId{ .f1, .f2, .f3, .f4, .f5, .f6, .f7, .f8, .f9, .f10, .f11, .f12 };
    for (fn_keys) |k| {
        const key = Key{ .code = k, .modifiers = .{} };
        try std.testing.expect(key.isFunctionKey());
    }

    const non_fn_keys = [_]KeyId{ .a, .enter, .escape, .up, .space };
    for (non_fn_keys) |k| {
        const key = Key{ .code = k, .modifiers = .{} };
        try std.testing.expect(!key.isFunctionKey());
    }
}

test "Key.isPrintable" {
    const printable = Key{ .code = .a, .modifiers = .{}, .text = "a" };
    try std.testing.expect(printable.isPrintable());

    const non_printable = Key{ .code = .escape, .modifiers = .{} };
    try std.testing.expect(!non_printable.isPrintable());

    const empty_text = Key{ .code = .a, .modifiers = .{}, .text = "" };
    try std.testing.expect(!empty_text.isPrintable());
}

// ============================================================================
// parseKittySequence tests
// ============================================================================

test "parseKittySequence - basic Ctrl+A (codepoint 97)" {
    const key = keys.parseKittySequence("\x1b[97;5u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.ctrl);
    try std.testing.expect(!key.?.modifiers.shift);
    try std.testing.expect(!key.?.modifiers.alt);
}

test "parseKittySequence - shift only (mod=2)" {
    const key = keys.parseKittySequence("\x1b[65;2u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.shift);
    try std.testing.expect(!key.?.modifiers.ctrl);
}

test "parseKittySequence - alt only (mod=3)" {
    const key = keys.parseKittySequence("\x1b[97;3u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.alt);
    try std.testing.expect(!key.?.modifiers.shift);
}

test "parseKittySequence - with event type marker" {
    const key = keys.parseKittySequence("\x1b[97;5:1u");
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.a, key.?.code);
    try std.testing.expect(key.?.modifiers.ctrl);
}

test "parseKittySequence - digit codepoint" {
    const key = keys.parseKittySequence("\x1b[48;1u"); // '0' = 48
    try std.testing.expect(key != null);
    try std.testing.expectEqual(KeyId.@"0", key.?.code);
}

test "parseKittySequence - invalid sequences return null" {
    try std.testing.expect(keys.parseKittySequence("") == null);
    try std.testing.expect(keys.parseKittySequence("abc") == null);
    try std.testing.expect(keys.parseKittySequence("\x1b[") == null);
    try std.testing.expect(keys.parseKittySequence("\x1b[97u") == null); // no semicolon
    try std.testing.expect(keys.parseKittySequence("\x1b[97;5~") == null); // wrong terminator
    try std.testing.expect(keys.parseKittySequence("[97;5u") == null); // no escape
}

test "parseKittySequence - too short" {
    try std.testing.expect(keys.parseKittySequence("\x1b[u") == null);
    try std.testing.expect(keys.parseKittySequence("\x1b[1") == null);
}

// ============================================================================
// isKeyRelease tests
// ============================================================================

test "isKeyRelease - :3u marker" {
    try std.testing.expect(keys.isKeyRelease("\x1b[97;5:3u"));
}

test "isKeyRelease - :3~ marker" {
    try std.testing.expect(keys.isKeyRelease("\x1b[1;5:3~"));
}

test "isKeyRelease - arrow key release markers" {
    try std.testing.expect(keys.isKeyRelease("\x1b[1;2:3A"));
    try std.testing.expect(keys.isKeyRelease("\x1b[1;2:3B"));
    try std.testing.expect(keys.isKeyRelease("\x1b[1;2:3C"));
    try std.testing.expect(keys.isKeyRelease("\x1b[1;2:3D"));
}

test "isKeyRelease - home/end release markers" {
    try std.testing.expect(keys.isKeyRelease("\x1b[1;2:3H"));
    try std.testing.expect(keys.isKeyRelease("\x1b[1;2:3F"));
}

test "isKeyRelease - not release" {
    try std.testing.expect(!keys.isKeyRelease("\x1b[97;5u"));
    try std.testing.expect(!keys.isKeyRelease("\x1b[97;5:1u"));
    try std.testing.expect(!keys.isKeyRelease("\x1b[97;5:2u"));
}

test "isKeyRelease - paste bracket mode is not release" {
    try std.testing.expect(!keys.isKeyRelease("\x1b[200~hello\x1b[201~"));
    try std.testing.expect(!keys.isKeyRelease("\x1b[200~:3u\x1b[201~"));
}

// ============================================================================
// isKeyRepeat tests
// ============================================================================

test "isKeyRepeat - :2u marker" {
    try std.testing.expect(keys.isKeyRepeat("\x1b[97;5:2u"));
}

test "isKeyRepeat - :2~ marker" {
    try std.testing.expect(keys.isKeyRepeat("\x1b[1;5:2~"));
}

test "isKeyRepeat - arrow key repeat markers" {
    try std.testing.expect(keys.isKeyRepeat("\x1b[1;2:2A"));
    try std.testing.expect(keys.isKeyRepeat("\x1b[1;2:2B"));
    try std.testing.expect(keys.isKeyRepeat("\x1b[1;2:2C"));
    try std.testing.expect(keys.isKeyRepeat("\x1b[1;2:2D"));
}

test "isKeyRepeat - not repeat" {
    try std.testing.expect(!keys.isKeyRepeat("\x1b[97;5u"));
    try std.testing.expect(!keys.isKeyRepeat("\x1b[97;5:1u"));
    try std.testing.expect(!keys.isKeyRepeat("\x1b[97;5:3u"));
}

test "isKeyRepeat - paste bracket mode is not repeat" {
    try std.testing.expect(!keys.isKeyRepeat("\x1b[200~hello\x1b[201~"));
}

// ============================================================================
// parseLegacyKey tests
// ============================================================================

test "parseLegacyKey - escape" {
    const key = keys.parseLegacyKey("\x1b");
    try std.testing.expectEqual(KeyId.escape, key.code);
    try std.testing.expect(key.modifiers.eql(Modifiers{}));
}

test "parseLegacyKey - enter (CR)" {
    const key = keys.parseLegacyKey("\r");
    try std.testing.expectEqual(KeyId.enter, key.code);
}

test "parseLegacyKey - tab" {
    const key = keys.parseLegacyKey("\t");
    try std.testing.expectEqual(KeyId.tab, key.code);
}

test "parseLegacyKey - backspace (DEL)" {
    const key = keys.parseLegacyKey("\x7f");
    try std.testing.expectEqual(KeyId.backspace, key.code);
}

test "parseLegacyKey - space" {
    const key = keys.parseLegacyKey(" ");
    try std.testing.expectEqual(KeyId.space, key.code);
}

test "parseLegacyKey - Ctrl+A through Ctrl+Z" {
    const key_a = keys.parseLegacyKey("\x01");
    try std.testing.expectEqual(KeyId.a, key_a.code);
    try std.testing.expect(key_a.modifiers.ctrl);

    const key_c = keys.parseLegacyKey("\x03");
    try std.testing.expectEqual(KeyId.c, key_c.code);
    try std.testing.expect(key_c.modifiers.ctrl);

    const key_z = keys.parseLegacyKey("\x1a");
    try std.testing.expectEqual(KeyId.z, key_z.code);
    try std.testing.expect(key_z.modifiers.ctrl);
}

test "parseLegacyKey - lowercase letters" {
    const key = keys.parseLegacyKey("a");
    try std.testing.expectEqual(KeyId.a, key.code);
    try std.testing.expect(key.modifiers.eql(Modifiers{}));
    try std.testing.expect(key.text != null);
    try std.testing.expectEqualStrings("a", key.text.?);
}

test "parseLegacyKey - uppercase letters (shift)" {
    const key = keys.parseLegacyKey("A");
    try std.testing.expectEqual(KeyId.a, key.code);
    try std.testing.expect(key.modifiers.shift);
    try std.testing.expect(key.text != null);
    try std.testing.expectEqualStrings("A", key.text.?);
}

test "parseLegacyKey - digits" {
    const key = keys.parseLegacyKey("5");
    try std.testing.expectEqual(KeyId.@"5", key.code);
    try std.testing.expect(key.modifiers.eql(Modifiers{}));
    try std.testing.expect(key.text != null);
}

test "parseLegacyKey - Alt+letter" {
    const key = keys.parseLegacyKey("\x1bx");
    try std.testing.expectEqual(KeyId.x, key.code);
    try std.testing.expect(key.modifiers.alt);
}

test "parseLegacyKey - unknown input" {
    const key = keys.parseLegacyKey("!!!");
    try std.testing.expectEqual(KeyId.unknown, key.code);
}

test "parseLegacyKey - empty input" {
    const key = keys.parseLegacyKey("");
    try std.testing.expectEqual(KeyId.unknown, key.code);
}

// ============================================================================
// parseKey tests
// ============================================================================

test "parseKey - prefers Kitty format" {
    const key = keys.parseKey("\x1b[97;5u");
    try std.testing.expectEqual(KeyId.a, key.code);
    try std.testing.expect(key.modifiers.ctrl);
}

test "parseKey - falls back to legacy" {
    const key = keys.parseKey("\x03");
    try std.testing.expectEqual(KeyId.c, key.code);
    try std.testing.expect(key.modifiers.ctrl);
}

test "parseKey - simple letter" {
    const key = keys.parseKey("x");
    try std.testing.expectEqual(KeyId.x, key.code);
}
