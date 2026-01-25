const std = @import("std");
const vaxis = @import("vaxis");

/// Renderer encapsulates all rendering operations
/// Can be backed by vaxis, web canvas, test buffer, etc.
pub fn Renderer(comptime Backend: type) type {
    return struct {
        window: Backend.Window,

        const Self = @This();

        // Types re-exported for convenience
        pub const Window = Backend.Window;
        pub const Color = Backend.Color;
        pub const Style = Backend.Style;
        pub const Key = Backend.Key;
        pub const Mouse = Backend.Mouse;
        pub const Winsize = Backend.Winsize;
        pub const Clipboard = Backend.Clipboard;

        pub fn init(window: Backend.Window) Self {
            return .{ .window = window };
        }

        /// Write styled text at position
        pub fn drawText(self: Self, x: u16, y: u16, text: []const u8, style: Style) void {
            var child = self.window.child(.{
                .x_off = x,
                .y_off = y,
                .width = @intCast(@min(text.len, self.window.width -| x)),
                .height = 1,
            });
            _ = child.printSegment(.{ .text = text, .style = style }, .{});
        }

        /// Write single cell
        pub fn drawCell(self: Self, x: u16, y: u16, char: []const u8, style: Style) void {
            self.window.writeCell(x, y, .{
                .char = .{ .grapheme = char, .width = 1 },
                .style = style,
            });
        }

        /// Fill area with character
        pub fn fill(self: Self, x: u16, y: u16, w: u16, h: u16, char: []const u8, style: Style) void {
            var row: u16 = 0;
            while (row < h) : (row += 1) {
                var col: u16 = 0;
                while (col < w) : (col += 1) {
                    self.window.writeCell(x + col, y + row, .{
                        .char = .{ .grapheme = char, .width = 1 },
                        .style = style,
                    });
                }
            }
        }

        /// Create sub-region renderer
        pub fn subRegion(self: Self, x: u16, y: u16, w: u16, h: u16) Self {
            return .{
                .window = self.window.child(.{
                    .x_off = x,
                    .y_off = y,
                    .width = w,
                    .height = h,
                }),
            };
        }

        /// Clear the entire window
        pub fn clear(self: Self) void {
            self.window.clear();
        }

        /// Get dimensions
        pub fn width(self: Self) u16 {
            return self.window.width;
        }

        pub fn height(self: Self) u16 {
            return self.window.height;
        }

        /// Create sub-region with border (returns content area renderer)
        pub fn subRegionWithBorder(self: Self, x: u16, y: u16, w: u16, h: u16, border_style: Style) Self {
            const child = self.window.child(.{
                .x_off = x,
                .y_off = y,
                .width = w,
                .height = h,
                .border = .{
                    .where = .all,
                    .style = border_style,
                },
            });
            return .{ .window = child };
        }

        /// Print styled segment at position (returns number of cells printed)
        pub fn printSegment(self: Self, x: u16, y: u16, text: []const u8, style: Style) u16 {
            var child = self.window.child(.{
                .x_off = x,
                .y_off = y,
                .width = self.window.width -| x,
                .height = 1,
            });
            const result = child.printSegment(.{ .text = text, .style = style }, .{});
            return @intCast(result.col);
        }
    };
}

const clipboard_mod = @import("../clipboard.zig");

/// Vaxis backend types
pub const VaxisBackend = struct {
    pub const Window = vaxis.Window;
    pub const Color = vaxis.Color;
    pub const Style = vaxis.Style;
    pub const Key = vaxis.Key;
    pub const Mouse = vaxis.Mouse;
    pub const Winsize = vaxis.Winsize;
    pub const Clipboard = clipboard_mod.SystemClipboard;
};

/// Stdout backend for CLI/headless mode - renders to normal terminal via stdout
pub const StdoutBackend = struct {
    pub const Window = StdoutWindow;
    pub const Color = StdoutColor;
    pub const Style = StdoutStyle;
    pub const Key = StdoutKey;
    pub const Mouse = StdoutMouse;
    pub const Winsize = StdoutWinsize;
    pub const Clipboard = StdoutClipboard;

    /// Simple color representation
    pub const StdoutColor = struct {
        r: u8 = 0,
        g: u8 = 0,
        b: u8 = 0,

        pub const default: StdoutColor = .{};

        pub fn rgb(r: u8, g: u8, b: u8) StdoutColor {
            return .{ .r = r, .g = g, .b = b };
        }
    };

    pub const StdoutStyle = struct {
        fg: StdoutColor = StdoutColor.default,
        bg: StdoutColor = StdoutColor.default,
        bold: bool = false,
        italic: bool = false,
        underline: bool = false,
    };

    pub const StdoutKey = struct {
        codepoint: u21 = 0,
        text: ?[]const u8 = null,
        mods: Mods = .{},

        pub const Mods = struct {
            ctrl: bool = false,
            alt: bool = false,
            shift: bool = false,
        };

        pub const escape: u21 = 0x1b;
        pub const up: u21 = 0x100;
        pub const down: u21 = 0x101;
        pub const left: u21 = 0x102;
        pub const right: u21 = 0x103;
        pub const page_up: u21 = 0x104;
        pub const page_down: u21 = 0x105;
        pub const enter: u21 = '\r';
        pub const backspace: u21 = 0x7f;
        pub const delete: u21 = 0x106;
        pub const home: u21 = 0x107;
        pub const end: u21 = 0x108;
        pub const tab: u21 = '\t';

        pub fn matches(self: StdoutKey, cp: u21, mods: Mods) bool {
            return self.codepoint == cp and
                self.mods.ctrl == mods.ctrl and
                self.mods.alt == mods.alt and
                self.mods.shift == mods.shift;
        }
    };

    pub const StdoutMouse = struct {
        col: u16 = 0,
        row: u16 = 0,
        button: u8 = 0,
        type: enum { press, release, motion } = .press,
    };

    pub const StdoutWinsize = struct {
        cols: u16 = 80,
        rows: u16 = 24,
    };

    pub const StdoutClipboard = struct {
        pub fn get(_: *StdoutClipboard, _: std.mem.Allocator) ?[]const u8 {
            return null;
        }
        pub fn set(_: *StdoutClipboard, _: []const u8) void {}
    };

    /// Window that accumulates output and prints to stdout
    pub const StdoutWindow = struct {
        width: u16 = 80,
        height: u16 = 24,
        x_off: u16 = 0,
        y_off: u16 = 0,
        writer: ?std.fs.File.Writer = null,

        const ChildOptions = struct {
            x_off: u16 = 0,
            y_off: u16 = 0,
            width: u16 = 80,
            height: u16 = 24,
            border: ?struct {
                where: enum { all, none } = .none,
                style: StdoutStyle = .{},
            } = null,
        };

        const PrintResult = struct {
            col: u16 = 0,
            row: u16 = 0,
        };

        const Segment = struct {
            text: []const u8,
            style: StdoutStyle = .{},
        };

        pub fn init() StdoutWindow {
            return .{
                .width = 80,
                .height = 24,
                .writer = std.io.getStdOut().writer(),
            };
        }

        pub fn child(self: StdoutWindow, opts: ChildOptions) StdoutWindow {
            return .{
                .width = opts.width,
                .height = opts.height,
                .x_off = self.x_off + opts.x_off,
                .y_off = self.y_off + opts.y_off,
                .writer = self.writer,
            };
        }

        pub fn printSegment(self: *StdoutWindow, segment: Segment, _: anytype) PrintResult {
            if (self.writer) |w| {
                w.print("{s}", .{segment.text}) catch {};
            }
            return .{ .col = @intCast(@min(segment.text.len, self.width)) };
        }

        pub fn writeCell(self: *StdoutWindow, _: u16, _: u16, cell: anytype) void {
            if (self.writer) |w| {
                w.print("{s}", .{cell.char.grapheme}) catch {};
            }
        }

        pub fn clear(_: *StdoutWindow) void {
            // Print newline to separate renders
            const stdout = std.io.getStdOut().writer();
            stdout.print("\n", .{}) catch {};
        }
    };
};

