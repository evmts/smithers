// Multi-line Text Editor
// Core editing logic - no rendering

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const KillRing = @import("kill_ring.zig").KillRing;
const UndoStack = @import("undo.zig").UndoStack;
const InputHistory = @import("history.zig").InputHistory;

pub const Editor = struct {
    lines: ArrayListUnmanaged(ArrayListUnmanaged(u8)),
    cursor_line: usize = 0,
    cursor_col: usize = 0,

    kill_ring: KillRing,
    undo_stack: UndoStack,
    history: InputHistory,

    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        var lines = ArrayListUnmanaged(ArrayListUnmanaged(u8)){};
        lines.append(allocator, ArrayListUnmanaged(u8){}) catch {};

        return .{
            .lines = lines,
            .kill_ring = KillRing.init(allocator),
            .undo_stack = UndoStack.init(allocator),
            .history = InputHistory.init(allocator),
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
        self.history.deinit();
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

    pub fn clear(self: *Self) !void {
        try self.setText("");
    }

    pub fn getCursor(self: *const Self) struct { line: usize, col: usize } {
        return .{ .line = self.cursor_line, .col = self.cursor_col };
    }

    pub fn setCursor(self: *Self, line: usize, col: usize) void {
        self.cursor_line = line;
        self.cursor_col = col;
        self.clampCursor();
    }

    pub fn lineCount(self: *const Self) usize {
        return self.lines.items.len;
    }

    pub fn getLine(self: *const Self, idx: usize) ?[]const u8 {
        if (idx >= self.lines.items.len) return null;
        return self.lines.items[idx].items;
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
        while (col > 0 and std.ascii.isWhitespace(line.items[col - 1])) col -= 1;
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
        while (col < line.items.len and isWordChar(line.items[col])) col += 1;
        while (col < line.items.len and std.ascii.isWhitespace(line.items[col])) col += 1;

        self.cursor_col = col;
        self.kill_ring.breakAccumulation();
    }

    fn prevGraphemeCol(self: *Self, line_idx: usize, col: usize) usize {
        const line = self.lines.items[line_idx].items;
        if (col == 0) return 0;
        var i = col - 1;
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

    // ============ Text Editing ============

    pub fn insertChar(self: *Self, c: u8) !void {
        if (self.undo_stack.shouldSnapshot(c)) {
            try self.undo_stack.push(self.lines.items, self.cursor_line, self.cursor_col);
        }

        const line = &self.lines.items[self.cursor_line];
        try line.insert(self.allocator, self.cursor_col, c);
        self.cursor_col += 1;
        self.kill_ring.breakAccumulation();
    }

    pub fn insertText(self: *Self, text: []const u8) !void {
        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        for (text) |c| {
            if (c == '\n') {
                try self.newlineInternal();
            } else {
                const line = &self.lines.items[self.cursor_line];
                try line.insert(self.allocator, self.cursor_col, c);
                self.cursor_col += 1;
            }
        }
        self.kill_ring.breakAccumulation();
    }

    pub fn newline(self: *Self) !void {
        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
        try self.newlineInternal();
    }

    fn newlineInternal(self: *Self) !void {
        const current = &self.lines.items[self.cursor_line];
        var new_line = ArrayListUnmanaged(u8){};
        try new_line.appendSlice(self.allocator, current.items[self.cursor_col..]);
        current.shrinkRetainingCapacity(self.cursor_col);

        try self.lines.insert(self.allocator, self.cursor_line + 1, new_line);
        self.cursor_line += 1;
        self.cursor_col = 0;
    }

    pub fn deleteCharBackward(self: *Self) !void {
        if (self.cursor_col == 0 and self.cursor_line == 0) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        if (self.cursor_col > 0) {
            const line = &self.lines.items[self.cursor_line];
            const prev_col = self.prevGraphemeCol(self.cursor_line, self.cursor_col);
            const bytes_to_remove = self.cursor_col - prev_col;
            for (0..bytes_to_remove) |_| {
                _ = line.orderedRemove(prev_col);
            }
            self.cursor_col = prev_col;
        } else {
            const current = self.lines.orderedRemove(self.cursor_line);
            self.cursor_line -= 1;
            const prev_line = &self.lines.items[self.cursor_line];
            self.cursor_col = prev_line.items.len;
            try prev_line.appendSlice(self.allocator, current.items);
            @constCast(&current).deinit(self.allocator);
        }
        self.kill_ring.breakAccumulation();
    }

    pub fn deleteCharForward(self: *Self) !void {
        const line = &self.lines.items[self.cursor_line];

        if (self.cursor_col >= line.items.len) {
            if (self.cursor_line + 1 >= self.lines.items.len) return;
            try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
            const next_line = self.lines.orderedRemove(self.cursor_line + 1);
            try line.appendSlice(self.allocator, next_line.items);
            @constCast(&next_line).deinit(self.allocator);
        } else {
            try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
            const next_col = self.nextGraphemeCol(self.cursor_line, self.cursor_col);
            const bytes_to_remove = next_col - self.cursor_col;
            for (0..bytes_to_remove) |_| {
                _ = line.orderedRemove(self.cursor_col);
            }
        }
        self.kill_ring.breakAccumulation();
    }

    // ============ Kill Operations ============

    pub fn deleteToLineEnd(self: *Self) !void {
        const line = &self.lines.items[self.cursor_line];

        if (self.cursor_col >= line.items.len) {
            if (self.cursor_line + 1 >= self.lines.items.len) return;
            try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
            try self.kill_ring.add("\n", false);
            const next_line = self.lines.orderedRemove(self.cursor_line + 1);
            try line.appendSlice(self.allocator, next_line.items);
            @constCast(&next_line).deinit(self.allocator);
        } else {
            try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);
            const killed = line.items[self.cursor_col..];
            try self.kill_ring.add(killed, false);
            line.shrinkRetainingCapacity(self.cursor_col);
        }
    }

    pub fn deleteToLineStart(self: *Self) !void {
        if (self.cursor_col == 0) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        const line = &self.lines.items[self.cursor_line];
        const killed = line.items[0..self.cursor_col];
        try self.kill_ring.add(killed, true);

        for (0..self.cursor_col) |_| {
            _ = line.orderedRemove(0);
        }
        self.cursor_col = 0;
    }

    pub fn deleteWordBackward(self: *Self) !void {
        if (self.cursor_col == 0) return;

        try self.undo_stack.forceSnapshot(self.lines.items, self.cursor_line, self.cursor_col);

        const line = &self.lines.items[self.cursor_line];
        var end_col = self.cursor_col;
        while (end_col > 0 and std.ascii.isWhitespace(line.items[end_col - 1])) end_col -= 1;
        while (end_col > 0 and isWordChar(line.items[end_col - 1])) end_col -= 1;

        const killed = line.items[end_col..self.cursor_col];
        try self.kill_ring.add(killed, true);

        for (0..(self.cursor_col - end_col)) |_| {
            _ = line.orderedRemove(end_col);
        }
        self.cursor_col = end_col;
    }

    pub fn yank(self: *Self) !void {
        if (self.kill_ring.yank()) |text| {
            try self.insertText(text);
        }
    }

    pub fn yankPop(self: *Self) !void {
        if (self.kill_ring.yankPop()) |text| {
            try self.undo();
            try self.insertText(text);
        }
    }

    // ============ Undo ============

    pub fn undo(self: *Self) !void {
        const snapshot = try self.undo_stack.undo(self.lines.items, self.cursor_line, self.cursor_col);
        if (snapshot) |snap| {
            try self.restoreSnapshot(snap);
        }
    }

    pub fn redo(self: *Self) !void {
        const snapshot = try self.undo_stack.redo(self.lines.items, self.cursor_line, self.cursor_col);
        if (snapshot) |snap| {
            try self.restoreSnapshot(snap);
        }
    }

    fn restoreSnapshot(self: *Self, snapshot: anytype) !void {
        for (self.lines.items) |*line| line.deinit(self.allocator);
        self.lines.clearRetainingCapacity();

        for (snapshot.lines) |line_data| {
            var line = ArrayListUnmanaged(u8){};
            try line.appendSlice(self.allocator, line_data);
            try self.lines.append(self.allocator, line);
            self.allocator.free(line_data);
        }
        self.allocator.free(snapshot.lines);

        if (self.lines.items.len == 0) {
            try self.lines.append(self.allocator, ArrayListUnmanaged(u8){});
        }

        self.cursor_line = snapshot.cursor_line;
        self.cursor_col = snapshot.cursor_col;
        self.clampCursor();
    }

    // ============ History ============

    pub fn historyUp(self: *Self) !void {
        if (self.history.nav_idx == null) {
            const text = try self.getText();
            defer self.allocator.free(text);
            self.history.saveDraft(text);
        }
        if (self.history.prev()) |entry| {
            try self.setText(entry);
            self.moveLineEnd();
        }
    }

    pub fn historyDown(self: *Self) !void {
        if (self.history.next()) |entry| {
            try self.setText(entry);
            self.moveLineEnd();
        } else {
            try self.clear();
        }
    }

    pub fn addToHistory(self: *Self, text: []const u8) void {
        self.history.push(text);
        self.history.reset();
        self.history.clearDraft();
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

test "Editor deleteCharBackward join lines" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello\nWorld");
    editor.cursor_line = 1;
    editor.cursor_col = 0;

    try editor.deleteCharBackward();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("HelloWorld", text);
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_line);
    try std.testing.expectEqual(@as(usize, 5), editor.cursor_col);
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

test "Editor deleteToLineEnd (Ctrl+K)" {
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

test "Editor deleteToLineStart (Ctrl+U)" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello World");
    editor.cursor_col = 6;

    try editor.deleteToLineStart();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("World", text);
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_col);
}

test "Editor deleteWordBackward (Ctrl+W)" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("hello world");
    editor.cursor_col = 11;

    try editor.deleteWordBackward();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("hello ", text);
}

test "Editor yank (Ctrl+Y)" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello World");
    editor.cursor_col = 5;
    try editor.deleteToLineEnd();

    try editor.yank();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hello World", text);
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

test "Editor clear" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello\nWorld");
    try editor.clear();

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("", text);
    try std.testing.expectEqual(@as(usize, 1), editor.lines.items.len);
}

test "Editor getLine" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("Hello\nWorld\nTest");

    try std.testing.expectEqualStrings("Hello", editor.getLine(0).?);
    try std.testing.expectEqualStrings("World", editor.getLine(1).?);
    try std.testing.expectEqualStrings("Test", editor.getLine(2).?);
    try std.testing.expect(editor.getLine(3) == null);
}

test "Editor lineCount" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("One\nTwo\nThree");
    try std.testing.expectEqual(@as(usize, 3), editor.lineCount());
}

test "Editor history navigation" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    editor.addToHistory("first");
    editor.addToHistory("second");

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

test "Editor moveRight wraps to next line" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("AB\nCD");
    editor.cursor_col = 2;

    editor.moveRight();

    try std.testing.expectEqual(@as(usize, 1), editor.cursor_line);
    try std.testing.expectEqual(@as(usize, 0), editor.cursor_col);
}

test "Editor moveLeft wraps to prev line" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.setText("AB\nCD");
    editor.cursor_line = 1;
    editor.cursor_col = 0;

    editor.moveLeft();

    try std.testing.expectEqual(@as(usize, 0), editor.cursor_line);
    try std.testing.expectEqual(@as(usize, 2), editor.cursor_col);
}

test "Editor insertText with newlines" {
    const allocator = std.testing.allocator;
    var editor = Editor.init(allocator);
    defer editor.deinit();

    try editor.insertText("Hello\nWorld\nTest");

    const text = try editor.getText();
    defer allocator.free(text);

    try std.testing.expectEqualStrings("Hello\nWorld\nTest", text);
    try std.testing.expectEqual(@as(usize, 3), editor.lineCount());
}
