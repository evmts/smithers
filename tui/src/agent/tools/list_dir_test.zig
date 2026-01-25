const std = @import("std");
const list_dir = @import("list_dir.zig");

test "list_dir tool definition" {
    try std.testing.expectEqualStrings("list_dir", list_dir.tool.name);
    try std.testing.expect(list_dir.tool.execute_ctx != null);
}
