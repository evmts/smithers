// Undo Stack - ported from god-tui
// Coalescing undo with word-based grouping

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

/// Snapshot of editor state for undo
pub const UndoSnapshot = struct {
    /// Lines content (deep copy)
    lines: [][]u8,
    cursor_line: usize,
    cursor_col: usize,

    pub fn deinit(self: *UndoSnapshot, allocator: Allocator) void {
        for (self.lines) |line| {
            allocator.free(line);
        }
        allocator.free(self.lines);
    }
};

pub const UndoStack = struct {
    stack: ArrayListUnmanaged(UndoSnapshot),
    redo_stack: ArrayListUnmanaged(UndoSnapshot),
    allocator: Allocator,
    max_entries: usize = 1000,

    /// Coalescing state
    coalescing: bool = false,
    last_was_word_char: bool = false,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .stack = .{},
            .redo_stack = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        for (self.stack.items) |*snapshot| {
            snapshot.deinit(self.allocator);
        }
        self.stack.deinit(self.allocator);
        for (self.redo_stack.items) |*snapshot| {
            snapshot.deinit(self.allocator);
        }
        self.redo_stack.deinit(self.allocator);
    }

    /// Push a snapshot (deep copy of lines)
    pub fn push(
        self: *Self,
        lines: []const ArrayListUnmanaged(u8),
        cursor_line: usize,
        cursor_col: usize,
    ) !void {
        // Clear redo stack on new edit
        self.clearRedo();

        // Enforce max entries
        while (self.stack.items.len >= self.max_entries) {
            var oldest = self.stack.orderedRemove(0);
            oldest.deinit(self.allocator);
        }

        // Deep copy lines
        const lines_copy = try self.allocator.alloc([]u8, lines.len);
        errdefer {
            for (lines_copy) |line| self.allocator.free(line);
            self.allocator.free(lines_copy);
        }

        for (lines, 0..) |line, i| {
            lines_copy[i] = try self.allocator.dupe(u8, line.items);
        }

        try self.stack.append(self.allocator, .{
            .lines = lines_copy,
            .cursor_line = cursor_line,
            .cursor_col = cursor_col,
        });
    }

    /// Undo: pop from undo stack, push current state to redo stack
    pub fn undo(
        self: *Self,
        current_lines: []const ArrayListUnmanaged(u8),
        current_cursor_line: usize,
        current_cursor_col: usize,
    ) !?UndoSnapshot {
        if (self.stack.items.len == 0) return null;

        // Save current state to redo stack
        const lines_copy = try self.allocator.alloc([]u8, current_lines.len);
        errdefer {
            for (lines_copy) |line| self.allocator.free(line);
            self.allocator.free(lines_copy);
        }
        for (current_lines, 0..) |line, i| {
            lines_copy[i] = try self.allocator.dupe(u8, line.items);
        }
        try self.redo_stack.append(self.allocator, .{
            .lines = lines_copy,
            .cursor_line = current_cursor_line,
            .cursor_col = current_cursor_col,
        });

        self.breakCoalescing();
        return self.stack.pop();
    }

    /// Redo: pop from redo stack, push current state to undo stack
    pub fn redo(
        self: *Self,
        current_lines: []const ArrayListUnmanaged(u8),
        current_cursor_line: usize,
        current_cursor_col: usize,
    ) !?UndoSnapshot {
        if (self.redo_stack.items.len == 0) return null;

        // Save current state to undo stack (without clearing redo)
        const lines_copy = try self.allocator.alloc([]u8, current_lines.len);
        errdefer {
            for (lines_copy) |line| self.allocator.free(line);
            self.allocator.free(lines_copy);
        }
        for (current_lines, 0..) |line, i| {
            lines_copy[i] = try self.allocator.dupe(u8, line.items);
        }
        try self.stack.append(self.allocator, .{
            .lines = lines_copy,
            .cursor_line = current_cursor_line,
            .cursor_col = current_cursor_col,
        });

        self.breakCoalescing();
        return self.redo_stack.pop();
    }

    /// Pop and return most recent snapshot (raw pop, no redo tracking)
    pub fn pop(self: *Self) ?UndoSnapshot {
        if (self.stack.items.len == 0) return null;
        return self.stack.pop();
    }

    /// Peek at most recent snapshot without removing
    pub fn peek(self: *const Self) ?*const UndoSnapshot {
        if (self.stack.items.len == 0) return null;
        return &self.stack.items[self.stack.items.len - 1];
    }

    /// Called before character insertion to handle coalescing
    /// Returns true if a snapshot should be taken
    pub fn shouldSnapshot(self: *Self, char: u8) bool {
        const is_word_char = isWordChar(char);
        const is_whitespace = std.ascii.isWhitespace(char);

        // Non-typing always snapshots
        if (!std.ascii.isPrint(char) and char != ' ' and char != '\t') {
            self.breakCoalescing();
            return true;
        }

        // Whitespace after word = snapshot (captures word+space unit)
        if (is_whitespace and self.last_was_word_char) {
            self.last_was_word_char = false;
            return true;
        }

        // Word char continues coalescing
        if (is_word_char) {
            if (!self.coalescing) {
                self.coalescing = true;
                self.last_was_word_char = true;
                return true; // Start of new word
            }
            self.last_was_word_char = true;
            return false; // Continue word
        }

        // Non-word printable (punctuation) = snapshot
        self.breakCoalescing();
        return true;
    }

    /// Break coalescing (called on non-typing actions)
    pub fn breakCoalescing(self: *Self) void {
        self.coalescing = false;
        self.last_was_word_char = false;
    }

    /// Force immediate snapshot (for explicit actions like paste)
    pub fn forceSnapshot(
        self: *Self,
        lines: []const ArrayListUnmanaged(u8),
        cursor_line: usize,
        cursor_col: usize,
    ) !void {
        self.breakCoalescing();
        try self.push(lines, cursor_line, cursor_col);
    }

    pub fn len(self: *const Self) usize {
        return self.stack.items.len;
    }

    pub fn redoLen(self: *const Self) usize {
        return self.redo_stack.items.len;
    }

    pub fn isEmpty(self: *const Self) bool {
        return self.stack.items.len == 0;
    }

    pub fn canRedo(self: *const Self) bool {
        return self.redo_stack.items.len > 0;
    }

    pub fn clear(self: *Self) void {
        for (self.stack.items) |*snapshot| {
            snapshot.deinit(self.allocator);
        }
        self.stack.clearRetainingCapacity();
        self.clearRedo();
        self.breakCoalescing();
    }

    fn clearRedo(self: *Self) void {
        for (self.redo_stack.items) |*snapshot| {
            snapshot.deinit(self.allocator);
        }
        self.redo_stack.clearRetainingCapacity();
    }
};

fn isWordChar(c: u8) bool {
    return std.ascii.isAlphanumeric(c) or c == '_';
}

// ============ Tests ============

test "UndoStack push and pop" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    var line1 = ArrayListUnmanaged(u8){};
    defer line1.deinit(allocator);
    try line1.appendSlice(allocator, "hello");

    var lines = [_]ArrayListUnmanaged(u8){line1};
    try stack.push(&lines, 0, 5);

    try std.testing.expectEqual(@as(usize, 1), stack.len());

    var snapshot = stack.pop().?;
    defer snapshot.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 1), snapshot.lines.len);
    try std.testing.expectEqualStrings("hello", snapshot.lines[0]);
    try std.testing.expectEqual(@as(usize, 0), snapshot.cursor_line);
    try std.testing.expectEqual(@as(usize, 5), snapshot.cursor_col);
}

test "UndoStack undo operation" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    var line1 = ArrayListUnmanaged(u8){};
    defer line1.deinit(allocator);
    try line1.appendSlice(allocator, "hello");
    var lines1 = [_]ArrayListUnmanaged(u8){line1};
    try stack.push(&lines1, 0, 5);

    var line2 = ArrayListUnmanaged(u8){};
    defer line2.deinit(allocator);
    try line2.appendSlice(allocator, "world");
    var lines2 = [_]ArrayListUnmanaged(u8){line2};

    var snapshot = (try stack.undo(&lines2, 0, 5)).?;
    defer snapshot.deinit(allocator);

    try std.testing.expectEqualStrings("hello", snapshot.lines[0]);
    try std.testing.expectEqual(@as(usize, 1), stack.redoLen());
}

test "UndoStack redo operation" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    var line1 = ArrayListUnmanaged(u8){};
    defer line1.deinit(allocator);
    try line1.appendSlice(allocator, "hello");
    var lines1 = [_]ArrayListUnmanaged(u8){line1};
    try stack.push(&lines1, 0, 5);

    var line2 = ArrayListUnmanaged(u8){};
    defer line2.deinit(allocator);
    try line2.appendSlice(allocator, "world");
    var lines2 = [_]ArrayListUnmanaged(u8){line2};

    var undo_snap = (try stack.undo(&lines2, 0, 5)).?;
    defer undo_snap.deinit(allocator);

    var line3 = ArrayListUnmanaged(u8){};
    defer line3.deinit(allocator);
    try line3.appendSlice(allocator, "hello");
    var lines3 = [_]ArrayListUnmanaged(u8){line3};

    var redo_snap = (try stack.redo(&lines3, 0, 5)).?;
    defer redo_snap.deinit(allocator);

    try std.testing.expectEqualStrings("world", redo_snap.lines[0]);
    try std.testing.expectEqual(@as(usize, 0), stack.redoLen());
}

test "UndoStack new edit clears redo" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    var line1 = ArrayListUnmanaged(u8){};
    defer line1.deinit(allocator);
    try line1.appendSlice(allocator, "hello");
    var lines1 = [_]ArrayListUnmanaged(u8){line1};
    try stack.push(&lines1, 0, 5);

    var line2 = ArrayListUnmanaged(u8){};
    defer line2.deinit(allocator);
    try line2.appendSlice(allocator, "world");
    var lines2 = [_]ArrayListUnmanaged(u8){line2};

    var undo_snap = (try stack.undo(&lines2, 0, 5)).?;
    defer undo_snap.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 1), stack.redoLen());

    var line3 = ArrayListUnmanaged(u8){};
    defer line3.deinit(allocator);
    try line3.appendSlice(allocator, "new");
    var lines3 = [_]ArrayListUnmanaged(u8){line3};
    try stack.push(&lines3, 0, 3);

    try std.testing.expectEqual(@as(usize, 0), stack.redoLen());
}

test "UndoStack coalescing word chars" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    // First char of word = snapshot
    try std.testing.expect(stack.shouldSnapshot('h'));
    // Subsequent word chars = no snapshot
    try std.testing.expect(!stack.shouldSnapshot('e'));
    try std.testing.expect(!stack.shouldSnapshot('l'));
    try std.testing.expect(!stack.shouldSnapshot('l'));
    try std.testing.expect(!stack.shouldSnapshot('o'));
}

test "UndoStack coalescing whitespace boundary" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    _ = stack.shouldSnapshot('h');
    _ = stack.shouldSnapshot('i');
    // Space after word = snapshot
    try std.testing.expect(stack.shouldSnapshot(' '));
}

test "UndoStack break coalescing" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    _ = stack.shouldSnapshot('h');
    _ = stack.shouldSnapshot('i');
    stack.breakCoalescing();
    // After break, next char should snapshot
    try std.testing.expect(stack.shouldSnapshot('x'));
}

test "UndoStack max entries" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    stack.max_entries = 3;
    defer stack.deinit();

    var line = ArrayListUnmanaged(u8){};
    defer line.deinit(allocator);
    try line.appendSlice(allocator, "test");
    var lines = [_]ArrayListUnmanaged(u8){line};

    try stack.push(&lines, 0, 0);
    try stack.push(&lines, 0, 1);
    try stack.push(&lines, 0, 2);
    try stack.push(&lines, 0, 3);

    try std.testing.expectEqual(@as(usize, 3), stack.len());
    // Oldest (cursor_col=0) should be removed, newest (cursor_col=3) present
    const newest = stack.peek().?;
    try std.testing.expectEqual(@as(usize, 3), newest.cursor_col);
}

test "UndoStack empty operations" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    try std.testing.expect(stack.isEmpty());
    try std.testing.expect(stack.pop() == null);
    try std.testing.expect(stack.peek() == null);
    try std.testing.expect(!stack.canRedo());
}

test "UndoStack punctuation breaks coalescing" {
    const allocator = std.testing.allocator;
    var stack = UndoStack.init(allocator);
    defer stack.deinit();

    _ = stack.shouldSnapshot('a');
    _ = stack.shouldSnapshot('b');
    // Punctuation = snapshot
    try std.testing.expect(stack.shouldSnapshot('.'));
    // Next char also snapshots
    try std.testing.expect(stack.shouldSnapshot('c'));
}
