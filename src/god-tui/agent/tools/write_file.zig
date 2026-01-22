const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn writeFile(params: ToolParams) ToolResult {
    const path = params.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };
    const content = params.getString("content") orelse {
        return ToolResult.err("Missing required parameter: content");
    };

    const file = std.fs.cwd().createFile(path, .{}) catch |e| {
        return switch (e) {
            error.AccessDenied => ToolResult.err("Access denied"),
            else => ToolResult.err("Failed to create file"),
        };
    };
    defer file.close();

    file.writeAll(content) catch {
        return ToolResult.err("Failed to write file");
    };

    return ToolResult.ok("File written successfully");
}

pub const write_file_tool = Tool{
    .name = "write_file",
    .description = "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    .execute = writeFile,
};

test "write_file tool definition" {
    try std.testing.expectEqualStrings("write_file", write_file_tool.name);
}
