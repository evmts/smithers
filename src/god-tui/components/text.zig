// Text Component per God-TUI spec §4
// Word-wrapped text with optional background and padding

const std = @import("std");
const Allocator = std.mem.Allocator;
const component_mod = @import("component.zig");
const Component = component_mod.Component;

// Inline width calculation to avoid cross-module imports
const WidthUtil = struct {
    pub fn wrapTextWithAnsi(allocator: Allocator, text: []const u8, max_width: u32) !std.ArrayListUnmanaged([]u8) {
        var lines = std.ArrayListUnmanaged([]u8){};
        errdefer {
            for (lines.items) |line| allocator.free(line);
            lines.deinit(allocator);
        }

        if (max_width == 0) return lines;

        var current_line = std.ArrayListUnmanaged(u8){};
        defer current_line.deinit(allocator);
        var current_width: u32 = 0;

        var i: usize = 0;
        while (i < text.len) {
            if (text[i] == '\n') {
                const line_copy = try allocator.dupe(u8, current_line.items);
                try lines.append(allocator, line_copy);
                current_line.clearRetainingCapacity();
                current_width = 0;
                i += 1;
                continue;
            }

            // Handle ANSI sequences (zero width)
            if (text[i] == '\x1b') {
                const seq_len = classifyAnsiSequence(text[i..]);
                if (seq_len > 0) {
                    try current_line.appendSlice(allocator, text[i .. i + seq_len]);
                    i += seq_len;
                    continue;
                }
            }

            var char_width: u32 = 1;
            var char_len: usize = 1;
            if (text[i] >= 0x80) {
                char_len = utf8ByteLen(text[i]);
                char_width = if (isWideCodepoint(text[i..])) 2 else 1;
            }

            if (current_width + char_width > max_width and current_width > 0) {
                const line_copy = try allocator.dupe(u8, current_line.items);
                try lines.append(allocator, line_copy);
                current_line.clearRetainingCapacity();
                current_width = 0;
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

    fn classifyAnsiSequence(data: []const u8) usize {
        if (data.len < 2 or data[0] != '\x1b') return 0;
        const after = data[1];
        if (after == '[') {
            var i: usize = 2;
            while (i < data.len) : (i += 1) {
                if (data[i] >= 0x40 and data[i] <= 0x7E) return i + 1;
            }
        }
        if (after == ']') {
            var i: usize = 2;
            while (i < data.len) : (i += 1) {
                if (data[i] == '\x07') return i + 1;
                if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') return i + 2;
            }
        }
        return 0;
    }

    fn utf8ByteLen(first_byte: u8) usize {
        if (first_byte < 0x80) return 1;
        if (first_byte < 0xC0) return 1;
        if (first_byte < 0xE0) return 2;
        if (first_byte < 0xF0) return 3;
        return 4;
    }

    fn isWideCodepoint(data: []const u8) bool {
        if (data.len < 3) return false;
        // Check for CJK ranges (simplified)
        const b0 = data[0];
        const b1 = data[1];
        if (b0 == 0xE4 or b0 == 0xE5 or b0 == 0xE6 or b0 == 0xE7 or b0 == 0xE8 or b0 == 0xE9) {
            _ = b1;
            return true; // CJK Unified Ideographs
        }
        if (b0 >= 0xF0) return true; // Emoji and other wide chars
        return false;
    }

    pub fn visibleWidth(text: []const u8) u32 {
        var width: u32 = 0;
        var i: usize = 0;
        while (i < text.len) {
            if (text[i] == '\x1b') {
                const seq_len = classifyAnsiSequence(text[i..]);
                if (seq_len > 0) {
                    i += seq_len;
                    continue;
                }
            }
            if (text[i] >= 0x80) {
                const char_len = utf8ByteLen(text[i]);
                width += if (isWideCodepoint(text[i..])) 2 else 1;
                i += char_len;
            } else {
                width += 1;
                i += 1;
            }
        }
        return width;
    }
};

pub const TextStyle = struct {
    background: ?[]const u8 = null, // ANSI background color code
    padding_left: u16 = 0,
    padding_right: u16 = 0,
    padding_top: u16 = 0,
    padding_bottom: u16 = 0,
};

pub const Text = struct {
    content: []const u8,
    style: TextStyle = .{},
    allocator: Allocator,
    cached_lines: ?[][]const u8 = null,
    cached_width: u16 = 0,
    valid: bool = false,

    const Self = @This();
    const RESET = "\x1b[0m";

    pub fn init(allocator: Allocator, content: []const u8) Self {
        return .{
            .content = content,
            .allocator = allocator,
        };
    }

    pub fn initWithStyle(allocator: Allocator, content: []const u8, style: TextStyle) Self {
        return .{
            .content = content,
            .style = style,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearCache();
    }

    pub fn setContent(self: *Self, content: []const u8) void {
        self.content = content;
        self.invalidate();
    }

    pub fn setStyle(self: *Self, style: TextStyle) void {
        self.style = style;
        self.invalidate();
    }

    pub fn invalidate(self: *Self) void {
        self.valid = false;
        self.clearCache();
    }

    fn clearCache(self: *Self) void {
        if (self.cached_lines) |lines| {
            for (lines) |line| {
                self.allocator.free(line);
            }
            self.allocator.free(lines);
            self.cached_lines = null;
        }
    }

    pub fn render(self: *Self, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        if (self.valid and self.cached_width == width) {
            if (self.cached_lines) |lines| {
                const result = try allocator.alloc([]const u8, lines.len);
                for (lines, 0..) |line, i| {
                    result[i] = try allocator.dupe(u8, line);
                }
                return result;
            }
        }

        // Handle zero width
        if (width == 0) {
            return try allocator.alloc([]const u8, 0);
        }

        // Calculate effective width after padding
        const horiz_padding = self.style.padding_left + self.style.padding_right;
        const effective_width: u32 = if (width > horiz_padding) width - horiz_padding else 1;

        // Wrap text
        var wrapped = try WidthUtil.wrapTextWithAnsi(allocator, self.content, effective_width);
        defer {
            for (wrapped.items) |line| allocator.free(line);
            wrapped.deinit(allocator);
        }

        // Build result with padding
        var result = std.ArrayListUnmanaged([]const u8){};
        errdefer {
            for (result.items) |line| allocator.free(@constCast(line));
            result.deinit(allocator);
        }

        // Padding line (used for top/bottom)
        const pad_line = try self.buildPaddingLine(allocator, width);
        defer allocator.free(pad_line);

        // Top padding
        for (0..self.style.padding_top) |_| {
            try result.append(allocator, try allocator.dupe(u8, pad_line));
        }

        // Content lines with horizontal padding
        for (wrapped.items) |line| {
            const styled_line = try self.buildStyledLine(allocator, line, width);
            try result.append(allocator, styled_line);
        }

        // Bottom padding
        for (0..self.style.padding_bottom) |_| {
            try result.append(allocator, try allocator.dupe(u8, pad_line));
        }

        const owned = try result.toOwnedSlice(allocator);

        // Cache result
        self.clearCache();
        self.cached_lines = try self.allocator.alloc([]const u8, owned.len);
        for (owned, 0..) |line, i| {
            self.cached_lines.?[i] = try self.allocator.dupe(u8, line);
        }
        self.cached_width = width;
        self.valid = true;

        return owned;
    }

    fn buildPaddingLine(self: *const Self, allocator: Allocator, width: u16) ![]u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        if (self.style.background) |bg| {
            try line.appendSlice(allocator, bg);
        }

        for (0..width) |_| {
            try line.append(allocator, ' ');
        }

        if (self.style.background != null) {
            try line.appendSlice(allocator, RESET);
        }

        return try line.toOwnedSlice(allocator);
    }

    fn buildStyledLine(self: *const Self, allocator: Allocator, content: []const u8, width: u16) ![]const u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        if (self.style.background) |bg| {
            try line.appendSlice(allocator, bg);
        }

        // Left padding
        for (0..self.style.padding_left) |_| {
            try line.append(allocator, ' ');
        }

        // Content
        try line.appendSlice(allocator, content);

        // Right padding + fill to width
        const content_width = WidthUtil.visibleWidth(content);
        const used = self.style.padding_left + content_width;
        if (used < width) {
            const remaining = width - @as(u16, @intCast(used));
            for (0..remaining) |_| {
                try line.append(allocator, ' ');
            }
        }

        if (self.style.background != null) {
            try line.appendSlice(allocator, RESET);
        }

        return try line.toOwnedSlice(allocator);
    }

    /// Convert to Component interface
    pub fn component(self: *Self) Component {
        return .{
            .ptr = self,
            .vtable = &vtable,
        };
    }

    const vtable = Component.VTable{
        .render = renderVtable,
        .invalidate = invalidateVtable,
        .deinit = deinitVtable,
    };

    fn renderVtable(ptr: *anyopaque, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        const self: *Self = @ptrCast(@alignCast(ptr));
        return self.render(width, allocator);
    }

    fn invalidateVtable(ptr: *anyopaque) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.invalidate();
    }

    fn deinitVtable(ptr: *anyopaque, _: Allocator) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.deinit();
    }
};

// ============ Tests ============

test "Text simple render" {
    const allocator = std.testing.allocator;
    var text = Text.init(allocator, "Hello");
    defer text.deinit();

    const lines = try text.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Hello") != null);
}

test "Text word wrap" {
    const allocator = std.testing.allocator;
    var text = Text.init(allocator, "Hello World");
    defer text.deinit();

    const lines = try text.render(5, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 3), lines.len);
}

test "Text empty" {
    const allocator = std.testing.allocator;
    var text = Text.init(allocator, "");
    defer text.deinit();

    const lines = try text.render(80, allocator);
    defer allocator.free(lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}

test "Text width zero" {
    const allocator = std.testing.allocator;
    var text = Text.init(allocator, "Hello");
    defer text.deinit();

    const lines = try text.render(0, allocator);
    defer allocator.free(lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}

test "Text with padding" {
    const allocator = std.testing.allocator;
    var text = Text.initWithStyle(allocator, "Hi", .{
        .padding_top = 1,
        .padding_bottom = 1,
        .padding_left = 2,
    });
    defer text.deinit();

    const lines = try text.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // 1 top + 1 content + 1 bottom
    try std.testing.expectEqual(@as(usize, 3), lines.len);
}

test "Text with background" {
    const allocator = std.testing.allocator;
    var text = Text.initWithStyle(allocator, "Test", .{
        .background = "\x1b[44m", // Blue background
    });
    defer text.deinit();

    const lines = try text.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expect(std.mem.startsWith(u8, lines[0], "\x1b[44m"));
    try std.testing.expect(std.mem.endsWith(u8, lines[0], "\x1b[0m"));
}

test "Text caching" {
    const allocator = std.testing.allocator;
    var text = Text.init(allocator, "Cached");
    defer text.deinit();

    // First render
    const lines1 = try text.render(80, allocator);
    defer {
        for (lines1) |line| allocator.free(@constCast(line));
        allocator.free(lines1);
    }

    // Second render should use cache
    const lines2 = try text.render(80, allocator);
    defer {
        for (lines2) |line| allocator.free(@constCast(line));
        allocator.free(lines2);
    }

    try std.testing.expectEqualStrings(lines1[0], lines2[0]);
}

test "Text invalidation clears cache" {
    const allocator = std.testing.allocator;
    var text = Text.init(allocator, "Original");
    defer text.deinit();

    const lines = try text.render(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }
    // Cache populated but we'll test invalidation works
    try std.testing.expect(text.valid);

    text.invalidate();
    try std.testing.expect(!text.valid);
    try std.testing.expect(text.cached_lines == null);
}
