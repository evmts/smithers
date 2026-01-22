// God-TUI: Production Terminal UI Framework
// Language-agnostic spec implementation in Zig

pub const terminal = @import("terminal/terminal.zig");
pub const ansi = @import("terminal/ansi.zig");
pub const stdin_buffer = @import("terminal/stdin_buffer.zig");
pub const keys = @import("terminal/keys.zig");

// Phase 1: Terminal Abstraction
pub const Terminal = terminal.Terminal;
pub const StdinBuffer = stdin_buffer.StdinBuffer;
pub const KeyId = keys.KeyId;
pub const matchesKey = keys.matchesKey;

test {
    _ = @import("terminal/test.zig");
}
