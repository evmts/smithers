// Help Overlay - shows keybindings when Ctrl is held
// Inspired by vim's which-key style help

const std = @import("std");
const DefaultRenderer = @import("../rendering/renderer.zig").DefaultRenderer;

const bg_color: u8 = 236; // Dark gray
const key_color: u8 = 75; // Blue  
const desc_color: u8 = 252; // Light gray
const header_color: u8 = 114; // Green
const border_color: u8 = 243; // Dim

pub const HelpOverlay = struct {
    visible: bool = false,

    const Self = @This();

    pub fn init() Self {
        return .{};
    }

    pub fn show(self: *Self) void {
        self.visible = true;
    }

    pub fn hide(self: *Self) void {
        self.visible = false;
    }

    pub fn isVisible(self: *const Self) bool {
        return self.visible;
    }

    pub fn draw(self: *const Self, win: DefaultRenderer.Window) void {
        if (!self.visible) return;

        const overlay_width: u16 = 60;
        const overlay_height: u16 = 9;

        if (win.width < overlay_width + 4 or win.height < overlay_height + 8) return;

        const x: u16 = (win.width - overlay_width) / 2;
        const y: u16 = win.height / 2 - overlay_height / 2;

        const bg_style: DefaultRenderer.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = desc_color } };
        const border_style: DefaultRenderer.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = border_color } };
        const key_style: DefaultRenderer.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = key_color }, .bold = true };
        const header_style: DefaultRenderer.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = header_color }, .bold = true };

        // Fill background
        var row: u16 = 0;
        while (row < overlay_height) : (row += 1) {
            var col: u16 = 0;
            while (col < overlay_width) : (col += 1) {
                win.writeCell(x + col, y + row, .{
                    .char = .{ .grapheme = " ", .width = 1 },
                    .style = bg_style,
                });
            }
        }

        // Draw border
        win.writeCell(x, y, .{ .char = .{ .grapheme = "╭", .width = 1 }, .style = border_style });
        win.writeCell(x + overlay_width - 1, y, .{ .char = .{ .grapheme = "╮", .width = 1 }, .style = border_style });
        win.writeCell(x, y + overlay_height - 1, .{ .char = .{ .grapheme = "╰", .width = 1 }, .style = border_style });
        win.writeCell(x + overlay_width - 1, y + overlay_height - 1, .{ .char = .{ .grapheme = "╯", .width = 1 }, .style = border_style });
        
        var col: u16 = 1;
        while (col < overlay_width - 1) : (col += 1) {
            win.writeCell(x + col, y, .{ .char = .{ .grapheme = "─", .width = 1 }, .style = border_style });
            win.writeCell(x + col, y + overlay_height - 1, .{ .char = .{ .grapheme = "─", .width = 1 }, .style = border_style });
        }
        row = 1;
        while (row < overlay_height - 1) : (row += 1) {
            win.writeCell(x, y + row, .{ .char = .{ .grapheme = "│", .width = 1 }, .style = border_style });
            win.writeCell(x + overlay_width - 1, y + row, .{ .char = .{ .grapheme = "│", .width = 1 }, .style = border_style });
        }

        // Title
        const title = " Ctrl+ Keybindings ";
        const title_x = x + (overlay_width - @as(u16, @intCast(title.len))) / 2;
        _ = win.child(.{ .x_off = title_x, .y_off = y, .width = @intCast(title.len), .height = 1 })
            .printSegment(.{ .text = title, .style = header_style }, .{});

        // Two columns of bindings
        const col1_x = x + 2;
        const col2_x = x + 30;

        // Left column - Editing
        self.drawBinding(win, col1_x, y + 2, "K", "Kill to end", key_style, bg_style);
        self.drawBinding(win, col1_x, y + 3, "U", "Kill to start", key_style, bg_style);
        self.drawBinding(win, col1_x, y + 4, "W", "Kill word", key_style, bg_style);
        self.drawBinding(win, col1_x, y + 5, "Y", "Yank (paste)", key_style, bg_style);
        self.drawBinding(win, col1_x, y + 6, "Z", "Undo", key_style, bg_style);
        self.drawBinding(win, col1_x, y + 7, "A/E", "Line start/end", key_style, bg_style);

        // Right column - Navigation
        self.drawBinding(win, col2_x, y + 2, "C", "Clear input", key_style, bg_style);
        self.drawBinding(win, col2_x, y + 3, "D", "Exit", key_style, bg_style);
        self.drawBinding(win, col2_x, y + 4, "T", "Transcript", key_style, bg_style);
        self.drawBinding(win, col2_x, y + 5, "↑↓", "History", key_style, bg_style);
        self.drawBinding(win, col2_x, y + 6, "Tab", "Autocomplete", key_style, bg_style);
        self.drawBinding(win, col2_x, y + 7, "Esc", "Dismiss", key_style, bg_style);
    }

    fn drawBinding(_: *const Self, win: DefaultRenderer.Window, bx: u16, by: u16, key: []const u8, desc: []const u8, key_style: DefaultRenderer.Style, desc_style: DefaultRenderer.Style) void {
        _ = win.child(.{ .x_off = bx, .y_off = by, .width = @intCast(key.len), .height = 1 })
            .printSegment(.{ .text = key, .style = key_style }, .{});
        _ = win.child(.{ .x_off = bx + @as(u16, @intCast(key.len)), .y_off = by, .width = 3, .height = 1 })
            .printSegment(.{ .text = " - ", .style = desc_style }, .{});
        _ = win.child(.{ .x_off = bx + @as(u16, @intCast(key.len)) + 3, .y_off = by, .width = @intCast(desc.len), .height = 1 })
            .printSegment(.{ .text = desc, .style = desc_style }, .{});
    }
};
