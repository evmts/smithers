const std = @import("std");
const vaxis = @import("vaxis");

/// Renderer encapsulates all rendering operations
/// Can be backed by vaxis, web canvas, test buffer, etc.
pub fn Renderer(comptime Backend: type) type {
    return struct {
        window: Backend.Window,

        const Self = @This();

        // Types re-exported for convenience
        pub const Window = Backend.Window;
        pub const Color = Backend.Color;
        pub const Style = Backend.Style;
        pub const Key = Backend.Key;
        pub const Mouse = Backend.Mouse;
        pub const Winsize = Backend.Winsize;

        pub fn init(window: Backend.Window) Self {
            return .{ .window = window };
        }

        /// Write styled text at position
        pub fn drawText(self: Self, x: u16, y: u16, text: []const u8, style: Style) void {
            var child = self.window.child(.{
                .x_off = x,
                .y_off = y,
                .width = @intCast(@min(text.len, self.window.width -| x)),
                .height = 1,
            });
            _ = child.printSegment(.{ .text = text, .style = style }, .{});
        }

        /// Write single cell
        pub fn drawCell(self: Self, x: u16, y: u16, char: []const u8, style: Style) void {
            self.window.writeCell(x, y, .{
                .char = .{ .grapheme = char, .width = 1 },
                .style = style,
            });
        }

        /// Fill area with character
        pub fn fill(self: Self, x: u16, y: u16, w: u16, h: u16, char: []const u8, style: Style) void {
            var row: u16 = 0;
            while (row < h) : (row += 1) {
                var col: u16 = 0;
                while (col < w) : (col += 1) {
                    self.window.writeCell(x + col, y + row, .{
                        .char = .{ .grapheme = char, .width = 1 },
                        .style = style,
                    });
                }
            }
        }

        /// Create sub-region renderer
        pub fn subRegion(self: Self, x: u16, y: u16, w: u16, h: u16) Self {
            return .{
                .window = self.window.child(.{
                    .x_off = x,
                    .y_off = y,
                    .width = w,
                    .height = h,
                }),
            };
        }

        /// Clear the entire window
        pub fn clear(self: Self) void {
            self.window.clear();
        }

        /// Get dimensions
        pub fn width(self: Self) u16 {
            return self.window.width;
        }

        pub fn height(self: Self) u16 {
            return self.window.height;
        }

        /// Create sub-region with border (returns content area renderer)
        pub fn subRegionWithBorder(self: Self, x: u16, y: u16, w: u16, h: u16, border_style: Style) Self {
            const child = self.window.child(.{
                .x_off = x,
                .y_off = y,
                .width = w,
                .height = h,
                .border = .{
                    .where = .all,
                    .style = border_style,
                },
            });
            return .{ .window = child };
        }

        /// Print styled segment at position (returns number of cells printed)
        pub fn printSegment(self: Self, x: u16, y: u16, text: []const u8, style: Style) u16 {
            var child = self.window.child(.{
                .x_off = x,
                .y_off = y,
                .width = self.window.width -| x,
                .height = 1,
            });
            const result = child.printSegment(.{ .text = text, .style = style }, .{});
            return @intCast(result.col);
        }
    };
}

/// Vaxis backend types
pub const VaxisBackend = struct {
    pub const Window = vaxis.Window;
    pub const Color = vaxis.Color;
    pub const Style = vaxis.Style;
    pub const Key = vaxis.Key;
    pub const Mouse = vaxis.Mouse;
    pub const Winsize = vaxis.Winsize;
};

pub const DefaultRenderer = Renderer(VaxisBackend);
