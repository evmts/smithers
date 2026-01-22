// Header Component per God-TUI spec §5 (Phase 11)
// Display: god-agent v0.1.0 │ claude-sonnet-4 │ session: abc123

const std = @import("std");
const Allocator = std.mem.Allocator;

pub const RenderError = error{OutOfMemory};

pub const HeaderComponent = struct {
    version: []const u8,
    model: []const u8,
    session_id: ?[]const u8,
    allocator: Allocator,
    cached_line: ?[]const u8 = null,
    cached_width: u32 = 0,
    valid: bool = false,

    const Self = @This();
    const SEPARATOR = " │ ";
    const DIM = "\x1b[2m";
    const BOLD = "\x1b[1m";
    const RESET = "\x1b[0m";

    pub fn init(allocator: Allocator, version: []const u8, model: []const u8) Self {
        return .{
            .version = version,
            .model = model,
            .session_id = null,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearCache();
    }

    pub fn setSessionId(self: *Self, session_id: ?[]const u8) void {
        self.session_id = session_id;
        self.invalidate();
    }

    pub fn setModel(self: *Self, model: []const u8) void {
        self.model = model;
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

        // Build header content
        var content = std.ArrayListUnmanaged(u8){};
        defer content.deinit(allocator);

        // god-agent vX.X.X
        try content.appendSlice(allocator, BOLD);
        try content.appendSlice(allocator, "god-agent");
        try content.appendSlice(allocator, RESET);
        try content.appendSlice(allocator, " v");
        try content.appendSlice(allocator, self.version);

        // │ model
        try content.appendSlice(allocator, DIM);
        try content.appendSlice(allocator, SEPARATOR);
        try content.appendSlice(allocator, RESET);
        try content.appendSlice(allocator, self.model);

        // │ session: id (if present)
        if (self.session_id) |sid| {
            try content.appendSlice(allocator, DIM);
            try content.appendSlice(allocator, SEPARATOR);
            try content.appendSlice(allocator, RESET);
            try content.appendSlice(allocator, "session: ");
            try content.appendSlice(allocator, sid);
        }

        // Pad to width
        const visible_len = self.visibleWidth(content.items);
        if (visible_len < width) {
            const padding = width - visible_len;
            try content.appendNTimes(allocator, ' ', padding);
        }

        const result = try allocator.alloc([]const u8, 1);
        result[0] = try allocator.dupe(u8, content.items);
        return result;
    }

    fn visibleWidth(self: *const Self, text: []const u8) u32 {
        _ = self;
        var width: u32 = 0;
        var i: usize = 0;
        while (i < text.len) {
            if (text[i] == '\x1b') {
                // Skip ANSI escape sequence
                i += 1;
                if (i < text.len and text[i] == '[') {
                    i += 1;
                    while (i < text.len and text[i] >= 0x30 and text[i] <= 0x3F) : (i += 1) {}
                    while (i < text.len and text[i] >= 0x20 and text[i] <= 0x2F) : (i += 1) {}
                    if (i < text.len) i += 1; // final byte
                }
                continue;
            }
            if (text[i] >= 0x80) {
                // UTF-8 character
                const char_len = utf8ByteLen(text[i]);
                width += 1;
                i += char_len;
            } else {
                width += 1;
                i += 1;
            }
        }
        return width;
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

test "HeaderComponent render" {
    const allocator = std.testing.allocator;
    var header = HeaderComponent.init(allocator, "0.1.0", "claude-sonnet-4");
    defer header.deinit();

    const lines = try header.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "god-agent") != null);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "0.1.0") != null);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "claude-sonnet-4") != null);
}

test "HeaderComponent with session" {
    const allocator = std.testing.allocator;
    var header = HeaderComponent.init(allocator, "0.1.0", "claude-sonnet-4");
    defer header.deinit();

    header.setSessionId("abc123");

    const lines = try header.renderWithAllocator(100, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expectEqual(@as(usize, 1), lines.len);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "session: abc123") != null);
}

test "HeaderComponent zero width" {
    const allocator = std.testing.allocator;
    var header = HeaderComponent.init(allocator, "0.1.0", "claude-sonnet-4");
    defer header.deinit();

    const lines = try header.renderWithAllocator(0, allocator);
    defer allocator.free(lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}

test "HeaderComponent model update" {
    const allocator = std.testing.allocator;
    var header = HeaderComponent.init(allocator, "0.1.0", "claude-sonnet-4");
    defer header.deinit();

    header.setModel("gpt-4");

    const lines = try header.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.indexOf(u8, lines[0], "gpt-4") != null);
}
