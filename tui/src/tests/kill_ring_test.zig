const std = @import("std");
const KillRing = @import("../editor/kill_ring.zig").KillRing;

// ============ Basic Operations ============

test "init: default state" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expectEqual(@as(usize, 0), ring.len());
    try std.testing.expect(ring.isEmpty());
    try std.testing.expect(!ring.last_action_was_kill);
    try std.testing.expectEqual(@as(usize, 0), ring.current);
    try std.testing.expectEqual(@as(usize, 100), ring.max_entries);
}

test "init: custom max_entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.max_entries = 5;
    defer ring.deinit();

    try std.testing.expectEqual(@as(usize, 5), ring.max_entries);
}

test "deinit: frees all entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);
    ring.breakAccumulation();
    try ring.add("third", false);

    ring.deinit();
}

test "deinit: empty ring no crash" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.deinit();
}

// ============ Add Operations ============

test "add: single entry" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expect(!ring.isEmpty());
    try std.testing.expect(ring.last_action_was_kill);
}

test "add: empty text ignored" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("", false);

    try std.testing.expectEqual(@as(usize, 0), ring.len());
    try std.testing.expect(ring.isEmpty());
    try std.testing.expect(!ring.last_action_was_kill);
}

test "add: multiple entries with break" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);
    ring.breakAccumulation();
    try ring.add("third", false);

    try std.testing.expectEqual(@as(usize, 3), ring.len());
}

test "add: sets current to len after new entry" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    try std.testing.expectEqual(@as(usize, 1), ring.current);

    ring.breakAccumulation();
    try ring.add("second", false);
    try std.testing.expectEqual(@as(usize, 2), ring.current);
}

test "add: special characters preserved" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    const special = "hello\nworld\ttab\"quotes'single\\backslash";
    try ring.add(special, false);

    try std.testing.expectEqualStrings(special, ring.yank().?);
}

test "add: unicode preserved" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    const unicode = "こんにちは 🎉 émojis 中文 العربية";
    try ring.add(unicode, false);

    try std.testing.expectEqualStrings(unicode, ring.yank().?);
}

test "add: binary data preserved" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    const binary = "\x00\x01\x02\xff\xfe";
    try ring.add(binary, false);

    try std.testing.expectEqualSlices(u8, binary, ring.yank().?);
}

// ============ Max Entries Eviction ============

test "add: max entries eviction" {
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

test "add: max entries eviction multiple times" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.max_entries = 2;
    defer ring.deinit();

    try ring.add("one", false);
    ring.breakAccumulation();
    try ring.add("two", false);
    ring.breakAccumulation();
    try ring.add("three", false);
    ring.breakAccumulation();
    try ring.add("four", false);
    ring.breakAccumulation();
    try ring.add("five", false);

    try std.testing.expectEqual(@as(usize, 2), ring.len());
    try std.testing.expectEqualStrings("four", ring.entries.items[0]);
    try std.testing.expectEqualStrings("five", ring.entries.items[1]);
}

test "add: max entries of 1" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.max_entries = 1;
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);
    ring.breakAccumulation();
    try ring.add("third", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("third", ring.yank().?);
}

// ============ Accumulation - Append Mode ============

test "accumulation: append consecutive kills" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try ring.add(" ", false);
    try ring.add("world", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("hello world", ring.yank().?);
}

test "accumulation: append many consecutive kills" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("a", false);
    try ring.add("b", false);
    try ring.add("c", false);
    try ring.add("d", false);
    try ring.add("e", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("abcde", ring.yank().?);
}

// ============ Accumulation - Prepend Mode ============

test "accumulation: prepend mode" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("world", false);
    try ring.add("hello ", true);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("hello world", ring.yank().?);
}

test "accumulation: prepend multiple times" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("c", false);
    try ring.add("b", true);
    try ring.add("a", true);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("abc", ring.yank().?);
}

test "accumulation: mixed append and prepend" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("middle", false);
    try ring.add("start-", true);
    try ring.add("-end", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("start-middle-end", ring.yank().?);
}

// ============ Break Accumulation ============

test "breakAccumulation: stops accumulation" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    ring.breakAccumulation();
    try ring.add("world", false);

    try std.testing.expectEqual(@as(usize, 2), ring.len());
    try std.testing.expectEqualStrings("hello", ring.entries.items[0]);
    try std.testing.expectEqualStrings("world", ring.entries.items[1]);
}

test "breakAccumulation: clears flag" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try std.testing.expect(ring.last_action_was_kill);

    ring.breakAccumulation();
    try std.testing.expect(!ring.last_action_was_kill);
}

test "breakAccumulation: multiple calls safe" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    ring.breakAccumulation();
    ring.breakAccumulation();
    ring.breakAccumulation();

    try std.testing.expect(!ring.last_action_was_kill);
}

test "breakAccumulation: on empty ring" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    ring.breakAccumulation();

    try std.testing.expect(ring.isEmpty());
}

// ============ Yank Operations ============

test "yank: returns most recent" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);
    ring.breakAccumulation();
    try ring.add("third", false);

    try std.testing.expectEqualStrings("third", ring.yank().?);
}

test "yank: empty ring returns null" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expect(ring.yank() == null);
}

test "yank: resets current to len" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);

    ring.current = 0;
    _ = ring.yank();

    try std.testing.expectEqual(@as(usize, 2), ring.current);
}

test "yank: multiple calls return same value" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);

    try std.testing.expectEqualStrings("hello", ring.yank().?);
    try std.testing.expectEqualStrings("hello", ring.yank().?);
    try std.testing.expectEqualStrings("hello", ring.yank().?);
}

// ============ Yank Pop Operations ============

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

test "yankPop: wraps around to end" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.breakAccumulation();
    try ring.add("second", false);

    _ = ring.yank();
    _ = ring.yankPop(); // second
    _ = ring.yankPop(); // first
    try std.testing.expectEqualStrings("second", ring.yankPop().?); // wraps
}

test "yankPop: empty ring returns null" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expect(ring.yankPop() == null);
}

test "yankPop: single entry cycles" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("only", false);

    _ = ring.yank();
    try std.testing.expectEqualStrings("only", ring.yankPop().?);
    try std.testing.expectEqualStrings("only", ring.yankPop().?);
    try std.testing.expectEqualStrings("only", ring.yankPop().?);
}

test "yankPop: current wraps when at 0" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("a", false);
    ring.breakAccumulation();
    try ring.add("b", false);
    ring.breakAccumulation();
    try ring.add("c", false);

    ring.current = 0;
    const result = ring.yankPop();

    try std.testing.expectEqualStrings("c", result.?);
    try std.testing.expectEqual(@as(usize, 2), ring.current);
}

test "yankPop: updates current correctly" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("a", false);
    ring.breakAccumulation();
    try ring.add("b", false);
    ring.breakAccumulation();
    try ring.add("c", false);

    _ = ring.yank();
    try std.testing.expectEqual(@as(usize, 3), ring.current);

    _ = ring.yankPop();
    try std.testing.expectEqual(@as(usize, 2), ring.current);

    _ = ring.yankPop();
    try std.testing.expectEqual(@as(usize, 1), ring.current);

    _ = ring.yankPop();
    try std.testing.expectEqual(@as(usize, 0), ring.current);
}

// ============ Len and isEmpty ============

test "len: returns correct count" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expectEqual(@as(usize, 0), ring.len());

    try ring.add("a", false);
    try std.testing.expectEqual(@as(usize, 1), ring.len());

    ring.breakAccumulation();
    try ring.add("b", false);
    try std.testing.expectEqual(@as(usize, 2), ring.len());
}

test "isEmpty: true when empty" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try std.testing.expect(ring.isEmpty());
}

test "isEmpty: false when has entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try std.testing.expect(!ring.isEmpty());
}

// ============ Edge Cases ============

test "edge: add empty after non-empty" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try ring.add("", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("hello", ring.yank().?);
}

test "edge: accumulation with current at 0" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    ring.current = 0;
    try ring.add("second", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("firstsecond", ring.yank().?);
}

test "edge: very long text" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    const long_text = "x" ** 10000;
    try ring.add(long_text, false);

    try std.testing.expectEqual(@as(usize, 10000), ring.yank().?.len);
    try std.testing.expectEqualStrings(long_text, ring.yank().?);
}

test "edge: accumulate very long text" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    const chunk = "x" ** 1000;
    try ring.add(chunk, false);
    try ring.add(chunk, false);
    try ring.add(chunk, false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqual(@as(usize, 3000), ring.yank().?.len);
}

test "edge: single character entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("a", false);
    ring.breakAccumulation();
    try ring.add("b", false);
    ring.breakAccumulation();
    try ring.add("c", false);

    try std.testing.expectEqual(@as(usize, 3), ring.len());
    try std.testing.expectEqualStrings("c", ring.yank().?);
    try std.testing.expectEqualStrings("c", ring.yankPop().?);
    try std.testing.expectEqualStrings("b", ring.yankPop().?);
    try std.testing.expectEqualStrings("a", ring.yankPop().?);
}

test "edge: whitespace only entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("   ", false);
    try ring.add("\t\t", false);
    try ring.add("\n\n", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("   \t\t\n\n", ring.yank().?);
}

test "edge: newlines in text" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("line1\nline2\nline3", false);

    try std.testing.expectEqualStrings("line1\nline2\nline3", ring.yank().?);
}

// ============ Workflow Tests ============

test "workflow: typical emacs kill-yank cycle" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("killed text 1", false);
    ring.breakAccumulation();

    try ring.add("killed text 2", false);
    ring.breakAccumulation();

    const yanked = ring.yank();
    try std.testing.expectEqualStrings("killed text 2", yanked.?);

    const prev = ring.yankPop();
    try std.testing.expectEqualStrings("killed text 2", prev.?);

    const older = ring.yankPop();
    try std.testing.expectEqualStrings("killed text 1", older.?);
}

test "workflow: kill line accumulation (Ctrl+K repeated)" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first line\n", false);
    try ring.add("second line\n", false);
    try ring.add("third line", false);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("first line\nsecond line\nthird line", ring.yank().?);
}

test "workflow: backward kill accumulation (Ctrl+U repeated with prepend)" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("end", false);
    try ring.add("middle-", true);
    try ring.add("start-", true);

    try std.testing.expectEqual(@as(usize, 1), ring.len());
    try std.testing.expectEqualStrings("start-middle-end", ring.yank().?);
}

test "workflow: interleaved kills and other actions" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("first", false);
    try ring.add(" part", false);
    ring.breakAccumulation();

    try ring.add("second", false);
    ring.breakAccumulation();

    try ring.add("third", false);
    try ring.add(" chunk", false);

    try std.testing.expectEqual(@as(usize, 3), ring.len());
    try std.testing.expectEqualStrings("first part", ring.entries.items[0]);
    try std.testing.expectEqualStrings("second", ring.entries.items[1]);
    try std.testing.expectEqualStrings("third chunk", ring.entries.items[2]);
}

test "workflow: yank then continue editing then yank-pop" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("old", false);
    ring.breakAccumulation();
    try ring.add("new", false);

    _ = ring.yank();

    ring.breakAccumulation();

    try std.testing.expectEqualStrings("new", ring.yankPop().?);
    try std.testing.expectEqualStrings("old", ring.yankPop().?);
}

// ============ Memory Safety Tests ============

test "memory: no leaks on accumulation" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("hello", false);
    try ring.add(" world", false);
    try ring.add("!", false);
}

test "memory: no leaks on eviction" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.max_entries = 2;
    defer ring.deinit();

    try ring.add("one", false);
    ring.breakAccumulation();
    try ring.add("two", false);
    ring.breakAccumulation();
    try ring.add("three", false);
    ring.breakAccumulation();
    try ring.add("four", false);
}

test "memory: no leaks with prepend accumulation" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    defer ring.deinit();

    try ring.add("c", false);
    try ring.add("b", true);
    try ring.add("a", true);
}

test "memory: stress test many entries" {
    const allocator = std.testing.allocator;
    var ring = KillRing.init(allocator);
    ring.max_entries = 10;
    defer ring.deinit();

    var i: usize = 0;
    while (i < 100) : (i += 1) {
        var buf: [32]u8 = undefined;
        const text = std.fmt.bufPrint(&buf, "entry-{d}", .{i}) catch unreachable;
        try ring.add(text, false);
        ring.breakAccumulation();
    }

    try std.testing.expectEqual(@as(usize, 10), ring.len());
}
