const std = @import("std");
const glob = @import("glob.zig");

test "glob tool definition" {
    try std.testing.expectEqualStrings("glob", glob.tool.name);
    try std.testing.expect(glob.tool.execute_ctx != null);
}

test "matchesPattern extension" {
    try std.testing.expect(glob.matchesPattern("foo/bar.zig", "*.zig"));
    try std.testing.expect(glob.matchesPattern("src/main.zig", "**/*.zig"));
    try std.testing.expect(!glob.matchesPattern("foo/bar.ts", "*.zig"));
}
