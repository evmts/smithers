const std = @import("std");
const vaxis = @import("vaxis");

/// Renderer wraps the terminal rendering backend (vaxis)
/// Can be swapped for other backends (web, GUI, tests)
pub fn Renderer(comptime Vx: type) type {
    return struct {
        pub const Window = Vx.Window;
        pub const Color = Vx.Color;
        pub const Style = Vx.Style;
        pub const Cell = Vx.Cell;
        pub const Key = Vx.Key;
        pub const Mouse = Vx.Mouse;
        pub const Winsize = Vx.Winsize;

        const Self = @This();
    };
}

/// Production renderer using vaxis types
pub const VaxisTypes = struct {
    pub const Window = vaxis.Window;
    pub const Color = vaxis.Color;
    pub const Style = vaxis.Style;
    pub const Cell = vaxis.Cell;
    pub const Key = vaxis.Key;
    pub const Mouse = vaxis.Mouse;
    pub const Winsize = vaxis.Winsize;
};

pub const DefaultRenderer = Renderer(VaxisTypes);
