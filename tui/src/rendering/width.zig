// Width calculation for terminal rendering
// Handles visible width calculation with grapheme segmentation and East Asian Width

const std = @import("std");

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

const CacheEntry = struct {
    key_hash: u64,
    width: u32,
    valid: bool = false,
};

pub const WidthCache = struct {
    entries: [512]CacheEntry = [_]CacheEntry{.{ .key_hash = 0, .width = 0, .valid = false }} ** 512,
    next_evict: u9 = 0,

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

var global_cache: WidthCache = .{};

pub fn visibleWidth(text: []const u8) u32 {
    return visibleWidthWithAllocator(std.heap.page_allocator, text);
}

pub fn visibleWidthWithAllocator(allocator: std.mem.Allocator, text: []const u8) u32 {
    if (text.len == 0) return 0;

    const hash = std.hash.Wyhash.hash(0, text);
    if (global_cache.get(hash)) |cached| {
        return cached;
    }

    const stripped = stripAnsi(allocator, text) catch {
        return simpleWidth(text);
    };
    defer allocator.free(stripped);

    const width = calculateWidth(stripped);
    global_cache.put(hash, width);
    return width;
}

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
            i += 1;
            continue;
        }

        const codepoint = codepoint_result.codepoint;
        const char_len = codepoint_result.len;

        if (isCombiningMark(codepoint)) {
            i += char_len;
            continue;
        }

        if (isVariationSelector(codepoint)) {
            i += char_len;
            continue;
        }

        // Zero-width joiners
        if (codepoint == 0x200D) {
            i += char_len;
            continue;
        }

        // Emoji detection (RGI_Emoji = 2 columns)
        if (isEmoji(codepoint)) {
            width += 2;
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

fn simpleWidth(text: []const u8) u32 {
    var width: u32 = 0;
    for (text) |byte| {
        if (byte == '\x1b') continue;
        if (byte >= 0x20 and byte <= 0x7E) width += 1;
        if (byte == '\t') width += 3;
    }
    return width;
}

const DecodeResult = struct { codepoint: u21, len: usize };

fn decodeUtf8(bytes: []const u8) DecodeResult {
    if (bytes.len == 0) return .{ .codepoint = 0, .len = 0 };

    const byte0 = bytes[0];

    if (byte0 < 0x80) {
        return .{ .codepoint = byte0, .len = 1 };
    }

    if (byte0 >= 0xC0 and byte0 < 0xE0) {
        if (bytes.len < 2) return .{ .codepoint = 0, .len = 0 };
        const cp = (@as(u21, byte0 & 0x1F) << 6) | @as(u21, bytes[1] & 0x3F);
        return .{ .codepoint = cp, .len = 2 };
    }

    if (byte0 >= 0xE0 and byte0 < 0xF0) {
        if (bytes.len < 3) return .{ .codepoint = 0, .len = 0 };
        const cp = (@as(u21, byte0 & 0x0F) << 12) |
            (@as(u21, bytes[1] & 0x3F) << 6) |
            @as(u21, bytes[2] & 0x3F);
        return .{ .codepoint = cp, .len = 3 };
    }

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

fn isCombiningMark(cp: u21) bool {
    if (cp >= 0x0300 and cp <= 0x036F) return true;
    if (cp >= 0x1AB0 and cp <= 0x1AFF) return true;
    if (cp >= 0x1DC0 and cp <= 0x1DFF) return true;
    if (cp >= 0xFE20 and cp <= 0xFE2F) return true;
    if (cp >= 0x20D0 and cp <= 0x20FF) return true;
    return false;
}

fn isVariationSelector(cp: u21) bool {
    if (cp >= 0xFE00 and cp <= 0xFE0F) return true;
    if (cp >= 0xE0100 and cp <= 0xE01EF) return true;
    return false;
}

fn isEmoji(cp: u21) bool {
    if (cp >= 0x1F600 and cp <= 0x1F64F) return true;
    if (cp >= 0x1F300 and cp <= 0x1F5FF) return true;
    if (cp >= 0x1F680 and cp <= 0x1F6FF) return true;
    if (cp >= 0x1F900 and cp <= 0x1F9FF) return true;
    if (cp >= 0x1FA00 and cp <= 0x1FA6F) return true;
    if (cp >= 0x2700 and cp <= 0x27BF) return true;
    if (cp >= 0x2600 and cp <= 0x26FF) return true;
    if (cp >= 0x1F1E0 and cp <= 0x1F1FF) return true;
    return false;
}

fn skipEmojiModifiers(text: []const u8, start: usize) usize {
    var i = start;
    while (i < text.len) {
        const result = decodeUtf8(text[i..]);
        if (result.len == 0) break;

        const cp = result.codepoint;

        if (cp >= 0x1F3FB and cp <= 0x1F3FF) {
            i += result.len;
            continue;
        }

        if (isVariationSelector(cp)) {
            i += result.len;
            continue;
        }

        if (cp == 0x200D) {
            i += result.len;
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

fn isWideChar(cp: u21) bool {
    if (cp >= 0x4E00 and cp <= 0x9FFF) return true;
    if (cp >= 0x3400 and cp <= 0x4DBF) return true;
    if (cp >= 0x20000 and cp <= 0x2EBEF) return true;
    if (cp >= 0xF900 and cp <= 0xFAFF) return true;
    if (cp >= 0xAC00 and cp <= 0xD7AF) return true;
    if (cp >= 0x1100 and cp <= 0x11FF) return true;
    if (cp >= 0x3040 and cp <= 0x309F) return true;
    if (cp >= 0x30A0 and cp <= 0x30FF) return true;
    if (cp >= 0x31F0 and cp <= 0x31FF) return true;
    if (cp >= 0x2E80 and cp <= 0x2EFF) return true;
    if (cp >= 0x2F00 and cp <= 0x2FDF) return true;
    if (cp >= 0x3000 and cp <= 0x303F) return true;
    if (cp >= 0x3200 and cp <= 0x32FF) return true;
    if (cp >= 0x3300 and cp <= 0x33FF) return true;
    if (cp >= 0xFF00 and cp <= 0xFF60) return true;
    if (cp >= 0xFFE0 and cp <= 0xFFE6) return true;
    return false;
}

pub fn sliceByColumn(allocator: std.mem.Allocator, text: []const u8, start_col: u32, end_col: u32) ![]u8 {
    var result = std.ArrayListUnmanaged(u8){};
    errdefer result.deinit(allocator);

    var col: u32 = 0;
    var i: usize = 0;
    var in_range = false;
    var pending_ansi = std.ArrayListUnmanaged(u8){};
    defer pending_ansi.deinit(allocator);

    while (i < text.len) {
        if (text[i] == '\x1b') {
            const seq = classifySequence(text[i..]);
            if (seq.type != .not_escape and seq.type != .incomplete) {
                if (in_range or col >= start_col) {
                    try result.appendSlice(allocator, text[i .. i + seq.len]);
                } else {
                    try pending_ansi.appendSlice(allocator, text[i .. i + seq.len]);
                }
                i += seq.len;
                continue;
            }
        }

        const byte = text[i];

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

        if (col < start_col and col + char_width > start_col) {
            try result.appendSlice(allocator, pending_ansi.items);
            pending_ansi.clearRetainingCapacity();
            in_range = true;
        } else if (col >= start_col and !in_range) {
            try result.appendSlice(allocator, pending_ansi.items);
            pending_ansi.clearRetainingCapacity();
            in_range = true;
        }

        if (col >= end_col) {
            break;
        }

        if (in_range and col + char_width <= end_col) {
            try result.appendSlice(allocator, text[i .. i + char_len]);
        } else if (in_range and col < end_col) {
            try result.appendSlice(allocator, text[i .. i + char_len]);
        }

        col += char_width;
        i += char_len;
    }

    return result.toOwnedSlice(allocator);
}

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
    var active_style = std.ArrayListUnmanaged(u8){};
    defer active_style.deinit(allocator);

    var i: usize = 0;
    while (i < text.len) {
        if (text[i] == '\n') {
            const line_copy = try allocator.dupe(u8, current_line.items);
            try lines.append(allocator, line_copy);
            current_line.clearRetainingCapacity();
            current_width = 0;
            i += 1;
            if (active_style.items.len > 0) {
                try current_line.appendSlice(allocator, active_style.items);
            }
            continue;
        }

        if (text[i] == '\x1b') {
            const seq = classifySequence(text[i..]);
            if (seq.type != .not_escape and seq.type != .incomplete) {
                try current_line.appendSlice(allocator, text[i .. i + seq.len]);
                if (seq.type == .csi and seq.len >= 3) {
                    const end_char = text[i + seq.len - 1];
                    if (end_char == 'm') {
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

        if (current_width + char_width > max_width and current_width > 0) {
            const line_copy = try allocator.dupe(u8, current_line.items);
            try lines.append(allocator, line_copy);
            current_line.clearRetainingCapacity();
            current_width = 0;
            if (active_style.items.len > 0) {
                try current_line.appendSlice(allocator, active_style.items);
            }
        }

        try current_line.appendSlice(allocator, text[i .. i + char_len]);
        current_width += char_width;
        i += char_len;
    }

    if (current_line.items.len > 0) {
        const line_copy = try allocator.dupe(u8, current_line.items);
        try lines.append(allocator, line_copy);
    }

    return lines;
}
