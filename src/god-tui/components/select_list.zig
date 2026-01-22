// SelectList Component per God-TUI spec §4
// Scrollable selection list with wrap-around navigation

const std = @import("std");
const Allocator = std.mem.Allocator;
const component_mod = @import("component.zig");
const Component = component_mod.Component;
const Focusable = component_mod.Focusable;

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

pub const SelectListStyle = struct {
    selected_prefix: []const u8 = "> ",
    unselected_prefix: []const u8 = "  ",
    selected_style: ?[]const u8 = "\x1b[7m", // Reverse video
    focused_style: ?[]const u8 = "\x1b[1m", // Bold when focused
    max_visible: ?u16 = null, // Viewport height (null = show all)
};

pub const SelectList = struct {
    items: std.ArrayListUnmanaged([]const u8),
    selected_index: usize = 0,
    scroll_offset: usize = 0,
    style: SelectListStyle = .{},
    allocator: Allocator,
    focused: bool = false,
    on_select: ?*const fn (index: usize, item: []const u8) void = null,

    const Self = @This();
    const RESET = "\x1b[0m";

    pub fn init(allocator: Allocator) Self {
        return .{
            .items = .{},
            .allocator = allocator,
        };
    }

    pub fn initWithItems(allocator: Allocator, items: []const []const u8) !Self {
        var self = Self.init(allocator);
        for (items) |item| {
            try self.items.append(allocator, try allocator.dupe(u8, item));
        }
        return self;
    }

    pub fn deinit(self: *Self) void {
        for (self.items.items) |item| {
            self.allocator.free(item);
        }
        self.items.deinit(self.allocator);
    }

    pub fn addItem(self: *Self, item: []const u8) !void {
        try self.items.append(self.allocator, try self.allocator.dupe(u8, item));
    }

    pub fn clear(self: *Self) void {
        for (self.items.items) |item| {
            self.allocator.free(item);
        }
        self.items.clearRetainingCapacity();
        self.selected_index = 0;
        self.scroll_offset = 0;
    }

    pub fn itemCount(self: *const Self) usize {
        return self.items.items.len;
    }

    pub fn selectedIndex(self: *const Self) usize {
        return self.selected_index;
    }

    pub fn selectedItem(self: *const Self) ?[]const u8 {
        if (self.items.items.len == 0) return null;
        return self.items.items[self.selected_index];
    }

    pub fn setSelectedIndex(self: *Self, index: usize) void {
        if (self.items.items.len == 0) return;
        self.selected_index = @min(index, self.items.items.len - 1);
        self.ensureVisible();
    }

    /// Move selection up with wrap-around
    pub fn moveUp(self: *Self) void {
        if (self.items.items.len == 0) return;
        if (self.selected_index == 0) {
            self.selected_index = self.items.items.len - 1;
        } else {
            self.selected_index -= 1;
        }
        self.ensureVisible();
    }

    /// Move selection down with wrap-around
    pub fn moveDown(self: *Self) void {
        if (self.items.items.len == 0) return;
        self.selected_index = (self.selected_index + 1) % self.items.items.len;
        self.ensureVisible();
    }

    /// Select current item (triggers callback)
    pub fn select(self: *Self) void {
        if (self.on_select) |callback| {
            if (self.selectedItem()) |item| {
                callback(self.selected_index, item);
            }
        }
    }

    fn ensureVisible(self: *Self) void {
        const max_visible = self.style.max_visible orelse return;
        if (max_visible == 0) return;

        if (self.selected_index < self.scroll_offset) {
            self.scroll_offset = self.selected_index;
        } else if (self.selected_index >= self.scroll_offset + max_visible) {
            self.scroll_offset = self.selected_index - max_visible + 1;
        }
    }

    pub fn setFocused(self: *Self, focused: bool) void {
        self.focused = focused;
    }

    pub fn invalidate(_: *Self) void {}

    pub fn handleInput(self: *Self, data: []const u8) void {
        // Arrow key handling
        if (data.len >= 3 and data[0] == '\x1b' and data[1] == '[') {
            switch (data[2]) {
                'A' => self.moveUp(), // Up arrow
                'B' => self.moveDown(), // Down arrow
                else => {},
            }
        } else if (data.len == 1) {
            switch (data[0]) {
                'k', 'K' => self.moveUp(),
                'j', 'J' => self.moveDown(),
                '\r', '\n' => self.select(), // Enter
                else => {},
            }
        }
    }

    pub fn render(self: *Self, width: u16, allocator: Allocator) Component.RenderError![][]const u8 {
        if (self.items.items.len == 0) {
            return try allocator.alloc([]const u8, 0);
        }

        const max_visible = self.style.max_visible orelse @as(u16, @intCast(self.items.items.len));
        const visible_count = @min(max_visible, @as(u16, @intCast(self.items.items.len)));
        const end_index = @min(self.scroll_offset + visible_count, self.items.items.len);

        var result = std.ArrayListUnmanaged([]const u8){};
        errdefer {
            for (result.items) |line| allocator.free(@constCast(line));
            result.deinit(allocator);
        }

        for (self.scroll_offset..end_index) |i| {
            const item = self.items.items[i];
            const is_selected = i == self.selected_index;
            const line = try self.renderItem(allocator, item, is_selected, width);
            try result.append(allocator, line);
        }

        return try result.toOwnedSlice(allocator);
    }

    fn renderItem(self: *const Self, allocator: Allocator, item: []const u8, is_selected: bool, width: u16) ![]const u8 {
        var line = std.ArrayListUnmanaged(u8){};
        errdefer line.deinit(allocator);

        // Apply styles
        if (is_selected) {
            if (self.style.selected_style) |style| {
                try line.appendSlice(allocator, style);
            }
        }
        if (self.focused) {
            if (self.style.focused_style) |style| {
                try line.appendSlice(allocator, style);
            }
        }

        // Prefix
        const prefix = if (is_selected) self.style.selected_prefix else self.style.unselected_prefix;
        try line.appendSlice(allocator, prefix);

        // Item text
        try line.appendSlice(allocator, item);

        // Pad to width
        const prefix_width = WidthUtil.visibleWidth(prefix);
        const item_width = WidthUtil.visibleWidth(item);
        const used = prefix_width + item_width;
        if (used < width) {
            const padding = width - @as(u16, @intCast(used));
            for (0..padding) |_| {
                try line.append(allocator, ' ');
            }
        }

        // Reset if styled
        if (is_selected or self.focused) {
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

    /// Convert to Focusable interface
    pub fn focusable(self: *Self) Focusable {
        return .{
            .component = self.component(),
            .focused = self.focused,
        };
    }

    const vtable = Component.VTable{
        .render = renderVtable,
        .invalidate = invalidateVtable,
        .handleInput = handleInputVtable,
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

    fn handleInputVtable(ptr: *anyopaque, data: []const u8) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.handleInput(data);
    }

    fn deinitVtable(ptr: *anyopaque, _: Allocator) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.deinit();
    }
};

// ============ Tests ============

test "SelectList empty" {
    const allocator = std.testing.allocator;
    var list = SelectList.init(allocator);
    defer list.deinit();

    try std.testing.expectEqual(@as(usize, 0), list.itemCount());
    try std.testing.expectEqual(@as(?[]const u8, null), list.selectedItem());

    const lines = try list.render(80, allocator);
    defer allocator.free(lines);
    try std.testing.expectEqual(@as(usize, 0), lines.len);
}

test "SelectList add items" {
    const allocator = std.testing.allocator;
    var list = SelectList.init(allocator);
    defer list.deinit();

    try list.addItem("Item 1");
    try list.addItem("Item 2");
    try list.addItem("Item 3");

    try std.testing.expectEqual(@as(usize, 3), list.itemCount());
    try std.testing.expectEqualStrings("Item 1", list.selectedItem().?);
}

test "SelectList navigation" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B", "C" });
    defer list.deinit();

    try std.testing.expectEqual(@as(usize, 0), list.selectedIndex());

    list.moveDown();
    try std.testing.expectEqual(@as(usize, 1), list.selectedIndex());

    list.moveDown();
    try std.testing.expectEqual(@as(usize, 2), list.selectedIndex());

    list.moveUp();
    try std.testing.expectEqual(@as(usize, 1), list.selectedIndex());
}

test "SelectList wrap-around down" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B", "C" });
    defer list.deinit();

    list.setSelectedIndex(2); // Last item
    list.moveDown(); // Should wrap to first
    try std.testing.expectEqual(@as(usize, 0), list.selectedIndex());
}

test "SelectList wrap-around up" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B", "C" });
    defer list.deinit();

    try std.testing.expectEqual(@as(usize, 0), list.selectedIndex());
    list.moveUp(); // Should wrap to last
    try std.testing.expectEqual(@as(usize, 2), list.selectedIndex());
}

test "SelectList render" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "First", "Second" });
    defer list.deinit();

    const lines = try list.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 2), lines.len);
    // First item should have selected prefix
    try std.testing.expect(std.mem.indexOf(u8, lines[0], ">") != null);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "First") != null);
}

test "SelectList viewport scrolling" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B", "C", "D", "E" });
    defer list.deinit();
    list.style.max_visible = 3;

    // Initially shows A, B, C
    try std.testing.expectEqual(@as(usize, 0), list.scroll_offset);

    // Move to D
    list.setSelectedIndex(3);
    try std.testing.expectEqual(@as(usize, 1), list.scroll_offset); // B, C, D visible

    // Move to E
    list.setSelectedIndex(4);
    try std.testing.expectEqual(@as(usize, 2), list.scroll_offset); // C, D, E visible
}

test "SelectList keyboard input" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B", "C" });
    defer list.deinit();

    // j = down
    list.handleInput("j");
    try std.testing.expectEqual(@as(usize, 1), list.selectedIndex());

    // k = up
    list.handleInput("k");
    try std.testing.expectEqual(@as(usize, 0), list.selectedIndex());

    // Arrow down
    list.handleInput("\x1b[B");
    try std.testing.expectEqual(@as(usize, 1), list.selectedIndex());

    // Arrow up
    list.handleInput("\x1b[A");
    try std.testing.expectEqual(@as(usize, 0), list.selectedIndex());
}

test "SelectList selection highlighting" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B" });
    defer list.deinit();

    list.moveDown(); // Select B

    const lines = try list.render(20, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    // Second line (B) should have reverse video style
    try std.testing.expect(std.mem.indexOf(u8, lines[1], "\x1b[7m") != null);
}

test "SelectList clear" {
    const allocator = std.testing.allocator;
    var list = try SelectList.initWithItems(allocator, &.{ "A", "B", "C" });
    defer list.deinit();

    list.setSelectedIndex(2);
    list.clear();

    try std.testing.expectEqual(@as(usize, 0), list.itemCount());
    try std.testing.expectEqual(@as(usize, 0), list.selectedIndex());
}
