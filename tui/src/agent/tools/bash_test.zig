const std = @import("std");
const bash = @import("bash.zig");

test "bash tool definition" {
    try std.testing.expectEqualStrings("bash", bash.tool.name);
    try std.testing.expect(bash.tool.execute_ctx != null);
}
