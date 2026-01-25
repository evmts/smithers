const std = @import("std");
const edit_file = @import("edit_file.zig");

test "edit_file tool definition" {
    try std.testing.expectEqualStrings("edit_file", edit_file.tool.name);
    try std.testing.expect(edit_file.tool.execute_ctx != null);
}
