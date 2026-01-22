// Box Component per God-TUI spec §4
// Container with borders and padding

const std = @import("std");
const Allocator = std.mem.Allocator;
const component_mod = @import("component.zig");
const Component = component_mod.Component;

// Inline width calculation
const WidthUtil = struct {
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
        const b0 = data[0];
        if (b0 == 0xE4 or b0 == 0xE5 or b0 == 0xE6 or b0 == 0xE7 or b0 == 0xE8 or b0 == 0xE9) return true;
        if (b0 >= 0xF0) return true;
        return false;
    }
};

pub const BorderStyle = enum {
    none,
    single,
    double,
    rounded,
    heavy,
    ascii,

    pub fn chars(self: BorderStyle) BorderChars {
        return switch (self) {
            .none => .{ .top_left = ' ', .top_right = ' ', .bottom_left = ' ', .bottom_right = ' ', .horizontal = ' ', .vertical = ' ' },
            .single => .{ .top_left = '┌', .top_right = '┐', .bottom_left = '└', .bottom_right = '┘', .horizontal = '─', .vertical = '│' },
            .double => .{ .top_left = '╔', .top_right = '╗', .bottom_left = '╚', .bottom_right = '╝', .horizontal = '═', .vertical = '║' },
            .rounded => .{ .top_left = '╭', .top_right = '╮', .bottom_left = '╰', .bottom_right = '╯', .horizontal = '─', .vertical = '│' },
            .heavy => .{ .top_left = '┏', .top_right = '┓', .bottom_left = '┗', .bottom_right = '┛', .horizontal = '━', .vertical = '┃' },
            .ascii => .{ .top_left = '+', .top_right = '+', .bottom_left = '+', .bottom_right = '+', .horizontal = '-', .vertical = '|' },
        };
    }
};

pub const BorderChars = struct {
    top_left: u21,
    top_right: u21,
    bottom_left: u21,
    bottom_right: u21,
    horizontal: u21,
    vertical: u21,
};

pub const BoxStyle = struct {
    border: BorderStyle = .single,
    padding_left: u16 = 0,
    padding_right: u16 = 0,
    padding_top: u16 = 0,
    padding_bottom: u16 = 0,
    title: ?[]const u8 = null,
};

pub const Box = struct {
    child: ?Component = null,
    style: BoxStyle = .{},
    allocator: Allocator,
    cached_lines: ?[][]const u8 = null,
    cached_width: u16 = 0,
    valid: bool = false,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .allocator = allocator,
        };
    }

    pub fn initWithStyle(allocator: Allocator, style: BoxStyle) Self {
        return .{
            .allocator = allocator,
            .style = style,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearCache();
        if (self.child) |child| {
            child.deinit(self.allocator);
        }
    }

    pub fn setChild(self: *Self, child: Component) void {
        if (self.child) |old| {
            old.deinit(self.allocator);
        }
        self.child = child;
        self.invalidate();
    }

    pub fn setStyle(self: *Self, style: BoxStyle) void {
        self.style = style;
        self.invalidate();
    }

    pub fn invalidate(self: *Self) void {
        self.valid = false;
        self.clearCache();
        if (self.child) |child| {
            child.invalidate();
        }
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

        if (width < 2) {
            return try allocator.alloc([]const u8, 0);
        }

        const chars = self.style.border.chars();
        const has_border = self.style.border != .none;
        const border_width: u16 = if (has_border) 2 else 0;
        const horiz_padding = self.style.padding_left + self.style.padding_right;
        const inner_width: u16 = if (width > border_width + horiz_padding)
            width - border_width - horiz_padding
        else
            1;

        var result = std.ArrayListUnmanaged([]const u8){};
        errdefer {
            for (result.items) |line| allocator.free(@constCast(line));
            result.deinit(allocator);
        }

        // Top border
        if (has_border) {
            const top_line = try self.buildTopBorder(allocator, width, chars);
            try result.append(allocator, top_line);
        }

        // Top padding
        for (0..self.style.padding_top) |_| {
            const pad_line = try self.buildPaddingLine(allocator, width, chars, has_border);
            try result.append(allocator, pad_line);
        }

        // Child content
        if (self.child) |child| {
            const child_lines = try child.render(inner_width, allocator);
            defer allocator.free(child_lines);
            for (child_lines) |child_line| {
                defer allocator.free(@constCast(child_line));
                const content_line = try self.buildContentLine(allocator, child_line, width, chars, has_border);
                try result.append(allocator, content_line);
            }
        }

        // Bottom padding
        for (0..self.style.padding_bottom) |_| {
            const pad_line = try self.buildPaddingLine(allocator, width, chars, has_border);
            try result.append(allocator, pad_line);
        }

        // Bottom border
        if (has_border) {
            const bottom_line = try self.buildBottomBorder(allocator, width, chars);
            try result.append(allocator, bottom_line);
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

    fn buildTopBorder(self: *const Self, allocator: Allocator, width: u16, chars: BorderChars) ![]const u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        // Top-left corner
        var corner_buf: [4]u8 = undefined;
        const corner_len = std.unicode.utf8Encode(chars.top_left, &corner_buf) catch 1;
        try line.appendSlice(allocator, corner_buf[0..corner_len]);

        // Horizontal line (possibly with title)
        const horiz_count = if (width > 2) width - 2 else 0;
        if (self.style.title) |title| {
            const title_width = WidthUtil.visibleWidth(title);
            const pre_title = if (horiz_count > title_width + 2) (horiz_count - @as(u16, @intCast(title_width)) - 2) / 2 else 0;
            const post_title = if (horiz_count > title_width + 2 + pre_title) horiz_count - pre_title - @as(u16, @intCast(title_width)) - 2 else 0;

            for (0..pre_title) |_| {
                var h_buf: [4]u8 = undefined;
                const h_len = std.unicode.utf8Encode(chars.horizontal, &h_buf) catch 1;
                try line.appendSlice(allocator, h_buf[0..h_len]);
            }
            try line.append(allocator, ' ');
            try line.appendSlice(allocator, title);
            try line.append(allocator, ' ');
            for (0..post_title) |_| {
                var h_buf: [4]u8 = undefined;
                const h_len = std.unicode.utf8Encode(chars.horizontal, &h_buf) catch 1;
                try line.appendSlice(allocator, h_buf[0..h_len]);
            }
        } else {
            for (0..horiz_count) |_| {
                var h_buf: [4]u8 = undefined;
                const h_len = std.unicode.utf8Encode(chars.horizontal, &h_buf) catch 1;
                try line.appendSlice(allocator, h_buf[0..h_len]);
            }
        }

        // Top-right corner
        const tr_len = std.unicode.utf8Encode(chars.top_right, &corner_buf) catch 1;
        try line.appendSlice(allocator, corner_buf[0..tr_len]);

        return try line.toOwnedSlice(allocator);
    }

    fn buildBottomBorder(_: *const Self, allocator: Allocator, width: u16, chars: BorderChars) ![]const u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        var corner_buf: [4]u8 = undefined;
        const bl_len = std.unicode.utf8Encode(chars.bottom_left, &corner_buf) catch 1;
        try line.appendSlice(allocator, corner_buf[0..bl_len]);

        const horiz_count = if (width > 2) width - 2 else 0;
        for (0..horiz_count) |_| {
            var h_buf: [4]u8 = undefined;
            const h_len = std.unicode.utf8Encode(chars.horizontal, &h_buf) catch 1;
            try line.appendSlice(allocator, h_buf[0..h_len]);
        }

        const br_len = std.unicode.utf8Encode(chars.bottom_right, &corner_buf) catch 1;
        try line.appendSlice(allocator, corner_buf[0..br_len]);

        return try line.toOwnedSlice(allocator);
    }

    fn buildPaddingLine(self: *const Self, allocator: Allocator, width: u16, chars: BorderChars, has_border: bool) ![]const u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        if (has_border) {
            var v_buf: [4]u8 = undefined;
            const v_len = std.unicode.utf8Encode(chars.vertical, &v_buf) catch 1;
            try line.appendSlice(allocator, v_buf[0..v_len]);
        }

        const inner = if (width > 2 and has_border) width - 2 else width;
        for (0..inner) |_| {
            try line.append(allocator, ' ');
        }

        if (has_border) {
            var v_buf: [4]u8 = undefined;
            const v_len = std.unicode.utf8Encode(chars.vertical, &v_buf) catch 1;
            try line.appendSlice(allocator, v_buf[0..v_len]);
        }

        _ = self;
        return try line.toOwnedSlice(allocator);
    }

    fn buildContentLine(self: *const Self, allocator: Allocator, content: []const u8, width: u16, chars: BorderChars, has_border: bool) ![]const u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        if (has_border) {
            var v_buf: [4]u8 = undefined;
            const v_len = std.unicode.utf8Encode(chars.vertical, &v_buf) catch 1;
            try line.appendSlice(allocator, v_buf[0..v_len]);
        }

        // Left padding
        for (0..self.style.padding_left) |_| {
            try line.append(allocator, ' ');
        }

        // Content
        try line.appendSlice(allocator, content);

        // Fill to width
        const content_width = WidthUtil.visibleWidth(content);
        const border_size: u16 = if (has_border) 2 else 0;
        const total_padding = self.style.padding_left + self.style.padding_right;
        const used = @as(u16, @intCast(content_width)) + self.style.padding_left + border_size;
        if (used < width) {
            const fill = width - used;
            for (0..fill) |_| {
                try line.append(allocator, ' ');
            }
        }

        _ = total_padding;

        if (has_border) {
            var v_buf: [4]u8 = undefined;
            const v_len = std.unicode.utf8Encode(chars.vertical, &v_buf) catch 1;
            try line.appendSlice(allocator, v_buf[0..v_len]);
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

test "Box empty render" {
    const allocator = std.testing.allocator;
    var box = Box.init(allocator);
    defer box.deinit();

    const lines = try box.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Just top and bottom border
    try std.testing.expectEqual(@as(usize, 2), lines.len);
}

test "Box with child" {
    const allocator = std.testing.allocator;
    var box = Box.init(allocator);
    defer box.deinit();

    const text_mod = @import("text.zig");
    var text = text_mod.Text.init(allocator, "Hello");
    box.setChild(text.component());

    const lines = try box.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Top border + content + bottom border
    try std.testing.expectEqual(@as(usize, 3), lines.len);
    try std.testing.expect(std.mem.indexOf(u8, lines[1], "Hello") != null);
}

test "Box with padding" {
    const allocator = std.testing.allocator;
    var box = Box.initWithStyle(allocator, .{
        .padding_top = 1,
        .padding_bottom = 1,
    });
    defer box.deinit();

    const lines = try box.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Top border + top pad + bottom pad + bottom border
    try std.testing.expectEqual(@as(usize, 4), lines.len);
}

test "Box border styles" {
    const allocator = std.testing.allocator;

    const styles = [_]BorderStyle{ .single, .double, .rounded, .heavy, .ascii };
    for (styles) |style| {
        var box = Box.initWithStyle(allocator, .{ .border = style });
        defer box.deinit();

        const lines = try box.render(10, allocator);
        defer {
            for (lines) |line| allocator.free(@constCast(line));
            allocator.free(lines);
        }

        try std.testing.expectEqual(@as(usize, 2), lines.len);
    }
}

test "Box no border" {
    const allocator = std.testing.allocator;
    var box = Box.initWithStyle(allocator, .{ .border = .none });
    defer box.deinit();

    const lines = try box.render(10, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // No borders = empty
    try std.testing.expectEqual(@as(usize, 0), lines.len);
}

test "Box with title" {
    const allocator = std.testing.allocator;
    var box = Box.initWithStyle(allocator, .{
        .title = "Title",
    });
    defer box.deinit();

    const lines = try box.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Title") != null);
}

test "Box caching" {
    const allocator = std.testing.allocator;
    var box = Box.init(allocator);
    defer box.deinit();

    const lines = try box.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }
    try std.testing.expect(box.valid);

    box.invalidate();
    try std.testing.expect(!box.valid);
}
