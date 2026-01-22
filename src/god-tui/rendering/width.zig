// Width calculation per God-TUI spec §7
// Handles visible width calculation with grapheme segmentation and East Asian Width

const std = @import("std");
// ANSI utilities - inline minimal subset needed for width calculation
const AnsiUtil = struct {
    const ESC = '\x1b';

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

    pub fn classifySequence(data: []const u8) struct { type: SequenceType, len: usize } {
        if (data.len == 0) return .{ .type = .not_escape, .len = 0 };
        if (data[0] != ESC) return .{ .type = .not_escape, .len = 0 };
        if (data.len == 1) return .{ .type = .incomplete, .len = 1 };

        const after = data[1];

        // CSI: ESC [
        if (after == '[') {
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
                if (i + 1 < data.len and data[i] == ESC and data[i + 1] == '\\') {
                    return .{ .type = .osc, .len = i + 2 };
                }
            }
            return .{ .type = .incomplete, .len = data.len };
        }

        // DCS: ESC P
        if (after == 'P') {
            var i: usize = 2;
            while (i + 1 < data.len) : (i += 1) {
                if (data[i] == ESC and data[i + 1] == '\\') {
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
                if (i + 1 < data.len and data[i] == ESC and data[i + 1] == '\\') {
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

    pub fn stripAnsi(allocator: std.mem.Allocator, text: []const u8) ![]u8 {
        var result = std.ArrayListUnmanaged(u8){};
        errdefer result.deinit(allocator);

        var i: usize = 0;
        while (i < text.len) {
            if (text[i] == ESC) {
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
};

const ansi = AnsiUtil;

/// LRU cache entry for width calculations
const CacheEntry = struct {
    key_hash: u64,
    width: u32,
    valid: bool = false,
};

/// LRU cache for width calculations (512 entries per spec)
pub const WidthCache = struct {
    entries: [512]CacheEntry = [_]CacheEntry{.{ .key_hash = 0, .width = 0, .valid = false }} ** 512,
    next_evict: u9 = 0, // Simple clock-based eviction

    pub fn get(self: *WidthCache, hash: u64) ?u32 {
        const idx = @as(usize, @truncate(hash & 511));
        if (self.entries[idx].valid and self.entries[idx].key_hash == hash) {
            return self.entries[idx].width;
        }
        return null;
    }

    pub fn put(self: *WidthCache, hash: u64, width: u32) void {
        const idx = @as(usize, @truncate(hash & 511));
        self.entries[idx] = .{
            .key_hash = hash,
            .width = width,
            .valid = true,
        };
    }
};

/// Global width cache (thread-local would be better in production)
var global_cache: WidthCache = .{};

/// Compute visible width of text with caching
pub fn visibleWidth(text: []const u8) u32 {
    return visibleWidthWithAllocator(std.heap.page_allocator, text);
}

/// Compute visible width with explicit allocator for ANSI stripping
pub fn visibleWidthWithAllocator(allocator: std.mem.Allocator, text: []const u8) u32 {
    if (text.len == 0) return 0;

    // Check cache first
    const hash = std.hash.Wyhash.hash(0, text);
    if (global_cache.get(hash)) |cached| {
        return cached;
    }

    // Strip ANSI sequences first
    const stripped = ansi.stripAnsi(allocator, text) catch {
        // Fallback to simple calculation on alloc failure
        return simpleWidth(text);
    };
    defer allocator.free(stripped);

    const width = calculateWidth(stripped);
    global_cache.put(hash, width);
    return width;
}

/// Calculate width without caching (for already-stripped text)
pub fn calculateWidth(text: []const u8) u32 {
    var width: u32 = 0;
    var i: usize = 0;

    while (i < text.len) {
        const byte = text[i];

        // ASCII fast path (0x20-0x7E = 1 column each)
        if (byte >= 0x20 and byte <= 0x7E) {
            width += 1;
            i += 1;
            continue;
        }

        // Tab expansion to 3 spaces
        if (byte == '\t') {
            width += 3;
            i += 1;
            continue;
        }

        // Control characters (< 0x20, except tab) = 0 width
        if (byte < 0x20) {
            i += 1;
            continue;
        }

        // UTF-8 multi-byte sequence
        const codepoint_result = decodeUtf8(text[i..]);
        if (codepoint_result.len == 0) {
            // Invalid UTF-8, skip byte
            i += 1;
            continue;
        }

        const codepoint = codepoint_result.codepoint;
        const char_len = codepoint_result.len;

        // Check for combining marks (zero width)
        if (isCombiningMark(codepoint)) {
            i += char_len;
            continue;
        }

        // Check for variation selectors (zero width, but may modify previous)
        if (isVariationSelector(codepoint)) {
            i += char_len;
            continue;
        }

        // Zero-width joiners
        if (codepoint == 0x200D) { // ZWJ
            i += char_len;
            continue;
        }

        // Emoji detection (RGI_Emoji = 2 columns)
        if (isEmoji(codepoint)) {
            width += 2;
            // Skip any following variation selectors, ZWJ sequences
            i += char_len;
            i = skipEmojiModifiers(text, i);
            continue;
        }

        // East Asian Width (W/F = 2 columns)
        if (isWideChar(codepoint)) {
            width += 2;
            i += char_len;
            continue;
        }

        // Default: 1 column
        width += 1;
        i += char_len;
    }

    return width;
}

/// Simple width calculation fallback (no UTF-8 handling)
fn simpleWidth(text: []const u8) u32 {
    var width: u32 = 0;
    for (text) |byte| {
        if (byte == '\x1b') continue; // Skip escape start
        if (byte >= 0x20 and byte <= 0x7E) width += 1;
        if (byte == '\t') width += 3;
    }
    return width;
}

/// Decode UTF-8 codepoint
const DecodeResult = struct { codepoint: u21, len: usize };

fn decodeUtf8(bytes: []const u8) DecodeResult {
    if (bytes.len == 0) return .{ .codepoint = 0, .len = 0 };

    const byte0 = bytes[0];

    // 1-byte (ASCII)
    if (byte0 < 0x80) {
        return .{ .codepoint = byte0, .len = 1 };
    }

    // 2-byte
    if (byte0 >= 0xC0 and byte0 < 0xE0) {
        if (bytes.len < 2) return .{ .codepoint = 0, .len = 0 };
        const cp = (@as(u21, byte0 & 0x1F) << 6) | @as(u21, bytes[1] & 0x3F);
        return .{ .codepoint = cp, .len = 2 };
    }

    // 3-byte
    if (byte0 >= 0xE0 and byte0 < 0xF0) {
        if (bytes.len < 3) return .{ .codepoint = 0, .len = 0 };
        const cp = (@as(u21, byte0 & 0x0F) << 12) |
            (@as(u21, bytes[1] & 0x3F) << 6) |
            @as(u21, bytes[2] & 0x3F);
        return .{ .codepoint = cp, .len = 3 };
    }

    // 4-byte
    if (byte0 >= 0xF0 and byte0 < 0xF8) {
        if (bytes.len < 4) return .{ .codepoint = 0, .len = 0 };
        const cp = (@as(u21, byte0 & 0x07) << 18) |
            (@as(u21, bytes[1] & 0x3F) << 12) |
            (@as(u21, bytes[2] & 0x3F) << 6) |
            @as(u21, bytes[3] & 0x3F);
        return .{ .codepoint = cp, .len = 4 };
    }

    return .{ .codepoint = 0, .len = 0 };
}

/// Check if codepoint is a combining mark (Unicode category Mn, Mc, Me)
fn isCombiningMark(cp: u21) bool {
    // Combining Diacritical Marks (0300-036F)
    if (cp >= 0x0300 and cp <= 0x036F) return true;
    // Combining Diacritical Marks Extended (1AB0-1AFF)
    if (cp >= 0x1AB0 and cp <= 0x1AFF) return true;
    // Combining Diacritical Marks Supplement (1DC0-1DFF)
    if (cp >= 0x1DC0 and cp <= 0x1DFF) return true;
    // Combining Half Marks (FE20-FE2F)
    if (cp >= 0xFE20 and cp <= 0xFE2F) return true;
    // Combining Marks for Symbols (20D0-20FF)
    if (cp >= 0x20D0 and cp <= 0x20FF) return true;
    return false;
}

/// Check if codepoint is a variation selector
fn isVariationSelector(cp: u21) bool {
    // Variation Selectors (FE00-FE0F)
    if (cp >= 0xFE00 and cp <= 0xFE0F) return true;
    // Variation Selectors Supplement (E0100-E01EF)
    if (cp >= 0xE0100 and cp <= 0xE01EF) return true;
    return false;
}

/// Check if codepoint is an emoji (simplified RGI_Emoji check)
fn isEmoji(cp: u21) bool {
    // Common emoji ranges
    // Emoticons (1F600-1F64F)
    if (cp >= 0x1F600 and cp <= 0x1F64F) return true;
    // Misc Symbols and Pictographs (1F300-1F5FF)
    if (cp >= 0x1F300 and cp <= 0x1F5FF) return true;
    // Transport and Map Symbols (1F680-1F6FF)
    if (cp >= 0x1F680 and cp <= 0x1F6FF) return true;
    // Supplemental Symbols and Pictographs (1F900-1F9FF)
    if (cp >= 0x1F900 and cp <= 0x1F9FF) return true;
    // Symbols and Pictographs Extended-A (1FA00-1FA6F)
    if (cp >= 0x1FA00 and cp <= 0x1FA6F) return true;
    // Dingbats (2700-27BF)
    if (cp >= 0x2700 and cp <= 0x27BF) return true;
    // Misc Symbols (2600-26FF)
    if (cp >= 0x2600 and cp <= 0x26FF) return true;
    // Regional Indicators (1F1E0-1F1FF) - flag emoji
    if (cp >= 0x1F1E0 and cp <= 0x1F1FF) return true;
    return false;
}

/// Skip emoji modifiers (skin tones, variation selectors, ZWJ sequences)
fn skipEmojiModifiers(text: []const u8, start: usize) usize {
    var i = start;
    while (i < text.len) {
        const result = decodeUtf8(text[i..]);
        if (result.len == 0) break;

        const cp = result.codepoint;

        // Emoji skin tone modifiers (1F3FB-1F3FF)
        if (cp >= 0x1F3FB and cp <= 0x1F3FF) {
            i += result.len;
            continue;
        }

        // Variation selectors
        if (isVariationSelector(cp)) {
            i += result.len;
            continue;
        }

        // ZWJ (followed by another emoji)
        if (cp == 0x200D) {
            i += result.len;
            // Expect another emoji after ZWJ
            if (i < text.len) {
                const next = decodeUtf8(text[i..]);
                if (next.len > 0 and isEmoji(next.codepoint)) {
                    i += next.len;
                    continue;
                }
            }
            break;
        }

        break;
    }
    return i;
}

/// Check if codepoint has East Asian Width W or F (wide/fullwidth)
fn isWideChar(cp: u21) bool {
    // CJK Unified Ideographs (4E00-9FFF)
    if (cp >= 0x4E00 and cp <= 0x9FFF) return true;
    // CJK Extension A (3400-4DBF)
    if (cp >= 0x3400 and cp <= 0x4DBF) return true;
    // CJK Extension B-F (20000-2EBEF)
    if (cp >= 0x20000 and cp <= 0x2EBEF) return true;
    // CJK Compatibility Ideographs (F900-FAFF)
    if (cp >= 0xF900 and cp <= 0xFAFF) return true;
    // Hangul Syllables (AC00-D7AF)
    if (cp >= 0xAC00 and cp <= 0xD7AF) return true;
    // Hangul Jamo (1100-11FF)
    if (cp >= 0x1100 and cp <= 0x11FF) return true;
    // Hiragana (3040-309F)
    if (cp >= 0x3040 and cp <= 0x309F) return true;
    // Katakana (30A0-30FF)
    if (cp >= 0x30A0 and cp <= 0x30FF) return true;
    // Katakana Phonetic Extensions (31F0-31FF)
    if (cp >= 0x31F0 and cp <= 0x31FF) return true;
    // CJK Radicals Supplement (2E80-2EFF)
    if (cp >= 0x2E80 and cp <= 0x2EFF) return true;
    // Kangxi Radicals (2F00-2FDF)
    if (cp >= 0x2F00 and cp <= 0x2FDF) return true;
    // CJK Symbols and Punctuation (3000-303F)
    if (cp >= 0x3000 and cp <= 0x303F) return true;
    // Enclosed CJK Letters and Months (3200-32FF)
    if (cp >= 0x3200 and cp <= 0x32FF) return true;
    // CJK Compatibility (3300-33FF)
    if (cp >= 0x3300 and cp <= 0x33FF) return true;
    // Fullwidth Forms (FF00-FF60, FFE0-FFE6)
    if (cp >= 0xFF00 and cp <= 0xFF60) return true;
    if (cp >= 0xFFE0 and cp <= 0xFFE6) return true;
    return false;
}

/// Slice text by visible column range, preserving ANSI sequences
/// Returns slice from start_col to end_col (exclusive)
pub fn sliceByColumn(allocator: std.mem.Allocator, text: []const u8, start_col: u32, end_col: u32) ![]u8 {
    var result = std.ArrayListUnmanaged(u8){};
    errdefer result.deinit(allocator);

    var col: u32 = 0;
    var i: usize = 0;
    var in_range = false;
    var pending_ansi = std.ArrayListUnmanaged(u8){}; // Collect ANSI before range
    defer pending_ansi.deinit(allocator);

    while (i < text.len) {
        // Check for ANSI escape
        if (text[i] == '\x1b') {
            const seq = ansi.classifySequence(text[i..]);
            if (seq.type != .not_escape and seq.type != .incomplete) {
                if (in_range or col >= start_col) {
                    // Include ANSI in output
                    try result.appendSlice(allocator, text[i .. i + seq.len]);
                } else {
                    // Save ANSI before range (might affect styling)
                    try pending_ansi.appendSlice(allocator, text[i .. i + seq.len]);
                }
                i += seq.len;
                continue;
            }
        }

        const byte = text[i];

        // Decode character
        var char_width: u32 = 1;
        var char_len: usize = 1;

        if (byte >= 0x80) {
            const decoded = decodeUtf8(text[i..]);
            if (decoded.len > 0) {
                char_len = decoded.len;
                if (isWideChar(decoded.codepoint) or isEmoji(decoded.codepoint)) {
                    char_width = 2;
                } else if (isCombiningMark(decoded.codepoint) or isVariationSelector(decoded.codepoint)) {
                    char_width = 0;
                }
            }
        } else if (byte == '\t') {
            char_width = 3;
        } else if (byte < 0x20) {
            char_width = 0;
        }

        // Check if character enters range
        if (col < start_col and col + char_width > start_col) {
            // Wide char spans into range - include pending ANSI
            try result.appendSlice(allocator, pending_ansi.items);
            pending_ansi.clearRetainingCapacity();
            in_range = true;
        } else if (col >= start_col and !in_range) {
            // Entering range
            try result.appendSlice(allocator, pending_ansi.items);
            pending_ansi.clearRetainingCapacity();
            in_range = true;
        }

        // Check if past range
        if (col >= end_col) {
            break;
        }

        // Include character if in range
        if (in_range and col + char_width <= end_col) {
            try result.appendSlice(allocator, text[i .. i + char_len]);
        } else if (in_range and col < end_col) {
            // Wide char spans past end - could include partial or skip
            // For safety, include it
            try result.appendSlice(allocator, text[i .. i + char_len]);
        }

        col += char_width;
        i += char_len;
    }

    return result.toOwnedSlice(allocator);
}

/// Wrap text to specified width, preserving ANSI sequences
pub fn wrapTextWithAnsi(allocator: std.mem.Allocator, text: []const u8, max_width: u32) !std.ArrayListUnmanaged([]u8) {
    var lines = std.ArrayListUnmanaged([]u8){};
    errdefer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }

    if (max_width == 0) return lines;

    var current_line = std.ArrayListUnmanaged(u8){};
    defer current_line.deinit(allocator);
    var current_width: u32 = 0;
    var active_style = std.ArrayListUnmanaged(u8){}; // Track active ANSI styles
    defer active_style.deinit(allocator);

    var i: usize = 0;
    while (i < text.len) {
        // Handle newlines
        if (text[i] == '\n') {
            const line_copy = try allocator.dupe(u8, current_line.items);
            try lines.append(allocator, line_copy);
            current_line.clearRetainingCapacity();
            current_width = 0;
            i += 1;
            // Prepend active style to next line
            if (active_style.items.len > 0) {
                try current_line.appendSlice(allocator, active_style.items);
            }
            continue;
        }

        // Handle ANSI sequences
        if (text[i] == '\x1b') {
            const seq = ansi.classifySequence(text[i..]);
            if (seq.type != .not_escape and seq.type != .incomplete) {
                try current_line.appendSlice(allocator, text[i .. i + seq.len]);
                // Track SGR sequences for style continuation
                if (seq.type == .csi and seq.len >= 3) {
                    const end_char = text[i + seq.len - 1];
                    if (end_char == 'm') {
                        // SGR sequence
                        if (std.mem.eql(u8, text[i .. i + seq.len], "\x1b[0m") or
                            std.mem.eql(u8, text[i .. i + seq.len], "\x1b[m"))
                        {
                            active_style.clearRetainingCapacity();
                        } else {
                            try active_style.appendSlice(allocator, text[i .. i + seq.len]);
                        }
                    }
                }
                i += seq.len;
                continue;
            }
        }

        // Calculate character width
        var char_width: u32 = 1;
        var char_len: usize = 1;

        if (text[i] >= 0x80) {
            const decoded = decodeUtf8(text[i..]);
            if (decoded.len > 0) {
                char_len = decoded.len;
                if (isWideChar(decoded.codepoint) or isEmoji(decoded.codepoint)) {
                    char_width = 2;
                } else if (isCombiningMark(decoded.codepoint) or isVariationSelector(decoded.codepoint)) {
                    char_width = 0;
                }
            }
        } else if (text[i] == '\t') {
            char_width = 3;
        } else if (text[i] < 0x20) {
            char_width = 0;
        }

        // Wrap if needed
        if (current_width + char_width > max_width and current_width > 0) {
            const line_copy = try allocator.dupe(u8, current_line.items);
            try lines.append(allocator, line_copy);
            current_line.clearRetainingCapacity();
            current_width = 0;
            // Prepend active style
            if (active_style.items.len > 0) {
                try current_line.appendSlice(allocator, active_style.items);
            }
        }

        // Append character
        try current_line.appendSlice(allocator, text[i .. i + char_len]);
        current_width += char_width;
        i += char_len;
    }

    // Final line
    if (current_line.items.len > 0) {
        const line_copy = try allocator.dupe(u8, current_line.items);
        try lines.append(allocator, line_copy);
    }

    return lines;
}

// ============ Tests ============

test "visibleWidth ASCII" {
    const width = calculateWidth("Hello, World!");
    try std.testing.expectEqual(@as(u32, 13), width);
}

test "visibleWidth empty" {
    const width = calculateWidth("");
    try std.testing.expectEqual(@as(u32, 0), width);
}

test "visibleWidth tab" {
    const width = calculateWidth("a\tb");
    try std.testing.expectEqual(@as(u32, 5), width); // a + 3 spaces + b
}

test "visibleWidth CJK" {
    // 你好 = 2 characters, each 2 columns wide
    const width = calculateWidth("你好");
    try std.testing.expectEqual(@as(u32, 4), width);
}

test "visibleWidth mixed" {
    // Hello你好 = 5 ASCII + 2 CJK (4 cols)
    const width = calculateWidth("Hello你好");
    try std.testing.expectEqual(@as(u32, 9), width);
}

test "visibleWidth emoji" {
    // 😀 = 2 columns
    const width = calculateWidth("😀");
    try std.testing.expectEqual(@as(u32, 2), width);
}

test "visibleWidth combining marks" {
    // e + combining acute = 1 column (é as two codepoints)
    const width = calculateWidth("e\u{0301}");
    try std.testing.expectEqual(@as(u32, 1), width);
}

test "visibleWidth with ANSI stripped" {
    const allocator = std.testing.allocator;
    const width = visibleWidthWithAllocator(allocator, "\x1b[31mRed\x1b[0m");
    try std.testing.expectEqual(@as(u32, 3), width);
}

test "sliceByColumn basic" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "Hello, World!", 0, 5);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("Hello", result);
}

test "sliceByColumn middle" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "Hello, World!", 7, 12);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("World", result);
}

test "sliceByColumn with ANSI" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "\x1b[31mRed\x1b[0m Text", 0, 3);
    defer allocator.free(result);
    // Should include the ANSI sequence and any subsequent ANSI before next visible char
    try std.testing.expectEqualStrings("\x1b[31mRed\x1b[0m", result);
}

test "sliceByColumn wide char" {
    const allocator = std.testing.allocator;
    const result = try sliceByColumn(allocator, "你好世界", 0, 4);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("你好", result);
}

test "wrapTextWithAnsi basic" {
    const allocator = std.testing.allocator;
    var lines = try wrapTextWithAnsi(allocator, "Hello World", 5);
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
    var lines = try wrapTextWithAnsi(allocator, "\x1b[31mRedText\x1b[0m", 3);
    defer {
        for (lines.items) |line| allocator.free(line);
        lines.deinit(allocator);
    }
    try std.testing.expectEqual(@as(usize, 3), lines.items.len);
    // First line has the style
    try std.testing.expect(std.mem.startsWith(u8, lines.items[0], "\x1b[31m"));
    // Subsequent lines should also have style prepended
    try std.testing.expect(std.mem.startsWith(u8, lines.items[1], "\x1b[31m"));
}
