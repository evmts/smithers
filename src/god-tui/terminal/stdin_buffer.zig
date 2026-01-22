// Stdin Buffer per God-TUI spec §6
// Handles partial sequence arrival and bracketed paste detection
const std = @import("std");
const ansi = @import("ansi.zig");

pub const Event = union(enum) {
    data: []const u8, // Complete sequence
    paste: []const u8, // Paste content (without markers)
};

pub const StdinBuffer = struct {
    buffer: std.ArrayListUnmanaged(u8) = .{},
    paste_buffer: std.ArrayListUnmanaged(u8) = .{},
    paste_mode: bool = false,
    timeout_ns: u64 = 10 * std.time.ns_per_ms, // 10ms default

    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) StdinBuffer {
        return .{
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *StdinBuffer) void {
        self.buffer.deinit(self.allocator);
        self.paste_buffer.deinit(self.allocator);
    }

    pub fn reset(self: *StdinBuffer) void {
        self.buffer.clearRetainingCapacity();
        self.paste_buffer.clearRetainingCapacity();
        self.paste_mode = false;
    }

    // Process incoming data and emit events
    // Returns events via the callback
    pub fn process(
        self: *StdinBuffer,
        data: []const u8,
        emit: *const fn (Event) void,
    ) !void {
        // Handle high-byte conversion for legacy terminals
        // Single byte > 127 converts to ESC + (byte - 128)
        var converted_data: [2]u8 = undefined;
        var effective_data = data;

        if (data.len == 1 and data[0] > 127) {
            converted_data[0] = '\x1b';
            converted_data[1] = data[0] - 128;
            effective_data = &converted_data;
        }

        // Empty input on empty buffer emits empty event
        if (effective_data.len == 0 and self.buffer.items.len == 0) {
            emit(.{ .data = "" });
            return;
        }

        try self.buffer.appendSlice(self.allocator, effective_data);

        // === PASTE MODE HANDLING ===
        if (self.paste_mode) {
            try self.paste_buffer.appendSlice(self.allocator, self.buffer.items);
            self.buffer.clearRetainingCapacity();

            // Check for paste end marker
            if (std.mem.indexOf(u8, self.paste_buffer.items, ansi.PASTE_END)) |end_idx| {
                const content = self.paste_buffer.items[0..end_idx];
                const remaining = self.paste_buffer.items[end_idx + ansi.PASTE_END.len ..];

                emit(.{ .paste = content });

                self.paste_mode = false;
                self.paste_buffer.clearRetainingCapacity();

                // Process any remaining data after paste
                if (remaining.len > 0) {
                    try self.process(remaining, emit);
                }
            }
            return;
        }

        // === PASTE START DETECTION ===
        if (std.mem.indexOf(u8, self.buffer.items, ansi.PASTE_START)) |start_idx| {
            // Emit sequences before paste marker
            if (start_idx > 0) {
                try self.extractAndEmit(self.buffer.items[0..start_idx], emit);
            }

            // Enter paste mode
            const after_marker = self.buffer.items[start_idx + ansi.PASTE_START.len ..];
            try self.paste_buffer.appendSlice(self.allocator, after_marker);
            self.buffer.clearRetainingCapacity();
            self.paste_mode = true;

            // Check for immediate paste end
            if (std.mem.indexOf(u8, self.paste_buffer.items, ansi.PASTE_END)) |end_idx| {
                const content = self.paste_buffer.items[0..end_idx];
                const remaining = self.paste_buffer.items[end_idx + ansi.PASTE_END.len ..];

                emit(.{ .paste = content });

                self.paste_mode = false;
                self.paste_buffer.clearRetainingCapacity();

                if (remaining.len > 0) {
                    try self.process(remaining, emit);
                }
            }
            return;
        }

        // === NORMAL SEQUENCE EXTRACTION ===
        self.extractAndEmit(emit);
    }

    // Extract complete sequences and emit them
    fn extractAndEmit(self: *StdinBuffer, emit: *const fn (Event) void) void {
        var pos: usize = 0;

        while (pos < self.buffer.items.len) {
            if (self.buffer.items[pos] == '\x1b') {
                // Try to parse as escape sequence
                const seq = ansi.classifySequence(self.buffer.items[pos..]);

                switch (seq.type) {
                    .incomplete => {
                        // Keep the incomplete sequence at start of buffer
                        if (pos > 0) {
                            const remaining_len = self.buffer.items.len - pos;
                            // Use memmove semantic - copy in-place
                            var i: usize = 0;
                            while (i < remaining_len) : (i += 1) {
                                self.buffer.items[i] = self.buffer.items[pos + i];
                            }
                            self.buffer.shrinkRetainingCapacity(remaining_len);
                        }
                        return;
                    },
                    .not_escape => {
                        emit(.{ .data = self.buffer.items[pos .. pos + 1] });
                        pos += 1;
                    },
                    else => {
                        // Complete sequence
                        emit(.{ .data = self.buffer.items[pos .. pos + seq.len] });
                        pos += seq.len;
                    },
                }
            } else {
                // Regular character
                emit(.{ .data = self.buffer.items[pos .. pos + 1] });
                pos += 1;
            }
        }

        self.buffer.clearRetainingCapacity();
    }

    // Flush buffer after timeout (emit incomplete sequences as-is)
    pub fn flush(self: *StdinBuffer, emit: *const fn (Event) void) void {
        if (self.buffer.items.len > 0) {
            emit(.{ .data = self.buffer.items });
            self.buffer.clearRetainingCapacity();
        }
    }

    // Check if there's pending data that needs timeout flush
    pub fn hasPending(self: *const StdinBuffer) bool {
        return self.buffer.items.len > 0;
    }
};

// === Tests ===

test "StdinBuffer single char" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    try buf.process("a", emit_fn.emit);

    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqualStrings("a", events.items[0].data);
}

test "StdinBuffer escape sequence" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    try buf.process("\x1b[A", emit_fn.emit);

    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqualStrings("\x1b[A", events.items[0].data);
}

test "StdinBuffer incomplete sequence" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    // Send partial sequence
    try buf.process("\x1b[", emit_fn.emit);
    try std.testing.expectEqual(@as(usize, 0), events.items.len);
    try std.testing.expect(buf.hasPending());

    // Complete it
    try buf.process("A", emit_fn.emit);
    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqualStrings("\x1b[A", events.items[0].data);
}

test "StdinBuffer bracketed paste" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    try buf.process("\x1b[200~Hello World\x1b[201~", emit_fn.emit);

    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqualStrings("Hello World", events.items[0].paste);
}

test "StdinBuffer split paste" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    // Paste marker split across reads
    try buf.process("\x1b[200~Hello", emit_fn.emit);
    try std.testing.expectEqual(@as(usize, 0), events.items.len);
    try std.testing.expect(buf.paste_mode);

    try buf.process(" World\x1b[201~", emit_fn.emit);
    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqualStrings("Hello World", events.items[0].paste);
}

test "StdinBuffer high byte conversion" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    // Single byte > 127 should convert to ESC + (byte - 128)
    try buf.process(&[_]u8{0xC1}, emit_fn.emit); // 0xC1 - 128 = 0x41 = 'A'

    // Should get ESC + 'A' = Alt+A or similar
    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqual(@as(usize, 2), events.items[0].data.len);
    try std.testing.expectEqual(@as(u8, '\x1b'), events.items[0].data[0]);
    try std.testing.expectEqual(@as(u8, 'A'), events.items[0].data[1]);
}

test "StdinBuffer flush timeout" {
    const allocator = std.testing.allocator;
    var buf = StdinBuffer.init(allocator);
    defer buf.deinit();

    var events = std.ArrayListUnmanaged(Event){};
    defer events.deinit(allocator);

    const emit_fn = struct {
        var captured: *std.ArrayListUnmanaged(Event) = undefined;
        var alloc: std.mem.Allocator = undefined;
        fn emit(event: Event) void {
            captured.append(alloc, event) catch {};
        }
    };
    emit_fn.captured = &events;
    emit_fn.alloc = allocator;

    // Send just ESC
    try buf.process("\x1b", emit_fn.emit);
    try std.testing.expectEqual(@as(usize, 0), events.items.len);
    try std.testing.expect(buf.hasPending());

    // Simulate timeout - flush
    buf.flush(emit_fn.emit);
    try std.testing.expectEqual(@as(usize, 1), events.items.len);
    try std.testing.expectEqualStrings("\x1b", events.items[0].data);
}
