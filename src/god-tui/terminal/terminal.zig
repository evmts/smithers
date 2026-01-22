// Terminal Abstraction Layer per God-TUI spec §2
const std = @import("std");
const builtin = @import("builtin");
const ansi = @import("ansi.zig");
const keys = @import("keys.zig");
const StdinBuffer = @import("stdin_buffer.zig").StdinBuffer;

pub const Terminal = @This();

// Callbacks
pub const InputCallback = *const fn (data: []const u8) void;
pub const ResizeCallback = *const fn () void;
pub const PasteCallback = *const fn (content: []const u8) void;

// Terminal capabilities detected at startup
pub const Capabilities = struct {
    kitty_keyboard: bool = false,
    kitty_graphics: bool = false,
    rgb: bool = false,
    sync_output: bool = false,
    bracketed_paste: bool = false,
    hyperlinks: bool = false,
    sixel: bool = false,
    focus_tracking: bool = false,
    // Cell dimensions (from CSI 16t response)
    cell_pixel_width: ?u16 = null,
    cell_pixel_height: ?u16 = null,
};

// Terminal state
columns: u16 = 80,
rows: u16 = 24,
caps: Capabilities = .{},

// Internal state
running: bool = false,
was_raw_mode: bool = false,
stdin_buffer: StdinBuffer,

// Callbacks
on_input: ?InputCallback = null,
on_resize: ?ResizeCallback = null,
on_paste: ?PasteCallback = null,

// Output buffer for batched writes
output_buffer: std.ArrayListUnmanaged(u8) = .{},
allocator: std.mem.Allocator,

// Original termios for restoration
original_termios: ?std.posix.termios = null,

pub fn init(allocator: std.mem.Allocator) Terminal {
    return .{
        .stdin_buffer = StdinBuffer.init(allocator),
        .allocator = allocator,
    };
}

pub fn deinit(self: *Terminal) void {
    if (self.running) {
        self.stop() catch {};
    }
    self.stdin_buffer.deinit();
    self.output_buffer.deinit(self.allocator);
}

// Start the terminal - enable raw mode, register handlers
pub fn startTerminal(
    self: *Terminal,
    on_input: InputCallback,
    on_resize: ResizeCallback,
) !void {
    self.on_input = on_input;
    self.on_resize = on_resize;

    // Get current dimensions
    self.updateDimensions();

    // Save and enable raw mode
    try self.enableRawMode();

    // Enable bracketed paste
    try self.write(ansi.BRACKETED_PASTE_ON);

    // Query Kitty protocol support
    try self.write(ansi.KITTY_QUERY);

    // Query cell size for images
    try self.write(ansi.QUERY_CELL_SIZE);

    self.running = true;

    // Force SIGWINCH to refresh dimensions (Unix only)
    if (builtin.os.tag != .windows) {
        // Register signal handler
        // Note: In production, use proper signal handling
    }
}

// Stop the terminal - restore cooked mode
pub fn stop(self: *Terminal) !void {
    if (!self.running) return;

    // Disable bracketed paste
    try self.write(ansi.BRACKETED_PASTE_OFF);

    // Pop Kitty protocol if enabled
    if (self.caps.kitty_keyboard) {
        try self.write(ansi.KITTY_POP);
    }

    // Show cursor
    try self.write(ansi.SHOW_CURSOR);

    // Flush output
    try self.flush();

    // Restore terminal mode
    try self.disableRawMode();

    self.running = false;
    self.on_input = null;
    self.on_resize = null;
}

// Write data to terminal (buffered)
pub fn write(self: *Terminal, data: []const u8) !void {
    try self.output_buffer.appendSlice(self.allocator, data);
}

// Write formatted output
pub fn print(self: *Terminal, comptime fmt: []const u8, args: anytype) !void {
    try self.output_buffer.writer(self.allocator).print(fmt, args);
}

// Flush output buffer to stdout
pub fn flush(self: *Terminal) !void {
    if (self.output_buffer.items.len == 0) return;

    _ = try std.posix.write(std.posix.STDOUT_FILENO, self.output_buffer.items);
    self.output_buffer.clearRetainingCapacity();
}

// Get output buffer writer
pub fn writer(self: *Terminal) std.ArrayListUnmanaged(u8).Writer {
    return self.output_buffer.writer(self.allocator);
}

// === Cursor Operations ===

pub fn hideCursor(self: *Terminal) !void {
    try self.write(ansi.HIDE_CURSOR);
}

pub fn showCursor(self: *Terminal) !void {
    try self.write(ansi.SHOW_CURSOR);
}

pub fn moveBy(self: *Terminal, lines: i16) !void {
    if (lines < 0) {
        try ansi.cursorUp(self.writer(), @intCast(-lines));
    } else if (lines > 0) {
        try ansi.cursorDown(self.writer(), @intCast(lines));
    }
}

// === Clear Operations ===

pub fn clearLine(self: *Terminal) !void {
    try self.write(ansi.CLEAR_LINE);
}

pub fn clearFromCursor(self: *Terminal) !void {
    try self.write(ansi.CLEAR_TO_EOS);
}

pub fn clearScreen(self: *Terminal) !void {
    try self.write(ansi.CLEAR_ALL);
}

// === Window Operations ===

pub fn setTitle(self: *Terminal, title: []const u8) !void {
    try ansi.setTitle(self.writer(), title);
}

// === Protocol Setup ===

// Enable Kitty keyboard protocol with flags
pub fn enableKittyKeyboard(self: *Terminal, flags: u8) !void {
    try self.print("\x1b[>{d}u", .{flags});
    self.caps.kitty_keyboard = true;
}

// Process capability response
pub fn processCapabilityResponse(self: *Terminal, response: []const u8) void {
    // Kitty keyboard protocol detection: CSI ? <flags> u
    if (std.mem.indexOf(u8, response, "\x1b[?") != null) {
        var i: usize = 0;
        while (i + 4 < response.len) : (i += 1) {
            if (response[i] == '\x1b' and response[i + 1] == '[' and response[i + 2] == '?') {
                var num_end = i + 3;
                while (num_end < response.len and response[num_end] >= '0' and response[num_end] <= '9') : (num_end += 1) {}
                if (num_end > i + 3 and num_end < response.len and response[num_end] == 'u') {
                    self.caps.kitty_keyboard = true;
                    break;
                }
            }
        }
    }

    // Cell size response: CSI 6 ; height ; width t
    if (std.mem.indexOf(u8, response, "\x1b[6;")) |pos| {
        const resp_start = pos + 4;
        if (std.mem.indexOfPos(u8, response, resp_start, ";")) |semi1| {
            if (std.mem.indexOfPos(u8, response, semi1 + 1, "t")) |end| {
                const height = std.fmt.parseInt(u16, response[resp_start..semi1], 10) catch null;
                const width = std.fmt.parseInt(u16, response[semi1 + 1 .. end], 10) catch null;
                self.caps.cell_pixel_height = height;
                self.caps.cell_pixel_width = width;
            }
        }
    }

    // Sync output support
    if (std.mem.indexOf(u8, response, "2026;2$y") != null or
        std.mem.indexOf(u8, response, "2026;1$y") != null)
    {
        self.caps.sync_output = true;
    }

    // Bracketed paste support
    if (std.mem.indexOf(u8, response, "2004;2$y") != null or
        std.mem.indexOf(u8, response, "2004;1$y") != null)
    {
        self.caps.bracketed_paste = true;
    }
}

// === Raw Mode ===

fn enableRawMode(self: *Terminal) !void {
    if (builtin.os.tag == .windows) {
        // Windows: use different approach
        return;
    }

    const stdin_fd = std.posix.STDIN_FILENO;

    // Save original termios
    self.original_termios = try std.posix.tcgetattr(stdin_fd);

    var raw = self.original_termios.?;

    // Input flags: disable break, CR to NL, parity, strip, XON/XOFF
    raw.iflag.BRKINT = false;
    raw.iflag.ICRNL = false;
    raw.iflag.INPCK = false;
    raw.iflag.ISTRIP = false;
    raw.iflag.IXON = false;

    // Output flags: disable post-processing
    raw.oflag.OPOST = false;

    // Control flags: set 8-bit chars
    raw.cflag.CSIZE = .CS8;

    // Local flags: disable echo, canonical, extended, signals
    raw.lflag.ECHO = false;
    raw.lflag.ICANON = false;
    raw.lflag.IEXTEN = false;
    raw.lflag.ISIG = false;

    // Control chars: return each byte immediately
    raw.cc[@intFromEnum(std.posix.V.MIN)] = 1;
    raw.cc[@intFromEnum(std.posix.V.TIME)] = 0;

    try std.posix.tcsetattr(stdin_fd, .FLUSH, raw);
    self.was_raw_mode = true;
}

fn disableRawMode(self: *Terminal) !void {
    if (builtin.os.tag == .windows) return;
    if (!self.was_raw_mode) return;

    if (self.original_termios) |termios| {
        const stdin_fd = std.posix.STDIN_FILENO;
        try std.posix.tcsetattr(stdin_fd, .FLUSH, termios);
    }

    self.was_raw_mode = false;
}

fn updateDimensions(self: *Terminal) void {
    if (builtin.os.tag == .windows) {
        // Windows: use GetConsoleScreenBufferInfo
        self.columns = 80;
        self.rows = 24;
        return;
    }

    const stdout_fd = std.posix.STDOUT_FILENO;
    var ws: std.posix.winsize = undefined;

    if (std.posix.system.ioctl(stdout_fd, std.posix.T.IOCGWINSZ, @intFromPtr(&ws)) == 0) {
        self.columns = ws.col;
        self.rows = ws.row;
    }
}

// Process raw input from stdin
pub fn processInput(self: *Terminal, data: []const u8) !void {
    const emit_fn = struct {
        var terminal: *Terminal = undefined;

        fn emit(event: @import("stdin_buffer.zig").Event) void {
            switch (event) {
                .data => |d| {
                    if (terminal.on_input) |callback| {
                        callback(d);
                    }
                },
                .paste => |content| {
                    if (terminal.on_paste) |callback| {
                        callback(content);
                    }
                },
            }
        }
    };
    emit_fn.terminal = self;

    try self.stdin_buffer.process(data, emit_fn.emit);
}

// Flush any pending input after timeout
pub fn flushInput(self: *Terminal) void {
    const emit_fn = struct {
        var terminal: *Terminal = undefined;

        fn emit(event: @import("stdin_buffer.zig").Event) void {
            switch (event) {
                .data => |d| {
                    if (terminal.on_input) |callback| {
                        callback(d);
                    }
                },
                .paste => |content| {
                    if (terminal.on_paste) |callback| {
                        callback(content);
                    }
                },
            }
        }
    };
    emit_fn.terminal = self;

    self.stdin_buffer.flush(emit_fn.emit);
}

pub fn hasPendingInput(self: *const Terminal) bool {
    return self.stdin_buffer.hasPending();
}

// === Convenience Methods ===

// Begin synchronized output
pub fn syncStart(self: *Terminal) !void {
    try self.write(ansi.SYNC_START);
}

// End synchronized output
pub fn syncEnd(self: *Terminal) !void {
    try self.write(ansi.SYNC_END);
}

// === Mock Terminal for Testing ===

pub const MockTerminal = struct {
    output: std.ArrayListUnmanaged(u8) = .{},
    input_queue: std.ArrayListUnmanaged([]const u8) = .{},
    columns: u16 = 80,
    rows: u16 = 24,
    caps: Capabilities = .{},

    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) MockTerminal {
        return .{
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *MockTerminal) void {
        self.output.deinit(self.allocator);
        self.input_queue.deinit(self.allocator);
    }

    pub fn write(self: *MockTerminal, data: []const u8) !void {
        try self.output.appendSlice(self.allocator, data);
    }

    pub fn print(self: *MockTerminal, comptime fmt: []const u8, args: anytype) !void {
        try self.output.writer(self.allocator).print(fmt, args);
    }

    pub fn getOutput(self: *const MockTerminal) []const u8 {
        return self.output.items;
    }

    pub fn clearOutput(self: *MockTerminal) void {
        self.output.clearRetainingCapacity();
    }

    pub fn simulateInput(self: *MockTerminal, data: []const u8) !void {
        try self.input_queue.append(self.allocator, data);
    }

    pub fn simulateResize(self: *MockTerminal, cols: u16, new_rows: u16) void {
        self.columns = cols;
        self.rows = new_rows;
    }
};

// === Tests ===

test "Terminal init/deinit" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    try std.testing.expectEqual(@as(u16, 80), term.columns);
    try std.testing.expectEqual(@as(u16, 24), term.rows);
}

test "Terminal write buffering" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    try term.write("Hello");
    try term.write(" World");

    try std.testing.expectEqualStrings("Hello World", term.output_buffer.items);
}

test "Terminal cursor operations" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    try term.hideCursor();
    try std.testing.expectEqualStrings(ansi.HIDE_CURSOR, term.output_buffer.items);

    term.output_buffer.clearRetainingCapacity();

    try term.showCursor();
    try std.testing.expectEqualStrings(ansi.SHOW_CURSOR, term.output_buffer.items);
}

test "Terminal moveBy" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    try term.moveBy(-3);
    try std.testing.expectEqualStrings("\x1b[3A", term.output_buffer.items);

    term.output_buffer.clearRetainingCapacity();

    try term.moveBy(5);
    try std.testing.expectEqualStrings("\x1b[5B", term.output_buffer.items);
}

test "Terminal sync output" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    try term.syncStart();
    try term.write("content");
    try term.syncEnd();

    try std.testing.expectEqualStrings(
        ansi.SYNC_START ++ "content" ++ ansi.SYNC_END,
        term.output_buffer.items,
    );
}

test "MockTerminal" {
    const allocator = std.testing.allocator;
    var mock = MockTerminal.init(allocator);
    defer mock.deinit();

    try mock.write("Test");
    try std.testing.expectEqualStrings("Test", mock.getOutput());

    mock.simulateResize(120, 40);
    try std.testing.expectEqual(@as(u16, 120), mock.columns);
    try std.testing.expectEqual(@as(u16, 40), mock.rows);
}

test "processCapabilityResponse kitty" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    term.processCapabilityResponse("\x1b[?0u");
    try std.testing.expect(term.caps.kitty_keyboard);
}

test "processCapabilityResponse cell size" {
    const allocator = std.testing.allocator;
    var term = Terminal.init(allocator);
    defer term.deinit();

    term.processCapabilityResponse("\x1b[6;18;9t");
    try std.testing.expectEqual(@as(?u16, 18), term.caps.cell_pixel_height);
    try std.testing.expectEqual(@as(?u16, 9), term.caps.cell_pixel_width);
}
