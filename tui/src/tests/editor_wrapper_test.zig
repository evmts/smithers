const std = @import("std");
const editor = @import("../editor.zig");

// The editor.zig module contains openExternalEditor which requires
// actual TTY and event loop. We can only test compilation.

test "editor module exports openExternalEditor" {
    // Verify function exists
    const fn_type = @TypeOf(editor.openExternalEditor);
    _ = fn_type;
}

test "openExternalEditor returns []u8" {
    // The function signature returns []u8
    const ReturnType = @typeInfo(@TypeOf(editor.openExternalEditor)).@"fn".return_type.?;
    try std.testing.expect(@typeInfo(ReturnType) == .error_union);
}
