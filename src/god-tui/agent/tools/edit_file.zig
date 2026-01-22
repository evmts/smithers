const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn editFile(params: ToolParams) ToolResult {
    const path = params.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };
    const old_str = params.getString("old_str") orelse {
        return ToolResult.err("Missing required parameter: old_str");
    };
    const new_str = params.getString("new_str") orelse {
        return ToolResult.err("Missing required parameter: new_str");
    };

    const file = std.fs.cwd().openFile(path, .{}) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("File not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            else => ToolResult.err("Failed to open file"),
        };
    };

    const content = file.readToEndAlloc(params.allocator, 1024 * 1024) catch {
        file.close();
        return ToolResult.err("Failed to read file");
    };
    file.close();

    if (std.mem.indexOf(u8, content, old_str)) |_| {
        const new_content = std.mem.replaceOwned(u8, params.allocator, content, old_str, new_str) catch {
            return ToolResult.err("Failed to replace content");
        };

        const write_file = std.fs.cwd().createFile(path, .{}) catch {
            return ToolResult.err("Failed to open file for writing");
        };
        defer write_file.close();

        write_file.writeAll(new_content) catch {
            return ToolResult.err("Failed to write file");
        };

        return ToolResult.ok("File edited successfully");
    } else {
        return ToolResult.err("old_str not found in file");
    }
}

pub const edit_file_tool = Tool{
    .name = "edit_file",
    .description = "Edit a file by replacing old_str with new_str. old_str must exist in the file.",
    .execute = editFile,
};

test "edit_file tool definition" {
    try std.testing.expectEqualStrings("edit_file", edit_file_tool.name);
}
