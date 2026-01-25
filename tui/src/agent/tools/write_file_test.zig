const std = @import("std");
const write_file = @import("write_file.zig");

test "write_file tool definition" {
    try std.testing.expectEqualStrings("write_file", write_file.tool.name);
    try std.testing.expect(write_file.tool.execute_ctx != null);
}
