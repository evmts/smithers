// Header Component for Smithers TUI
// Display: Smithers │ claude-sonnet-4 │ [1:main] [2:chat] [3:code]

const std = @import("std");
const vaxis = @import("vaxis");
const db = @import("../db.zig");
const Colors = @import("../layout.zig").Colors;

const bg_color = Colors.Indexed.HEADER_BG;
const title_color = Colors.Indexed.TITLE;
const separator_color = Colors.Indexed.SEPARATOR;
const model_color = Colors.Indexed.MODEL;
const tab_color = Colors.Indexed.TAB;
const tab_active_color = Colors.Indexed.TAB_ACTIVE;
const tab_bg_active = Colors.Indexed.TAB_BG_ACTIVE;

pub const Header = struct {
    version: []const u8,
    model: []const u8,
    allocator: std.mem.Allocator,

    const Self = @This();
    const SEPARATOR = " │ ";

    pub fn init(allocator: std.mem.Allocator, version: []const u8, model: []const u8) Self {
        return .{
            .allocator = allocator,
            .version = version,
            .model = model,
        };
    }

    pub fn setModel(self: *Self, model: []const u8) void {
        self.model = model;
    }

    pub fn draw(self: *const Self, win: vaxis.Window, database: *db.Database) void {
        const bar_style: vaxis.Style = .{ .bg = .{ .index = bg_color } };
        const title_style: vaxis.Style = .{
            .fg = .{ .index = title_color },
            .bg = .{ .index = bg_color },
            .bold = true,
        };
        const sep_style: vaxis.Style = .{ .fg = .{ .index = separator_color }, .bg = .{ .index = bg_color } };
        const model_style: vaxis.Style = .{ .fg = .{ .index = model_color }, .bg = .{ .index = bg_color } };
        const default_style: vaxis.Style = .{ .bg = .{ .index = bg_color } };

        // Fill header background
        for (0..win.width) |col| {
            win.writeCell(@intCast(col), 0, .{
                .char = .{ .grapheme = " ", .width = 1 },
                .style = bar_style,
            });
        }

        var x: u16 = 1;

        // "Smithers vX.X.X"
        const title = "Smithers";
        _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(title.len), .height = 1 })
            .printSegment(.{ .text = title, .style = title_style }, .{});
        x += @intCast(title.len);

        const ver_prefix = " v";
        _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(ver_prefix.len), .height = 1 })
            .printSegment(.{ .text = ver_prefix, .style = default_style }, .{});
        x += @intCast(ver_prefix.len);

        _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(self.version.len), .height = 1 })
            .printSegment(.{ .text = self.version, .style = default_style }, .{});
        x += @intCast(self.version.len);

        // Separator + model
        _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(SEPARATOR.len), .height = 1 })
            .printSegment(.{ .text = SEPARATOR, .style = sep_style }, .{});
        x += @intCast(SEPARATOR.len);

        _ = win.child(.{ .x_off = x, .y_off = 0, .width = @intCast(self.model.len), .height = 1 })
            .printSegment(.{ .text = self.model, .style = model_style }, .{});

        // Skip tabs for now to avoid segfault from dangling session.name pointers
        _ = database;
    }

    pub fn height() u16 {
        return 1;
    }
};
