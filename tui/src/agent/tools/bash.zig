const std = @import("std");
const registry = @import("registry.zig");
const truncate = @import("truncate.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB max before truncation kicks in

fn executeBash(ctx: ToolContext) ToolResult {
    const command = ctx.getString("command") orelse {
        return ToolResult.err("Missing required parameter: command");
    };

    // Check for cancellation before starting
    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    var child = std.process.Child.init(&.{ "/bin/sh", "-c", command }, ctx.allocator);
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    child.spawn() catch {
        return ToolResult.err("Failed to spawn process");
    };
    // Always wait for child to prevent zombies
    defer _ = child.wait() catch {};

    // Collect output with streaming updates
    var stdout_list = std.ArrayListUnmanaged(u8){};
    defer stdout_list.deinit(ctx.allocator);
    var stderr_list = std.ArrayListUnmanaged(u8){};
    defer stderr_list.deinit(ctx.allocator);

    // Read in chunks for streaming
    var buf: [4096]u8 = undefined;

    // Read stdout
    if (child.stdout) |stdout_file| {
        while (true) {
            // Check cancellation periodically
            if (ctx.isCancelled()) {
                _ = child.kill() catch {};
                return ToolResult.err("Cancelled");
            }

            const n = stdout_file.read(&buf) catch break;
            if (n == 0) break;

            stdout_list.appendSlice(ctx.allocator, buf[0..n]) catch {
                return ToolResult.err("Out of memory collecting output");
            };

            // Stream partial update
            ctx.update(stdout_list.items);

            // Prevent runaway output
            if (stdout_list.items.len > MAX_OUTPUT_SIZE) break;
        }
    }

    // Read stderr
    if (child.stderr) |stderr_file| {
        const content = stderr_file.readToEndAlloc(ctx.allocator, MAX_OUTPUT_SIZE) catch "";
        defer if (content.len > 0) ctx.allocator.free(content);
        stderr_list.appendSlice(ctx.allocator, content) catch {
            return ToolResult.err("Out of memory collecting stderr");
        };
    }

    const result = child.wait() catch {
        return ToolResult.err("Failed to wait for process");
    };

    // Combine output
    var combined = std.ArrayListUnmanaged(u8){};
    defer combined.deinit(ctx.allocator);
    combined.appendSlice(ctx.allocator, stdout_list.items) catch {
        return ToolResult.err("Out of memory combining output");
    };
    if (stderr_list.items.len > 0) {
        if (combined.items.len > 0) {
            combined.appendSlice(ctx.allocator, "\n--- stderr ---\n") catch {
                return ToolResult.err("Out of memory combining output");
            };
        }
        combined.appendSlice(ctx.allocator, stderr_list.items) catch {
            return ToolResult.err("Out of memory combining output");
        };
    }

    // Apply truncation (keep tail for bash output)
    const trunc_result = truncate.truncateTail(ctx.allocator, combined.items, .{});

    const exit_code = switch (result) {
        .Exited => |code| code,
        else => 1,
    };

    if (exit_code == 0) {
        if (trunc_result.truncated) {
            // Add truncation notice
            var output = std.ArrayListUnmanaged(u8){};
            output.appendSlice(ctx.allocator, trunc_result.content) catch {
                return ToolResult.err("Out of memory formatting output");
            };
            const notice = std.fmt.allocPrint(
                ctx.allocator,
                "\n\n[Showing last {d} of {d} lines]",
                .{ trunc_result.output_lines, trunc_result.total_lines },
            ) catch {
                return ToolResult.err("Out of memory formatting output");
            };
            defer ctx.allocator.free(notice);
            output.appendSlice(ctx.allocator, notice) catch {
                return ToolResult.err("Out of memory formatting output");
            };
            return ToolResult.okTruncated(output.toOwnedSlice(ctx.allocator) catch {
                return ToolResult.err("Out of memory formatting output");
            }, null);
        }
        return ToolResult.ok(trunc_result.content);
    } else {
        // Command failed - include exit code
        var output = std.ArrayListUnmanaged(u8){};
        output.appendSlice(ctx.allocator, trunc_result.content) catch {
            return ToolResult.err("Out of memory formatting error output");
        };
        const notice = std.fmt.allocPrint(ctx.allocator, "\n\nCommand exited with code {d}", .{exit_code}) catch {
            return ToolResult.err("Out of memory formatting error output");
        };
        defer ctx.allocator.free(notice);
        output.appendSlice(ctx.allocator, notice) catch {
            return ToolResult.err("Out of memory formatting error output");
        };
        return ToolResult.err(output.toOwnedSlice(ctx.allocator) catch "Command failed");
    }
}

pub const tool = Tool{
    .name = "bash",
    .description =
    \\Execute a bash command and return the output.
    \\Output is truncated to last 500 lines or 30KB.
    \\Use for running shell commands, scripts, or system operations.
    ,
    .execute_ctx = executeBash,
};

// Legacy export for backwards compat
pub const bash_tool = tool;
