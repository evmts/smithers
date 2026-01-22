const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn readFile(params: ToolParams) ToolResult {
    const path = params.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };

    const file = std.fs.cwd().openFile(path, .{}) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("File not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            else => ToolResult.err("Failed to open file"),
        };
    };
    defer file.close();

    const max_size = 1024 * 1024; // 1MB limit
    const content = file.readToEndAlloc(params.allocator, max_size) catch {
        return ToolResult.err("Failed to read file");
    };

    return ToolResult.ok(content);
}

pub const read_file_tool = Tool{
    .name = "read_file",
    .description = "Read contents of a file. Returns the full file content as text.",
    .execute = readFile,
};

test "read_file tool definition" {
    try std.testing.expectEqualStrings("read_file", read_file_tool.name);
}
