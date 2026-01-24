const std = @import("std");
const testing = std.testing;
const SelectList = @import("../commands/select_list.zig").SelectList;

// =============================================================================
// Selection Navigation Tests
// =============================================================================

test "moveDown increments selected_index" {
    const items = [_]u32{ 10, 20, 30 };
    var list = SelectList(u32).init(&items, 3);

    try testing.expectEqual(@as(usize, 0), list.selected_index);
    list.moveDown();
    try testing.expectEqual(@as(usize, 1), list.selected_index);
    list.moveDown();
    try testing.expectEqual(@as(usize, 2), list.selected_index);
}

test "moveUp decrements selected_index" {
    const items = [_]u32{ 10, 20, 30 };
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 2;

    list.moveUp();
    try testing.expectEqual(@as(usize, 1), list.selected_index);
    list.moveUp();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
}

test "moveDown wraps from last to first" {
    const items = [_]u32{ 10, 20, 30 };
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 2;

    list.moveDown();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expectEqual(@as(u32, 10), list.selectedItem().?);
}

test "moveUp wraps from first to last" {
    const items = [_]u32{ 10, 20, 30 };
    var list = SelectList(u32).init(&items, 3);

    list.moveUp();
    try testing.expectEqual(@as(usize, 2), list.selected_index);
    try testing.expectEqual(@as(u32, 30), list.selectedItem().?);
}

test "multiple wrap-around cycles" {
    const items = [_]u32{ 1, 2 };
    var list = SelectList(u32).init(&items, 2);

    // Wrap down multiple times
    list.moveDown(); // 0 -> 1
    list.moveDown(); // 1 -> 0 (wrap)
    list.moveDown(); // 0 -> 1
    try testing.expectEqual(@as(usize, 1), list.selected_index);

    // Wrap up multiple times
    list.moveUp(); // 1 -> 0
    list.moveUp(); // 0 -> 1 (wrap)
    list.moveUp(); // 1 -> 0
    try testing.expectEqual(@as(usize, 0), list.selected_index);
}

test "isSelected returns correct values" {
    const items = [_]u32{ 10, 20, 30 };
    var list = SelectList(u32).init(&items, 3);

    try testing.expect(list.isSelected(0));
    try testing.expect(!list.isSelected(1));
    try testing.expect(!list.isSelected(2));

    list.moveDown();
    try testing.expect(!list.isSelected(0));
    try testing.expect(list.isSelected(1));
    try testing.expect(!list.isSelected(2));
}

// =============================================================================
// Boundary Conditions Tests
// =============================================================================

test "single item list navigation" {
    const items = [_]u32{42};
    var list = SelectList(u32).init(&items, 3);

    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expectEqual(@as(u32, 42), list.selectedItem().?);

    // moveDown wraps to same element
    list.moveDown();
    try testing.expectEqual(@as(usize, 0), list.selected_index);

    // moveUp wraps to same element
    list.moveUp();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
}

test "visible_rows larger than items count" {
    const items = [_]u32{ 1, 2, 3 };
    var list = SelectList(u32).init(&items, 100);

    const range = list.visibleRange();
    try testing.expectEqual(@as(usize, 0), range.start);
    try testing.expectEqual(@as(usize, 3), range.end); // clamped to items.len
}

test "visible_rows of zero" {
    const items = [_]u32{ 1, 2, 3 };
    var list = SelectList(u32).init(&items, 0);

    const range = list.visibleRange();
    try testing.expectEqual(@as(usize, 0), range.start);
    try testing.expectEqual(@as(usize, 0), range.end);
}

test "clampSelection with index beyond items length" {
    const items = [_]u32{ 1, 2, 3 };
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 10; // beyond bounds

    list.clampSelection();
    try testing.expectEqual(@as(usize, 2), list.selected_index);
    try testing.expectEqual(@as(u32, 3), list.selectedItem().?);
}

test "clampSelection with index at exact boundary" {
    const items = [_]u32{ 1, 2, 3 };
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 3; // exactly at items.len

    list.clampSelection();
    try testing.expectEqual(@as(usize, 2), list.selected_index);
}

test "setItems resets selection when new list is smaller" {
    const items1 = [_]u32{ 1, 2, 3, 4, 5 };
    var list = SelectList(u32).init(&items1, 3);
    list.selected_index = 4;

    const items2 = [_]u32{ 10, 20 };
    list.setItems(&items2);

    try testing.expectEqual(@as(usize, 1), list.selected_index);
    try testing.expectEqual(@as(u32, 20), list.selectedItem().?);
}

test "setItems to empty list" {
    const items1 = [_]u32{ 1, 2, 3 };
    var list = SelectList(u32).init(&items1, 3);
    list.selected_index = 2;

    const items2 = [_]u32{};
    list.setItems(&items2);

    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expect(list.selectedItem() == null);
}

test "setItems to larger list preserves selection" {
    const items1 = [_]u32{ 1, 2 };
    var list = SelectList(u32).init(&items1, 3);
    list.selected_index = 1;

    const items2 = [_]u32{ 10, 20, 30, 40, 50 };
    list.setItems(&items2);

    try testing.expectEqual(@as(usize, 1), list.selected_index);
    try testing.expectEqual(@as(u32, 20), list.selectedItem().?);
}

// =============================================================================
// Empty List Handling Tests
// =============================================================================

test "empty list init" {
    const items = [_]u32{};
    const list = SelectList(u32).init(&items, 3);

    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expectEqual(@as(usize, 0), list.scroll_offset);
    try testing.expect(list.selectedItem() == null);
}

test "empty list moveDown does nothing" {
    const items = [_]u32{};
    var list = SelectList(u32).init(&items, 3);

    list.moveDown();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expect(list.selectedItem() == null);
}

test "empty list moveUp does nothing" {
    const items = [_]u32{};
    var list = SelectList(u32).init(&items, 3);

    list.moveUp();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expect(list.selectedItem() == null);
}

test "empty list visibleRange returns zero range" {
    const items = [_]u32{};
    const list = SelectList(u32).init(&items, 3);

    const range = list.visibleRange();
    try testing.expectEqual(@as(usize, 0), range.start);
    try testing.expectEqual(@as(usize, 0), range.end);
}

test "empty list clampSelection resets to zero" {
    const items = [_]u32{};
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 5; // artificially set
    list.scroll_offset = 3;

    list.clampSelection();
    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expectEqual(@as(usize, 0), list.scroll_offset);
}

test "empty list isSelected always false for any index" {
    const items = [_]u32{};
    const list = SelectList(u32).init(&items, 3);

    try testing.expect(!list.isSelected(1));
    try testing.expect(!list.isSelected(100));
}

// =============================================================================
// Scroll Offset / Visible Range Tests
// =============================================================================

test "scroll_offset adjusts when moving down past visible area" {
    const items = [_]u32{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var list = SelectList(u32).init(&items, 3);

    // Move to index 3 (beyond visible range 0-2)
    list.moveDown(); // 1
    list.moveDown(); // 2
    list.moveDown(); // 3
    
    try testing.expectEqual(@as(usize, 3), list.selected_index);
    try testing.expectEqual(@as(usize, 1), list.scroll_offset);

    const range = list.visibleRange();
    try testing.expectEqual(@as(usize, 1), range.start);
    try testing.expectEqual(@as(usize, 4), range.end);
}

test "scroll_offset adjusts when moving up past visible area" {
    const items = [_]u32{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 5;
    list.scroll_offset = 3;

    // Move up past current scroll_offset
    list.moveUp(); // 4
    list.moveUp(); // 3
    list.moveUp(); // 2 - should adjust scroll_offset

    try testing.expectEqual(@as(usize, 2), list.selected_index);
    try testing.expectEqual(@as(usize, 2), list.scroll_offset);
}

test "wrap-around from end to start resets scroll_offset" {
    const items = [_]u32{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var list = SelectList(u32).init(&items, 3);
    list.selected_index = 7;
    list.scroll_offset = 5;

    list.moveDown(); // wraps to 0
    try testing.expectEqual(@as(usize, 0), list.selected_index);
    try testing.expectEqual(@as(usize, 0), list.scroll_offset);
}

test "wrap-around from start to end adjusts scroll_offset" {
    const items = [_]u32{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var list = SelectList(u32).init(&items, 3);

    list.moveUp(); // wraps to 7
    try testing.expectEqual(@as(usize, 7), list.selected_index);
    try testing.expectEqual(@as(usize, 5), list.scroll_offset);

    const range = list.visibleRange();
    try testing.expectEqual(@as(usize, 5), range.start);
    try testing.expectEqual(@as(usize, 8), range.end);
}

// =============================================================================
// Generic Type Tests
// =============================================================================

test "SelectList with string slices" {
    const items = [_][]const u8{ "apple", "banana", "cherry" };
    var list = SelectList([]const u8).init(&items, 3);

    try testing.expectEqualStrings("apple", list.selectedItem().?);
    list.moveDown();
    try testing.expectEqualStrings("banana", list.selectedItem().?);
}

test "SelectList with struct type" {
    const Item = struct {
        id: u32,
        name: []const u8,
    };

    const items = [_]Item{
        .{ .id = 1, .name = "first" },
        .{ .id = 2, .name = "second" },
        .{ .id = 3, .name = "third" },
    };
    var list = SelectList(Item).init(&items, 3);

    try testing.expectEqual(@as(u32, 1), list.selectedItem().?.id);
    list.moveDown();
    try testing.expectEqual(@as(u32, 2), list.selectedItem().?.id);
    try testing.expectEqualStrings("second", list.selectedItem().?.name);
}
