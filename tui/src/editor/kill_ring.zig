// Kill Ring - Emacs-style clipboard with accumulation
// Ported from god-tui

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

pub const KillRing = struct {
    entries: ArrayListUnmanaged([]u8),
    allocator: Allocator,
    current: usize = 0,
    last_action_was_kill: bool = false,
    max_entries: usize = 100,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .entries = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        for (self.entries.items) |entry| {
            self.allocator.free(entry);
        }
        self.entries.deinit(self.allocator);
    }

    /// Add text to kill ring
    /// If last action was kill, accumulate (prepend if prepend=true, else append)
    /// Otherwise push new entry
    pub fn add(self: *Self, text: []const u8, prepend: bool) !void {
        if (text.len == 0) return;

        if (self.last_action_was_kill and self.entries.items.len > 0) {
            const idx = if (self.current == 0) self.entries.items.len - 1 else self.current - 1;
            const existing = self.entries.items[idx];

            const new_len = existing.len + text.len;
            const new_entry = try self.allocator.alloc(u8, new_len);

            if (prepend) {
                @memcpy(new_entry[0..text.len], text);
                @memcpy(new_entry[text.len..], existing);
            } else {
                @memcpy(new_entry[0..existing.len], existing);
                @memcpy(new_entry[existing.len..], text);
            }

            self.allocator.free(existing);
            self.entries.items[idx] = new_entry;
        } else {
            if (self.entries.items.len >= self.max_entries) {
                self.allocator.free(self.entries.items[0]);
                _ = self.entries.orderedRemove(0);
            }

            const entry = try self.allocator.dupe(u8, text);
            try self.entries.append(self.allocator, entry);
            self.current = self.entries.items.len;
        }

        self.last_action_was_kill = true;
    }

    /// Get current yank text (most recent entry)
    pub fn yank(self: *Self) ?[]const u8 {
        if (self.entries.items.len == 0) return null;
        self.current = self.entries.items.len;
        return self.entries.items[self.entries.items.len - 1];
    }

    /// Rotate to previous entry in ring (for Alt+Y after Ctrl+Y)
    pub fn yankPop(self: *Self) ?[]const u8 {
        if (self.entries.items.len == 0) return null;

        if (self.current == 0) {
            self.current = self.entries.items.len;
        }
        self.current -= 1;

        return self.entries.items[self.current];
    }

    /// Mark that a non-kill action occurred (breaks accumulation)
    pub fn breakAccumulation(self: *Self) void {
        self.last_action_was_kill = false;
    }

    pub fn len(self: *const Self) usize {
        return self.entries.items.len;
    }

    pub fn isEmpty(self: *const Self) bool {
        return self.entries.items.len == 0;
    }
};

// ============ Tests ============

test "push: add single entry" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try std.testing.expectEqual(@as(usize, 1), ring.len());
}

test "push: add multiple entries with break" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    ring.breakAccumulation();
    try ring.add("world", false);

    try std.testing.expectEqual(@as(usize, 2), ring.len());
}

test "push: max entries eviction" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.max_entries = 3;
    defer ring.deinit();

    try ring.add("one", false);
    ring.breakAccumulation();
    try ring.add("two", false);
    ring.breakAccumulation();
    try ring.add("three", false);
    ring.breakAccumulation();
    try ring.add("four", false);

    try std.testing.expectEqual(@as(usize, 3), ring.len());
    try std.testing.expectEqualStrings("two", ring.entries.items[0]);
    try std.testing.expectEqualStrings("three", ring.entries.items[1]);
    try std.testing.expectEqualStrings("four", ring.entries.items[2]);
}

test "push: empty text ignored" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("", false);
    try std.testing.expectEqual(@as(usize, 0), ring.len());
}

test "yank: returns most recent" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);

    try std.testing.expectEqualStrings("second", ring.yank().?);
}

test "yank: empty ring returns null" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expect(ring.yank() == null);
}

test "yankPop: rotation through entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);
    ring.breakAccumulation();
    try ring.add("third", false);

    _ = ring.yank();
    try std.testing.expectEqualStrings("third", ring.yankPop().?);
    try std.testing.expectEqualStrings("second", ring.yankPop().?);
    try std.testing.expectEqualStrings("first", ring.yankPop().?);
}

test "yankPop: wraps around" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);

    _ = ring.yank();
    _ = ring.yankPop();
    _ = ring.yankPop();
    try std.testing.expectEqualStrings("second", ring.yankPop().?);
}

test "yankPop: empty ring returns null" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expect(ring.yankPop() == null);
}

test "accumulation: append mode" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try ring.add(" world", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("hello world", ring.yank().?);
}

test "accumulation: prepend mode" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("world", false);
    try ring.add("hello ", true);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("hello world", ring.yank().?);
}

test "accumulation: break stops accumulation" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    ring.breakAccumulation();
    try ring.add("world", false);

    try std.testing.expectEqual(@as(usize, 2), ring.len());
}

test "accumulation: multiple consecutive kills" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("a", false);
    try ring.add("b", false);
    try ring.add("c", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("abc", ring.yank().?);
}
