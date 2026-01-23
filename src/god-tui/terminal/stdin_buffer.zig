// Stdin Buffer - Input sequence parsing with bracketed paste
// Now delegates to vaxis.Parser for proper escape sequence parsing

const std = @import("std");
const vaxis = @import("vaxis");

const ansi = @import("ansi.zig");

// Callback types
pub const DataCallback = *const fn (sequence: []const u8, ctx: ?*anyopaque) void;
pub const PasteCallback = *const fn (content: []const u8, ctx: ?*anyopaque) void;

// Vaxis event callback - called for key_press, key_release events
pub const VaxisEventCallback = *const fn (event: vaxis.Event, ctx: ?*anyopaque) void;

pub const StdinBuffer = struct {
    const Self = @This();

    allocator: std.mem.Allocator,
    buffer: std.ArrayListUnmanaged(u8),
    paste_buffer: std.ArrayListUnmanaged(u8),
    in_paste: bool = false,
    timeout_ns: u64 = 10 * std.time.ns_per_ms, // 10ms default
    data_callback: ?DataCallback = null,
    paste_callback: ?PasteCallback = null,
    vaxis_event_callback: ?VaxisEventCallback = null,
    callback_ctx: ?*anyopaque = null,

    // vaxis parser for proper escape sequence handling
    parser: vaxis.Parser = .{},

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .allocator = allocator,
            .buffer = .{},
            .paste_buffer = .{},
        };
    }

    pub fn deinit(self: *Self) void {
        self.buffer.deinit(self.allocator);
        self.paste_buffer.deinit(self.allocator);
    }

    pub fn setCallbacks(self: *Self, data_cb: ?DataCallback, paste_cb: ?PasteCallback, ctx: ?*anyopaque) void {
        self.data_callback = data_cb;
        self.paste_callback = paste_cb;
        self.callback_ctx = ctx;
    }

    pub fn setVaxisEventCallback(self: *Self, event_cb: ?VaxisEventCallback, ctx: ?*anyopaque) void {
        self.vaxis_event_callback = event_cb;
        self.callback_ctx = ctx;
    }

    fn emitData(self: *Self, seq: []const u8) void {
        if (self.data_callback) |cb| {
            cb(seq, self.callback_ctx);
        }
    }

    fn emitPaste(self: *Self, content: []const u8) void {
        if (self.paste_callback) |cb| {
            cb(content, self.callback_ctx);
        }
    }

    fn emitVaxisEvent(self: *Self, event: vaxis.Event) void {
        if (self.vaxis_event_callback) |cb| {
            cb(event, self.callback_ctx);
        }
    }

    // Process incoming data from stdin
    pub fn process(self: *Self, data: []const u8) !void {
        // Handle high-byte conversion for legacy terminals
        // Single byte > 127 converts to ESC + (byte - 128)
        if (data.len == 1 and data[0] > 127) {
            try self.buffer.append(self.allocator, '\x1b');
            try self.buffer.append(self.allocator, data[0] - 128);
        } else {
            try self.buffer.appendSlice(self.allocator, data);
        }

        // Empty buffer after empty input
        if (self.buffer.items.len == 0) {
            self.emitData("");
            return;
        }

        // === PASTE MODE HANDLING ===
        if (self.in_paste) {
            try self.paste_buffer.appendSlice(self.allocator, self.buffer.items);
            self.buffer.clearRetainingCapacity();

            // Check for paste end marker
            if (std.mem.indexOf(u8, self.paste_buffer.items, ansi.PASTE_END)) |end_idx| {
                const content = self.paste_buffer.items[0..end_idx];
                const remaining = self.paste_buffer.items[end_idx + ansi.PASTE_END.len ..];

                // Emit paste content
                self.emitPaste(content);

                // Exit paste mode
                self.in_paste = false;

                // Process remaining data after paste
                if (remaining.len > 0) {
                    const rem_copy = try self.allocator.dupe(u8, remaining);
                    defer self.allocator.free(rem_copy);
                    self.paste_buffer.clearRetainingCapacity();
                    try self.process(rem_copy);
                } else {
                    self.paste_buffer.clearRetainingCapacity();
                }
            }
            return;
        }

        // === PASTE START DETECTION ===
        if (std.mem.indexOf(u8, self.buffer.items, ansi.PASTE_START)) |start_idx| {
            // Emit sequences before paste marker
            if (start_idx > 0) {
                const before = self.buffer.items[0..start_idx];
                try self.extractAndEmitSequences(before);
            }

            // Enter paste mode
            self.in_paste = true;
            const after_marker = self.buffer.items[start_idx + ansi.PASTE_START.len ..];
            try self.paste_buffer.appendSlice(self.allocator, after_marker);
            self.buffer.clearRetainingCapacity();

            // Check for immediate paste end
            if (std.mem.indexOf(u8, self.paste_buffer.items, ansi.PASTE_END)) |end_idx| {
                const content = self.paste_buffer.items[0..end_idx];
                const remaining = self.paste_buffer.items[end_idx + ansi.PASTE_END.len ..];

                self.emitPaste(content);
                self.in_paste = false;

                if (remaining.len > 0) {
                    const rem_copy = try self.allocator.dupe(u8, remaining);
                    defer self.allocator.free(rem_copy);
                    self.paste_buffer.clearRetainingCapacity();
                    try self.process(rem_copy);
                } else {
                    self.paste_buffer.clearRetainingCapacity();
                }
            }
            return;
        }

        // === NORMAL SEQUENCE EXTRACTION ===
        try self.extractAndEmitSequences(self.buffer.items);
        self.buffer.clearRetainingCapacity();
    }

    fn extractAndEmitSequences(self: *Self, data: []const u8) !void {
        var pos: usize = 0;

        while (pos < data.len) {
            if (data[pos] == '\x1b') {
                // Find end of escape sequence
                const remaining = data[pos..];
                const status = ansi.isCompleteSequence(remaining);

                switch (status) {
                    .complete => {
                        // Find actual end of sequence
                        const end = findSequenceEnd(remaining);
                        self.emitData(remaining[0..end]);
                        pos += end;
                    },
                    .incomplete => {
                        // Would need timeout, for now emit as-is
                        // In real impl, would schedule timeout flush
                        self.emitData(remaining);
                        pos = data.len;
                    },
                    .not_escape => {
                        self.emitData(data[pos .. pos + 1]);
                        pos += 1;
                    },
                }
            } else {
                // Single character
                self.emitData(data[pos .. pos + 1]);
                pos += 1;
            }
        }
    }

    // Process using vaxis parser - returns parsed events
    pub fn processWithVaxis(self: *Self, data: []const u8) !void {
        var seq_start: usize = 0;

        while (seq_start < data.len) {
            const result = try self.parser.parse(data[seq_start..], null);
            if (result.n == 0) {
                // Incomplete sequence - buffer it
                try self.buffer.appendSlice(self.allocator, data[seq_start..]);
                return;
            }
            seq_start += result.n;

            if (result.event) |event| {
                // Handle paste events specially
                switch (event) {
                    .paste_start => self.in_paste = true,
                    .paste_end => self.in_paste = false,
                    .paste => |text| {
                        self.emitPaste(text);
                    },
                    .key_press => |key| {
                        // Convert to raw bytes for backward compatibility
                        if (key.text) |text| {
                            self.emitData(text);
                        } else {
                            // Encode key back to escape sequence for legacy callback
                            var buf: [32]u8 = undefined;
                            const len = encodeKeyToEscapeSequence(key, &buf);
                            if (len > 0) {
                                self.emitData(buf[0..len]);
                            }
                        }
                        self.emitVaxisEvent(event);
                    },
                    .key_release => {
                        self.emitVaxisEvent(event);
                    },
                    else => {
                        self.emitVaxisEvent(event);
                    },
                }
            }
        }
    }

    // Flush buffer on timeout (returns remaining sequences)
    pub fn flush(self: *Self) !void {
        if (self.buffer.items.len > 0) {
            self.emitData(self.buffer.items);
            self.buffer.clearRetainingCapacity();
        }
    }

    pub fn clear(self: *Self) void {
        self.buffer.clearRetainingCapacity();
        self.paste_buffer.clearRetainingCapacity();
        self.in_paste = false;
    }
};

fn findSequenceEnd(data: []const u8) usize {
    if (data.len < 2) return data.len;
    if (data[0] != '\x1b') return 1;

    const after = data[1];

    // CSI: ESC [ ... final_byte
    if (after == '[') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            const c = data[i];
            if (c >= 0x40 and c <= 0x7e) {
                return i + 1;
            }
        }
        return data.len;
    }

    // OSC/APC: terminated by BEL or ST
    if (after == ']' or after == '_') {
        var i: usize = 2;
        while (i < data.len) : (i += 1) {
            if (data[i] == '\x07') return i + 1;
            if (i + 1 < data.len and data[i] == '\x1b' and data[i + 1] == '\\') {
                return i + 2;
            }
        }
        return data.len;
    }

    // DCS: ESC P ... ST
    if (after == 'P') {
        var i: usize = 2;
        while (i + 1 < data.len) : (i += 1) {
            if (data[i] == '\x1b' and data[i + 1] == '\\') {
                return i + 2;
            }
        }
        return data.len;
    }

    // SS3: ESC O + single char
    if (after == 'O') {
        return @min(3, data.len);
    }

    // Meta: ESC + char
    return @min(2, data.len);
}

// Encode a vaxis.Key back to an escape sequence for legacy callbacks
fn encodeKeyToEscapeSequence(key: vaxis.Key, buf: []u8) usize {
    // Handle control characters
    if (key.mods.ctrl and key.codepoint >= 'a' and key.codepoint <= 'z') {
        buf[0] = @intCast(key.codepoint - 'a' + 1);
        return 1;
    }

    // Handle special keys
    switch (key.codepoint) {
        vaxis.Key.escape => {
            buf[0] = 0x1b;
            return 1;
        },
        vaxis.Key.enter => {
            buf[0] = 0x0d;
            return 1;
        },
        vaxis.Key.tab => {
            buf[0] = 0x09;
            return 1;
        },
        vaxis.Key.backspace => {
            buf[0] = 0x7f;
            return 1;
        },
        vaxis.Key.space => {
            buf[0] = 0x20;
            return 1;
        },
        vaxis.Key.up => {
            @memcpy(buf[0..3], "\x1b[A");
            return 3;
        },
        vaxis.Key.down => {
            @memcpy(buf[0..3], "\x1b[B");
            return 3;
        },
        vaxis.Key.right => {
            @memcpy(buf[0..3], "\x1b[C");
            return 3;
        },
        vaxis.Key.left => {
            @memcpy(buf[0..3], "\x1b[D");
            return 3;
        },
        else => {
            // Try to encode as UTF-8
            if (key.codepoint < 128) {
                buf[0] = @intCast(key.codepoint);
                return 1;
            }
            const n = std.unicode.utf8Encode(key.codepoint, buf[0..4]) catch return 0;
            return n;
        },
    }
}

test "StdinBuffer basic sequence" {
    const testing = std.testing;
    const allocator = testing.allocator;

    var sequences = std.ArrayListUnmanaged([]const u8){};
    defer {
        for (sequences.items) |s| allocator.free(s);
        sequences.deinit(allocator);
    }

    var buffer = StdinBuffer.init(allocator);
    defer buffer.deinit();

    const Ctx = struct {
        seqs: *std.ArrayListUnmanaged([]const u8),
        alloc: std.mem.Allocator,

        fn dataCallback(seq: []const u8, ctx: ?*anyopaque) void {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            self.seqs.append(self.alloc, self.alloc.dupe(u8, seq) catch return) catch {};
        }
    };

    var ctx = Ctx{ .seqs = &sequences, .alloc = allocator };
    buffer.setCallbacks(Ctx.dataCallback, null, @ptrCast(&ctx));

    try buffer.process("a");
    try testing.expectEqual(@as(usize, 1), sequences.items.len);
    try testing.expectEqualStrings("a", sequences.items[0]);
}

test "StdinBuffer bracketed paste" {
    const testing = std.testing;
    const allocator = testing.allocator;

    var paste_content: ?[]const u8 = null;
    defer if (paste_content) |p| allocator.free(p);

    var buffer = StdinBuffer.init(allocator);
    defer buffer.deinit();

    const Ctx = struct {
        content: *?[]const u8,
        alloc: std.mem.Allocator,

        fn pasteCallback(content: []const u8, ctx: ?*anyopaque) void {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            self.content.* = self.alloc.dupe(u8, content) catch null;
        }
    };

    var ctx = Ctx{ .content = &paste_content, .alloc = allocator };
    buffer.setCallbacks(null, Ctx.pasteCallback, @ptrCast(&ctx));

    try buffer.process("\x1b[200~Hello World\x1b[201~");

    try testing.expect(paste_content != null);
    try testing.expectEqualStrings("Hello World", paste_content.?);
}
