// Mock renderer for tests - generic test double for Renderer
const std = @import("std");
const clipboard_mod = @import("../clipboard.zig");

pub const MockRenderer = struct {
    pub const Clipboard = clipboard_mod.MockClipboard;

    pub const Color = struct {
        rgb: struct { u8, u8, u8 } = .{ 0, 0, 0 },

        pub const default: Color = .{};
    };

    pub const Style = struct {
        fg: Color = .{},
        bg: Color = .{},
        bold: bool = false,
    };

    pub const Key = struct {
        codepoint: u21 = 0,
        mods: Mods = .{},

        pub const Mods = struct {
            shift: bool = false,
            ctrl: bool = false,
            alt: bool = false,
        };

        pub const up: u21 = 0x100001;
        pub const down: u21 = 0x100002;
        pub const left: u21 = 0x100003;
        pub const right: u21 = 0x100004;
        pub const enter: u21 = '\r';
        pub const escape: u21 = 0x1b;
        pub const tab: u21 = '\t';
        pub const backspace: u21 = 0x7f;

        pub fn matches(self: Key, codepoint: u21, mods: Mods) bool {
            return self.codepoint == codepoint and
                self.mods.shift == mods.shift and
                self.mods.ctrl == mods.ctrl and
                self.mods.alt == mods.alt;
        }
    };

    pub const Window = struct {
        w: u16 = 80,
        h: u16 = 24,

        pub fn printSegment(_: Window, _: anytype, _: anytype) struct { col: usize } {
            return .{ .col = 0 };
        }
    };

    w: u16 = 80,
    h: u16 = 24,
    window: Window = .{},

    pub fn init(_: Window) MockRenderer {
        return .{};
    }

    pub fn width(self: MockRenderer) u16 {
        return self.w;
    }

    pub fn height(self: MockRenderer) u16 {
        return self.h;
    }

    pub fn subRegion(_: MockRenderer, _: u16, _: u16, sw: u16, sh: u16) MockRenderer {
        return .{ .w = sw, .h = sh, .window = .{ .w = sw, .h = sh } };
    }

    pub fn drawText(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}
    pub fn drawCell(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) void {}
    pub fn fill(_: MockRenderer, _: u16, _: u16, _: u16, _: u16, _: []const u8, _: Style) void {}
    pub fn printSegment(_: MockRenderer, _: u16, _: u16, _: []const u8, _: Style) u16 {
        return 0;
    }
};
