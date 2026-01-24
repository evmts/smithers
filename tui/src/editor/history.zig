const std = @import("std");
const Allocator = std.mem.Allocator;

pub const InputHistory = struct {
    const Self = @This();
    pub const MAX_CAPACITY: usize = 100;

    entries: [MAX_CAPACITY]?[]u8 = [_]?[]u8{null} ** MAX_CAPACITY,
    count: usize = 0,
    write_idx: usize = 0,
    nav_idx: ?usize = null,
    draft: ?[]u8 = null,
    allocator: Allocator,

    pub fn init(allocator: Allocator) Self {
        return .{ .allocator = allocator };
    }

    pub fn deinit(self: *Self) void {
        for (&self.entries) |*entry| {
            if (entry.*) |e| {
                self.allocator.free(e);
                entry.* = null;
            }
        }
        if (self.draft) |d| {
            self.allocator.free(d);
            self.draft = null;
        }
    }

    pub fn push(self: *Self, text: []const u8) void {
        if (text.len == 0) return;

        if (self.count > 0) {
            const last_idx = if (self.write_idx == 0) MAX_CAPACITY - 1 else self.write_idx - 1;
            if (self.entries[last_idx]) |last| {
                if (std.mem.eql(u8, last, text)) return;
            }
        }

        if (self.entries[self.write_idx]) |old| {
            self.allocator.free(old);
        }

        self.entries[self.write_idx] = self.allocator.dupe(u8, text) catch return;
        self.write_idx = (self.write_idx + 1) % MAX_CAPACITY;
        if (self.count < MAX_CAPACITY) self.count += 1;
    }

    pub fn prev(self: *Self) ?[]const u8 {
        if (self.count == 0) return null;

        if (self.nav_idx) |idx| {
            const start_idx = if (self.write_idx >= self.count) self.write_idx - self.count else MAX_CAPACITY - (self.count - self.write_idx);
            if (idx == start_idx) return self.entries[idx];
            const new_idx = if (idx == 0) MAX_CAPACITY - 1 else idx - 1;
            self.nav_idx = new_idx;
            return self.entries[new_idx];
        } else {
            const last_idx = if (self.write_idx == 0) MAX_CAPACITY - 1 else self.write_idx - 1;
            self.nav_idx = last_idx;
            return self.entries[last_idx];
        }
    }

    pub fn next(self: *Self) ?[]const u8 {
        if (self.nav_idx == null) return self.getDraft();

        const idx = self.nav_idx.?;
        const last_idx = if (self.write_idx == 0) MAX_CAPACITY - 1 else self.write_idx - 1;

        if (idx == last_idx) {
            self.nav_idx = null;
            return self.getDraft();
        }

        const new_idx = (idx + 1) % MAX_CAPACITY;
        self.nav_idx = new_idx;
        return self.entries[new_idx];
    }

    pub fn current(self: *Self) ?[]const u8 {
        if (self.nav_idx) |idx| {
            return self.entries[idx];
        }
        return self.getDraft();
    }

    pub fn reset(self: *Self) void {
        self.nav_idx = null;
    }

    pub fn saveDraft(self: *Self, text: []const u8) void {
        if (self.draft) |d| {
            self.allocator.free(d);
        }
        self.draft = self.allocator.dupe(u8, text) catch null;
    }

    pub fn getDraft(self: *Self) ?[]const u8 {
        return self.draft;
    }

    pub fn clearDraft(self: *Self) void {
        if (self.draft) |d| {
            self.allocator.free(d);
            self.draft = null;
        }
    }
};

// ============ Tests ============

test "InputHistory push and navigate" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");
    h.push("third");

    try std.testing.expectEqual(@as(usize, 3), h.count);

    try std.testing.expectEqualStrings("third", h.prev().?);
    try std.testing.expectEqualStrings("second", h.prev().?);
    try std.testing.expectEqualStrings("first", h.prev().?);
    try std.testing.expectEqualStrings("first", h.prev().?);

    try std.testing.expectEqualStrings("second", h.next().?);
    try std.testing.expectEqualStrings("third", h.next().?);
    try std.testing.expect(h.next() == null);
}

test "InputHistory skip duplicates" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("hello");
    h.push("hello");
    h.push("hello");

    try std.testing.expectEqual(@as(usize, 1), h.count);
}

test "InputHistory draft saving" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");

    h.saveDraft("my draft");
    try std.testing.expectEqualStrings("my draft", h.getDraft().?);

    try std.testing.expectEqualStrings("second", h.prev().?);
    try std.testing.expectEqualStrings("first", h.prev().?);

    _ = h.next();
    _ = h.next();
    try std.testing.expectEqualStrings("my draft", h.current().?);
}

test "InputHistory reset navigation" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("a");
    h.push("b");

    _ = h.prev();
    _ = h.prev();

    h.reset();
    try std.testing.expect(h.current() == null);
    try std.testing.expectEqualStrings("b", h.prev().?);
}

test "InputHistory empty" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    try std.testing.expect(h.prev() == null);
    try std.testing.expect(h.next() == null);
    try std.testing.expect(h.current() == null);
}

test "InputHistory ring buffer wrap" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    for (0..InputHistory.MAX_CAPACITY + 10) |i| {
        var buf: [32]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "entry{d}", .{i}) catch continue;
        h.push(s);
    }

    try std.testing.expectEqual(InputHistory.MAX_CAPACITY, h.count);

    const last = h.prev().?;
    try std.testing.expect(std.mem.startsWith(u8, last, "entry"));
}

test "InputHistory skip empty push" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("");
    try std.testing.expectEqual(@as(usize, 0), h.count);
}
