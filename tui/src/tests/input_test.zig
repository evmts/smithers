const std = @import("std");
const input_mod = @import("../components/input.zig");
const event_mod = @import("../event.zig");

const MockKey = struct {
    codepoint: u21,
    mods: Modifiers = .{},
    text_buf: ?[4]u8 = null,
    text_len: u3 = 0,

    pub const enter: u21 = '\r';
    pub const tab: u21 = '\t';
    pub const backspace: u21 = 0x7f;
    pub const delete: u21 = 0x7e;
    pub const up: u21 = 0x100;
    pub const down: u21 = 0x101;
    pub const left: u21 = 0x102;
    pub const right: u21 = 0x103;
    pub const home: u21 = 0x104;
    pub const end: u21 = 0x105;

    pub const Modifiers = struct {
        ctrl: bool = false,
        alt: bool = false,
        shift: bool = false,
    };

    pub fn matches(self: MockKey, cp: u21, mods: Modifiers) bool {
        return self.codepoint == cp and
            self.mods.ctrl == mods.ctrl and
            self.mods.alt == mods.alt and
            self.mods.shift == mods.shift;
    }

    pub fn getText(self: *const MockKey) ?[]const u8 {
        if (self.text_len > 0) {
            return self.text_buf.?[0..self.text_len];
        }
        return null;
    }

    pub fn fromChar(c: u8) MockKey {
        return .{
            .codepoint = c,
            .text_buf = .{ c, 0, 0, 0 },
            .text_len = 1,
        };
    }
};

const MockMouse = struct {
    x: u16,
    y: u16,
    button: Button,

    pub const Button = enum { left, right, middle, none };
};

const MockWinsize = struct {
    rows: u16,
    cols: u16,
};

const MockWindow = struct {
    w: u16 = 80,
    h: u16 = 24,

    pub fn child(self: MockWindow, opts: anytype) MockWindow {
        _ = opts;
        return self;
    }

    pub fn writeCell(self: MockWindow, x: u16, y: u16, cell: anytype) void {
        _ = self;
        _ = x;
        _ = y;
        _ = cell;
    }

    pub fn printSegment(self: MockWindow, seg: anytype, opts: anytype) struct { col: u16, overflow: bool } {
        _ = self;
        _ = seg;
        _ = opts;
        return .{ .col = 0, .overflow = false };
    }

    pub fn clear(self: MockWindow) void {
        _ = self;
    }

    pub const width: u16 = 80;
    pub const height: u16 = 24;
};

const MockColor = union(enum) {
    index: u8,
    rgb: struct { u8, u8, u8 },
};

const MockStyle = struct {
    fg: ?MockColor = null,
    bg: ?MockColor = null,
};

const MockBackend = struct {
    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Key = MockKey;
    pub const Mouse = MockMouse;
    pub const Winsize = MockWinsize;
};

const MockRenderer = struct {
    win: MockWindow = .{},

    pub const Window = MockWindow;
    pub const Color = MockColor;
    pub const Style = MockStyle;
    pub const Key = MockKey;
    pub const Mouse = MockMouse;
    pub const Winsize = MockWinsize;

    pub fn width(self: MockRenderer) u16 {
        return self.win.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.win.h;
    }

    pub fn subRegionWithBorder(self: MockRenderer, x: u16, y: u16, w: u16, h: u16, style: Style) MockRenderer {
        _ = x;
        _ = y;
        _ = w;
        _ = h;
        _ = style;
        return self;
    }

    pub fn drawCell(self: MockRenderer, x: u16, y: u16, char: []const u8, style: Style) void {
        _ = self;
        _ = x;
        _ = y;
        _ = char;
        _ = style;
    }

    pub fn printSegment(self: MockRenderer, x: u16, y: u16, text: []const u8, style: Style) u16 {
        _ = self;
        _ = x;
        _ = y;
        _ = style;
        return @intCast(text.len);
    }
};

const MockEvent = event_mod.Event(MockRenderer);
const Input = input_mod.Input(MockRenderer);

test "Input init" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try std.testing.expect(input.isEmpty());

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("", text);
}

test "Input insert character" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    const event = MockEvent{ .key_press = MockKey.fromChar('a') };
    _ = try input.handleEvent(event);

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("a", text);
    try std.testing.expect(!input.isEmpty());
}

test "Input insert multiple characters" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('H') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('i') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('!') });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("Hi!", text);
}

test "Input delete at cursor (backspace)" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('a') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('b') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('c') });

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.backspace } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("ab", text);
}

test "Input delete forward" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");
    input.editor.cursor_col = 1;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.delete } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("ac", text);
}

test "Input cursor movement left" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");
    try std.testing.expectEqual(@as(usize, 3), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.left } });
    try std.testing.expectEqual(@as(usize, 2), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.left } });
    try std.testing.expectEqual(@as(usize, 1), input.editor.cursor_col);
}

test "Input cursor movement right" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");
    input.editor.cursor_col = 0;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.right } });
    try std.testing.expectEqual(@as(usize, 1), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.right } });
    try std.testing.expectEqual(@as(usize, 2), input.editor.cursor_col);
}

test "Input cursor home and end" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello world");
    try std.testing.expectEqual(@as(usize, 11), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.home } });
    try std.testing.expectEqual(@as(usize, 0), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.end } });
    try std.testing.expectEqual(@as(usize, 11), input.editor.cursor_col);
}

test "Input Ctrl+A moves to line start" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello");
    try std.testing.expectEqual(@as(usize, 5), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'a', .mods = .{ .ctrl = true } } });
    try std.testing.expectEqual(@as(usize, 0), input.editor.cursor_col);
}

test "Input Ctrl+E moves to line end" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello");
    input.editor.cursor_col = 0;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'e', .mods = .{ .ctrl = true } } });
    try std.testing.expectEqual(@as(usize, 5), input.editor.cursor_col);
}

test "Input getText" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("test content");

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("test content", text);
}

test "Input clear" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("some text");
    try std.testing.expect(!input.isEmpty());

    input.clear();

    try std.testing.expect(input.isEmpty());
    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("", text);
}

test "Input isEmpty" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try std.testing.expect(input.isEmpty());

    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('x') });
    try std.testing.expect(!input.isEmpty());

    input.clear();
    try std.testing.expect(input.isEmpty());
}

test "Input enter submits text" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('h') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('i') });

    const result = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.enter } });
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("hi", result.?);
    allocator.free(result.?);

    try std.testing.expect(input.isEmpty());
}

test "Input enter on empty input returns null" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    const result = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.enter } });
    try std.testing.expect(result == null);
}

test "Input history navigation" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    input.editor.addToHistory("first command");
    input.editor.addToHistory("second command");

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.up } });
    var text = try input.getText();
    try std.testing.expectEqualStrings("second command", text);
    allocator.free(text);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.up } });
    text = try input.getText();
    try std.testing.expectEqualStrings("first command", text);
    allocator.free(text);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.down } });
    text = try input.getText();
    try std.testing.expectEqualStrings("second command", text);
    allocator.free(text);
}

test "Input Ctrl+K deletes to end of line" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("Hello World");
    input.editor.cursor_col = 5;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'k', .mods = .{ .ctrl = true } } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("Hello", text);
}

test "Input Ctrl+U deletes to start of line" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("Hello World");
    input.editor.cursor_col = 6;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'u', .mods = .{ .ctrl = true } } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("World", text);
    try std.testing.expectEqual(@as(usize, 0), input.editor.cursor_col);
}

test "Input Ctrl+W deletes word backward" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello world");

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'w', .mods = .{ .ctrl = true } } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("hello ", text);
}

test "Input Alt+B moves word left" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello world test");

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'b', .mods = .{ .alt = true } } });
    try std.testing.expectEqual(@as(usize, 12), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'b', .mods = .{ .alt = true } } });
    try std.testing.expectEqual(@as(usize, 6), input.editor.cursor_col);
}

test "Input Alt+F moves word right" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello world test");
    input.editor.cursor_col = 0;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'f', .mods = .{ .alt = true } } });
    try std.testing.expectEqual(@as(usize, 6), input.editor.cursor_col);

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'f', .mods = .{ .alt = true } } });
    try std.testing.expectEqual(@as(usize, 12), input.editor.cursor_col);
}

test "Input backspace at start does nothing" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");
    input.editor.cursor_col = 0;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.backspace } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("abc", text);
    try std.testing.expectEqual(@as(usize, 0), input.editor.cursor_col);
}

test "Input delete at end does nothing" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.delete } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("abc", text);
}

test "Input left at start does nothing" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");
    input.editor.cursor_col = 0;

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.left } });
    try std.testing.expectEqual(@as(usize, 0), input.editor.cursor_col);
}

test "Input right at end does nothing" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("abc");

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.right } });
    try std.testing.expectEqual(@as(usize, 3), input.editor.cursor_col);
}

test "Input autocomplete for commands" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('/') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('e') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('x') });

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.tab } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("/exit", text);
}

test "Input Ctrl+Z undo" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("hello");

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'z', .mods = .{ .ctrl = true } } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("", text);
}

test "Input Ctrl+Y yank" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("Hello World");
    input.editor.cursor_col = 5;
    try input.editor.deleteToLineEnd();

    _ = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = 'y', .mods = .{ .ctrl = true } } });

    const text = try input.getText();
    defer allocator.free(text);
    try std.testing.expectEqualStrings("Hello World", text);
}

test "Input ignores non-key events" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    const result = try input.handleEvent(MockEvent{ .mouse = .{ .x = 10, .y = 10, .button = .left } });
    try std.testing.expect(result == null);

    const winsize_result = try input.handleEvent(MockEvent{ .winsize = .{ .rows = 24, .cols = 80 } });
    try std.testing.expect(winsize_result == null);
}

test "Input enter with autocomplete match applies command" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('/') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('h') });
    _ = try input.handleEvent(MockEvent{ .key_press = MockKey.fromChar('e') });

    const result = try input.handleEvent(MockEvent{ .key_press = .{ .codepoint = MockKey.enter } });
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("/help", result.?);
    allocator.free(result.?);
}

test "Input draw does not crash" {
    const allocator = std.testing.allocator;
    var input = Input.init(allocator);
    defer input.deinit();

    try input.editor.insertText("test");

    var renderer = MockRenderer{};
    input.draw(renderer);
    input.drawInWindow(renderer);
}
