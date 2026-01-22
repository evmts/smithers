// UI Module Tests - Phase 11

const std = @import("std");

pub const header = @import("header.zig");
pub const status = @import("status.zig");
pub const chat = @import("chat.zig");

test {
    std.testing.refAllDecls(@This());
}
