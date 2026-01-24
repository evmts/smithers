// Box Component for Smithers TUI
// Container with borders and optional title

const std = @import("std");
const DefaultRenderer = @import("../rendering/renderer.zig").DefaultRenderer;

const default_border_color: u8 = 240;

pub const BorderStyle = enum {
    none,
    single,
    double,
    rounded,
    heavy,
    ascii,

    pub fn chars(self: BorderStyle) BorderChars {
        return switch (self) {
            .none => .{ .tl = " ", .tr = " ", .bl = " ", .br = " ", .h = " ", .v = " " },
            .single => .{ .tl = "┌", .tr = "┐", .bl = "└", .br = "┘", .h = "─", .v = "│" },
            .double => .{ .tl = "╔", .tr = "╗", .bl = "╚", .br = "╝", .h = "═", .v = "║" },
            .rounded => .{ .tl = "╭", .tr = "╮", .bl = "╰", .br = "╯", .h = "─", .v = "│" },
            .heavy => .{ .tl = "┏", .tr = "┓", .bl = "┗", .br = "┛", .h = "━", .v = "┃" },
            .ascii => .{ .tl = "+", .tr = "+", .bl = "+", .br = "+", .h = "-", .v = "|" },
        };
    }
};

pub const BorderChars = struct {
    tl: []const u8,
    tr: []const u8,
    bl: []const u8,
    br: []const u8,
    h: []const u8,
    v: []const u8,
};

pub const BoxStyle = struct {
    border: BorderStyle = .single,
    border_color: u8 = default_border_color,
    padding_left: u16 = 0,
    padding_right: u16 = 0,
    padding_top: u16 = 0,
    padding_bottom: u16 = 0,
    title: ?[]const u8 = null,
    title_color: u8 = 75, // Blue
};

pub const Box = struct {
    style: BoxStyle = .{},

    const Self = @This();

    pub fn init() Self {
        return .{};
    }

    pub fn initWithStyle(style: BoxStyle) Self {
        return .{ .style = style };
    }

    pub fn setStyle(self: *Self, style: BoxStyle) void {
        self.style = style;
    }

    pub fn setTitle(self: *Self, title: ?[]const u8) void {
        self.style.title = title;
    }

    pub fn draw(self: *const Self, win: DefaultRenderer.Window) void {
        if (self.style.border == .none) return;
        if (win.width < 2 or win.height < 2) return;

        const chars = self.style.border.chars();
        const border_style: DefaultRenderer.Style = .{ .fg = .{ .index = self.style.border_color } };
        const title_style: DefaultRenderer.Style = .{
            .fg = .{ .index = self.style.title_color },
            .bold = true,
        };

        // Top border
        win.writeCell(0, 0, .{
            .char = .{ .grapheme = chars.tl, .width = 1 },
            .style = border_style,
        });

        var x: u16 = 1;

        // Title if present
        if (self.style.title) |title| {
            win.writeCell(x, 0, .{
                .char = .{ .grapheme = chars.h, .width = 1 },
                .style = border_style,
            });
            x += 1;

            const title_len: u16 = @intCast(@min(title.len, win.width -| 6));
            _ = win.child(.{ .x_off = x, .y_off = 0, .width = title_len, .height = 1 })
                .printSegment(.{ .text = title[0..title_len], .style = title_style }, .{});
            x += title_len;

            win.writeCell(x, 0, .{
                .char = .{ .grapheme = chars.h, .width = 1 },
                .style = border_style,
            });
            x += 1;
        }

        // Fill remaining top border
        while (x < win.width -| 1) : (x += 1) {
            win.writeCell(x, 0, .{
                .char = .{ .grapheme = chars.h, .width = 1 },
                .style = border_style,
            });
        }

        win.writeCell(win.width -| 1, 0, .{
            .char = .{ .grapheme = chars.tr, .width = 1 },
            .style = border_style,
        });

        // Side borders
        for (1..win.height -| 1) |y| {
            win.writeCell(0, @intCast(y), .{
                .char = .{ .grapheme = chars.v, .width = 1 },
                .style = border_style,
            });
            win.writeCell(win.width -| 1, @intCast(y), .{
                .char = .{ .grapheme = chars.v, .width = 1 },
                .style = border_style,
            });
        }

        // Bottom border
        const bottom_y: u16 = win.height -| 1;
        win.writeCell(0, bottom_y, .{
            .char = .{ .grapheme = chars.bl, .width = 1 },
            .style = border_style,
        });

        for (1..win.width -| 1) |bx| {
            win.writeCell(@intCast(bx), bottom_y, .{
                .char = .{ .grapheme = chars.h, .width = 1 },
                .style = border_style,
            });
        }

        win.writeCell(win.width -| 1, bottom_y, .{
            .char = .{ .grapheme = chars.br, .width = 1 },
            .style = border_style,
        });
    }

    pub fn contentWindow(self: *const Self, win: DefaultRenderer.Window) DefaultRenderer.Window {
        const border_offset: u16 = if (self.style.border != .none) 1 else 0;
        const x_off = border_offset + self.style.padding_left;
        const y_off = border_offset + self.style.padding_top;
        const w = win.width -| (border_offset * 2) -| self.style.padding_left -| self.style.padding_right;
        const h = win.height -| (border_offset * 2) -| self.style.padding_top -| self.style.padding_bottom;

        return win.child(.{
            .x_off = x_off,
            .y_off = y_off,
            .width = if (w > 0) w else 1,
            .height = if (h > 0) h else 1,
        });
    }
};
