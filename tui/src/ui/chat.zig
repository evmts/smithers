// Chat Container for Smithers TUI
// Wraps chat history display with container styling

const std = @import("std");
const DefaultRenderer = @import("../rendering/renderer.zig").DefaultRenderer;
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

    pub fn draw(self: *Self, renderer: DefaultRenderer) void {
        if (!self.show_border) {
            self.chat_history.draw(renderer);
            return;
        }

        const border_style: DefaultRenderer.Style = .{ .fg = .{ .index = border_color } };
        const title_style: DefaultRenderer.Style = .{
            .fg = .{ .index = title_color },
            .bold = true,
        };

        // Draw top border with optional title
        self.drawTopBorder(renderer, border_style, title_style);

        // Draw side borders
        for (1..renderer.height() -| 1) |y| {
            renderer.drawCell(0, @intCast(y), "│", border_style);
            renderer.drawCell(renderer.width() -| 1, @intCast(y), "│", border_style);
        }

        // Draw bottom border
        self.drawBottomBorder(renderer, border_style);

        // Draw chat content inside border
        const content_renderer = renderer.subRegion(1, 1, renderer.width() -| 2, renderer.height() -| 2);
        self.chat_history.draw(content_renderer);
    }

    fn drawTopBorder(self: *const Self, renderer: DefaultRenderer, border_style: DefaultRenderer.Style, title_style: DefaultRenderer.Style) void {
        renderer.drawCell(0, 0, "╭", border_style);

        var x: u16 = 1;

        // Title if present
        if (self.title) |title| {
            renderer.drawCell(x, 0, "─", border_style);
            x += 1;

            const title_len: u16 = @intCast(@min(title.len, renderer.width() -| 6));
            renderer.drawText(x, 0, title[0..title_len], title_style);
            x += title_len;

            renderer.drawCell(x, 0, "─", border_style);
            x += 1;
        }

        // Fill remaining with horizontal line
        while (x < renderer.width() -| 1) : (x += 1) {
            renderer.drawCell(x, 0, "─", border_style);
        }

        renderer.drawCell(renderer.width() -| 1, 0, "╮", border_style);
    }

    fn drawBottomBorder(_: *const Self, renderer: DefaultRenderer, border_style: DefaultRenderer.Style) void {
        const y: u16 = renderer.height() -| 1;

        renderer.drawCell(0, y, "╰", border_style);

        for (1..renderer.width() -| 1) |x| {
            renderer.drawCell(@intCast(x), y, "─", border_style);
        }

        renderer.drawCell(renderer.width() -| 1, y, "╯", border_style);
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

    pub fn reload(self: *Self, database: *db.DefaultDatabase) !void {
        try self.chat_history.reload(database);
    }
};
