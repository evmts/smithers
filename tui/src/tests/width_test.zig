const std = @import("std");
const width = @import("../rendering/width.zig");

// ============ calculateWidth tests ============

test "calculateWidth empty string" {
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth(""));
}

test "calculateWidth ASCII" {
    try std.testing.expectEqual(@as(u32, 13), width.calculateWidth("Hello, World!"));
    try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("abcde"));
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("x"));
}

test "calculateWidth ASCII punctuation and symbols" {
    try std.testing.expectEqual(@as(u32, 10), width.calculateWidth("!@#$%^&*()"));
    try std.testing.expectEqual(@as(u32, 3), width.calculateWidth("..."));
    try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("[]{}<>")[0..5].len);
}

test "calculateWidth tab expansion" {
    try std.testing.expectEqual(@as(u32, 3), width.calculateWidth("\t"));
    try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("a\tb"));
    try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("\t\t"));
    try std.testing.expectEqual(@as(u32, 9), width.calculateWidth("a\tb\tc"));
}

test "calculateWidth control characters" {
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\x00"));
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\x01\x02\x03"));
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\x1F"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("a\x00b"));
}

test "calculateWidth newline and carriage return" {
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\n"));
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\r"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("a\nb"));
}

// ============ CJK wide character tests ============

test "calculateWidth CJK Chinese" {
    try std.testing.expectEqual(@as(u32, 4), width.calculateWidth("你好"));
    try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("中文字"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("国"));
}

test "calculateWidth CJK Japanese Hiragana" {
    try std.testing.expectEqual(@as(u32, 10), width.calculateWidth("こんにちは"));
    try std.testing.expectEqual(@as(u32, 4), width.calculateWidth("あい"));
}

test "calculateWidth CJK Japanese Katakana" {
    try std.testing.expectEqual(@as(u32, 8), width.calculateWidth("カタカナ"));
    try std.testing.expectEqual(@as(u32, 4), width.calculateWidth("アイ"));
}

test "calculateWidth Korean Hangul" {
    try std.testing.expectEqual(@as(u32, 4), width.calculateWidth("한글"));
    try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("안녕하"));
}

test "calculateWidth mixed ASCII and CJK" {
    try std.testing.expectEqual(@as(u32, 9), width.calculateWidth("Hello你好"));
    try std.testing.expectEqual(@as(u32, 7), width.calculateWidth("abc中文"));
    try std.testing.expectEqual(@as(u32, 8), width.calculateWidth("a你b好c"));
}

// ============ Emoji tests ============

test "calculateWidth basic emoji" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("😀"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🎉"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🚀"));
}

test "calculateWidth multiple emoji" {
    try std.testing.expectEqual(@as(u32, 4), width.calculateWidth("😀😃"));
    try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("🎉🚀🎈"));
}

test "calculateWidth emoji with ASCII" {
    try std.testing.expectEqual(@as(u32, 7), width.calculateWidth("Hello😀"));
    try std.testing.expectEqual(@as(u32, 7), width.calculateWidth("a😀b😃c"));
}

test "calculateWidth emoji categories" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("😀"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🌟"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🚗"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🤖"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🎁"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("☀"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("✨"));
}

test "calculateWidth flag emoji" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🇺"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("🇸"));
}

// ============ Combining marks and diacritics tests ============

test "calculateWidth combining acute accent" {
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("e\u{0301}"));
}

test "calculateWidth combining diacritical marks" {
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("a\u{0300}"));
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("o\u{0308}"));
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("n\u{0303}"));
}

test "calculateWidth multiple combining marks" {
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("a\u{0300}\u{0301}"));
}

test "calculateWidth precomposed vs decomposed" {
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("é"));
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("e\u{0301}"));
}

// ============ Variation selectors tests ============

test "calculateWidth variation selector VS15" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("☀\u{FE0F}"));
}

test "calculateWidth variation selector VS16" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("❤\u{FE0F}"));
}

// ============ Zero-width joiner tests ============

test "calculateWidth ZWJ alone" {
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\u{200D}"));
}

test "calculateWidth ZWJ between characters" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("a\u{200D}b"));
}

// ============ visibleWidth tests (with ANSI stripping) ============

test "visibleWidth with CSI color" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqual(@as(u32, 3), width.visibleWidthWithAllocator(allocator, "\x1b[31mRed\x1b[0m"));
}

test "visibleWidth with multiple ANSI" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqual(@as(u32, 8), width.visibleWidthWithAllocator(allocator, "\x1b[1m\x1b[31mBold Red\x1b[0m"));
}

test "visibleWidth no ANSI" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqual(@as(u32, 5), width.visibleWidthWithAllocator(allocator, "Hello"));
}

test "visibleWidth ANSI only" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqual(@as(u32, 0), width.visibleWidthWithAllocator(allocator, "\x1b[31m\x1b[0m"));
}

test "visibleWidth complex ANSI with CJK" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqual(@as(u32, 4), width.visibleWidthWithAllocator(allocator, "\x1b[32m你好\x1b[0m"));
}

test "visibleWidth complex ANSI with emoji" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqual(@as(u32, 2), width.visibleWidthWithAllocator(allocator, "\x1b[33m😀\x1b[0m"));
}

// ============ classifySequence tests ============

test "classifySequence not escape" {
    const result = width.classifySequence("hello");
    try std.testing.expectEqual(width.SequenceType.not_escape, result.type);
    try std.testing.expectEqual(@as(usize, 0), result.len);
}

test "classifySequence empty" {
    const result = width.classifySequence("");
    try std.testing.expectEqual(width.SequenceType.not_escape, result.type);
    try std.testing.expectEqual(@as(usize, 0), result.len);
}

test "classifySequence incomplete ESC only" {
    const result = width.classifySequence("\x1b");
    try std.testing.expectEqual(width.SequenceType.incomplete, result.type);
    try std.testing.expectEqual(@as(usize, 1), result.len);
}

test "classifySequence CSI color" {
    const result = width.classifySequence("\x1b[31m");
    try std.testing.expectEqual(width.SequenceType.csi, result.type);
    try std.testing.expectEqual(@as(usize, 5), result.len);
}

test "classifySequence CSI reset" {
    const result = width.classifySequence("\x1b[0m");
    try std.testing.expectEqual(width.SequenceType.csi, result.type);
    try std.testing.expectEqual(@as(usize, 4), result.len);
}

test "classifySequence CSI cursor move" {
    const result = width.classifySequence("\x1b[10;20H");
    try std.testing.expectEqual(width.SequenceType.csi, result.type);
    try std.testing.expectEqual(@as(usize, 8), result.len);
}

test "classifySequence incomplete CSI" {
    const result = width.classifySequence("\x1b[31");
    try std.testing.expectEqual(width.SequenceType.incomplete, result.type);
}

test "classifySequence OSC with BEL" {
    const result = width.classifySequence("\x1b]0;title\x07");
    try std.testing.expectEqual(width.SequenceType.osc, result.type);
    try std.testing.expectEqual(@as(usize, 10), result.len);
}

test "classifySequence OSC with ST" {
    const result = width.classifySequence("\x1b]0;title\x1b\\");
    try std.testing.expectEqual(width.SequenceType.osc, result.type);
    try std.testing.expectEqual(@as(usize, 11), result.len);
}

test "classifySequence incomplete OSC" {
    const result = width.classifySequence("\x1b]0;title");
    try std.testing.expectEqual(width.SequenceType.incomplete, result.type);
}

test "classifySequence DCS" {
    const result = width.classifySequence("\x1bPdata\x1b\\");
    try std.testing.expectEqual(width.SequenceType.dcs, result.type);
    try std.testing.expectEqual(@as(usize, 8), result.len);
}

test "classifySequence incomplete DCS" {
    const result = width.classifySequence("\x1bPdata");
    try std.testing.expectEqual(width.SequenceType.incomplete, result.type);
}

test "classifySequence APC with BEL" {
    const result = width.classifySequence("\x1b_data\x07");
    try std.testing.expectEqual(width.SequenceType.apc, result.type);
    try std.testing.expectEqual(@as(usize, 7), result.len);
}

test "classifySequence APC with ST" {
    const result = width.classifySequence("\x1b_data\x1b\\");
    try std.testing.expectEqual(width.SequenceType.apc, result.type);
    try std.testing.expectEqual(@as(usize, 8), result.len);
}

test "classifySequence incomplete APC" {
    const result = width.classifySequence("\x1b_data");
    try std.testing.expectEqual(width.SequenceType.incomplete, result.type);
}

test "classifySequence SS3" {
    const result = width.classifySequence("\x1bOA");
    try std.testing.expectEqual(width.SequenceType.ss3, result.type);
    try std.testing.expectEqual(@as(usize, 3), result.len);
}

test "classifySequence incomplete SS3" {
    const result = width.classifySequence("\x1bO");
    try std.testing.expectEqual(width.SequenceType.incomplete, result.type);
}

test "classifySequence single char (Meta/Alt)" {
    const result = width.classifySequence("\x1bx");
    try std.testing.expectEqual(width.SequenceType.single_char, result.type);
    try std.testing.expectEqual(@as(usize, 2), result.len);
}

// ============ stripAnsi tests ============

test "stripAnsi basic" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "\x1b[31mRed\x1b[0m");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Red", result);
}

test "stripAnsi no escapes" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "Plain text");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Plain text", result);
}

test "stripAnsi empty" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}

test "stripAnsi multiple sequences" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "\x1b[1m\x1b[31mBold Red\x1b[0m\x1b[32m Green\x1b[0m");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Bold Red Green", result);
}

test "stripAnsi OSC sequence" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "Before\x1b]0;title\x07After");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("BeforeAfter", result);
}

test "stripAnsi preserves CJK" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "\x1b[31m你好\x1b[0m");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("你好", result);
}

test "stripAnsi preserves emoji" {
    const allocator = std.testing.allocator;
    const result = try width.stripAnsi(allocator, "\x1b[33m😀\x1b[0m");
    defer allocator.free(result);
    try std.testing.expectEqualStrings("😀", result);
}

// ============ WidthCache tests ============

test "WidthCache get miss" {
    var cache = width.WidthCache{};
    try std.testing.expectEqual(@as(?u32, null), cache.get(12345));
}

test "WidthCache put and get hit" {
    var cache = width.WidthCache{};
    cache.put(12345, 42);
    try std.testing.expectEqual(@as(?u32, 42), cache.get(12345));
}

test "WidthCache overwrite same slot" {
    var cache = width.WidthCache{};
    cache.put(12345, 42);
    cache.put(12345, 100);
    try std.testing.expectEqual(@as(?u32, 100), cache.get(12345));
}

test "WidthCache different hashes same slot collision" {
    var cache = width.WidthCache{};
    cache.put(0, 10);
    cache.put(512, 20);
    try std.testing.expectEqual(@as(?u32, 20), cache.get(512));
    try std.testing.expectEqual(@as(?u32, null), cache.get(0));
}

test "WidthCache multiple entries" {
    var cache = width.WidthCache{};
    cache.put(1, 10);
    cache.put(2, 20);
    cache.put(3, 30);
    try std.testing.expectEqual(@as(?u32, 10), cache.get(1));
    try std.testing.expectEqual(@as(?u32, 20), cache.get(2));
    try std.testing.expectEqual(@as(?u32, 30), cache.get(3));
}

// ============ sliceByColumn tests ============

test "sliceByColumn basic ASCII" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "Hello, World!", 0, 5);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Hello", result);
}

test "sliceByColumn middle" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "Hello, World!", 7, 12);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("World", result);
}

test "sliceByColumn full string" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "Hello", 0, 5);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Hello", result);
}

test "sliceByColumn empty range" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "Hello", 0, 0);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}

test "sliceByColumn with ANSI" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "\x1b[31mRed\x1b[0m Text", 0, 3);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("\x1b[31mRed\x1b[0m", result);
}

test "sliceByColumn CJK" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "你好世界", 0, 4);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("你好", result);
}

test "sliceByColumn CJK middle" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "你好世界", 4, 8);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("世界", result);
}

test "sliceByColumn mixed ASCII and CJK" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "ab你好cd", 2, 6);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("你好", result);
}

test "sliceByColumn with tab" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "a\tb", 0, 4);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a\t", result);
}

// ============ wrapTextWithAnsi tests ============

test "wrapTextWithAnsi basic" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "Hello World", 5);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 3), lines.items.len);
    try std.testing.expectEqualStrings("Hello", lines.items[0]);
    try std.testing.expectEqualStrings(" Worl", lines.items[1]);
    try std.testing.expectEqualStrings("d", lines.items[2]);
}

test "wrapTextWithAnsi preserves style" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "\x1b[31mRedText\x1b[0m", 3);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 3), lines.items.len);
    try std.testing.expect(std.mem.startsWith(u8, lines.items[0], "\x1b[31m"));
    try std.testing.expect(std.mem.startsWith(u8, lines.items[1], "\x1b[31m"));
}

test "wrapTextWithAnsi zero width" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "Hello", 0);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 0), lines.items.len);
}

test "wrapTextWithAnsi empty string" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "", 10);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 0), lines.items.len);
}

test "wrapTextWithAnsi newlines" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "Hello\nWorld", 10);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 2), lines.items.len);
    try std.testing.expectEqualStrings("Hello", lines.items[0]);
    try std.testing.expectEqualStrings("World", lines.items[1]);
}

test "wrapTextWithAnsi CJK wrapping" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "你好世界", 4);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 2), lines.items.len);
    try std.testing.expectEqualStrings("你好", lines.items[0]);
    try std.testing.expectEqualStrings("世界", lines.items[1]);
}

test "wrapTextWithAnsi style reset mid-wrap" {
    const allocator = std.testing.allocator;
    var lines = try width.wrapTextWithAnsi(allocator, "\x1b[31mRed\x1b[0mNormal", 3);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 2), lines.items.len);
}

// ============ Edge cases ============

test "calculateWidth DEL character" {
    try std.testing.expectEqual(@as(u32, 0), width.calculateWidth("\x7F"));
}

test "calculateWidth space" {
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth(" "));
    try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("     "));
}

test "calculateWidth mixed everything" {
    try std.testing.expectEqual(@as(u32, 13), width.calculateWidth("a你😀\t\nb"));
}

test "calculateWidth Latin extended" {
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("ñ"));
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("ü"));
    try std.testing.expectEqual(@as(u32, 1), width.calculateWidth("ø"));
}

test "calculateWidth Cyrillic" {
    try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("Привет"));
}

test "calculateWidth Greek" {
    try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("Ελλάς"));
}

test "calculateWidth Arabic" {
    try std.testing.expectEqual(@as(u32, 6), width.calculateWidth("مرحبا"));
}

test "calculateWidth Hebrew" {
    try std.testing.expectEqual(@as(u32, 5), width.calculateWidth("שלום"));
}

test "calculateWidth Thai" {
    try std.testing.expectEqual(@as(u32, 10), width.calculateWidth("สวัสดี"));
}

test "visibleWidth caching works" {
    const allocator = std.testing.allocator;
    const text = "test string for caching";
    const w1 = width.visibleWidthWithAllocator(allocator, text);
    const w2 = width.visibleWidthWithAllocator(allocator, text);
    try std.testing.expectEqual(w1, w2);
}

test "calculateWidth fullwidth ASCII" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("Ａ"));
    try std.testing.expectEqual(@as(u32, 4), width.calculateWidth("ＡＢ"));
}

test "calculateWidth fullwidth currency" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("￥"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("￡"));
}

test "calculateWidth CJK punctuation" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("。"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("、"));
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("「"));
}

test "calculateWidth ideographic space" {
    try std.testing.expectEqual(@as(u32, 2), width.calculateWidth("　"));
}

test "sliceByColumn out of bounds" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "Hi", 0, 100);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Hi", result);
}

test "sliceByColumn start beyond end" {
    const allocator = std.testing.allocator;
    const result = try width.sliceByColumn(allocator, "Hello", 10, 15);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("", result);
}
