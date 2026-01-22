// Terminal Abstraction Layer
// Reference: issues/god-tui/02-terminal-abstraction.md

const std = @import("std");
const builtin = @import("builtin");
const ansi = @import("ansi.zig");
const keys = @import("keys.zig");
const StdinBuffer = @import("stdin_buffer.zig").StdinBuffer;

pub const Terminal = struct {
    const Self = @This();

    allocator: std.mem.Allocator,

    // Dimensions
    columns: u16 = 80,
    rows: u16 = 24,

    // Protocol state
    kitty_protocol_active: bool = false,
    cell_pixel_width: ?u16 = null,
    cell_pixel_height: ?u16 = null,

    // Internal state
    was_raw: bool = false,
    stdin_buffer: StdinBuffer,
    output_buffer: std.ArrayListUnmanaged(u8),

    // Callbacks
    on_input: ?*const fn (data: []const u8, ctx: ?*anyopaque) void = null,
    on_resize: ?*const fn (ctx: ?*anyopaque) void = null,
    callback_ctx: ?*anyopaque = null,

    // File handles
    stdin: std.posix.fd_t,
    stdout: std.posix.fd_t,

    // Original terminal state (for restore)
    original_termios: ?std.posix.termios = null,

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .allocator = allocator,
            .stdin_buffer = StdinBuffer.init(allocator),
            .output_buffer = .{},
            .stdin = std.io.getStdIn().handle,
            .stdout = std.io.getStdOut().handle,
        };
    }

    pub fn deinit(self: *Self) void {
        self.stop();
        self.stdin_buffer.deinit();
        self.output_buffer.deinit(self.allocator);
    }

    // Start terminal in raw mode with protocol negotiation
    pub fn start(
        self: *Self,
        on_input: ?*const fn (data: []const u8, ctx: ?*anyopaque) void,
        on_resize: ?*const fn (ctx: ?*anyopaque) void,
        ctx: ?*anyopaque,
    ) !void {
        self.on_input = on_input;
        self.on_resize = on_resize;
        self.callback_ctx = ctx;

        // Get current dimensions
        self.updateDimensions();

        // Enable raw mode
        try self.enableRawMode();

        // Setup stdin buffer callbacks
        self.stdin_buffer.setCallbacks(
            inputDataCallback,
            inputPasteCallback,
            @ptrCast(self),
        );

        // Write start sequence
        try self.output_buffer.appendSlice(self.allocator, ansi.BRACKETED_PASTE_ENABLE);
        try self.output_buffer.appendSlice(self.allocator, ansi.KITTY_QUERY);
        try self.output_buffer.appendSlice(self.allocator, ansi.CELL_SIZE_QUERY);
        try self.flush();
    }

    fn inputDataCallback(data: []const u8, ctx: ?*anyopaque) void {
        const self: *Self = @ptrCast(@alignCast(ctx));
        if (self.on_input) |cb| {
            cb(data, self.callback_ctx);
        }
    }

    fn inputPasteCallback(content: []const u8, ctx: ?*anyopaque) void {
        // Paste content delivered as single input event
        const self: *Self = @ptrCast(@alignCast(ctx));
        if (self.on_input) |cb| {
            cb(content, self.callback_ctx);
        }
    }

    // Stop terminal and restore state
    pub fn stop(self: *Self) void {
        // Write stop sequence
        if (self.kitty_protocol_active) {
            self.output_buffer.appendSlice(self.allocator, ansi.KITTY_POP) catch {};
        }
        self.output_buffer.appendSlice(self.allocator, ansi.BRACKETED_PASTE_DISABLE) catch {};
        self.output_buffer.appendSlice(self.allocator, ansi.SHOW_CURSOR) catch {};
        self.flush() catch {};

        // Restore terminal mode
        self.disableRawMode();
    }

    // Write data to output buffer
    pub fn write(self: *Self, data: []const u8) !void {
        try self.output_buffer.appendSlice(self.allocator, data);
    }

    // Flush output buffer to stdout
    pub fn flush(self: *Self) !void {
        if (self.output_buffer.items.len == 0) return;
        _ = try std.posix.write(self.stdout, self.output_buffer.items);
        self.output_buffer.clearRetainingCapacity();
    }

    // Process incoming stdin data
    pub fn processInput(self: *Self, data: []const u8) !void {
        // Check for Kitty protocol response
        if (std.mem.indexOf(u8, data, "\x1b[?") != null and
            std.mem.indexOf(u8, data, "u") != null)
        {
            self.kitty_protocol_active = true;
            // Enable Kitty flags
            try self.write(ansi.KITTY_ENABLE_FLAGS_7);
        }

        // Check for cell size response: ESC[6;height;widtht
        if (std.mem.indexOf(u8, data, "\x1b[6;")) |pos| {
            self.parseCellSize(data[pos..]);
        }

        try self.stdin_buffer.process(data);
    }

    fn parseCellSize(self: *Self, data: []const u8) void {
        // Format: ESC[6;height;widtht
        if (!std.mem.startsWith(u8, data, "\x1b[6;")) return;

        const inner = data[4..];
        const semi = std.mem.indexOf(u8, inner, ";") orelse return;
        const height_str = inner[0..semi];

        const rest = inner[semi + 1 ..];
        const t_pos = std.mem.indexOf(u8, rest, "t") orelse return;
        const width_str = rest[0..t_pos];

        self.cell_pixel_height = std.fmt.parseInt(u16, height_str, 10) catch null;
        self.cell_pixel_width = std.fmt.parseInt(u16, width_str, 10) catch null;
    }

    // Update terminal dimensions
    pub fn updateDimensions(self: *Self) void {
        if (builtin.os.tag == .windows) {
            // Windows: would use GetConsoleScreenBufferInfo
            return;
        }

        var ws = std.posix.winsize{
            .ws_col = 0,
            .ws_row = 0,
            .ws_xpixel = 0,
            .ws_ypixel = 0,
        };
        const result = std.posix.system.ioctl(self.stdout, std.posix.T.IOCGWINSZ, @intFromPtr(&ws));
        if (result == 0) {
            if (ws.ws_col > 0) self.columns = ws.ws_col;
            if (ws.ws_row > 0) self.rows = ws.ws_row;
        }
    }

    // Cursor operations
    pub fn hideCursor(self: *Self) !void {
        try self.write(ansi.HIDE_CURSOR);
    }

    pub fn showCursor(self: *Self) !void {
        try self.write(ansi.SHOW_CURSOR);
    }

    pub fn moveBy(self: *Self, lines: i32) !void {
        var buf: [16]u8 = undefined;
        var fbs = std.io.fixedBufferStream(&buf);
        try ansi.moveBy(fbs.writer(), lines);
        try self.write(fbs.getWritten());
    }

    // Clear operations
    pub fn clearLine(self: *Self) !void {
        try self.write(ansi.CLEAR_LINE);
    }

    pub fn clearFromCursor(self: *Self) !void {
        try self.write(ansi.CLEAR_FROM_CURSOR);
    }

    pub fn clearScreen(self: *Self) !void {
        try self.write(ansi.CLEAR_ALL);
    }

    // Window title
    pub fn setTitle(self: *Self, title: []const u8) !void {
        var buf: [256]u8 = undefined;
        var fbs = std.io.fixedBufferStream(&buf);
        try ansi.setTitle(fbs.writer(), title);
        try self.write(fbs.getWritten());
    }

    // Raw mode management
    fn enableRawMode(self: *Self) !void {
        if (builtin.os.tag == .windows) {
            // Windows: would use SetConsoleMode
            return;
        }

        const fd = self.stdin;
        self.original_termios = try std.posix.tcgetattr(fd);

        var raw = self.original_termios.?;

        // Input flags: disable BREAK, CR-to-NL, parity, strip, XON/XOFF
        raw.iflag.BRKINT = false;
        raw.iflag.ICRNL = false;
        raw.iflag.INPCK = false;
        raw.iflag.ISTRIP = false;
        raw.iflag.IXON = false;

        // Output flags: disable post-processing
        raw.oflag.OPOST = false;

        // Control flags: 8-bit chars
        raw.cflag.CSIZE = .CS8;

        // Local flags: disable echo, canonical, signals, extended
        raw.lflag.ECHO = false;
        raw.lflag.ICANON = false;
        raw.lflag.ISIG = false;
        raw.lflag.IEXTEN = false;

        // Control characters: min 0, time 1 (100ms)
        raw.cc[@intFromEnum(std.posix.V.MIN)] = 0;
        raw.cc[@intFromEnum(std.posix.V.TIME)] = 1;

        try std.posix.tcsetattr(fd, .NOW, raw);
        self.was_raw = true;
    }

    fn disableRawMode(self: *Self) void {
        if (!self.was_raw) return;
        if (self.original_termios) |termios| {
            std.posix.tcsetattr(self.stdin, .NOW, termios) catch {};
        }
        self.was_raw = false;
    }

    // Check if running in a TTY
    pub fn isTTY(self: *Self) bool {
        return std.posix.isatty(self.stdin);
    }
};

// Mock terminal for testing
pub const MockTerminal = struct {
    const Self = @This();

    allocator: std.mem.Allocator,
    output: std.ArrayListUnmanaged(u8),
    input_queue: std.ArrayListUnmanaged([]const u8),
    columns: u16 = 80,
    rows: u16 = 24,
    kitty_protocol_active: bool = false,

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .allocator = allocator,
            .output = .{},
            .input_queue = .{},
        };
    }

    pub fn deinit(self: *Self) void {
        self.output.deinit(self.allocator);
        for (self.input_queue.items) |item| {
            self.allocator.free(item);
        }
        self.input_queue.deinit(self.allocator);
    }

    pub fn write(self: *Self, data: []const u8) !void {
        try self.output.appendSlice(self.allocator, data);
    }

    pub fn flush(self: *Self) !void {
        // No-op for mock
        _ = self;
    }

    pub fn simulateInput(self: *Self, data: []const u8) !void {
        const copy = try self.allocator.dupe(u8, data);
        try self.input_queue.append(self.allocator, copy);
    }

    pub fn simulateResize(self: *Self, cols: u16, row: u16) void {
        self.columns = cols;
        self.rows = row;
    }

    pub fn getOutput(self: *Self) []const u8 {
        return self.output.items;
    }

    pub fn clearOutput(self: *Self) void {
        self.output.clearRetainingCapacity();
    }

    pub fn containsOutput(self: *Self, needle: []const u8) bool {
        return std.mem.indexOf(u8, self.output.items, needle) != null;
    }
};

test "Terminal init and dimensions" {
    const testing = std.testing;
    const allocator = testing.allocator;

    var term = Terminal.init(allocator);
    defer term.deinit();

    try testing.expect(term.columns >= 1);
    try testing.expect(term.rows >= 1);
}

test "MockTerminal write and output" {
    const testing = std.testing;
    const allocator = testing.allocator;

    var mock = MockTerminal.init(allocator);
    defer mock.deinit();

    try mock.write("Hello");
    try mock.write(" World");

    try testing.expectEqualStrings("Hello World", mock.getOutput());
    try testing.expect(mock.containsOutput("Hello"));
}

test "MockTerminal simulate resize" {
    const testing = std.testing;
    const allocator = testing.allocator;

    var mock = MockTerminal.init(allocator);
    defer mock.deinit();

    mock.simulateResize(120, 40);

    try testing.expectEqual(@as(u16, 120), mock.columns);
    try testing.expectEqual(@as(u16, 40), mock.rows);
}
