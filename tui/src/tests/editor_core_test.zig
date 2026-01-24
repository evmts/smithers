const std = @import("std");
const editor = @import("../editor/editor.zig");

// ============ Init/Deinit tests ============

test "Editor init creates empty editor" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try std.testing.expectEqual(@as(usize, 1), ed.lineCount());
    try std.testing.expectEqual(@as(usize, 0), ed.cursor_line);
    try std.testing.expectEqual(@as(usize, 0), ed.cursor_col);
}

test "Editor deinit frees memory" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    ed.deinit();
}

// ============ getText/setText tests ============

test "Editor getText on empty returns empty" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    const text = try ed.getText();
    defer allocator.free(text);
    try std.testing.expectEqual(@as(usize, 0), text.len);
}

test "Editor setText single line" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("hello world");
    const text = try ed.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("hello world", text);
}

test "Editor setText multiple lines" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("line1\nline2\nline3");
    try std.testing.expectEqual(@as(usize, 3), ed.lineCount());

    const text = try ed.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("line1\nline2\nline3", text);
}

test "Editor setText clears previous content" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("first content");
    try ed.setText("second");

    const text = try ed.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("second", text);
}

test "Editor clear resets to empty" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("some content");
    try ed.clear();

    const text = try ed.getText();
    defer allocator.free(text);
    try std.testing.expectEqual(@as(usize, 0), text.len);
}

// ============ Cursor tests ============

test "Editor getCursor returns position" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    const cursor = ed.getCursor();
    try std.testing.expectEqual(@as(usize, 0), cursor.line);
    try std.testing.expectEqual(@as(usize, 0), cursor.col);
}

test "Editor setCursor updates position" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("hello\nworld");
    ed.setCursor(1, 3);

    try std.testing.expectEqual(@as(usize, 1), ed.cursor_line);
    try std.testing.expectEqual(@as(usize, 3), ed.cursor_col);
}

test "Editor setCursor clamps to valid range" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("hi");
    ed.setCursor(100, 100);

    try std.testing.expectEqual(@as(usize, 0), ed.cursor_line);
    // Column should be clamped to line length
    try std.testing.expect(ed.cursor_col <= 2);
}

// ============ getLine tests ============

test "Editor getLine returns line content" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("first\nsecond\nthird");

    try std.testing.expectEqualStrings("first", ed.getLine(0).?);
    try std.testing.expectEqualStrings("second", ed.getLine(1).?);
    try std.testing.expectEqualStrings("third", ed.getLine(2).?);
}

test "Editor getLine returns null for invalid index" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("one line");
    try std.testing.expect(ed.getLine(1) == null);
    try std.testing.expect(ed.getLine(100) == null);
}

// ============ lineCount tests ============

test "Editor lineCount counts lines" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try std.testing.expectEqual(@as(usize, 1), ed.lineCount());

    try ed.setText("a");
    try std.testing.expectEqual(@as(usize, 1), ed.lineCount());

    try ed.setText("a\nb");
    try std.testing.expectEqual(@as(usize, 2), ed.lineCount());

    try ed.setText("a\nb\nc\nd");
    try std.testing.expectEqual(@as(usize, 4), ed.lineCount());
}

// ============ Unicode tests ============

test "Editor handles unicode" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("日本語\némojis 🎉");
    try std.testing.expectEqual(@as(usize, 2), ed.lineCount());

    const text = try ed.getText();
    defer allocator.free(text);
    try std.testing.expect(std.mem.indexOf(u8, text, "日本語") != null);
    try std.testing.expect(std.mem.indexOf(u8, text, "🎉") != null);
}

// ============ Empty content edge cases ============

test "Editor setText empty string" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("");
    try std.testing.expectEqual(@as(usize, 1), ed.lineCount());
}

test "Editor setText trailing newline" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("line1\n");
    try std.testing.expectEqual(@as(usize, 2), ed.lineCount());
    try std.testing.expectEqualStrings("line1", ed.getLine(0).?);
    try std.testing.expectEqualStrings("", ed.getLine(1).?);
}

test "Editor setText multiple empty lines" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    try ed.setText("\n\n\n");
    try std.testing.expectEqual(@as(usize, 4), ed.lineCount());
}

// ============ Memory tests ============

test "Editor multiple setText calls" {
    const allocator = std.testing.allocator;
    var ed = editor.Editor.init(allocator);
    defer ed.deinit();

    var i: usize = 0;
    while (i < 100) : (i += 1) {
        try ed.setText("test content");
    }
}

test "Editor struct size is reasonable" {
    try std.testing.expect(@sizeOf(editor.Editor) <= 256);
}
