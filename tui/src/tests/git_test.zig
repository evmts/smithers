const std = @import("std");
const git = @import("../git.zig");

// Note: git.zig only exposes runGitDiff which spawns actual git processes.
// These tests verify the module compiles correctly and document the API.
// Actual integration tests requiring a git repo are skipped.

test "runGitDiff function exists and has correct signature" {
    // Compile-time check: verify function signature
    const func_info = @typeInfo(@TypeOf(git.runGitDiff));
    try std.testing.expectEqual(.@"fn", func_info);

    const fn_info = func_info.@"fn";
    try std.testing.expectEqual(1, fn_info.params.len);
    try std.testing.expect(fn_info.return_type != null);
}

test "runGitDiff returns error union of []u8" {
    const ReturnType = @typeInfo(@TypeOf(git.runGitDiff)).@"fn".return_type.?;
    const return_info = @typeInfo(ReturnType);
    try std.testing.expectEqual(.error_union, return_info);

    const payload_type = return_info.error_union.payload;
    try std.testing.expectEqual([]u8, payload_type);
}

test "runGitDiff takes allocator parameter" {
    const ParamType = @typeInfo(@TypeOf(git.runGitDiff)).@"fn".params[0].type.?;
    try std.testing.expectEqual(std.mem.Allocator, ParamType);
}

// Skip actual git operations - would require real git repo
// test "runGitDiff in git repo" { ... }
// test "runGitDiff outside git repo" { ... }
// test "runGitDiff truncation behavior" { ... }
