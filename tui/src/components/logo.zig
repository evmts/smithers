const vaxis = @import("vaxis");

pub const ascii_art =
    \\  ███████╗███╗   ███╗██╗████████╗██╗  ██╗███████╗██████╗ ███████╗
    \\  ██╔════╝████╗ ████║██║╚══██╔══╝██║  ██║██╔════╝██╔══██╗██╔════╝
    \\  ███████╗██╔████╔██║██║   ██║   ███████║█████╗  ██████╔╝███████╗
    \\  ╚════██║██║╚██╔╝██║██║   ██║   ██╔══██║██╔══╝  ██╔══██╗╚════██║
    \\  ███████║██║ ╚═╝ ██║██║   ██║   ██║  ██║███████╗██║  ██║███████║
    \\  ╚══════╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝
;

pub const subtitle = "Multi-Agent AI Orchestration Framework";

pub const height: u16 = 6;
pub const width: u16 = 66;

const logo_color = .{ 0x7a, 0xa2, 0xf7 }; // Blue
const subtitle_color = .{ 0x73, 0xda, 0xca }; // Teal

/// Draw the Smithers logo centered in the window
pub fn draw(win: vaxis.Window) void {
    const win_width = win.width;
    const win_height = win.height;

    // Calculate centered position (upper third of screen)
    const logo_y: u16 = if (win_height > height + 10) (win_height - height) / 3 else 1;
    const logo_x: u16 = if (win_width > width) (win_width - width) / 2 else 0;

    const logo_style: vaxis.Style = .{ .fg = .{ .rgb = logo_color } };

    const logo_win = win.child(.{
        .x_off = logo_x,
        .y_off = logo_y,
        .width = width,
        .height = height,
    });
    _ = logo_win.printSegment(.{ .text = ascii_art, .style = logo_style }, .{ .wrap = .grapheme });

    // Draw subtitle below logo
    const subtitle_len: u16 = @intCast(subtitle.len);
    const subtitle_y: u16 = logo_y + height + 1;
    const subtitle_x: u16 = if (win_width > subtitle_len) (win_width - subtitle_len) / 2 else 0;
    const subtitle_style: vaxis.Style = .{ .fg = .{ .rgb = subtitle_color } };

    const subtitle_win = win.child(.{
        .x_off = subtitle_x,
        .y_off = subtitle_y,
        .width = subtitle_len,
        .height = 1,
    });
    _ = subtitle_win.printSegment(.{ .text = subtitle, .style = subtitle_style }, .{});
}
