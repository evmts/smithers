const std = @import("std");
const select_list = @import("select_list.zig");

const SelectList = select_list.SelectList;

test "SelectList navigation" {
    const testing = std.testing;
    const items = [_]u32{ 1, 2, 3, 4, 5 };
    var list = SelectList(u32).init(&items, 3);

    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expectEqual(@as(u32, 1), list.selectedItem().?);

    list.moveDown();
    try testing.expectEqual(@as(usize, 1), list.selected_index);

    list.moveUp();
    try testing.expectEqual(@as(usize, 0), list.selected_index);

    list.moveUp();
    try testing.expectEqual(@as(usize, 4), list.selected_index);

    list.moveDown();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
}

test "SelectList empty list" {
    const testing = std.testing;
    const items = [_]u32{};
    var list = SelectList(u32).init(&items, 3);

    try testing.expect(list.selectedItem() == null);

    list.moveDown();
    try testing.expect(list.selectedItem() == null);

    list.moveUp();
    try testing.expect(list.selectedItem() == null);
}

test "SelectList clamp on resize" {
    const testing = std.testing;
    const items1 = [_]u32{ 1, 2, 3, 4, 5 };
    var list = SelectList(u32).init(&items1, 3);

    list.selected_index = 4;
    try testing.expectEqual(@as(u32, 5), list.selectedItem().?);

    const items2 = [_]u32{ 1, 2 };
    list.setItems(&items2);

    try testing.expectEqual(@as(usize, 1), list.selected_index);
    try testing.expectEqual(@as(u32, 2), list.selectedItem().?);
}

test "SelectList visible range" {
    const testing = std.testing;
    const items = [_]u32{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var list = SelectList(u32).init(&items, 3);

    var range = list.visibleRange();
    try testing.expectEqual(@as(usize, 0), range.start);
    try testing.expectEqual(@as(usize, 3), range.end);

    list.selected_index = 5;
    list.clampSelection();
    range = list.visibleRange();
    try testing.expectEqual(@as(usize, 3), range.start);
    try testing.expectEqual(@as(usize, 6), range.end);
}
