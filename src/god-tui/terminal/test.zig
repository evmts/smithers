// Terminal Module Tests
// Phase 1: Terminal Abstraction

const std = @import("std");
const testing = std.testing;

const ansi = @import("ansi.zig");
const keys = @import("keys.zig");
const stdin_buffer = @import("stdin_buffer.zig");
const terminal = @import("terminal.zig");

// Re-export all tests from submodules
test {
    _ = ansi;
    _ = keys;
    _ = stdin_buffer;
    _ = terminal;
}

// === ANSI Sequence Tests ===

test "ANSI cursor movement generation" {
    var buf: [64]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    const writer = fbs.writer();

    try ansi.cursorUp(writer, 5);
    try testing.expectEqualStrings("\x1b[5A", fbs.getWritten());

    fbs.reset();
    try ansi.cursorDown(writer, 3);
    try testing.expectEqualStrings("\x1b[3B", fbs.getWritten());

    fbs.reset();
    try ansi.cursorPosition(writer, 10, 20);
    try testing.expectEqualStrings("\x1b[11;21H", fbs.getWritten()); // 1-indexed
}

test "ANSI color generation" {
    var buf: [64]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    const writer = fbs.writer();

    try ansi.fg256(writer, 196);
    try testing.expectEqualStrings("\x1b[38;5;196m", fbs.getWritten());

    fbs.reset();
    try ansi.fgRgb(writer, 255, 128, 0);
    try testing.expectEqualStrings("\x1b[38;2;255;128;0m", fbs.getWritten());
}

test "ANSI sequence completeness detection" {
    // Complete sequences
    try testing.expectEqual(ansi.SequenceStatus.complete, ansi.isCompleteSequence("\x1b[A"));
    try testing.expectEqual(ansi.SequenceStatus.complete, ansi.isCompleteSequence("\x1b[1;5A"));
    try testing.expectEqual(ansi.SequenceStatus.complete, ansi.isCompleteSequence("\x1b[?2004h"));
    try testing.expectEqual(ansi.SequenceStatus.complete, ansi.isCompleteSequence("\x1b]0;title\x07"));
    try testing.expectEqual(ansi.SequenceStatus.complete, ansi.isCompleteSequence("\x1bOA"));

    // Incomplete sequences
    try testing.expectEqual(ansi.SequenceStatus.incomplete, ansi.isCompleteSequence("\x1b"));
    try testing.expectEqual(ansi.SequenceStatus.incomplete, ansi.isCompleteSequence("\x1b["));
    try testing.expectEqual(ansi.SequenceStatus.incomplete, ansi.isCompleteSequence("\x1b[1;5"));
    try testing.expectEqual(ansi.SequenceStatus.incomplete, ansi.isCompleteSequence("\x1b]0;title"));

    // Not escape sequences
    try testing.expectEqual(ansi.SequenceStatus.not_escape, ansi.isCompleteSequence("hello"));
    try testing.expectEqual(ansi.SequenceStatus.not_escape, ansi.isCompleteSequence(""));
}

test "ANSI image detection" {
    try testing.expect(ansi.containsImage("\x1b_Ga=T,f=100;AAAA\x1b\\"));
    try testing.expect(ansi.containsImage("\x1b]1337;File=inline=1:AAAA\x07"));
    try testing.expect(!ansi.containsImage("Hello world"));
    try testing.expect(!ansi.containsImage("\x1b[31mRed text\x1b[0m"));
}

// === Key Parsing Tests ===

test "Keys: Ctrl+letter matching" {
    try testing.expect(keys.matchesKey("\x01", "ctrl+a"));
    try testing.expect(keys.matchesKey("\x03", "ctrl+c"));
    try testing.expect(keys.matchesKey("\x1a", "ctrl+z"));
    try testing.expect(!keys.matchesKey("a", "ctrl+a"));
}

test "Keys: special key parsing" {
    var event = keys.parseLegacyKey("\x1b");
    try testing.expectEqual(keys.KeyId.escape, event.key);

    event = keys.parseLegacyKey("\x0d");
    try testing.expectEqual(keys.KeyId.enter, event.key);

    event = keys.parseLegacyKey("\x09");
    try testing.expectEqual(keys.KeyId.tab, event.key);

    event = keys.parseLegacyKey("\x7f");
    try testing.expectEqual(keys.KeyId.backspace, event.key);
}

test "Keys: arrow key parsing" {
    var event = keys.parseLegacyKey("\x1b[A");
    try testing.expectEqual(keys.KeyId.up, event.key);

    event = keys.parseLegacyKey("\x1b[B");
    try testing.expectEqual(keys.KeyId.down, event.key);

    event = keys.parseLegacyKey("\x1b[C");
    try testing.expectEqual(keys.KeyId.right, event.key);

    event = keys.parseLegacyKey("\x1b[D");
    try testing.expectEqual(keys.KeyId.left, event.key);

    // SS3 format
    event = keys.parseLegacyKey("\x1bOA");
    try testing.expectEqual(keys.KeyId.up, event.key);
}

test "Keys: modified arrow keys" {
    const event = keys.parseLegacyKey("\x1b[1;2A");
    try testing.expectEqual(keys.KeyId.up, event.key);
    try testing.expect(event.modifiers.shift);
    try testing.expect(!event.modifiers.ctrl);
    try testing.expect(!event.modifiers.alt);
}

test "Keys: function keys" {
    var event = keys.parseLegacyKey("\x1bOP");
    try testing.expectEqual(keys.KeyId.f1, event.key);

    event = keys.parseLegacyKey("\x1b[15~");
    try testing.expectEqual(keys.KeyId.f5, event.key);

    event = keys.parseLegacyKey("\x1b[24~");
    try testing.expectEqual(keys.KeyId.f12, event.key);
}

test "Keys: Kitty CSI-u format" {
    // ESC [ 97 ; 5 u = Ctrl+a
    const event = keys.parseKittySequence("\x1b[97;5u");
    try testing.expect(event != null);
    try testing.expectEqual(keys.KeyId.a, event.?.key);
    try testing.expect(event.?.modifiers.ctrl);
    try testing.expect(!event.?.modifiers.shift);
}

test "Keys: Kitty key release" {
    // ESC [ 97 ; 5 : 3 u = Ctrl+a release
    const event = keys.parseKittySequence("\x1b[97;5:3u");
    try testing.expect(event != null);
    try testing.expect(event.?.is_release);

    try testing.expect(keys.isKeyRelease("\x1b[97;5:3u"));
    try testing.expect(!keys.isKeyRelease("\x1b[97;5u"));
}

test "Keys: Alt+letter" {
    const event = keys.parseLegacyKey("\x1ba");
    try testing.expectEqual(keys.KeyId.a, event.key);
    try testing.expect(event.modifiers.alt);
}

test "Keys: matchesKey combinations" {
    try testing.expect(keys.matchesKey("\x1b[1;5A", "ctrl+up"));
    try testing.expect(keys.matchesKey("\x1b[1;3A", "alt+up"));
    try testing.expect(keys.matchesKey("\x1b[1;2A", "shift+up"));
}

// === StdinBuffer Tests ===

test "StdinBuffer: single character" {
    const allocator = testing.allocator;

    var received = std.ArrayListUnmanaged(u8){};
    defer received.deinit(allocator);

    var buf = stdin_buffer.StdinBuffer.init(allocator);
    defer buf.deinit();

    const Ctx = struct {
        data: *std.ArrayListUnmanaged(u8),
        alloc: std.mem.Allocator,

        fn callback(seq: []const u8, ctx: ?*anyopaque) void {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            self.data.appendSlice(self.alloc, seq) catch {};
        }
    };

    var ctx = Ctx{ .data = &received, .alloc = allocator };
    buf.setCallbacks(Ctx.callback, null, @ptrCast(&ctx));

    try buf.process("x");

    try testing.expectEqualStrings("x", received.items);
}

test "StdinBuffer: escape sequence" {
    const allocator = testing.allocator;

    var received = std.ArrayListUnmanaged([]const u8){};
    defer {
        for (received.items) |item| allocator.free(item);
        received.deinit(allocator);
    }

    var buf = stdin_buffer.StdinBuffer.init(allocator);
    defer buf.deinit();

    const Ctx = struct {
        seqs: *std.ArrayListUnmanaged([]const u8),
        alloc: std.mem.Allocator,

        fn callback(seq: []const u8, ctx: ?*anyopaque) void {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            const copy = self.alloc.dupe(u8, seq) catch return;
            self.seqs.append(self.alloc, copy) catch self.alloc.free(copy);
        }
    };

    var ctx = Ctx{ .seqs = &received, .alloc = allocator };
    buf.setCallbacks(Ctx.callback, null, @ptrCast(&ctx));

    try buf.process("\x1b[A");

    try testing.expectEqual(@as(usize, 1), received.items.len);
    try testing.expectEqualStrings("\x1b[A", received.items[0]);
}

test "StdinBuffer: bracketed paste" {
    const allocator = testing.allocator;

    var paste_content: ?[]const u8 = null;
    defer if (paste_content) |p| allocator.free(p);

    var buf = stdin_buffer.StdinBuffer.init(allocator);
    defer buf.deinit();

    const Ctx = struct {
        content: *?[]const u8,
        alloc: std.mem.Allocator,

        fn callback(content: []const u8, ctx: ?*anyopaque) void {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            self.content.* = self.alloc.dupe(u8, content) catch null;
        }
    };

    var ctx = Ctx{ .content = &paste_content, .alloc = allocator };
    buf.setCallbacks(null, Ctx.callback, @ptrCast(&ctx));

    try buf.process("\x1b[200~pasted text\x1b[201~");

    try testing.expect(paste_content != null);
    try testing.expectEqualStrings("pasted text", paste_content.?);
}

test "StdinBuffer: split paste" {
    const allocator = testing.allocator;

    var paste_content: ?[]const u8 = null;
    defer if (paste_content) |p| allocator.free(p);

    var buf = stdin_buffer.StdinBuffer.init(allocator);
    defer buf.deinit();

    const Ctx = struct {
        content: *?[]const u8,
        alloc: std.mem.Allocator,

        fn callback(content: []const u8, ctx: ?*anyopaque) void {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            self.content.* = self.alloc.dupe(u8, content) catch null;
        }
    };

    var ctx = Ctx{ .content = &paste_content, .alloc = allocator };
    buf.setCallbacks(null, Ctx.callback, @ptrCast(&ctx));

    // Simulate paste arriving in chunks
    try buf.process("\x1b[200~Hello ");
    try testing.expect(paste_content == null); // Not complete yet

    try buf.process("World\x1b[201~");
    try testing.expect(paste_content != null);
    try testing.expectEqualStrings("Hello World", paste_content.?);
}

// === Terminal Tests ===

test "Terminal: MockTerminal basic operations" {
    const allocator = testing.allocator;

    var mock = terminal.MockTerminal.init(allocator);
    defer mock.deinit();

    try mock.write("\x1b[?25l");
    try mock.write("Hello");

    try testing.expect(mock.containsOutput("\x1b[?25l"));
    try testing.expect(mock.containsOutput("Hello"));
}

test "Terminal: MockTerminal resize" {
    const allocator = testing.allocator;

    var mock = terminal.MockTerminal.init(allocator);
    defer mock.deinit();

    try testing.expectEqual(@as(u16, 80), mock.columns);
    try testing.expectEqual(@as(u16, 24), mock.rows);

    mock.simulateResize(120, 40);

    try testing.expectEqual(@as(u16, 120), mock.columns);
    try testing.expectEqual(@as(u16, 40), mock.rows);
}

test "Terminal: cursor marker constant" {
    try testing.expectEqualStrings("\x1b_pi:c\x07", ansi.CURSOR_MARKER);
}

test "Terminal: line reset constant" {
    try testing.expectEqualStrings("\x1b[0m\x1b]8;;\x07", ansi.LINE_RESET);
}

test "Terminal: sync output constants" {
    try testing.expectEqualStrings("\x1b[?2026h", ansi.SYNC_START);
    try testing.expectEqualStrings("\x1b[?2026l", ansi.SYNC_END);
}
