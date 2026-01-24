const std = @import("std");
const selection_mod = @import("../selection.zig");
const clipboard_mod = @import("../clipboard.zig");

// Use MockClipboard for testable Selection
const TestSelection = selection_mod.Selection(clipboard_mod.MockClipboard);

test "Selection init state" {
    const sel = TestSelection.init();

    try std.testing.expectEqual(@as(u16, 0), sel.anchor_x);
    try std.testing.expectEqual(@as(i32, 0), sel.anchor_y);
    try std.testing.expectEqual(@as(u16, 0), sel.focus_x);
    try std.testing.expectEqual(@as(i32, 0), sel.focus_y);
    try std.testing.expect(!sel.is_selecting);
    try std.testing.expect(!sel.has_selection);
    try std.testing.expectEqual(@as(u16, 0), sel.start_scroll_offset);
}

test "Selection start sets anchor" {
    var sel = TestSelection.init();
    sel.start(10, 20, 5);

    try std.testing.expectEqual(@as(u16, 10), sel.anchor_x);
    try std.testing.expectEqual(@as(i32, 25), sel.anchor_y); // 20 + 5 scroll
    try std.testing.expectEqual(@as(u16, 10), sel.focus_x);
    try std.testing.expectEqual(@as(i32, 25), sel.focus_y);
    try std.testing.expect(sel.is_selecting);
    try std.testing.expect(!sel.has_selection);
    try std.testing.expectEqual(@as(u16, 5), sel.start_scroll_offset);
}

test "Selection update tracks focus" {
    var sel = TestSelection.init();
    sel.start(10, 20, 0);
    sel.update(30, 25, 0);

    try std.testing.expectEqual(@as(u16, 10), sel.anchor_x);
    try std.testing.expectEqual(@as(i32, 20), sel.anchor_y);
    try std.testing.expectEqual(@as(u16, 30), sel.focus_x);
    try std.testing.expectEqual(@as(i32, 25), sel.focus_y);
    try std.testing.expect(sel.has_selection);
}

test "Selection update same position no selection" {
    var sel = TestSelection.init();
    sel.start(10, 20, 0);
    sel.update(10, 20, 0);

    try std.testing.expect(!sel.has_selection);
}

test "Selection update only when selecting" {
    var sel = TestSelection.init();
    // Not started, update should do nothing
    sel.update(30, 25, 0);

    try std.testing.expectEqual(@as(u16, 0), sel.focus_x);
    try std.testing.expectEqual(@as(i32, 0), sel.focus_y);
    try std.testing.expect(!sel.has_selection);
}

test "Selection end stops selecting" {
    var sel = TestSelection.init();
    sel.start(10, 20, 0);
    sel.update(30, 25, 0);
    sel.end();

    try std.testing.expect(!sel.is_selecting);
    try std.testing.expect(sel.has_selection); // Selection remains
}

test "Selection clear resets everything" {
    var sel = TestSelection.init();
    sel.start(10, 20, 0);
    sel.update(30, 25, 0);
    sel.clear();

    try std.testing.expect(!sel.is_selecting);
    try std.testing.expect(!sel.has_selection);
}

test "Selection bounds normalized" {
    var sel = TestSelection.init();
    sel.start(5, 10, 0);
    sel.update(15, 12, 0);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(u16, 5), bounds.min_x);
    try std.testing.expectEqual(@as(i32, 10), bounds.min_y);
    try std.testing.expectEqual(@as(u16, 15), bounds.max_x);
    try std.testing.expectEqual(@as(i32, 12), bounds.max_y);
}

test "Selection reverse drag direction" {
    var sel = TestSelection.init();
    // Drag from bottom-right to top-left
    sel.start(30, 25, 0);
    sel.update(10, 15, 0);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(u16, 10), bounds.min_x);
    try std.testing.expectEqual(@as(i32, 15), bounds.min_y);
    try std.testing.expectEqual(@as(u16, 30), bounds.max_x);
    try std.testing.expectEqual(@as(i32, 25), bounds.max_y);
}

test "Selection with scroll offset" {
    var sel = TestSelection.init();
    sel.start(5, 5, 10);
    sel.update(15, 8, 10);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(i32, 15), bounds.min_y); // 5 + 10
    try std.testing.expectEqual(@as(i32, 18), bounds.max_y); // 8 + 10

    const screen_bounds = sel.getScreenBounds(10);
    try std.testing.expectEqual(@as(i32, 5), screen_bounds.min_y);
    try std.testing.expectEqual(@as(i32, 8), screen_bounds.max_y);
}

test "Selection getScreenBounds with different scroll" {
    var sel = TestSelection.init();
    sel.start(0, 10, 20); // content y = 30
    sel.update(10, 15, 20); // content y = 35

    // Check at different scroll offset
    const screen_bounds = sel.getScreenBounds(25);
    try std.testing.expectEqual(@as(i32, 5), screen_bounds.min_y); // 30 - 25
    try std.testing.expectEqual(@as(i32, 10), screen_bounds.max_y); // 35 - 25
}

test "Selection containsCell single line" {
    var sel = TestSelection.init();
    sel.start(5, 10, 0);
    sel.update(15, 10, 0);

    // On the line, in range
    try std.testing.expect(sel.containsCell(5, 10));
    try std.testing.expect(sel.containsCell(10, 10));
    try std.testing.expect(sel.containsCell(15, 10));

    // On the line, out of range
    try std.testing.expect(!sel.containsCell(4, 10));
    try std.testing.expect(!sel.containsCell(16, 10));

    // Different line
    try std.testing.expect(!sel.containsCell(10, 9));
    try std.testing.expect(!sel.containsCell(10, 11));
}

test "Selection containsCell multi line first line" {
    var sel = TestSelection.init();
    sel.start(10, 5, 0);
    sel.update(20, 8, 0);

    // First line (y=5): from anchor_x (10) to end of line
    try std.testing.expect(sel.containsCell(10, 5));
    try std.testing.expect(sel.containsCell(50, 5));
    try std.testing.expect(sel.containsCell(100, 5));
    try std.testing.expect(!sel.containsCell(9, 5)); // Before anchor
}

test "Selection containsCell multi line middle" {
    var sel = TestSelection.init();
    sel.start(10, 5, 0);
    sel.update(20, 8, 0);

    // Middle lines (y=6, y=7): entire line selected
    try std.testing.expect(sel.containsCell(0, 6));
    try std.testing.expect(sel.containsCell(50, 6));
    try std.testing.expect(sel.containsCell(100, 6));

    try std.testing.expect(sel.containsCell(0, 7));
    try std.testing.expect(sel.containsCell(50, 7));
}

test "Selection containsCell multi line last line" {
    var sel = TestSelection.init();
    sel.start(10, 5, 0);
    sel.update(20, 8, 0);

    // Last line (y=8): from start to focus_x (20)
    try std.testing.expect(sel.containsCell(0, 8));
    try std.testing.expect(sel.containsCell(10, 8));
    try std.testing.expect(sel.containsCell(20, 8));
    try std.testing.expect(!sel.containsCell(21, 8)); // After focus
}

test "Selection containsCell reverse drag multi line" {
    var sel = TestSelection.init();
    // Drag from bottom to top
    sel.start(20, 8, 0);
    sel.update(10, 5, 0);

    // First line (y=5): from focus_x (10) to end
    try std.testing.expect(sel.containsCell(10, 5));
    try std.testing.expect(sel.containsCell(50, 5));
    try std.testing.expect(!sel.containsCell(9, 5));

    // Last line (y=8): from start to anchor_x (20)
    try std.testing.expect(sel.containsCell(0, 8));
    try std.testing.expect(sel.containsCell(20, 8));
    try std.testing.expect(!sel.containsCell(21, 8));
}

test "Selection containsCell no selection" {
    var sel = TestSelection.init();

    try std.testing.expect(!sel.containsCell(0, 0));
    try std.testing.expect(!sel.containsCell(10, 10));
}

test "Selection containsCell cleared selection" {
    var sel = TestSelection.init();
    sel.start(5, 10, 0);
    sel.update(15, 12, 0);
    sel.clear();

    try std.testing.expect(!sel.containsCell(10, 11));
}

test "Selection containsCell while selecting" {
    var sel = TestSelection.init();
    sel.start(5, 10, 0);
    sel.update(15, 10, 0);
    // Still selecting, should still work

    try std.testing.expect(sel.containsCell(10, 10));
}

test "Selection copyToClipboard integration" {
    clipboard_mod.MockClipboard.reset();

    try TestSelection.copyToClipboard(std.testing.allocator, "hello world");

    try std.testing.expectEqualStrings("hello world", clipboard_mod.MockClipboard.getLastCopied().?);
    try std.testing.expectEqual(@as(usize, 1), clipboard_mod.MockClipboard.getCopyCount());
}

test "Selection copyToClipboard multiple calls" {
    clipboard_mod.MockClipboard.reset();

    try TestSelection.copyToClipboard(std.testing.allocator, "first");
    try TestSelection.copyToClipboard(std.testing.allocator, "second");

    try std.testing.expectEqualStrings("second", clipboard_mod.MockClipboard.getLastCopied().?);
    try std.testing.expectEqual(@as(usize, 2), clipboard_mod.MockClipboard.getCopyCount());
}

test "Selection type can be instantiated with MockClipboard" {
    const TestSelection = selection_mod.Selection(clipboard_mod.MockClipboard);
    const sel = TestSelection.init();
    try std.testing.expect(!sel.is_selecting);
}

test "Legacy copyToClipboard function" {
    // Just verify it compiles - actual clipboard call would need system
    _ = selection_mod.copyToClipboard;
}
