const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

fn executeWriteFile(ctx: ToolContext) ToolResult {
    const path = ctx.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };
    const content = ctx.getString("content") orelse {
        return ToolResult.err("Missing required parameter: content");
    };

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    // Create parent directories if needed
    if (std.fs.path.dirname(path)) |dir| {
        std.fs.cwd().makePath(dir) catch |e| {
            // Ignore if already exists
            if (e != error.PathAlreadyExists) {
                return ToolResult.err("Failed to create parent directories");
            }
        };
    }

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

    const msg = std.fmt.allocPrint(
        ctx.allocator,
        "Successfully wrote {d} bytes to {s}",
        .{ content.len, path },
    ) catch "File written successfully";

    return ToolResult.ok(msg);
}

pub const tool = Tool{
    .name = "write_file",
    .description =
    \\Write content to a file.
    \\Creates the file if it doesn't exist, overwrites if it does.
    \\Automatically creates parent directories.
    \\Parameters:
    \\  - path: Path to the file (required)
    \\  - content: Content to write (required)
    ,
    .execute_ctx = executeWriteFile,
};

// Legacy export
pub const write_file_tool = tool;
