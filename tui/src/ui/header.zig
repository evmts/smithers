// Header Component for Smithers TUI
// Display: Smithers │ claude-sonnet-4 │ [1:main] [2:chat] [3:code]

const std = @import("std");
const layout = @import("../layout.zig");

pub fn Header(comptime R: type) type {
    const Colors = layout.Colors(R);

    return struct {
        version: []const u8,
        model: []const u8,
        allocator: std.mem.Allocator,

        const Self = @This();
        const SEPARATOR = " │ ";

        const bg_color = Colors.Indexed.HEADER_BG;
        const title_color = Colors.Indexed.TITLE;
        const separator_color = Colors.Indexed.SEPARATOR;
        const model_color = Colors.Indexed.MODEL;

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

        pub fn draw(self: *const Self, renderer: R, database: anytype) void {
            const bar_style: R.Style = .{ .bg = .{ .index = bg_color } };
            const title_style: R.Style = .{
                .fg = .{ .index = title_color },
                .bg = .{ .index = bg_color },
                .bold = true,
            };
            const sep_style: R.Style = .{ .fg = .{ .index = separator_color }, .bg = .{ .index = bg_color } };
            const model_style: R.Style = .{ .fg = .{ .index = model_color }, .bg = .{ .index = bg_color } };
            const default_style: R.Style = .{ .bg = .{ .index = bg_color } };

            // Fill header background
            renderer.fill(0, 0, renderer.width(), 1, " ", bar_style);

            var x: u16 = 1;

            // "Smithers vX.X.X"
            const title = "Smithers";
            renderer.drawText(x, 0, title, title_style);
            x += @intCast(title.len);

            const ver_prefix = " v";
            renderer.drawText(x, 0, ver_prefix, default_style);
            x += @intCast(ver_prefix.len);

            renderer.drawText(x, 0, self.version, default_style);
            x += @intCast(self.version.len);

            // Separator + model
            renderer.drawText(x, 0, SEPARATOR, sep_style);
            x += @intCast(SEPARATOR.len);

            renderer.drawText(x, 0, self.model, model_style);

            // Skip tabs for now to avoid segfault from dangling session.name pointers
            _ = database;
        }

        pub fn height() u16 {
            return 1;
        }
    };
}
