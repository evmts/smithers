// God-TUI: Production Terminal UI Framework
// Language-agnostic spec implementation in Zig

pub const terminal = @import("terminal/terminal.zig");
pub const ansi = @import("terminal/ansi.zig");
pub const stdin_buffer = @import("terminal/stdin_buffer.zig");
pub const keys = @import("terminal/keys.zig");

// Phase 2: Rendering Engine
pub const width = @import("rendering/width.zig");
pub const renderer = @import("rendering/renderer.zig");

// Phase 3: Component System
pub const Component = @import("components/component.zig").Component;
pub const Focusable = @import("components/component.zig").Focusable;
pub const Container = @import("components/component.zig").Container;
pub const Text = @import("components/text.zig").Text;
pub const TextStyle = @import("components/text.zig").TextStyle;
pub const Box = @import("components/box.zig").Box;
pub const BoxStyle = @import("components/box.zig").BoxStyle;
pub const BorderStyle = @import("components/box.zig").BorderStyle;
pub const Loader = @import("components/loader.zig").Loader;
pub const LoaderStyle = @import("components/loader.zig").LoaderStyle;
pub const SelectList = @import("components/select_list.zig").SelectList;
pub const SelectListStyle = @import("components/select_list.zig").SelectListStyle;

// Component modules
pub const components = struct {
    pub const component = @import("components/component.zig");
    pub const text = @import("components/text.zig");
    pub const box = @import("components/box.zig");
    pub const loader = @import("components/loader.zig");
    pub const select_list = @import("components/select_list.zig");
};

test {
    @import("std").testing.refAllDecls(@This());
}
