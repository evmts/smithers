const std = @import("std");
const vaxis = @import("vaxis");

const ChatHistory = @import("../components/chat_history.zig").ChatHistory;
const Layout = @import("../layout.zig").Layout;
const selection_mod = @import("../selection.zig");

pub const MouseHandler = struct {
    alloc: std.mem.Allocator,

    pub fn init(alloc: std.mem.Allocator) MouseHandler {
        return .{ .alloc = alloc };
    }

    pub fn handleMouse(self: *MouseHandler, mouse: vaxis.Mouse, chat_history: *ChatHistory) void {
        // Handle scroll wheel
        if (mouse.button == .wheel_up) {
            chat_history.scrollUp(3);
        } else if (mouse.button == .wheel_down) {
            chat_history.scrollDown(3);
        }
        // Handle text selection
        else if (mouse.button == .left) {
            const col: u16 = if (mouse.col >= 0) @intCast(mouse.col) else 0;
            // Adjust row for header offset
            const raw_row: i16 = mouse.row - @as(i16, Layout.HEADER_HEIGHT);
            const row: u16 = if (raw_row >= 0) @intCast(raw_row) else 0;

            if (mouse.type == .press) {
                // Start selection
                chat_history.startSelection(col, row);
            } else if (mouse.type == .drag) {
                // Drag - update selection
                chat_history.updateSelection(col, row);
            } else if (mouse.type == .release) {
                // End selection and copy if we have one
                chat_history.endSelection();
                if (chat_history.getSelectedText()) |text| {
                    defer self.alloc.free(text);
                    selection_mod.copyToClipboard(self.alloc, text) catch {};
                }
            }
        }
    }
};
