const std = @import("std");
const grep = @import("grep.zig");

test "grep tool definition" {
    try std.testing.expectEqualStrings("grep", grep.tool.name);
    try std.testing.expect(grep.tool.execute_ctx != null);
}
