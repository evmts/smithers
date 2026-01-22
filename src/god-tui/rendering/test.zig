// Rendering module tests
// Imports all submodule tests for unified test execution

const std = @import("std");

pub const width = @import("width.zig");
pub const renderer = @import("renderer.zig");

test {
    std.testing.refAllDecls(@This());
}
