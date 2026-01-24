const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

fn executeEditFile(ctx: ToolContext) ToolResult {
    const path = ctx.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };
    const old_str = ctx.getString("old_str") orelse {
        return ToolResult.err("Missing required parameter: old_str");
    };
    const new_str = ctx.getString("new_str") orelse {
        return ToolResult.err("Missing required parameter: new_str");
    };

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    // Validate old_str != new_str
    if (std.mem.eql(u8, old_str, new_str)) {
        return ToolResult.err("old_str and new_str must be different");
    }

    // Read existing file
    const file = std.fs.cwd().openFile(path, .{}) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("File not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            else => ToolResult.err("Failed to open file"),
        };
    };

    const content = file.readToEndAlloc(ctx.allocator, 10 * 1024 * 1024) catch {
        file.close();
        return ToolResult.err("Failed to read file");
    };
    file.close();

    // Find old_str - check for multiple occurrences
    const first_idx = std.mem.indexOf(u8, content, old_str);
    if (first_idx == null) {
        // Try fuzzy match: trimmed comparison
        const trimmed_old = std.mem.trim(u8, old_str, " \t\n\r");
        var found_fuzzy = false;
        var fuzzy_start: usize = 0;
        var fuzzy_end: usize = 0;

        // Line-by-line fuzzy search
        var lines = std.mem.splitScalar(u8, content, '\n');
        var line_start: usize = 0;
        while (lines.next()) |line| {
            const trimmed_line = std.mem.trim(u8, line, " \t\r");
            if (std.mem.indexOf(u8, trimmed_old, trimmed_line) != null or
                std.mem.indexOf(u8, trimmed_line, trimmed_old) != null)
            {
                if (trimmed_line.len > 0 and trimmed_old.len > 0) {
                    // Found potential match
                    found_fuzzy = true;
                    fuzzy_start = line_start;
                    fuzzy_end = line_start + line.len;
                    break;
                }
            }
            line_start += line.len + 1;
        }

        if (!found_fuzzy) {
            return ToolResult.err("old_str not found in file. Ensure exact match including whitespace.");
        }

        // Use fuzzy match
        const new_content = std.mem.concat(ctx.allocator, u8, &.{
            content[0..fuzzy_start],
            new_str,
            content[fuzzy_end..],
        }) catch {
            return ToolResult.err("Failed to create new content");
        };

        const write_file = std.fs.cwd().createFile(path, .{}) catch {
            return ToolResult.err("Failed to open file for writing");
        };
        defer write_file.close();

        write_file.writeAll(new_content) catch {
            return ToolResult.err("Failed to write file");
        };

        return ToolResult.ok("File edited successfully (fuzzy match)");
    }

    // Check for multiple occurrences
    const last_idx = std.mem.lastIndexOf(u8, content, old_str);
    if (first_idx.? != last_idx.?) {
        return ToolResult.err("Found multiple occurrences of old_str. Provide more context to make it unique.");
    }

    // Single occurrence - do replacement
    const new_content = std.mem.replaceOwned(u8, ctx.allocator, content, old_str, new_str) catch {
        return ToolResult.err("Failed to replace content");
    };

    // Verify something changed
    if (std.mem.eql(u8, content, new_content)) {
        return ToolResult.err("No changes made. old_str may not exist as expected.");
    }

    const write_file = std.fs.cwd().createFile(path, .{}) catch {
        return ToolResult.err("Failed to open file for writing");
    };
    defer write_file.close();

    write_file.writeAll(new_content) catch {
        return ToolResult.err("Failed to write file");
    };

    return ToolResult.ok("File edited successfully");
}

pub const tool = Tool{
    .name = "edit_file",
    .description =
    \\Edit a file by replacing old_str with new_str.
    \\Parameters:
    \\  - path: Path to the file (required)
    \\  - old_str: Exact text to find and replace (required)
    \\  - new_str: Text to replace it with (required)
    \\old_str must be unique in the file. Include surrounding context if needed.
    ,
    .execute_ctx = executeEditFile,
};

// Legacy export
pub const edit_file_tool = tool;

test "edit_file tool definition" {
    try std.testing.expectEqualStrings("edit_file", tool.name);
    try std.testing.expect(tool.execute_ctx != null);
}
