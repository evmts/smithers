const std = @import("std");
const InputHistory = @import("../editor/history.zig").InputHistory;

// ============ Basic Operations ============

test "InputHistory init creates empty history" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    try std.testing.expectEqual(@as(usize, 0), h.count);
    try std.testing.expectEqual(@as(usize, 0), h.write_idx);
    try std.testing.expect(h.nav_idx == null);
    try std.testing.expect(h.draft == null);
}

test "InputHistory push single entry" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("hello");
    try std.testing.expectEqual(@as(usize, 1), h.count);
    try std.testing.expectEqual(@as(usize, 1), h.write_idx);
}

test "InputHistory push multiple entries" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");
    h.push("third");

    try std.testing.expectEqual(@as(usize, 3), h.count);
    try std.testing.expectEqual(@as(usize, 3), h.write_idx);
}

test "InputHistory push empty string ignored" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("");
    try std.testing.expectEqual(@as(usize, 0), h.count);

    h.push("something");
    h.push("");
    try std.testing.expectEqual(@as(usize, 1), h.count);
}

test "InputHistory push duplicate consecutive ignored" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("hello");
    h.push("hello");
    h.push("hello");

    try std.testing.expectEqual(@as(usize, 1), h.count);
}

test "InputHistory push duplicate non-consecutive allowed" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("hello");
    h.push("world");
    h.push("hello");

    try std.testing.expectEqual(@as(usize, 3), h.count);
}

// ============ Navigation: prev() ============

test "InputHistory prev on empty returns null" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    try std.testing.expect(h.prev() == null);
}

test "InputHistory prev returns most recent first" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("oldest");
    h.push("middle");
    h.push("newest");

    try std.testing.expectEqualStrings("newest", h.prev().?);
    try std.testing.expectEqualStrings("middle", h.prev().?);
    try std.testing.expectEqualStrings("oldest", h.prev().?);
}

test "InputHistory prev at oldest stays at oldest" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");

    _ = h.prev(); // second
    _ = h.prev(); // first
    try std.testing.expectEqualStrings("first", h.prev().?);
    try std.testing.expectEqualStrings("first", h.prev().?);
    try std.testing.expectEqualStrings("first", h.prev().?);
}

test "InputHistory prev single entry" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("only");

    try std.testing.expectEqualStrings("only", h.prev().?);
    try std.testing.expectEqualStrings("only", h.prev().?);
}

// ============ Navigation: next() ============

test "InputHistory next on empty returns null (draft)" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    try std.testing.expect(h.next() == null);
}

test "InputHistory next without nav_idx returns draft" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("something");
    h.saveDraft("my draft");

    try std.testing.expectEqualStrings("my draft", h.next().?);
}

test "InputHistory next navigates forward in history" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");
    h.push("third");

    _ = h.prev(); // third
    _ = h.prev(); // second
    _ = h.prev(); // first

    try std.testing.expectEqualStrings("second", h.next().?);
    try std.testing.expectEqualStrings("third", h.next().?);
}

test "InputHistory next at newest returns draft" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");
    h.saveDraft("draft text");

    _ = h.prev(); // second

    try std.testing.expectEqualStrings("draft text", h.next().?);
}

test "InputHistory next past newest returns draft repeatedly" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("entry");
    h.saveDraft("draft");

    _ = h.prev();
    _ = h.next();
    try std.testing.expectEqualStrings("draft", h.next().?);
    try std.testing.expectEqualStrings("draft", h.next().?);
}

// ============ Navigation: current() ============

test "InputHistory current without navigation returns draft" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    try std.testing.expect(h.current() == null);

    h.saveDraft("draft");
    try std.testing.expectEqualStrings("draft", h.current().?);
}

test "InputHistory current returns navigated entry" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");

    _ = h.prev();
    try std.testing.expectEqualStrings("second", h.current().?);

    _ = h.prev();
    try std.testing.expectEqualStrings("first", h.current().?);
}

// ============ Navigation: reset() ============

test "InputHistory reset clears navigation" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");

    _ = h.prev();
    _ = h.prev();
    try std.testing.expect(h.nav_idx != null);

    h.reset();
    try std.testing.expect(h.nav_idx == null);
    try std.testing.expect(h.current() == null);
}

test "InputHistory reset allows fresh navigation" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");
    h.push("second");

    _ = h.prev();
    _ = h.prev();
    h.reset();

    try std.testing.expectEqualStrings("second", h.prev().?);
}

// ============ Draft Operations ============

test "InputHistory saveDraft stores text" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.saveDraft("my draft");
    try std.testing.expectEqualStrings("my draft", h.getDraft().?);
}

test "InputHistory saveDraft overwrites previous" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.saveDraft("draft 1");
    h.saveDraft("draft 2");
    h.saveDraft("draft 3");

    try std.testing.expectEqualStrings("draft 3", h.getDraft().?);
}

test "InputHistory saveDraft empty string" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.saveDraft("");
    try std.testing.expectEqualStrings("", h.getDraft().?);
}

test "InputHistory getDraft returns null when no draft" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    try std.testing.expect(h.getDraft() == null);
}

test "InputHistory clearDraft removes draft" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.saveDraft("draft");
    try std.testing.expect(h.getDraft() != null);

    h.clearDraft();
    try std.testing.expect(h.getDraft() == null);
}

test "InputHistory clearDraft on no draft is safe" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.clearDraft();
    h.clearDraft();
    try std.testing.expect(h.getDraft() == null);
}

// ============ Ring Buffer Behavior ============

test "InputHistory ring buffer wraps at capacity" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    for (0..InputHistory.MAX_CAPACITY) |i| {
        var buf: [32]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "entry{d}", .{i}) catch continue;
        h.push(s);
    }

    try std.testing.expectEqual(InputHistory.MAX_CAPACITY, h.count);
    try std.testing.expectEqual(@as(usize, 0), h.write_idx);
}

test "InputHistory ring buffer overwrites oldest" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    for (0..InputHistory.MAX_CAPACITY + 5) |i| {
        var buf: [32]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "entry{d}", .{i}) catch continue;
        h.push(s);
    }

    try std.testing.expectEqual(InputHistory.MAX_CAPACITY, h.count);

    // Navigate to oldest - should be entry5 (first 5 overwritten)
    for (0..InputHistory.MAX_CAPACITY) |_| {
        _ = h.prev();
    }

    const oldest = h.current().?;
    try std.testing.expect(std.mem.startsWith(u8, oldest, "entry5"));
}

test "InputHistory ring buffer count stays at max" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    for (0..InputHistory.MAX_CAPACITY * 2) |i| {
        var buf: [32]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "e{d}", .{i}) catch continue;
        h.push(s);
    }

    try std.testing.expectEqual(InputHistory.MAX_CAPACITY, h.count);
}

test "InputHistory ring buffer navigation after wrap" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    for (0..InputHistory.MAX_CAPACITY + 3) |i| {
        var buf: [32]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "item{d}", .{i}) catch continue;
        h.push(s);
    }

    // Most recent should be item102
    const newest = h.prev().?;
    try std.testing.expect(std.mem.startsWith(u8, newest, "item102"));

    // Navigate back through all entries
    var count: usize = 1;
    while (count < InputHistory.MAX_CAPACITY) : (count += 1) {
        const entry = h.prev();
        try std.testing.expect(entry != null);
    }

    // Should be at oldest (item3)
    const oldest = h.current().?;
    try std.testing.expect(std.mem.startsWith(u8, oldest, "item3"));
}

// ============ Edge Cases ============

test "InputHistory navigation interleaved with push" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("a");
    h.push("b");

    _ = h.prev(); // b
    _ = h.prev(); // a

    h.push("c");

    // After push, navigation state is not reset automatically
    // but nav_idx might point to stale data
    // Let's verify the history contains a, b, c
    try std.testing.expectEqual(@as(usize, 3), h.count);
}

test "InputHistory deinit cleans all allocations" {
    var h = InputHistory.init(std.testing.allocator);

    h.push("entry1");
    h.push("entry2");
    h.push("entry3");
    h.saveDraft("draft");

    h.deinit();
    // If allocator detects leaks, test will fail
}

test "InputHistory deinit on empty is safe" {
    var h = InputHistory.init(std.testing.allocator);
    h.deinit();
}

test "InputHistory deinit with only draft" {
    var h = InputHistory.init(std.testing.allocator);
    h.saveDraft("only draft");
    h.deinit();
}

test "InputHistory push very long string" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    const long_str = "x" ** 10000;
    h.push(long_str);

    try std.testing.expectEqual(@as(usize, 1), h.count);
    try std.testing.expectEqualStrings(long_str, h.prev().?);
}

test "InputHistory push special characters" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("hello\nworld");
    h.push("tab\there");
    h.push("emoji: 🎉");
    h.push("null\x00byte");

    try std.testing.expectEqual(@as(usize, 4), h.count);
}

test "InputHistory push whitespace only" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("   ");
    h.push("\t\t");
    h.push("\n");

    try std.testing.expectEqual(@as(usize, 3), h.count);
}

test "InputHistory MAX_CAPACITY constant" {
    try std.testing.expectEqual(@as(usize, 100), InputHistory.MAX_CAPACITY);
}

// ============ Complex Scenarios ============

test "InputHistory full navigation cycle" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("cmd1");
    h.push("cmd2");
    h.push("cmd3");
    h.saveDraft("typing...");

    // Navigate up through history
    try std.testing.expectEqualStrings("cmd3", h.prev().?);
    try std.testing.expectEqualStrings("cmd2", h.prev().?);
    try std.testing.expectEqualStrings("cmd1", h.prev().?);
    try std.testing.expectEqualStrings("cmd1", h.prev().?); // stays

    // Navigate back down
    try std.testing.expectEqualStrings("cmd2", h.next().?);
    try std.testing.expectEqualStrings("cmd3", h.next().?);
    try std.testing.expectEqualStrings("typing...", h.next().?); // draft
    try std.testing.expectEqualStrings("typing...", h.next().?); // stays

    // Current shows draft
    try std.testing.expectEqualStrings("typing...", h.current().?);
}

test "InputHistory draft preserved during navigation" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("history1");
    h.push("history2");
    h.saveDraft("my work in progress");

    // Navigate into history
    _ = h.prev();
    _ = h.prev();

    // Draft should still exist
    try std.testing.expectEqualStrings("my work in progress", h.getDraft().?);

    // Navigate back to draft
    _ = h.next();
    _ = h.next();
    try std.testing.expectEqualStrings("my work in progress", h.current().?);
}

test "InputHistory reset then navigate" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("a");
    h.push("b");
    h.push("c");

    _ = h.prev();
    _ = h.prev();
    h.reset();

    // Should start fresh from newest
    try std.testing.expectEqualStrings("c", h.prev().?);
}

test "InputHistory multiple cycles" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("first");

    // Cycle 1
    try std.testing.expectEqualStrings("first", h.prev().?);
    try std.testing.expect(h.next() == null);

    // Cycle 2
    try std.testing.expectEqualStrings("first", h.prev().?);
    try std.testing.expect(h.next() == null);

    h.push("second");

    // Cycle 3
    try std.testing.expectEqualStrings("second", h.prev().?);
    try std.testing.expectEqualStrings("first", h.prev().?);
}

test "InputHistory alternating prev/next" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    h.push("a");
    h.push("b");
    h.push("c");

    try std.testing.expectEqualStrings("c", h.prev().?);
    try std.testing.expectEqualStrings("b", h.prev().?);
    try std.testing.expectEqualStrings("c", h.next().?);
    try std.testing.expectEqualStrings("b", h.prev().?);
    try std.testing.expectEqualStrings("a", h.prev().?);
    try std.testing.expectEqualStrings("b", h.next().?);
}

// ============ Memory Safety ============

test "InputHistory entries are independent copies" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    var buf: [32]u8 = undefined;
    @memcpy(buf[0..5], "hello");
    h.push(buf[0..5]);

    // Modify original buffer
    @memcpy(buf[0..5], "world");

    // History should retain original
    try std.testing.expectEqualStrings("hello", h.prev().?);
}

test "InputHistory draft is independent copy" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    var buf: [32]u8 = undefined;
    @memcpy(buf[0..5], "draft");
    h.saveDraft(buf[0..5]);

    // Modify original buffer
    @memcpy(buf[0..5], "XXXXX");

    // Draft should retain original
    try std.testing.expectEqualStrings("draft", h.getDraft().?);
}

// ============ Boundary Conditions ============

test "InputHistory exactly at capacity" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    for (0..InputHistory.MAX_CAPACITY) |i| {
        var buf: [32]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "e{d}", .{i}) catch continue;
        h.push(s);
    }

    try std.testing.expectEqual(InputHistory.MAX_CAPACITY, h.count);
    try std.testing.expectEqual(@as(usize, 0), h.write_idx);

    // Add one more
    h.push("overflow");
    try std.testing.expectEqual(InputHistory.MAX_CAPACITY, h.count);
    try std.testing.expectEqual(@as(usize, 1), h.write_idx);
}

test "InputHistory write_idx wraps correctly" {
    var h = InputHistory.init(std.testing.allocator);
    defer h.deinit();

    // Fill to capacity
    for (0..InputHistory.MAX_CAPACITY) |i| {
        var buf: [8]u8 = undefined;
        const s = std.fmt.bufPrint(&buf, "{d}", .{i}) catch continue;
        h.push(s);
    }

    try std.testing.expectEqual(@as(usize, 0), h.write_idx);

    // Add one more - should wrap to index 1
    h.push("new");
    try std.testing.expectEqual(@as(usize, 1), h.write_idx);
}
