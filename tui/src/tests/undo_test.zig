const std = @import("std");
const undo = @import("../editor/undo.zig");

// Re-export inline tests from undo.zig
test {
    _ = undo;
}

// Additional edge case tests

test "UndoSnapshot deinit frees memory" {
    const allocator = std.testing.allocator;
    
    var lines = try allocator.alloc([]u8, 2);
    lines[0] = try allocator.dupe(u8, "line1");
    lines[1] = try allocator.dupe(u8, "line2");
    
    var snapshot = undo.UndoSnapshot{
        .lines = lines,
        .cursor_line = 0,
        .cursor_col = 5,
    };
    snapshot.deinit(allocator);
}

test "UndoStack clear frees all snapshots" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    var line = std.ArrayListUnmanaged(u8){};
    defer line.deinit(allocator);
    try line.appendSlice(allocator, "test");
    var lines = [_]std.ArrayListUnmanaged(u8){line};
    
    try stack.push(&lines, 0, 0);
    try stack.push(&lines, 0, 1);
    try stack.push(&lines, 0, 2);
    
    try std.testing.expectEqual(@as(usize, 3), stack.len());
    stack.clear();
    try std.testing.expectEqual(@as(usize, 0), stack.len());
    try std.testing.expect(stack.isEmpty());
}

test "UndoStack forceSnapshot breaks coalescing" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    _ = stack.shouldSnapshot('a');
    _ = stack.shouldSnapshot('b');
    try std.testing.expect(stack.coalescing);
    
    var line = std.ArrayListUnmanaged(u8){};
    defer line.deinit(allocator);
    try line.appendSlice(allocator, "ab");
    var lines = [_]std.ArrayListUnmanaged(u8){line};
    
    try stack.forceSnapshot(&lines, 0, 2);
    try std.testing.expect(!stack.coalescing);
}

test "UndoStack undo on empty returns null" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    var line = std.ArrayListUnmanaged(u8){};
    defer line.deinit(allocator);
    var lines = [_]std.ArrayListUnmanaged(u8){line};
    
    const result = try stack.undo(&lines, 0, 0);
    try std.testing.expect(result == null);
}

test "UndoStack redo on empty returns null" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    var line = std.ArrayListUnmanaged(u8){};
    defer line.deinit(allocator);
    var lines = [_]std.ArrayListUnmanaged(u8){line};
    
    const result = try stack.redo(&lines, 0, 0);
    try std.testing.expect(result == null);
}

test "UndoStack multiple lines snapshot" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    var line1 = std.ArrayListUnmanaged(u8){};
    defer line1.deinit(allocator);
    try line1.appendSlice(allocator, "first");
    
    var line2 = std.ArrayListUnmanaged(u8){};
    defer line2.deinit(allocator);
    try line2.appendSlice(allocator, "second");
    
    var line3 = std.ArrayListUnmanaged(u8){};
    defer line3.deinit(allocator);
    try line3.appendSlice(allocator, "third");
    
    var lines = [_]std.ArrayListUnmanaged(u8){ line1, line2, line3 };
    try stack.push(&lines, 1, 3);
    
    var snapshot = stack.pop().?;
    defer snapshot.deinit(allocator);
    
    try std.testing.expectEqual(@as(usize, 3), snapshot.lines.len);
    try std.testing.expectEqualStrings("first", snapshot.lines[0]);
    try std.testing.expectEqualStrings("second", snapshot.lines[1]);
    try std.testing.expectEqualStrings("third", snapshot.lines[2]);
    try std.testing.expectEqual(@as(usize, 1), snapshot.cursor_line);
    try std.testing.expectEqual(@as(usize, 3), snapshot.cursor_col);
}

test "shouldSnapshot non-print chars" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    // Non-printing always snapshots
    try std.testing.expect(stack.shouldSnapshot('\x01'));
    try std.testing.expect(stack.shouldSnapshot('\x7f'));
}

test "shouldSnapshot underscore is word char" {
    const allocator = std.testing.allocator;
    var stack = undo.UndoStack.init(allocator);
    defer stack.deinit();
    
    _ = stack.shouldSnapshot('a');
    // Underscore should continue coalescing
    try std.testing.expect(!stack.shouldSnapshot('_'));
    try std.testing.expect(!stack.shouldSnapshot('b'));
}
