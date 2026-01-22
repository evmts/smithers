const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolParams = registry.ToolParams;
const Tool = registry.Tool;

fn executeBash(params: ToolParams) ToolResult {
    const command = params.getString("command") orelse {
        return ToolResult.err("Missing required parameter: command");
    };

    var child = std.process.Child.init(&.{ "/bin/sh", "-c", command }, params.allocator);
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    child.spawn() catch {
        return ToolResult.err("Failed to spawn process");
    };

    // Read stdout/stderr after process completes
    const result = child.wait() catch {
        return ToolResult.err("Failed to wait for process");
    };

    // Use collectOutput for simpler handling
    var stdout_list = std.ArrayListUnmanaged(u8){};
    if (child.stdout) |stdout_file| {
        const content = stdout_file.readToEndAlloc(params.allocator, 1024 * 1024) catch {
            return ToolResult.err("Failed to read stdout");
        };
        stdout_list.appendSlice(params.allocator, content) catch {};
    }

    var stderr_list = std.ArrayListUnmanaged(u8){};
    if (child.stderr) |stderr_file| {
        const content = stderr_file.readToEndAlloc(params.allocator, 1024 * 1024) catch {
            return ToolResult.err("Failed to read stderr");
        };
        stderr_list.appendSlice(params.allocator, content) catch {};
    }

    if (result.Exited == 0) {
        return ToolResult.ok(stdout_list.items);
    } else {
        if (stderr_list.items.len > 0) {
            return ToolResult.err(stderr_list.items);
        }
        return ToolResult.err("Command failed");
    }
}

pub const bash_tool = Tool{
    .name = "bash",
    .description = "Execute a bash command and return the output.",
    .execute = executeBash,
};

test "bash tool definition" {
    try std.testing.expectEqualStrings("bash", bash_tool.name);
}
