// Chat Container for Smithers TUI
// Wraps chat history display with container styling

const std = @import("std");
const vaxis = @import("vaxis");
const ChatHistory = @import("../components/chat_history.zig").ChatHistory;
const db = @import("../db.zig");

const border_color: u8 = 240; // Gray border
const title_color: u8 = 75; // Blue title

pub const ChatContainer = struct {
    chat_history: *ChatHistory,
    title: ?[]const u8 = null,
    show_border: bool = true,

    const Self = @This();

    pub fn init(chat_history: *ChatHistory) Self {
        return .{
            .chat_history = chat_history,
        };
    }

    pub fn setTitle(self: *Self, title: ?[]const u8) void {
        self.title = title;
    }

    pub fn setBorder(self: *Self, show: bool) void {
        self.show_border = show;
    }

    pub fn draw(self: *Self, win: vaxis.Window) void {
        if (!self.show_border) {
            self.chat_history.draw(win);
            return;
        }

        const border_style: vaxis.Style = .{ .fg = .{ .index = border_color } };
        const title_style: vaxis.Style = .{
            .fg = .{ .index = title_color },
            .bold = true,
        };

        // Draw top border with optional title
        self.drawTopBorder(win, border_style, title_style);

        // Draw side borders
        for (1..win.height -| 1) |y| {
            win.writeCell(0, @intCast(y), .{
                .char = .{ .grapheme = "│", .width = 1 },
                .style = border_style,
            });
            win.writeCell(win.width -| 1, @intCast(y), .{
                .char = .{ .grapheme = "│", .width = 1 },
                .style = border_style,
            });
        }

        // Draw bottom border
        self.drawBottomBorder(win, border_style);

        // Draw chat content inside border
        const content_win = win.child(.{
            .x_off = 1,
            .y_off = 1,
            .width = win.width -| 2,
            .height = win.height -| 2,
        });
        self.chat_history.draw(content_win);
    }

    fn drawTopBorder(self: *const Self, win: vaxis.Window, border_style: vaxis.Style, title_style: vaxis.Style) void {
        win.writeCell(0, 0, .{
            .char = .{ .grapheme = "╭", .width = 1 },
            .style = border_style,
        });

        var x: u16 = 1;

        // Title if present
        if (self.title) |title| {
            win.writeCell(x, 0, .{
                .char = .{ .grapheme = "─", .width = 1 },
                .style = border_style,
            });
            x += 1;

            const title_len: u16 = @intCast(@min(title.len, win.width -| 6));
            _ = win.child(.{ .x_off = x, .y_off = 0, .width = title_len, .height = 1 })
                .printSegment(.{ .text = title[0..title_len], .style = title_style }, .{});
            x += title_len;

            win.writeCell(x, 0, .{
                .char = .{ .grapheme = "─", .width = 1 },
                .style = border_style,
            });
            x += 1;
        }

        // Fill remaining with horizontal line
        while (x < win.width -| 1) : (x += 1) {
            win.writeCell(x, 0, .{
                .char = .{ .grapheme = "─", .width = 1 },
                .style = border_style,
            });
        }

        win.writeCell(win.width -| 1, 0, .{
            .char = .{ .grapheme = "╮", .width = 1 },
            .style = border_style,
        });
    }

    fn drawBottomBorder(_: *const Self, win: vaxis.Window, border_style: vaxis.Style) void {
        const y: u16 = win.height -| 1;

        win.writeCell(0, y, .{
            .char = .{ .grapheme = "╰", .width = 1 },
            .style = border_style,
        });

        for (1..win.width -| 1) |x| {
            win.writeCell(@intCast(x), y, .{
                .char = .{ .grapheme = "─", .width = 1 },
                .style = border_style,
            });
        }

        win.writeCell(win.width -| 1, y, .{
            .char = .{ .grapheme = "╯", .width = 1 },
            .style = border_style,
        });
    }

    pub fn scrollUp(self: *Self, lines: u16) void {
        self.chat_history.scrollUp(lines);
    }

    pub fn scrollDown(self: *Self, lines: u16) void {
        self.chat_history.scrollDown(lines);
    }

    pub fn scrollToBottom(self: *Self) void {
        self.chat_history.scrollToBottom();
    }

    pub fn reload(self: *Self, database: *db.Database) !void {
        try self.chat_history.reload(database);
    }
};
