// Help Overlay - shows keybindings when Ctrl is held
// Inspired by vim's which-key style help

const std = @import("std");

const bg_color: u8 = 236; // Dark gray
const key_color: u8 = 75; // Blue
const desc_color: u8 = 252; // Light gray
const header_color: u8 = 114; // Green
const border_color: u8 = 243; // Dim

pub fn HelpOverlay(comptime R: type) type {
    return struct {
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

        pub fn draw(self: *const Self, renderer: R) void {
            if (!self.visible) return;

            const overlay_width: u16 = 60;
            const overlay_height: u16 = 9;

            if (renderer.width() < overlay_width + 4 or renderer.height() < overlay_height + 8) return;

            const x: u16 = (renderer.width() - overlay_width) / 2;
            const y: u16 = renderer.height() / 2 - overlay_height / 2;

            const bg_style: R.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = desc_color } };
            const border_style: R.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = border_color } };
            const key_style: R.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = key_color }, .bold = true };
            const header_style: R.Style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = header_color }, .bold = true };

            // Fill background
            renderer.fill(x, y, overlay_width, overlay_height, " ", bg_style);

            // Draw border
            renderer.drawCell(x, y, "╭", border_style);
            renderer.drawCell(x + overlay_width - 1, y, "╮", border_style);
            renderer.drawCell(x, y + overlay_height - 1, "╰", border_style);
            renderer.drawCell(x + overlay_width - 1, y + overlay_height - 1, "╯", border_style);

            var col: u16 = 1;
            while (col < overlay_width - 1) : (col += 1) {
                renderer.drawCell(x + col, y, "─", border_style);
                renderer.drawCell(x + col, y + overlay_height - 1, "─", border_style);
            }
            var row: u16 = 1;
            while (row < overlay_height - 1) : (row += 1) {
                renderer.drawCell(x, y + row, "│", border_style);
                renderer.drawCell(x + overlay_width - 1, y + row, "│", border_style);
            }

            // Title
            const title = " Ctrl+ Keybindings ";
            const title_x = x + (overlay_width - @as(u16, @intCast(title.len))) / 2;
            renderer.drawText(title_x, y, title, header_style);

            // Two columns of bindings
            const col1_x = x + 2;
            const col2_x = x + 30;

            // Left column - Editing
            self.drawBinding(renderer, col1_x, y + 2, "K", "Kill to end", key_style, bg_style);
            self.drawBinding(renderer, col1_x, y + 3, "U", "Kill to start", key_style, bg_style);
            self.drawBinding(renderer, col1_x, y + 4, "W", "Kill word", key_style, bg_style);
            self.drawBinding(renderer, col1_x, y + 5, "Y", "Yank (paste)", key_style, bg_style);
            self.drawBinding(renderer, col1_x, y + 6, "Z", "Undo", key_style, bg_style);
            self.drawBinding(renderer, col1_x, y + 7, "A/E", "Line start/end", key_style, bg_style);

            // Right column - Navigation
            self.drawBinding(renderer, col2_x, y + 2, "C", "Clear input", key_style, bg_style);
            self.drawBinding(renderer, col2_x, y + 3, "D", "Exit", key_style, bg_style);
            self.drawBinding(renderer, col2_x, y + 4, "T", "Transcript", key_style, bg_style);
            self.drawBinding(renderer, col2_x, y + 5, "↑↓", "History", key_style, bg_style);
            self.drawBinding(renderer, col2_x, y + 6, "Tab", "Autocomplete", key_style, bg_style);
            self.drawBinding(renderer, col2_x, y + 7, "Esc", "Dismiss", key_style, bg_style);
        }

        fn drawBinding(_: *const Self, renderer: R, bx: u16, by: u16, key: []const u8, desc: []const u8, key_style: R.Style, desc_style: R.Style) void {
            renderer.drawText(bx, by, key, key_style);
            renderer.drawText(bx + @as(u16, @intCast(key.len)), by, " - ", desc_style);
            renderer.drawText(bx + @as(u16, @intCast(key.len)) + 3, by, desc, desc_style);
        }
    };
}
