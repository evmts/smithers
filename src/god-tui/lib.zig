// God-TUI: Production Terminal UI Framework
// Language-agnostic spec implementation in Zig

pub const terminal = @import("terminal/terminal.zig");
pub const ansi = @import("terminal/ansi.zig");
pub const stdin_buffer = @import("terminal/stdin_buffer.zig");
pub const keys = @import("terminal/keys.zig");

// Phase 2: Rendering Engine
pub const width = @import("rendering/width.zig");
pub const renderer = @import("rendering/renderer.zig");

test {
    @import("std").testing.refAllDecls(@This());
}
