const std = @import("std");
const event_mod = @import("../event.zig");

const MockKey = struct {
    codepoint: u21,
    mods: Modifiers = .{},

    pub const enter: u21 = '\r';
    pub const escape: u21 = 0x1b;

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

const MockBackend = struct {
    pub const Window = void;
    pub const Color = void;
    pub const Style = void;
    pub const Key = MockKey;
    pub const Mouse = MockMouse;
    pub const Winsize = MockWinsize;
};

const MockRenderer = @import("../rendering/renderer.zig").Renderer(MockBackend);
const MockEvent = event_mod.Event(MockRenderer);

test "Event union variants" {
    const key_event = MockEvent{ .key_press = .{ .codepoint = 'a' } };
    const mouse_event = MockEvent{ .mouse = .{ .x = 10, .y = 20, .button = .left } };
    const winsize_event = MockEvent{ .winsize = .{ .rows = 24, .cols = 80 } };

    try std.testing.expect(key_event == .key_press);
    try std.testing.expect(mouse_event == .mouse);
    try std.testing.expect(winsize_event == .winsize);
}

test "key_press event - regular key" {
    const event = MockEvent{ .key_press = .{ .codepoint = 'x' } };
    try std.testing.expect(event == .key_press);
    try std.testing.expectEqual('x', event.key_press.codepoint);
    try std.testing.expect(!event.isQuit());
    try std.testing.expect(!event.isEnter());
}

test "key_press event - Ctrl+C is quit" {
    const event = MockEvent{ .key_press = .{ .codepoint = 'c', .mods = .{ .ctrl = true } } };
    try std.testing.expect(event.isQuit());
    try std.testing.expect(!event.isEnter());
}

test "key_press event - enter key" {
    const event = MockEvent{ .key_press = .{ .codepoint = MockKey.enter } };
    try std.testing.expect(event.isEnter());
    try std.testing.expect(!event.isQuit());
}

test "key_press event - with modifiers" {
    const ctrl_a = MockEvent{ .key_press = .{ .codepoint = 'a', .mods = .{ .ctrl = true } } };
    const shift_a = MockEvent{ .key_press = .{ .codepoint = 'a', .mods = .{ .shift = true } } };
    const alt_a = MockEvent{ .key_press = .{ .codepoint = 'a', .mods = .{ .alt = true } } };

    try std.testing.expect(!ctrl_a.isQuit());
    try std.testing.expect(!shift_a.isQuit());
    try std.testing.expect(!alt_a.isQuit());
    try std.testing.expect(ctrl_a.key_press.mods.ctrl);
    try std.testing.expect(shift_a.key_press.mods.shift);
    try std.testing.expect(alt_a.key_press.mods.alt);
}

test "mouse event" {
    const mouse = MockEvent{ .mouse = .{ .x = 100, .y = 50, .button = .right } };
    try std.testing.expect(mouse == .mouse);
    try std.testing.expectEqual(@as(u16, 100), mouse.mouse.x);
    try std.testing.expectEqual(@as(u16, 50), mouse.mouse.y);
    try std.testing.expectEqual(MockMouse.Button.right, mouse.mouse.button);
    try std.testing.expect(!mouse.isQuit());
    try std.testing.expect(!mouse.isEnter());
}

test "mouse event - all buttons" {
    const left = MockEvent{ .mouse = .{ .x = 0, .y = 0, .button = .left } };
    const right = MockEvent{ .mouse = .{ .x = 0, .y = 0, .button = .right } };
    const middle = MockEvent{ .mouse = .{ .x = 0, .y = 0, .button = .middle } };
    const none = MockEvent{ .mouse = .{ .x = 0, .y = 0, .button = .none } };

    try std.testing.expectEqual(MockMouse.Button.left, left.mouse.button);
    try std.testing.expectEqual(MockMouse.Button.right, right.mouse.button);
    try std.testing.expectEqual(MockMouse.Button.middle, middle.mouse.button);
    try std.testing.expectEqual(MockMouse.Button.none, none.mouse.button);
}

test "winsize event" {
    const winsize = MockEvent{ .winsize = .{ .rows = 40, .cols = 120 } };
    try std.testing.expect(winsize == .winsize);
    try std.testing.expectEqual(@as(u16, 40), winsize.winsize.rows);
    try std.testing.expectEqual(@as(u16, 120), winsize.winsize.cols);
    try std.testing.expect(!winsize.isQuit());
    try std.testing.expect(!winsize.isEnter());
}

test "winsize event - edge cases" {
    const small = MockEvent{ .winsize = .{ .rows = 1, .cols = 1 } };
    const large = MockEvent{ .winsize = .{ .rows = std.math.maxInt(u16), .cols = std.math.maxInt(u16) } };

    try std.testing.expectEqual(@as(u16, 1), small.winsize.rows);
    try std.testing.expectEqual(@as(u16, 1), small.winsize.cols);
    try std.testing.expectEqual(std.math.maxInt(u16), large.winsize.rows);
    try std.testing.expectEqual(std.math.maxInt(u16), large.winsize.cols);
}

test "Event type discrimination via switch" {
    const events = [_]MockEvent{
        .{ .key_press = .{ .codepoint = 'a' } },
        .{ .mouse = .{ .x = 0, .y = 0, .button = .left } },
        .{ .winsize = .{ .rows = 24, .cols = 80 } },
    };

    var key_count: u32 = 0;
    var mouse_count: u32 = 0;
    var winsize_count: u32 = 0;

    for (events) |event| {
        switch (event) {
            .key_press => key_count += 1,
            .mouse => mouse_count += 1,
            .winsize => winsize_count += 1,
        }
    }

    try std.testing.expectEqual(@as(u32, 1), key_count);
    try std.testing.expectEqual(@as(u32, 1), mouse_count);
    try std.testing.expectEqual(@as(u32, 1), winsize_count);
}

test "isQuit only true for Ctrl+C" {
    const cases = [_]struct { event: MockEvent, expected: bool }{
        .{ .event = .{ .key_press = .{ .codepoint = 'c', .mods = .{ .ctrl = true } } }, .expected = true },
        .{ .event = .{ .key_press = .{ .codepoint = 'c' } }, .expected = false },
        .{ .event = .{ .key_press = .{ .codepoint = 'C', .mods = .{ .ctrl = true } } }, .expected = false },
        .{ .event = .{ .key_press = .{ .codepoint = 'c', .mods = .{ .alt = true } } }, .expected = false },
        .{ .event = .{ .mouse = .{ .x = 0, .y = 0, .button = .left } }, .expected = false },
        .{ .event = .{ .winsize = .{ .rows = 24, .cols = 80 } }, .expected = false },
    };

    for (cases) |case| {
        try std.testing.expectEqual(case.expected, case.event.isQuit());
    }
}

test "isEnter only true for enter key" {
    const cases = [_]struct { event: MockEvent, expected: bool }{
        .{ .event = .{ .key_press = .{ .codepoint = MockKey.enter } }, .expected = true },
        .{ .event = .{ .key_press = .{ .codepoint = '\n' } }, .expected = false },
        .{ .event = .{ .key_press = .{ .codepoint = ' ' } }, .expected = false },
        .{ .event = .{ .key_press = .{ .codepoint = MockKey.enter, .mods = .{ .ctrl = true } } }, .expected = false },
        .{ .event = .{ .mouse = .{ .x = 0, .y = 0, .button = .left } }, .expected = false },
        .{ .event = .{ .winsize = .{ .rows = 24, .cols = 80 } }, .expected = false },
    };

    for (cases) |case| {
        try std.testing.expectEqual(case.expected, case.event.isEnter());
    }
}
