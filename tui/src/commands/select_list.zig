const std = @import("std");

/// Generic selectable list with keyboard navigation
pub fn SelectList(comptime T: type) type {
    return struct {
        items: []const T,
        selected_index: usize,
        scroll_offset: usize,
        visible_rows: usize,

        const Self = @This();

        pub fn init(items: []const T, visible_rows: usize) Self {
            return .{
                .items = items,
                .selected_index = 0,
                .scroll_offset = 0,
                .visible_rows = visible_rows,
            };
        }

        pub fn setItems(self: *Self, items: []const T) void {
            self.items = items;
            self.clampSelection();
        }

        pub fn moveUp(self: *Self) void {
            if (self.items.len == 0) return;
            if (self.selected_index > 0) {
                self.selected_index -= 1;
            } else {
                self.selected_index = self.items.len - 1;
            }
            self.ensureVisible();
        }

        pub fn moveDown(self: *Self) void {
            if (self.items.len == 0) return;
            if (self.selected_index < self.items.len - 1) {
                self.selected_index += 1;
            } else {
                self.selected_index = 0;
            }
            self.ensureVisible();
        }

        pub fn selectedItem(self: *const Self) ?T {
            if (self.items.len == 0) return null;
            return self.items[self.selected_index];
        }

        pub fn clampSelection(self: *Self) void {
            if (self.items.len == 0) {
                self.selected_index = 0;
                self.scroll_offset = 0;
                return;
            }
            if (self.selected_index >= self.items.len) {
                self.selected_index = self.items.len - 1;
            }
            self.ensureVisible();
        }

        fn ensureVisible(self: *Self) void {
            if (self.items.len == 0) return;

            if (self.selected_index < self.scroll_offset) {
                self.scroll_offset = self.selected_index;
            }
            const max_visible = @min(self.visible_rows, self.items.len);
            if (self.selected_index >= self.scroll_offset + max_visible) {
                self.scroll_offset = self.selected_index - max_visible + 1;
            }
        }

        pub fn visibleRange(self: *const Self) struct { start: usize, end: usize } {
            const start = self.scroll_offset;
            const end = @min(start + self.visible_rows, self.items.len);
            return .{ .start = start, .end = end };
        }

        pub fn isSelected(self: *const Self, index: usize) bool {
            return index == self.selected_index;
        }
    };
}
