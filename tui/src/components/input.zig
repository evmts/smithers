const std = @import("std");
const event_mod = @import("../event.zig");
const Editor = @import("../editor/editor.zig").Editor;

const border_color = .{ 0x7a, 0xa2, 0xf7 }; // Blue
const prompt_color = .{ 0xbb, 0x9a, 0xf7 }; // Purple
const text_color: u8 = 15; // White
const cursor_color: u8 = 75; // Blue


/// Available commands for autocomplete
const commands = [_][]const u8{
    "/exit",
    "/help",
    "/clear",
    "/new",
    "/model",
    "/compact",
    "/status",
    "/diff",
    "/init",
    "/mcp",
};

/// Generic chat input component with bordered text box and full editor features
pub fn Input(comptime R: type) type {
    const InputEvent = event_mod.Event(R);

    return struct {
        editor: Editor,
        allocator: std.mem.Allocator,

        const Self = @This();

        pub fn init(allocator: std.mem.Allocator) Self {
            return .{
                .editor = Editor.init(allocator),
                .allocator = allocator,
            };
        }

        pub fn deinit(self: *Self) void {
            self.editor.deinit();
        }

        /// Get matching command for autocomplete
        fn getAutocomplete(self: *Self) ?[]const u8 {
            const text = self.getText() catch return null;
            defer self.allocator.free(text);

            if (text.len == 0 or text[0] != '/') return null;

            for (commands) |cmd| {
                if (std.mem.startsWith(u8, cmd, text) and cmd.len > text.len) {
                    return cmd;
                }
            }
            return null;
        }

        /// Apply autocomplete - replace input with full command
        fn applyAutocomplete(self: *Self) !void {
            if (self.getAutocomplete()) |cmd| {
                try self.editor.clear();
                try self.editor.insertText(cmd);
            }
        }

        /// Handle keyboard input, returns command if enter was pressed
        pub fn handleEvent(self: *Self, event: InputEvent) !?[]const u8 {
            switch (event) {
                .key_press => |key| {
                    // Tab - apply autocomplete
                    if (key.matches(R.Key.tab, .{})) {
                        try self.applyAutocomplete();
                        return null;
                    }

                    // Enter - submit
                    if (key.matches(R.Key.enter, .{})) {
                        // If there's an autocomplete match, apply it first
                        if (self.getAutocomplete()) |cmd| {
                            const result = try self.allocator.dupe(u8, cmd);
                            try self.editor.clear();
                            return result;
                        }

                        const text = try self.getText();
                        if (text.len > 0) {
                            // Add to history before clearing
                            self.editor.addToHistory(text);
                            try self.editor.clear();
                            return text;
                        }
                        self.allocator.free(text);
                        return null;
                    }

                    // Ctrl+K - delete to end of line
                    if (key.matches('k', .{ .ctrl = true })) {
                        try self.editor.deleteToLineEnd();
                        return null;
                    }

                    // Ctrl+U - delete to start of line
                    if (key.matches('u', .{ .ctrl = true })) {
                        try self.editor.deleteToLineStart();
                        return null;
                    }

                    // Ctrl+W - delete word backward
                    if (key.matches('w', .{ .ctrl = true })) {
                        try self.editor.deleteWordBackward();
                        return null;
                    }

                    // Ctrl+Y - yank (paste from kill ring)
                    if (key.matches('y', .{ .ctrl = true })) {
                        try self.editor.yank();
                        return null;
                    }

                    // Ctrl+Z - undo
                    if (key.matches('z', .{ .ctrl = true })) {
                        try self.editor.undo();
                        return null;
                    }

                    // Ctrl+A - move to line start
                    if (key.matches('a', .{ .ctrl = true })) {
                        self.editor.moveLineStart();
                        return null;
                    }

                    // Ctrl+E - move to line end
                    if (key.matches('e', .{ .ctrl = true })) {
                        self.editor.moveLineEnd();
                        return null;
                    }

                    // Alt+B - word left
                    if (key.matches('b', .{ .alt = true })) {
                        self.editor.moveWordLeft();
                        return null;
                    }

                    // Alt+F - word right
                    if (key.matches('f', .{ .alt = true })) {
                        self.editor.moveWordRight();
                        return null;
                    }

                    // Up arrow - history up (only if on first line)
                    if (key.matches(R.Key.up, .{})) {
                        if (self.editor.cursor_line == 0) {
                            try self.editor.historyUp();
                        } else {
                            self.editor.moveUp();
                        }
                        return null;
                    }

                    // Down arrow - history down (only if on last line)
                    if (key.matches(R.Key.down, .{})) {
                        if (self.editor.cursor_line == self.editor.lineCount() - 1) {
                            try self.editor.historyDown();
                        } else {
                            self.editor.moveDown();
                        }
                        return null;
                    }

                    // Left arrow
                    if (key.matches(R.Key.left, .{})) {
                        self.editor.moveLeft();
                        return null;
                    }

                    // Right arrow
                    if (key.matches(R.Key.right, .{})) {
                        self.editor.moveRight();
                        return null;
                    }

                    // Home
                    if (key.matches(R.Key.home, .{})) {
                        self.editor.moveLineStart();
                        return null;
                    }

                    // End
                    if (key.matches(R.Key.end, .{})) {
                        self.editor.moveLineEnd();
                        return null;
                    }

                    // Backspace
                    if (key.matches(R.Key.backspace, .{})) {
                        try self.editor.deleteCharBackward();
                        return null;
                    }

                    // Delete
                    if (key.matches(R.Key.delete, .{})) {
                        try self.editor.deleteCharForward();
                        return null;
                    }

                    // Regular character input - use getText() for owned data
                    if (key.getText()) |text| {
                        std.log.debug("input: inserting text '{s}'", .{text});
                        try self.editor.insertText(text);
                        return null;
                    }
                },
                else => {},
            }
            return null;
        }

        /// Get current input text (caller owns memory)
        pub fn getText(self: *Self) ![]u8 {
            return self.editor.getText();
        }

        /// Get text without allocation (for display, returns first line only for quick check)
        fn getFirstLine(self: *Self) []const u8 {
            return self.editor.getLine(0) orelse "";
        }

        /// Check if input is empty (no allocation)
        pub fn isEmpty(self: *Self) bool {
            const first = self.editor.getLine(0) orelse return true;
            if (first.len > 0) return false;
            return self.editor.lineCount() <= 1;
        }

        /// Clear the input
        pub fn clear(self: *Self) void {
            self.editor.clear() catch {};
        }

        /// Draw the input box using renderer (for layout control)
        pub fn drawInWindow(self: *Self, renderer: R) void {
            const box_width: u16 = if (renderer.width() > 4) renderer.width() - 4 else renderer.width();
            const box_x: u16 = 2;

            const border_style: R.Style = .{ .fg = .{ .rgb = border_color } };

            // Input box with border (height 4 = 2 lines + top/bottom border)
            const input_renderer = renderer.subRegionWithBorder(
                box_x,
                0,
                box_width,
                if (renderer.height() >= 4) 4 else renderer.height(),
                border_style,
            );

            // Draw prompt
            const prompt_style: R.Style = .{ .fg = .{ .rgb = prompt_color } };
            input_renderer.drawCell(0, 0, ">", prompt_style);
            input_renderer.drawCell(1, 0, " ", prompt_style);

            // Text area dimensions
            const text_width = if (input_renderer.width() > 3) input_renderer.width() - 3 else 1;
            const text_height: u16 = 2;

            // Draw editor content
            const text_style: R.Style = .{ .fg = .{ .index = text_color } };
            var row: u16 = 0;
            const line_count = self.editor.lineCount();

            while (row < text_height and row < line_count) : (row += 1) {
                if (self.editor.getLine(row)) |line| {
                    const display_len: u16 = @intCast(@min(line.len, text_width));
                    if (display_len > 0) {
                        _ = input_renderer.printSegment(2, row, line[0..display_len], text_style);
                    }
                }
            }

            // Draw cursor
            const cursor = self.editor.getCursor();
            if (cursor.line < text_height) {
                const cursor_x: u16 = @intCast(@min(cursor.col, text_width - 1));
                const cursor_y: u16 = @intCast(cursor.line);

                // Get character at cursor position or space
                var cursor_char: []const u8 = " ";
                if (self.editor.getLine(cursor.line)) |line| {
                    if (cursor.col < line.len) {
                        cursor_char = line[cursor.col .. cursor.col + 1];
                    }
                }

                input_renderer.drawCell(2 + cursor_x, cursor_y, cursor_char, .{
                    .fg = .{ .index = 0 }, // Black text
                    .bg = .{ .index = cursor_color }, // Blue background
                });
            }

            // Draw ghost autocomplete text
            if (self.getAutocomplete()) |cmd| {
                const first_line = self.getFirstLine();
                if (first_line.len < cmd.len) {
                    const ghost_suffix = cmd[first_line.len..];
                    const cursor_x: u16 = @intCast(@min(first_line.len, text_width));

                    const ghost_style: R.Style = .{
                        .fg = .{ .index = 8 }, // Bright black/gray
                    };

                    if (cursor_x < text_width) {
                        const ghost_len: u16 = @intCast(@min(ghost_suffix.len, text_width - cursor_x));
                        _ = input_renderer.printSegment(2 + cursor_x, 0, ghost_suffix[0..ghost_len], ghost_style);
                    }
                }
            }
        }

        /// Legacy draw method (unused, kept for compatibility)
        pub fn draw(self: *Self, renderer: R) void {
            self.drawInWindow(renderer);
        }
    };
}


