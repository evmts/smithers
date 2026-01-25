const std = @import("std");
const read_file = @import("read_file.zig");

test "read_file tool definition" {
    try std.testing.expectEqualStrings("read_file", read_file.tool.name);
    try std.testing.expect(read_file.tool.execute_ctx != null);
}
