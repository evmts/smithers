// Modes Module Tests - Phase 11

const std = @import("std");

pub const print = @import("print.zig");
pub const interactive = @import("interactive.zig");

test {
    std.testing.refAllDecls(@This());
}
