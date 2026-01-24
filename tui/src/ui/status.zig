// Status Bar for Smithers TUI
// Display: Ctrl+C: cancel │ /: commands │ ↑↓: history

const std = @import("std");
const loading_mod = @import("../loading.zig");
const Colors = @import("../layout.zig").DefaultColors;

const bg_color = Colors.Indexed.STATUS_BG;
const fg_color = Colors.Indexed.STATUS_FG;
const key_color = Colors.Indexed.KEY_HINT;
const spinner_color = Colors.Indexed.SPINNER;

const HintEntry = struct { key: []const u8, desc: []const u8 };

pub fn StatusBar(comptime R: type) type {
    return struct {
        custom_status: ?[]const u8 = null,
        is_busy: bool = false,
        spinner_frame: u8 = 0,
        show_help: bool = false,

        const Self = @This();
        const SEPARATOR = " │ ";

        pub fn init() Self {
            return .{};
        }

        pub fn setBusy(self: *Self, busy: bool) void {
            self.is_busy = busy;
            if (!busy) self.spinner_frame = 0;
        }

        pub fn tickSpinner(self: *Self) void {
            self.spinner_frame = @intCast((self.spinner_frame + 1) % loading_mod.spinner_frames.len);
        }

        pub fn setCustomStatus(self: *Self, status: ?[]const u8) void {
            self.custom_status = status;
        }

        pub fn toggleHelp(self: *Self) void {
            self.show_help = !self.show_help;
        }

        pub fn hideHelp(self: *Self) void {
            self.show_help = false;
        }

        pub fn isHelpVisible(self: *const Self) bool {
            return self.show_help;
        }

        pub fn getHeight(self: *const Self) u16 {
            return if (self.show_help) 4 else 1;
        }

        pub fn draw(self: *const Self, renderer: R) void {
            const bar_style: R.Style = .{
                .bg = .{ .index = bg_color },
                .fg = .{ .index = fg_color },
            };
            const key_style: R.Style = .{
                .bg = .{ .index = bg_color },
                .fg = .{ .index = key_color },
                .bold = true,
            };
            const spin_style: R.Style = .{
                .bg = .{ .index = bg_color },
                .fg = .{ .index = spinner_color },
            };

            // Fill background for all rows
            const h = self.getHeight();
            renderer.fill(0, 0, renderer.width(), h, " ", bar_style);

            if (self.show_help) {
                // Expanded help view - 4 rows
                self.drawHelpRow(renderer, 0, &[_]HintEntry{
                    .{ .key = "Ctrl+K", .desc = "kill→end" },
                    .{ .key = "Ctrl+U", .desc = "kill→start" },
                    .{ .key = "Ctrl+W", .desc = "kill word" },
                    .{ .key = "Ctrl+Y", .desc = "yank" },
                }, key_style, bar_style);
                self.drawHelpRow(renderer, 1, &[_]HintEntry{
                    .{ .key = "Ctrl+A", .desc = "line start" },
                    .{ .key = "Ctrl+E", .desc = "line end" },
                    .{ .key = "Ctrl+Z", .desc = "undo" },
                    .{ .key = "Alt+B/F", .desc = "word nav" },
                }, key_style, bar_style);
                self.drawHelpRow(renderer, 2, &[_]HintEntry{
                    .{ .key = "Ctrl+C", .desc = "clear" },
                    .{ .key = "Ctrl+D", .desc = "exit" },
                    .{ .key = "↑/↓", .desc = "history" },
                    .{ .key = "Tab", .desc = "complete" },
                }, key_style, bar_style);
                // Bottom row - dismiss hint
                const dismiss = "Press ? or Esc to close";
                const dismiss_x = (renderer.width() -| @as(u16, @intCast(dismiss.len))) / 2;
                renderer.drawText(dismiss_x, 3, dismiss, .{ .bg = .{ .index = bg_color }, .fg = .{ .index = 243 } });
                return;
            }

            var x: u16 = 1;

            if (self.custom_status) |status| {
                if (self.is_busy) {
                    const frame = loading_mod.spinner_frames[self.spinner_frame];
                    renderer.drawText(x, 0, frame, spin_style);
                    x += 2;
                }
                const status_len: u16 = @intCast(@min(status.len, renderer.width() -| x -| 1));
                renderer.drawText(x, 0, status[0..status_len], bar_style);
            } else if (self.is_busy) {
                const frame = loading_mod.spinner_frames[self.spinner_frame];
                renderer.drawText(x, 0, frame, spin_style);
                x += 2;

                const proc_text = "Processing...";
                renderer.drawText(x, 0, proc_text, bar_style);
            } else {
                // Default keybinding hints
                const hints = [_]HintEntry{
                    .{ .key = "?", .desc = " help" },
                    .{ .key = "Esc", .desc = " interrupt" },
                    .{ .key = "Ctrl+C", .desc = " clear" },
                    .{ .key = "/", .desc = " commands" },
                };

                for (hints) |hint| {
                    if (x + hint.key.len + hint.desc.len + 3 > renderer.width()) break;

                    renderer.drawText(x, 0, hint.key, key_style);
                    x += @intCast(hint.key.len);

                    renderer.drawText(x, 0, hint.desc, bar_style);
                    x += @intCast(hint.desc.len);

                    if (x + SEPARATOR.len < renderer.width()) {
                        renderer.drawText(x, 0, SEPARATOR, bar_style);
                        x += @intCast(SEPARATOR.len);
                    }
                }
            }
        }

        fn drawHelpRow(self: *const Self, renderer: R, row: u16, hints: []const HintEntry, key_style: R.Style, bar_style: R.Style) void {
            _ = self;
            var x: u16 = 2;
            for (hints) |hint| {
                if (x + hint.key.len + hint.desc.len + 4 > renderer.width()) break;

                renderer.drawText(x, row, hint.key, key_style);
                x += @intCast(hint.key.len);

                renderer.drawText(x, row, " ", bar_style);
                x += 1;

                renderer.drawText(x, row, hint.desc, bar_style);
                x += @intCast(hint.desc.len);

                x += 3; // spacing between entries
            }
        }
    };
}

pub const DefaultStatusBar = StatusBar(@import("../rendering/renderer.zig").DefaultRenderer);
