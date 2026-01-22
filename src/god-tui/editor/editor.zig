// Text Editor Component per God-TUI spec §5
// Multi-line editor with word wrap, kill ring, undo, history

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const KillRing = @import("kill_ring.zig").KillRing;
const UndoStack = @import("undo.zig").UndoStack;

pub const CURSOR_MARKER = "\x1b_pi:c\x07";
const PASTE_THRESHOLD_LINES = 10;
const PASTE_THRESHOLD_CHARS = 1000;

pub const Editor = struct {
    lines: ArrayListUnmanaged(ArrayListUnmanaged(u8)),
    cursor_line: usize = 0,
    cursor_col: usize = 0,

    kill_ring: KillRing,
    undo_stack: UndoStack,
    history: ArrayListUnmanaged([]u8),
    history_index: ?usize = null,

    pastes: std.AutoHashMapUnmanaged(u32, []u8),
    paste_counter: u32 = 0,

    focused: bool = false,
    allocator: Allocator,

    on_submit: ?*const fn (text: []const u8) void = null,
    on_change: ?*const fn (text: []const u8) void = null,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        var lines = ArrayListUnmanaged(ArrayListUnmanaged(u8)){};
        lines.append(allocator, ArrayListUnmanaged(u8){}) catch {};

        return .{
            .lines = lines,
            .kill_ring = KillRing.init(allocator),
            .undo_stack = UndoStack.init(allocator),
            .history = .{},
            .pastes = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        for (self.lines.items) |*line| {
            line.deinit(self.allocator);
        }
        self.lines.deinit(self.allocator);

        self.kill_ring.deinit();
        self.undo_stack.deinit();

        for (self.history.items) |h| self.allocator.free(h);
        self.history.deinit(self.allocator);

        var it = self.pastes.iterator();
        while (it.next()) |entry| {
            self.allocator.free(entry.value_ptr.*);
        }
        self.pastes.deinit(self.allocator);
    }

    // ============ Text Access ============

    pub fn getText(self: *const Self) ![]u8 {
        var result = ArrayListUnmanaged(u8){};
        errdefer result.deinit(self.allocator);

        for (self.lines.items, 0..) |line, i| {
            if (i > 0) try result.append(self.allocator, '\n');
            try result.appendSlice(self.allocator, line.items);
        }
        return result.toOwnedSlice(self.allocator);
    }

    pub fn getExpandedText(self: *Self) ![]u8 {
        var text = try self.getText();
        defer self.allocator.free(text);

        var result = ArrayListUnmanaged(u8){};
        errdefer result.deinit(self.allocator);

        var i: usize = 0;
        while (i < text.len) {
            if (std.mem.startsWith(u8, text[i..], "[paste #")) {
                const end = std.mem.indexOfPos(u8, text, i, "]");
                if (end) |e| {
                    const marker = text[i .. e + 1];
                    const id_start = 8; // "[paste #".len
                    const id_end = std.mem.indexOfPos(u8, marker, id_start, " ") orelse marker.len - 1;
                    if (std.fmt.parseInt(u32, marker[id_start..id_end], 10)) |id| {
                        if (self.pastes.get(id)) |content| {
                            try result.appendSlice(self.allocator, content);
                            i = e + 1;
                            continue;
                        }
                    } else |_| {}
                }
            }
            try result.append(self.allocator, text[i]);
            i += 1;
        }
        return result.toOwnedSlice(self.allocator);
    }

    pub fn setText(self: *Self, text: []const u8) !void {
        for (self.lines.items) |*line| line.deinit(self.allocator);
        self.lines.clearRetainingCapacity();

        var it = std.mem.splitScalar(u8, text, '\n');
        while (it.next()) |part| {
            var line = ArrayListUnmanaged(u8){};
            try line.appendSlice(self.allocator, part);
            try self.lines.append(self.allocator, line);
        }

        if (self.lines.items.len == 0) {
            try self.lines.append(self.allocator, ArrayListUnmanaged(u8){});
        }

        self.cursor_line = 0;
        self.cursor_col = 0;
        self.clampCursor();
    }

    pub fn getCursor(self: *const Self) struct { line: usize, col: usize } {
        return .{ .line = self.cursor_line, .col = self.cursor_col };
    }

    pub fn setCursor(self: *Self, line: usize, col: usize) void {
        self.cursor_line = line;
        self.cursor_col = col;
        self.clampCursor();
    }

    fn clampCursor(self: *Self) void {
        if (self.cursor_line >= self.lines.items.len) {
            self.cursor_line = if (self.lines.items.len > 0) self.lines.items.len - 1 else 0;
        }
        const line_len = if (self.cursor_line < self.lines.items.len)
            self.lines.items[self.cursor_line].items.len
        else
            0;
        if (self.cursor_col > line_len) {
            self.cursor_col = line_len;
        }
    }

    // ============ Cursor Movement ============

    pub fn moveLeft(self: *Self) void {
        if (self.cursor_col > 0) {
            self.cursor_col = self.prevGraphemeCol(self.cursor_line, self.cursor_col);
        } else if (self.cursor_line > 0) {
            self.cursor_line -= 1;
            self.cursor_col = self.lines.items[self.cursor_line].items.len;
        }
        self.kill_ring.breakAccumulation();
    }

    pub fn moveRight(self: *Self) void {
        const line = &self.lines.items[self.cursor_line];
        if (self.cursor_col < line.items.len) {
            self.cursor_col = self.nextGraphemeCol(self.cursor_line, self.cursor_col);
        } else if (self.cursor_line + 1 < self.lines.items.len) {
            self.cursor_line += 1;
            self.cursor_col = 0;
        }
        self.kill_ring.breakAccumulation();
    }

    pub fn moveUp(self: *Self) void {
        if (self.cursor_line > 0) {
            self.cursor_line -= 1;
            self.clampCursor();
        }
        self.kill_ring.breakAccumulation();
    }

    pub fn moveDown(self: *Self) void {
        if (self.cursor_line + 1 < self.lines.items.len) {
            self.cursor_line += 1;
            self.clampCursor();
        }
        self.kill_ring.breakAccumulation();
    }

    pub fn moveLineStart(self: *Self) void {
        self.cursor_col = 0;
        self.kill_ring.breakAccumulation();
    }

    pub fn moveLineEnd(self: *Self) void {
        self.cursor_col = self.lines.items[self.cursor_line].items.len;
        self.kill_ring.breakAccumulation();
    }

    pub fn moveWordLeft(self: *Self) void {
        const line = &self.lines.items[self.cursor_line];
        if (self.cursor_col == 0) {
            if (self.cursor_line > 0) {
                self.cursor_line -= 1;
                self.cursor_col = self.lines.items[self.cursor_line].items.len;
            }
            return;
        }

        var col = self.cursor_col;
        // Skip trailing whitespace
        while (col > 0 and std.ascii.isWhitespace(line.items[col - 1])) col -= 1;
        // Skip word chars
        while (col > 0 and isWordChar(line.items[col - 1])) col -= 1;

        self.cursor_col = col;
        self.kill_ring.breakAccumulation();
    }

    pub fn moveWordRight(self: *Self) void {
        const line = &self.lines.items[self.cursor_line];
        if (self.cursor_col >= line.items.len) {
            if (self.cursor_line + 1 < self.lines.items.len) {
                self.cursor_line += 1;
                self.cursor_col = 0;
            }
            return;
        }

        var col = self.cursor_col;
        // Skip word chars
        while (col < line.items.len and isWordChar(line.items[col])) col += 1;
        // Skip trailing whitespace
        while (col < line.items.len and std.ascii.isWhitespace(line.items[col])) col += 1;

        self.cursor_col = col;
        self.kill_ring.breakAccumulation();
    }

    fn prevGraphemeCol(self: *Self, line_idx: usize, col: usize) usize {
        const line = self.lines.items[line_idx].items;
        if (col == 0) return 0;

        var i = col - 1;
        // Simple UTF-8 backward scan
        while (i > 0 and (line[i] & 0xC0) == 0x80) i -= 1;
        return i;
    }

    fn nextGraphemeCol(self: *Self, line_idx: usize, col: usize) usize {
        const line = self.lines.items[line_idx].items;
        if (col >= line.len) return line.len;

        var i = col + 1;
        while (i < line.len and (line[i] & 0xC0) == 0x80) i += 1;
        return i;
    }

    // ============ Edit Operations ============

    pub fn insertChar(self: *Self, char: u8) !void {
        if (self.undo_stack.shouldSnapshot(char)) {
            try self.undo_stack.push(self.lines.items, self.cursor_line, self.cursor_col);
        }

        const line = &self.lines.items[self.cursor_line];
        try line.insert(self.allocator, self.cursor_col, char);
        self.cursor_col += 1;

        self.kill_ring.breakAccumulation();
        self.triggerChange();
    }

    pub fn insertText(self: *Self, text: []const u8) !void {
        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        for (text) |c| {
            if (c == '\n') {
                try self.insertNewlineInternal();
            } else {
                const line = &self.lines.items[self.cursor_line];
                try line.insert(self.allocator, self.cursor_col, c);
                self.cursor_col += 1;
            }
        }

        self.kill_ring.breakAccumulation();
        self.triggerChange();
    }

    fn insertNewlineInternal(self: *Self) !void {
        const line = &self.lines.items[self.cursor_line];
        const rest = line.items[self.cursor_col..];

        var new_line = ArrayListUnmanaged(u8){};
        try new_line.appendSlice(self.allocator, rest);

        line.shrinkRetainingCapacity(self.cursor_col);

        try self.lines.insert(self.allocator, self.cursor_line + 1, new_line);
        self.cursor_line += 1;
        self.cursor_col = 0;
    }

    pub fn newline(self: *Self) !void {
        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
        try self.insertNewlineInternal();
        self.kill_ring.breakAccumulation();
        self.triggerChange();
    }

    pub fn deleteCharBackward(self: *Self) !void {
        if (self.cursor_col == 0 and self.cursor_line == 0) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        if (self.cursor_col > 0) {
            const prev_col = self.prevGraphemeCol(self.cursor_line, self.cursor_col);
            const line = &self.lines.items[self.cursor_line];
            const removed_len = self.cursor_col - prev_col;
            var i: usize = 0;
            while (i < removed_len) : (i += 1) {
                _ = line.orderedRemove(prev_col);
            }
            self.cursor_col = prev_col;
        } else {
            // Merge with previous line
            const prev_line = &self.lines.items[self.cursor_line - 1];
            const curr_line = self.lines.orderedRemove(self.cursor_line);
            self.cursor_line -= 1;
            self.cursor_col = prev_line.items.len;
            try prev_line.appendSlice(self.allocator, curr_line.items);
            @constCast(&curr_line).deinit(self.allocator);
        }

        self.kill_ring.breakAccumulation();
        self.triggerChange();
    }

    pub fn deleteCharForward(self: *Self) !void {
        const line = &self.lines.items[self.cursor_line];

        if (self.cursor_col >= line.items.len and self.cursor_line + 1 >= self.lines.items.len) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        if (self.cursor_col < line.items.len) {
            const next_col = self.nextGraphemeCol(self.cursor_line, self.cursor_col);
            const removed_len = next_col - self.cursor_col;
            var i: usize = 0;
            while (i < removed_len) : (i += 1) {
                _ = line.orderedRemove(self.cursor_col);
            }
        } else {
            // Merge with next line
            const next_line = self.lines.orderedRemove(self.cursor_line + 1);
            try line.appendSlice(self.allocator, next_line.items);
            @constCast(&next_line).deinit(self.allocator);
        }

        self.kill_ring.breakAccumulation();
        self.triggerChange();
    }

    pub fn deleteWordBackward(self: *Self) !void {
        const start_col = self.cursor_col;
        self.moveWordLeft();
        const end_col = self.cursor_col;

        if (start_col == end_col) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, start_col);

        const line = &self.lines.items[self.cursor_line];
        const deleted = line.items[end_col..start_col];
        try self.kill_ring.add(deleted, true);

        var i: usize = 0;
        while (i < start_col - end_col) : (i += 1) {
            _ = line.orderedRemove(end_col);
        }

        self.triggerChange();
    }

    pub fn deleteWordForward(self: *Self) !void {
        const start_col = self.cursor_col;
        const line = &self.lines.items[self.cursor_line];

        var end_col = start_col;
        while (end_col < line.items.len and isWordChar(line.items[end_col])) end_col += 1;
        while (end_col < line.items.len and std.ascii.isWhitespace(line.items[end_col])) end_col += 1;

        if (start_col == end_col) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        const deleted = line.items[start_col..end_col];
        try self.kill_ring.add(deleted, false);

        var i: usize = 0;
        while (i < end_col - start_col) : (i += 1) {
            _ = line.orderedRemove(start_col);
        }

        self.triggerChange();
    }

    pub fn deleteToLineStart(self: *Self) !void {
        if (self.cursor_col == 0) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        const line = &self.lines.items[self.cursor_line];
        const deleted = line.items[0..self.cursor_col];
        try self.kill_ring.add(deleted, true);

        var i: usize = 0;
        while (i < self.cursor_col) : (i += 1) {
            _ = line.orderedRemove(0);
        }
        self.cursor_col = 0;

        self.triggerChange();
    }

    pub fn deleteToLineEnd(self: *Self) !void {
        const line = &self.lines.items[self.cursor_line];

        if (self.cursor_col >= line.items.len) {
            // Delete newline - merge with next
            if (self.cursor_line + 1 < self.lines.items.len) {
                try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
                try self.kill_ring.add("\n", false);
                const next_line = self.lines.orderedRemove(self.cursor_line + 1);
                try line.appendSlice(self.allocator, next_line.items);
                @constCast(&next_line).deinit(self.allocator);
                self.triggerChange();
            }
            return;
        }

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        const deleted = line.items[self.cursor_col..];
        try self.kill_ring.add(deleted, false);

        line.shrinkRetainingCapacity(self.cursor_col);

        self.triggerChange();
    }

    // ============ Kill Ring Operations ============

    pub fn yank(self: *Self) !void {
        const text = self.kill_ring.yank() orelse return;
        try self.insertText(text);
    }

    pub fn yankPop(self: *Self) !void {
        // Would need to track last yank position to replace
        const text = self.kill_ring.yankPop() orelse return;
        try self.insertText(text);
    }

    // ============ Undo ============

    pub fn undo(self: *Self) !void {
        var snapshot = self.undo_stack.pop() orelse return;
        defer snapshot.deinit(self.allocator);

        for (self.lines.items) |*line| line.deinit(self.allocator);
        self.lines.clearRetainingCapacity();

        for (snapshot.lines) |line_data| {
            var line = ArrayListUnmanaged(u8){};
            try line.appendSlice(self.allocator, line_data);
            try self.lines.append(self.allocator, line);
        }

        self.cursor_line = snapshot.cursor_line;
        self.cursor_col = snapshot.cursor_col;
        self.clampCursor();

        self.kill_ring.breakAccumulation();
        self.triggerChange();
    }

    // ============ History ============

    pub fn addToHistory(self: *Self, text: []const u8) !void {
        const entry = try self.allocator.dupe(u8, text);
        try self.history.append(self.allocator, entry);
        self.history_index = null;
    }

    pub fn historyUp(self: *Self) !void {
        if (self.history.items.len == 0) return;

        const idx = if (self.history_index) |i| (if (i > 0) i - 1 else 0) else self.history.items.len - 1;

        self.history_index = idx;
        try self.setText(self.history.items[idx]);
    }

    pub fn historyDown(self: *Self) !void {
        if (self.history_index == null) return;

        const idx = self.history_index.?;
        if (idx + 1 >= self.history.items.len) {
            self.history_index = null;
            try self.setText("");
        } else {
            self.history_index = idx + 1;
            try self.setText(self.history.items[idx + 1]);
        }
    }

    // ============ Paste Handling ============

    pub fn handlePaste(self: *Self, content: []const u8) !void {
        const line_count = std.mem.count(u8, content, "\n") + 1;

        if (line_count > PASTE_THRESHOLD_LINES or content.len > PASTE_THRESHOLD_CHARS) {
            // Large paste - compress to marker
            const id = self.paste_counter;
            self.paste_counter += 1;

            const stored = try self.allocator.dupe(u8, content);
            try self.pastes.put(self.allocator, id, stored);

            var marker_buf: [64]u8 = undefined;
            const marker = std.fmt.bufPrint(&marker_buf, "[paste #{d} +{d} lines]", .{ id, line_count }) catch unreachable;
            try self.insertText(marker);
        } else {
            try self.insertText(content);
        }
    }

    // ============ Submit ============

    pub fn submit(self: *Self) ![]u8 {
        const text = try self.getExpandedText();

        if (self.on_submit) |cb| {
            cb(text);
        }

        // Add to history
        try self.addToHistory(text);

        // Clear editor
        for (self.lines.items) |*line| line.deinit(self.allocator);
        self.lines.clearRetainingCapacity();
        try self.lines.append(self.allocator, ArrayListUnmanaged(u8){});
        self.cursor_line = 0;
        self.cursor_col = 0;

        // Clear paste storage
        var it = self.pastes.iterator();
        while (it.next()) |entry| {
            self.allocator.free(entry.value_ptr.*);
        }
        self.pastes.clearRetainingCapacity();
        self.paste_counter = 0;

        self.undo_stack.clear();
        self.history_index = null;

        self.triggerChange();

        return text;
    }

    // ============ Rendering ============

    pub fn render(self: *Self, term_width: u16, allocator: Allocator) ![][]const u8 {
        var result = ArrayListUnmanaged([]const u8){};
        errdefer {
            for (result.items) |line| allocator.free(@constCast(line));
            result.deinit(allocator);
        }

        for (self.lines.items, 0..) |line, line_idx| {
            // Simple word wrap (full version would use width module)
            const line_content = line.items;
            if (line_content.len == 0) {
                // Empty line
                if (self.focused and line_idx == self.cursor_line) {
                    const cursor_line = try std.fmt.allocPrint(allocator, "{s}\x1b[7m \x1b[27m", .{CURSOR_MARKER});
                    try result.append(allocator, cursor_line);
                } else {
                    const empty = try allocator.dupe(u8, "");
                    try result.append(allocator, empty);
                }
            } else {
                // Simple: render line as-is (truncate to width in full version)
                const line_len = @min(line_content.len, @as(usize, term_width));
                var rendered_line: []u8 = undefined;
                
                if (self.focused and line_idx == self.cursor_line) {
                    // Insert cursor marker
                    const cursor_pos = @min(self.cursor_col, line_len);
                    const before = line_content[0..cursor_pos];
                    const after = line_content[cursor_pos..line_len];
                    rendered_line = try std.fmt.allocPrint(allocator, "{s}{s}\x1b[7m{s}\x1b[27m{s}", .{
                        before,
                        CURSOR_MARKER,
                        if (cursor_pos < line_len) line_content[cursor_pos .. cursor_pos + 1] else " ",
                        if (cursor_pos < line_len) after[1..] else "",
                    });
                } else {
                    rendered_line = try allocator.dupe(u8, line_content[0..line_len]);
                }
                try result.append(allocator, rendered_line);
            }
        }

        // Add cursor marker to correct position if focused
        if (self.focused and result.items.len > 0) {
            // Simple: add cursor marker to end of cursor line
            // Full implementation would handle wrapped lines properly
        }

        return result.toOwnedSlice(allocator);
    }

    // ============ Input Handling ============

    pub fn handleInput(self: *Self, data: []const u8) !void {
        if (data.len == 0) return;

        // Control characters
        if (data.len == 1) {
            const c = data[0];
            switch (c) {
                0x01 => self.moveLineStart(), // Ctrl+A
                0x05 => self.moveLineEnd(), // Ctrl+E
                0x02 => self.moveLeft(), // Ctrl+B
                0x06 => self.moveRight(), // Ctrl+F
                0x0E => self.moveDown(), // Ctrl+N
                0x10 => self.moveUp(), // Ctrl+P
                0x0B => try self.deleteToLineEnd(), // Ctrl+K
                0x15 => try self.deleteToLineStart(), // Ctrl+U
                0x17 => try self.deleteWordBackward(), // Ctrl+W
                0x19 => try self.yank(), // Ctrl+Y
                0x1A => try self.undo(), // Ctrl+Z
                0x7F => try self.deleteCharBackward(), // Backspace
                '\r', '\n' => {}, // Enter - handled by caller for submit vs newline
                else => {
                    if (c >= 0x20 and c < 0x7F) {
                        try self.insertChar(c);
                    }
                },
            }
        } else if (std.mem.eql(u8, data, "\x1b[A")) {
            self.moveUp(); // Up arrow
        } else if (std.mem.eql(u8, data, "\x1b[B")) {
            self.moveDown(); // Down arrow
        } else if (std.mem.eql(u8, data, "\x1b[C")) {
            self.moveRight(); // Right arrow
        } else if (std.mem.eql(u8, data, "\x1b[D")) {
            self.moveLeft(); // Left arrow
        } else if (std.mem.eql(u8, data, "\x1b[1;5D") or std.mem.eql(u8, data, "\x1b[1;3D")) {
            self.moveWordLeft(); // Ctrl+Left or Alt+Left
        } else if (std.mem.eql(u8, data, "\x1b[1;5C") or std.mem.eql(u8, data, "\x1b[1;3C")) {
            self.moveWordRight(); // Ctrl+Right or Alt+Right
        } else if (std.mem.eql(u8, data, "\x1b[H") or std.mem.eql(u8, data, "\x1bOH")) {
            self.moveLineStart(); // Home
        } else if (std.mem.eql(u8, data, "\x1b[F") or std.mem.eql(u8, data, "\x1bOF")) {
            self.moveLineEnd(); // End
        } else if (std.mem.eql(u8, data, "\x1b[3~")) {
            try self.deleteCharForward(); // Delete
        } else if (std.mem.eql(u8, data, "\x1bd")) {
            try self.deleteWordForward(); // Alt+D
        } else if (std.mem.eql(u8, data, "\x1by")) {
            try self.yankPop(); // Alt+Y
        } else {
            // Multi-byte UTF-8 or unknown - try to insert as text
            for (data) |c| {
                if (c >= 0x20 or c >= 0x80) {
                    try self.insertChar(c);
                }
            }
        }
    }

    fn triggerChange(self: *Self) void {
        if (self.on_change) |cb| {
            const text = self.getText() catch return;
            defer self.allocator.free(text);
            cb(text);
        }
    }
};

fn isWordChar(c: u8) bool {
    return std.ascii.isAlphanumeric(c) or c == '_';
}

// ============ Tests ============

test "Editor init/deinit" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try std.testing.expectEqual(@as(usize, 1), editor.lines.items.len);
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_line);
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_col);
}

test "Editor setText/getText" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello\nWorld");
    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hello\nWorld", text);
    try std.testing.expectEqual(@as(usize, 2), editor.lines.items.len);
}

test "Editor insertChar" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.insertChar('H');
    try editor.insertChar('i');

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hi", text);
    try std.testing.expectEqual(@as(usize, 2), editor.cursor_col);
}

test "Editor deleteCharBackward" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello");
    editor.cursor_col = 5;

    try editor.deleteCharBackward();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hell", text);
    try std.testing.expectEqual(@as(usize, 4), editor.cursor_col);
}

test "Editor newline" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello");
    editor.cursor_col = 5;

    try editor.newline();

    try std.testing.expectEqual(@as(usize, 2), editor.lines.items.len);
    try std.testing.expectEqual(@as(usize, 1), editor.cursor_line);
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_col);
}

test "Editor cursor movement" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello\nWorld");

    editor.moveRight();
    try std.testing.expectEqual(@as(usize, 1), editor.cursor_col);

    editor.moveDown();
    try std.testing.expectEqual(@as(usize, 1), editor.cursor_line);

    editor.moveLineEnd();
    try std.testing.expectEqual(@as(usize, 5), editor.cursor_col);

    editor.moveLineStart();
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_col);
}

test "Editor word movement" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("hello world test");
    editor.cursor_col = 0;

    editor.moveWordRight();
    try std.testing.expectEqual(@as(usize, 6), editor.cursor_col);

    editor.moveWordRight();
    try std.testing.expectEqual(@as(usize, 12), editor.cursor_col);

    editor.moveWordLeft();
    try std.testing.expectEqual(@as(usize, 6), editor.cursor_col);
}

test "Editor deleteToLineEnd" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello World");
    editor.cursor_col = 5;

    try editor.deleteToLineEnd();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hello", text);
    try std.testing.expect(!editor.kill_ring.isEmpty());
}

test "Editor undo" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello");
    try editor.undo_stack.forceSnapshot(editor.lines.items, 0, 5);

    try editor.insertText(" World");

    try editor.undo();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hello", text);
}

test "Editor large paste compression" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    // Create large paste content
    var content = ArrayListUnmanaged(u8){};
    defer content.deinit(allocator);
    var i: usize = 0;
    while (i < 15) : (i += 1) {
        try content.appendSlice(allocator, "line\n");
    }

    try editor.handlePaste(content.items);

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expect(std.mem.startsWith(u8, text, "[paste #0"));
}

test "Editor history" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.addToHistory("first");
    try editor.addToHistory("second");

    try editor.historyUp();
    var text = try editor.getText();
    try std.testing.expectEqualStrings("second", text);
    allocator.free(text);

    try editor.historyUp();
    text = try editor.getText();
    try std.testing.expectEqualStrings("first", text);
    allocator.free(text);

    try editor.historyDown();
    text = try editor.getText();
    try std.testing.expectEqualStrings("second", text);
    allocator.free(text);
}
