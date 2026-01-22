// Status Bar per God-TUI spec §5 (Phase 11)
// Display: Ctrl+C: Cancel │ Ctrl+L: Clear │ /help: Commands │ ↑↓: History

const std = @import("std");
const Allocator = std.mem.Allocator;

pub const RenderError = error{OutOfMemory};

pub const StatusBar = struct {
    allocator: Allocator,
    custom_status: ?[]const u8 = null,
    is_busy: bool = false,
    cached_line: ?[]const u8 = null,
    cached_width: u32 = 0,
    valid: bool = false,

    const Self = @This();
    const SEPARATOR = " │ ";
    const DIM = "\x1b[2m";
    const RESET = "\x1b[0m";
    const INVERT = "\x1b[7m";

    pub fn init(allocator: Allocator) Self {
        return .{
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearCache();
    }

    pub fn setBusy(self: *Self, busy: bool) void {
        self.is_busy = busy;
        self.invalidate();
    }

    pub fn setCustomStatus(self: *Self, status: ?[]const u8) void {
        self.custom_status = status;
        self.invalidate();
    }

    pub fn invalidate(self: *Self) void {
        self.valid = false;
        self.clearCache();
    }

    fn clearCache(self: *Self) void {
        if (self.cached_line) |line| {
            self.allocator.free(line);
            self.cached_line = null;
        }
    }

    pub fn render(self: *Self, width: u32) ![][]const u8 {
        return self.renderWithAllocator(width, self.allocator);
    }

    pub fn renderWithAllocator(self: *Self, width: u32, allocator: Allocator) RenderError![][]const u8 {
        if (width == 0) {
            return try allocator.alloc([]const u8, 0);
        }

        var content = std.ArrayListUnmanaged(u8){};
        defer content.deinit(allocator);

        try content.appendSlice(allocator, INVERT);

        if (self.custom_status) |status| {
            try content.appendSlice(allocator, status);
        } else if (self.is_busy) {
            try content.appendSlice(allocator, "Processing...");
        } else {
            // Default keybinding hints
            try content.appendSlice(allocator, "Ctrl+C: Cancel");
            try content.appendSlice(allocator, SEPARATOR);
            try content.appendSlice(allocator, "Ctrl+L: Clear");
            try content.appendSlice(allocator, SEPARATOR);
            try content.appendSlice(allocator, "/help: Commands");
            try content.appendSlice(allocator, SEPARATOR);
            try content.appendSlice(allocator, "↑↓: History");
        }

        // Pad to width
        const visible_len = self.visibleWidth(content.items);
        if (visible_len < width) {
            const padding = width - visible_len;
            try content.appendNTimes(allocator, ' ', padding);
        }

        try content.appendSlice(allocator, RESET);

        const result = try allocator.alloc([]const u8, 1);
        result[0] = try allocator.dupe(u8, content.items);
        return result;
    }

    fn visibleWidth(self: *const Self, text: []const u8) u32 {
        _ = self;
        var vis_width: u32 = 0;
        var i: usize = 0;
        while (i < text.len) {
            if (text[i] == '\x1b') {
                i += 1;
                if (i < text.len and text[i] == '[') {
                    i += 1;
                    while (i < text.len and text[i] >= 0x30 and text[i] <= 0x3F) : (i += 1) {}
                    while (i < text.len and text[i] >= 0x20 and text[i] <= 0x2F) : (i += 1) {}
                    if (i < text.len) i += 1;
                }
                continue;
            }
            if (text[i] >= 0x80) {
                const char_len = utf8ByteLen(text[i]);
                // Check for wide chars (arrows etc)
                if (text[i] == 0xE2) vis_width += 1 else vis_width += 1;
                i += char_len;
            } else {
                vis_width += 1;
                i += 1;
            }
        }
        return vis_width;
    }

    fn utf8ByteLen(first_byte: u8) usize {
        if (first_byte < 0x80) return 1;
        if (first_byte < 0xC0) return 1;
        if (first_byte < 0xE0) return 2;
        if (first_byte < 0xF0) return 3;
        return 4;
    }

};

// ============ Tests ============

test "StatusBar render" {
    const allocator = std.testing.allocator;
    var status = StatusBar.init(allocator);
    defer status.deinit();

    const lines = try status.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Ctrl+C") != null);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Ctrl+L") != null);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "/help") != null);
}

test "StatusBar busy state" {
    const allocator = std.testing.allocator;
    var status = StatusBar.init(allocator);
    defer status.deinit();

    status.setBusy(true);

    const lines = try status.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Processing") != null);
}

test "StatusBar custom status" {
    const allocator = std.testing.allocator;
    var status = StatusBar.init(allocator);
    defer status.deinit();

    status.setCustomStatus("Running tools...");

    const lines = try status.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Running tools") != null);
}

test "StatusBar zero width" {
    const allocator = std.testing.allocator;
    var status = StatusBar.init(allocator);
    defer status.deinit();

    const lines = try status.renderWithAllocator(0, allocator);
    defer allocator.free(lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}
