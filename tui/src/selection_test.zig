const std = @import("std");
const selection = @import("selection.zig");
const clipboard_mod = @import("clipboard.zig");

const Selection = selection.Selection;

test "Selection bounds" {
    const TestSelection = Selection(clipboard_mod.MockClipboard);
    var sel = TestSelection.init();
    sel.start(5, 10, 0);
    sel.update(15, 12, 0);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(u16, 5), bounds.min_x);
    try std.testing.expectEqual(@as(i32, 10), bounds.min_y);
    try std.testing.expectEqual(@as(u16, 15), bounds.max_x);
    try std.testing.expectEqual(@as(i32, 12), bounds.max_y);
}

test "Selection with scroll offset" {
    const TestSelection = Selection(clipboard_mod.MockClipboard);
    var sel = TestSelection.init();
    sel.start(5, 5, 10);
    sel.update(15, 8, 10);

    const bounds = sel.getBounds();
    try std.testing.expectEqual(@as(i32, 15), bounds.min_y);
    try std.testing.expectEqual(@as(i32, 18), bounds.max_y);

    const screen_bounds = sel.getScreenBounds(10);
    try std.testing.expectEqual(@as(i32, 5), screen_bounds.min_y);
    try std.testing.expectEqual(@as(i32, 8), screen_bounds.max_y);
}
