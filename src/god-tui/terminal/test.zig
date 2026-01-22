// Terminal module tests
const std = @import("std");

// Import all modules to run their embedded tests
pub const ansi = @import("ansi.zig");
pub const keys = @import("keys.zig");
pub const stdin_buffer = @import("stdin_buffer.zig");
pub const terminal = @import("terminal.zig");

test {
    std.testing.refAllDecls(@This());
}
