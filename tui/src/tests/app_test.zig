const std = @import("std");
const app = @import("../app.zig");

// The App type is a complex generic that requires many dependencies.
// We test that the generic compiles and verify type structure.

test "App is a generic function" {
    const AppFn = @TypeOf(app.App);
    try std.testing.expect(@typeInfo(AppFn) == .@"fn");
}

test "App takes 7 type parameters" {
    const fn_info = @typeInfo(@TypeOf(app.App)).@"fn";
    try std.testing.expectEqual(@as(usize, 7), fn_info.params.len);
}

test "App returns a struct type" {
    // Create mock types to instantiate App
    const MockDb = struct {
        pub fn init(_: std.mem.Allocator, _: [:0]const u8) !@This() {
            return .{};
        }
        pub fn deinit(_: *@This()) void {}
        pub fn deleteEphemeralMessages(_: *@This()) !void {}
    };

    const MockEvLoop = struct {
        pub fn init(_: std.mem.Allocator) !@This() {
            return .{};
        }
        pub fn deinit(_: *@This()) void {}
        pub fn start(_: *@This()) !void {}
    };

    const MockR = struct {
        pub const Key = struct {
            text: ?[]const u8 = null,
            codepoint: u21 = 0,
            pub fn matches(_: @This(), _: anytype, _: anytype) bool {
                return false;
            }
        };
    };

    const MockAgent = struct {};

    const MockEnv = struct {
        pub fn home() ?[:0]const u8 {
            return "/tmp";
        }
        pub fn anthropicApiKey() ?[:0]const u8 {
            return null;
        }
    };

    const MockClock = struct {
        pub fn milliTimestamp() i64 {
            return 0;
        }
    };

    const MockToolExec = struct {
        pub fn init(_: std.mem.Allocator) @This() {
            return .{};
        }
        pub fn deinit(_: *@This()) void {}
        pub fn isRunning(_: *@This()) bool {
            return false;
        }
    };

    // This should compile - we're just checking the type exists
    const AppType = app.App(MockDb, MockEvLoop, MockR, MockAgent, MockEnv, MockClock, MockToolExec);
    _ = AppType;
}

test "App module imports" {
    // Verify imports compile
    _ = @import("../db.zig");
    _ = @import("../loading.zig");
    _ = @import("../environment.zig");
    _ = @import("../clock.zig");
}
