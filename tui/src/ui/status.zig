// Status Bar for Smithers TUI
// Display: Ctrl+C: cancel │ /: commands │ ↑↓: history

const std = @import("std");
const vaxis = @import("vaxis");
const loading_mod = @import("../loading.zig");
const Colors = @import("../layout.zig").Colors;

const bg_color = Colors.Indexed.STATUS_BG;
const fg_color = Colors.Indexed.STATUS_FG;
const key_color = Colors.Indexed.KEY_HINT;
const spinner_color = Colors.Indexed.SPINNER;

const HintEntry = struct { key: []const u8, desc: []const u8 };

pub const StatusBar = struct {
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

    pub fn draw(self: *const Self, win: vaxis.Window) void {
        const bar_style: vaxis.Style = .{
            .bg = .{ .index = bg_color },
            .fg = .{ .index = fg_color },
        };
        const key_style: vaxis.Style = .{
            .bg = .{ .index = bg_color },
            .fg = .{ .index = key_color },
            .bold = true,
        };
        const spin_style: vaxis.Style = .{
            .bg = .{ .index = bg_color },
            .fg = .{ .index = spinner_color },
        };

        // Fill background for all rows
        const h = self.getHeight();
        for (0..h) |row| {
            for (0..win.width) |col| {
                win.writeCell(@intCast(col), @intCast(row), .{
                    .char = .{ .grapheme = " ", .width = 1 },
                    .style = bar_style,
                });
            }
        }

        if (self.show_help) {
            // Expanded help view - 4 rows
            self.drawHelpRow(win, 0, &[_]HintEntry{
                .{ .key = "Ctrl+K", .desc = "kill→end" },
                .{ .key = "Ctrl+U", .desc = "kill→start" },
                .{ .key = "Ctrl+W", .desc = "kill word" },
                .{ .key = "Ctrl+Y", .desc = "yank" },
            }, key_style, bar_style);
            self.drawHelpRow(win, 1, &[_]HintEntry{
                .{ .key = "Ctrl+A", .desc = "line start" },
                .{ .key = "Ctrl+E", .desc = "line end" },
                .{ .key = "Ctrl+Z", .desc = "undo" },
                .{ .key = "Alt+B/F", .desc = "word nav" },
            }, key_style, bar_style);
            self.drawHelpRow(win, 2, &[_]HintEntry{
                .{ .key = "Ctrl+C", .desc = "clear" },
                .{ .key = "Ctrl+D", .desc = "exit" },
                .{ .key = "↑/↓", .desc = "history" },
                .{ .key = "Tab", .desc = "complete" },
            }, key_style, bar_style);
            // Bottom row - dismiss hint
            const dismiss = "Press ? or Esc to close";
            const dismiss_x = (win.width -| @as(u16, @intCast(dismiss.len))) / 2;
            _ = win.child(.{ .x_off = dismiss_x, .y_off = 3, .width = @intCast(dismiss.len), .height = 1 })
                .printSegment(.{ .text = dismiss, .style = .{ .bg = .{ .index = bg_color }, .fg = .{ .index = 243 } } }, .{});
            return;
        }

        var x: u16 = 1;

        if (self.custom_status) |status| {
            if (self.is_busy) {
                const frame = loading_mod.spinner_frames[self.spinner_frame];
                _ = win.child(.{ .x_off = x, .y_off = 0, .width = 2, .height = 1 })
                    .printSegment(.{ .text = frame, .style = spin_style }, .{});
                x += 2;
            }
            const status_len: u16 = @intCast(@min(status.len, win.width -| x -| 1));
            _ = win.child(.{ .x_off = x, .y_off = 0, .width = status_len, .height = 1 })
                .printSegment(.{ .text = status[0..status_len], .style = bar_style }, .{});
        } else if (self.is_busy) {
            const frame = loading_mod.spinner_frames[self.spinner_frame];
            _ = win.child(.{ .x_off = x, .y_off = 0, .width = 2, .height = 1 })
                .printSegment(.{ .text = frame, .style = spin_style }, .{});
            x += 2;

            const proc_text = "Processing...";
            _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(proc_text.len), .height = 1 })
                .printSegment(.{ .text = proc_text, .style = bar_style }, .{});
        } else {
            // Default keybinding hints
            const hints = [_]HintEntry{
                .{ .key = "?", .desc = " help" },
                .{ .key = "Esc", .desc = " interrupt" },
                .{ .key = "Ctrl+C", .desc = " clear" },
                .{ .key = "/", .desc = " commands" },
            };

            for (hints) |hint| {
                if (x + hint.key.len + hint.desc.len + 3 > win.width) break;

                _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(hint.key.len), .height = 1 })
                    .printSegment(.{ .text = hint.key, .style = key_style }, .{});
                x += @intCast(hint.key.len);

                _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(hint.desc.len), .height = 1 })
                    .printSegment(.{ .text = hint.desc, .style = bar_style }, .{});
                x += @intCast(hint.desc.len);

                if (x + SEPARATOR.len < win.width) {
                    _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(SEPARATOR.len), .height = 1 })
                        .printSegment(.{ .text = SEPARATOR, .style = bar_style }, .{});
                    x += @intCast(SEPARATOR.len);
                }
            }
        }
    }

    fn drawHelpRow(self: *const Self, win: vaxis.Window, row: u16, hints: []const HintEntry, key_style: vaxis.Style, bar_style: vaxis.Style) void {
        _ = self;
        var x: u16 = 2;
        for (hints) |hint| {
            if (x + hint.key.len + hint.desc.len + 4 > win.width) break;

            _ = win.child(.{ .x_off = x, .y_off = row, .width = @intCast(hint.key.len), .height = 1 })
                .printSegment(.{ .text = hint.key, .style = key_style }, .{});
            x += @intCast(hint.key.len);

            _ = win.child(.{ .x_off = x, .y_off = row, .width = 1, .height = 1 })
                .printSegment(.{ .text = " ", .style = bar_style }, .{});
            x += 1;

            _ = win.child(.{ .x_off = x, .y_off = row, .width = @intCast(hint.desc.len), .height = 1 })
                .printSegment(.{ .text = hint.desc, .style = bar_style }, .{});
            x += @intCast(hint.desc.len);

            x += 3; // spacing between entries
        }
    }
};
