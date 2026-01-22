const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn listDir(params: ToolParams) ToolResult {
    const path = params.getString("path") orelse ".";

    var dir = std.fs.cwd().openDir(path, .{ .iterate = true }) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("Directory not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            error.NotDir => ToolResult.err("Path is not a directory"),
            else => ToolResult.err("Failed to open directory"),
        };
    };
    defer dir.close();

    var result = std.ArrayListUnmanaged(u8){};
    var iter = dir.iterate();

    while (iter.next() catch null) |entry| {
        result.appendSlice(params.allocator, entry.name) catch {};
        if (entry.kind == .directory) {
            result.append(params.allocator, '/') catch {};
        }
        result.append(params.allocator, '\n') catch {};
    }

    if (result.items.len == 0) {
        return ToolResult.ok("(empty directory)");
    }

    return ToolResult.ok(result.items);
}

pub const list_dir_tool = Tool{
    .name = "list_dir",
    .description = "List contents of a directory. Directories are marked with trailing /.",
    .execute = listDir,
};

test "list_dir tool definition" {
    try std.testing.expectEqualStrings("list_dir", list_dir_tool.name);
}
