// Rendering module tests
// Imports all submodule tests for unified test execution
// Note: These tests require vaxis module to be available

const std = @import("std");

// Note: width.zig and renderer.zig both import vaxis
// Tests can be run via: zig build test-modes (which has vaxis dependency)
// or directly by specifying the vaxis module path

pub const width = @import("width.zig");
pub const renderer = @import("renderer.zig");

test {
    std.testing.refAllDecls(@This());
}
