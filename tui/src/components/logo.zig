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

/// Generic logo drawing function
pub fn Logo(comptime R: type) type {
    return struct {
        /// Draw the Smithers logo centered in the window
        pub fn draw(renderer: R) void {
            const win_width = renderer.width();
            const win_height = renderer.height();

            // Calculate centered position (upper third of screen)
            const logo_y: u16 = if (win_height > height + 10) (win_height - height) / 3 else 1;
            const logo_x: u16 = if (win_width > width) (win_width - width) / 2 else 0;

            const logo_style: R.Style = .{ .fg = .{ .rgb = logo_color } };

            const logo_renderer = renderer.subRegion(logo_x, logo_y, width, height);
            _ = logo_renderer.window.printSegment(.{ .text = ascii_art, .style = logo_style }, .{ .wrap = .grapheme });

            // Draw subtitle below logo
            const subtitle_len: u16 = @intCast(subtitle.len);
            const subtitle_y: u16 = logo_y + height + 1;
            const subtitle_x: u16 = if (win_width > subtitle_len) (win_width - subtitle_len) / 2 else 0;
            const subtitle_style: R.Style = .{ .fg = .{ .rgb = subtitle_color } };

            renderer.drawText(subtitle_x, subtitle_y, subtitle, subtitle_style);
        }
    };
}

/// Default logo using DefaultRenderer
pub fn draw(renderer: @import("../rendering/renderer.zig").DefaultRenderer) void {
    Logo(@import("../rendering/renderer.zig").DefaultRenderer).draw(renderer);
}

pub const DefaultLogo = Logo(@import("../rendering/renderer.zig").DefaultRenderer);
