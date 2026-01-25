const std = @import("std");
const filesystem = @import("filesystem.zig");

const Filesystem = filesystem.Filesystem;
const StdFs = filesystem.StdFs;

test "Filesystem interface compiles" {
    _ = Filesystem(StdFs);
}
