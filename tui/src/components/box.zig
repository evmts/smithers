// Box Component for Smithers TUI
// Container with borders and optional title

const std = @import("std");

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

/// Generic box component
pub fn Box(comptime R: type) type {
    return struct {
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

        pub fn draw(self: *const Self, renderer: R) void {
            if (self.style.border == .none) return;
            const win_width = renderer.width();
            const win_height = renderer.height();
            if (win_width < 2 or win_height < 2) return;

            const chars = self.style.border.chars();
            const border_style: R.Style = .{ .fg = .{ .index = self.style.border_color } };
            const title_style: R.Style = .{
                .fg = .{ .index = self.style.title_color },
                .bold = true,
            };

            // Top border
            renderer.drawCell(0, 0, chars.tl, border_style);

            var x: u16 = 1;

            // Title if present
            if (self.style.title) |title| {
                renderer.drawCell(x, 0, chars.h, border_style);
                x += 1;

                const title_len: u16 = @intCast(@min(title.len, win_width -| 6));
                renderer.drawText(x, 0, title[0..title_len], title_style);
                x += title_len;

                renderer.drawCell(x, 0, chars.h, border_style);
                x += 1;
            }

            // Fill remaining top border
            while (x < win_width -| 1) : (x += 1) {
                renderer.drawCell(x, 0, chars.h, border_style);
            }

            renderer.drawCell(win_width -| 1, 0, chars.tr, border_style);

            // Side borders
            for (1..win_height -| 1) |y| {
                renderer.drawCell(0, @intCast(y), chars.v, border_style);
                renderer.drawCell(win_width -| 1, @intCast(y), chars.v, border_style);
            }

            // Bottom border
            const bottom_y: u16 = win_height -| 1;
            renderer.drawCell(0, bottom_y, chars.bl, border_style);

            for (1..win_width -| 1) |bx| {
                renderer.drawCell(@intCast(bx), bottom_y, chars.h, border_style);
            }

            renderer.drawCell(win_width -| 1, bottom_y, chars.br, border_style);
        }

        pub fn contentRegion(self: *const Self, renderer: R) R {
            const border_offset: u16 = if (self.style.border != .none) 1 else 0;
            const x_off = border_offset + self.style.padding_left;
            const y_off = border_offset + self.style.padding_top;
            const w = renderer.width() -| (border_offset * 2) -| self.style.padding_left -| self.style.padding_right;
            const h = renderer.height() -| (border_offset * 2) -| self.style.padding_top -| self.style.padding_bottom;

            return renderer.subRegion(
                x_off,
                y_off,
                if (w > 0) w else 1,
                if (h > 0) h else 1,
            );
        }
    };
}


