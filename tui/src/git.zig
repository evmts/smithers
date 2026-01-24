const std = @import("std");

/// Run git diff and return the output
pub fn runGitDiff(alloc: std.mem.Allocator) ![]u8 {
    var child = std.process.Child.init(&.{ "git", "diff", "--stat" }, alloc);
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    try child.spawn();
    const result = try child.wait();

    if (result.Exited == 0) {
        if (child.stdout) |stdout| {
            const output = try stdout.readToEndAlloc(alloc, 64 * 1024);
            if (output.len == 0) {
                alloc.free(output);
                return try alloc.dupe(u8, "");
            }
            return output;
        }
    }

    // Try to get full diff if stat was empty
    var child2 = std.process.Child.init(&.{ "git", "diff" }, alloc);
    child2.stdout_behavior = .Pipe;
    child2.stderr_behavior = .Pipe;

    try child2.spawn();
    _ = try child2.wait();

    if (child2.stdout) |stdout| {
        const output = try stdout.readToEndAlloc(alloc, 64 * 1024);
        // Truncate if too long
        if (output.len > 4096) {
            const truncated = try std.fmt.allocPrint(alloc, "{s}\n\n... (truncated, {d} bytes total)", .{ output[0..4000], output.len });
            alloc.free(output);
            return truncated;
        }
        return output;
    }

    return try alloc.dupe(u8, "");
}
