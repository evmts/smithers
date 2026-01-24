const std = @import("std");
const registry = @import("registry.zig");
const truncate = @import("truncate.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

const MAX_RESULTS = 100;
const MAX_LINE_LENGTH = 300;

fn executeGrep(ctx: ToolContext) ToolResult {
    const pattern = ctx.getString("pattern") orelse {
        return ToolResult.err("Missing required parameter: pattern");
    };

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    const search_path = ctx.getString("path") orelse ".";
    const include_glob = ctx.getString("include");

    // Use ripgrep if available, fall back to basic search
    var child = std.process.Child.init(
        &.{ "rg", "-n", "--color=never", "--no-heading", "-H", pattern, search_path },
        ctx.allocator,
    );

    // Add glob filter if specified
    if (include_glob) |glob| {
        child = std.process.Child.init(
            &.{ "rg", "-n", "--color=never", "--no-heading", "-H", "-g", glob, pattern, search_path },
            ctx.allocator,
        );
    }

    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    child.spawn() catch {
        // Fall back to basic grep
        return executeBasicGrep(ctx, pattern, search_path);
    };

    var stdout_list = std.ArrayListUnmanaged(u8){};
    defer stdout_list.deinit(ctx.allocator);

    if (child.stdout) |stdout_file| {
        const content = stdout_file.readToEndAlloc(ctx.allocator, 1024 * 1024) catch "";
        stdout_list.appendSlice(ctx.allocator, content) catch {};
    }

    const result = child.wait() catch {
        return ToolResult.err("Failed to wait for ripgrep");
    };

    const exit_code = switch (result) {
        .Exited => |code| code,
        else => 1,
    };

    // Exit code 1 = no matches (not an error)
    if (exit_code == 1 or stdout_list.items.len == 0) {
        return ToolResult.ok("No matches found");
    }

    if (exit_code != 0 and exit_code != 1) {
        return ToolResult.err("Grep failed");
    }

    // Parse and format results
    var output = std.ArrayListUnmanaged(u8){};
    var match_count: usize = 0;
    var current_file: []const u8 = "";

    var lines = std.mem.splitScalar(u8, stdout_list.items, '\n');
    while (lines.next()) |line| {
        if (line.len == 0) continue;
        if (match_count >= MAX_RESULTS) break;

        if (ctx.isCancelled()) {
            return ToolResult.err("Cancelled");
        }

        // Parse "file:line:content" format
        var parts = std.mem.splitScalar(u8, line, ':');
        const file = parts.next() orelse continue;
        const line_num = parts.next() orelse continue;
        const rest = parts.rest();

        // Truncate long lines
        const display_content = if (rest.len > MAX_LINE_LENGTH) rest[0..MAX_LINE_LENGTH] else rest;

        // Group by file
        if (!std.mem.eql(u8, file, current_file)) {
            if (output.items.len > 0) {
                output.appendSlice(ctx.allocator, "\n") catch {};
            }
            output.appendSlice(ctx.allocator, file) catch {};
            output.appendSlice(ctx.allocator, ":\n") catch {};
            current_file = file;
        }

        const formatted = std.fmt.allocPrint(
            ctx.allocator,
            "  Line {s}: {s}\n",
            .{ line_num, display_content },
        ) catch continue;
        output.appendSlice(ctx.allocator, formatted) catch {};
        match_count += 1;
    }

    if (match_count == 0) {
        return ToolResult.ok("No matches found");
    }

    // Add header
    var final = std.ArrayListUnmanaged(u8){};
    const header = std.fmt.allocPrint(ctx.allocator, "Found {d} matches\n\n", .{match_count}) catch "";
    final.appendSlice(ctx.allocator, header) catch {};
    final.appendSlice(ctx.allocator, output.items) catch {};

    if (match_count >= MAX_RESULTS) {
        final.appendSlice(ctx.allocator, "\n(Results truncated. Use a more specific pattern or path.)") catch {};
        return ToolResult.okTruncated(final.toOwnedSlice(ctx.allocator) catch "", null);
    }

    return ToolResult.ok(final.toOwnedSlice(ctx.allocator) catch "");
}

fn executeBasicGrep(ctx: ToolContext, pattern: []const u8, search_path: []const u8) ToolResult {
    // Basic fallback using Zig's directory walker
    var output = std.ArrayListUnmanaged(u8){};
    var match_count: usize = 0;

    var dir = std.fs.cwd().openDir(search_path, .{ .iterate = true }) catch {
        return ToolResult.err("Failed to open search directory");
    };
    defer dir.close();

    var walker = dir.walk(ctx.allocator) catch {
        return ToolResult.err("Failed to walk directory");
    };
    defer walker.deinit();

    while (walker.next() catch null) |entry| {
        if (ctx.isCancelled()) {
            return ToolResult.err("Cancelled");
        }

        if (entry.kind != .file) continue;
        if (match_count >= MAX_RESULTS) break;

        // Read file and search
        const file = dir.openFile(entry.path, .{}) catch continue;
        defer file.close();

        const content = file.readToEndAlloc(ctx.allocator, 1024 * 1024) catch continue;
        defer ctx.allocator.free(content);

        var line_num: usize = 1;
        var file_has_match = false;
        var content_lines = std.mem.splitScalar(u8, content, '\n');

        while (content_lines.next()) |line| {
            if (std.mem.indexOf(u8, line, pattern) != null) {
                if (!file_has_match) {
                    if (output.items.len > 0) output.appendSlice(ctx.allocator, "\n") catch {};
                    output.appendSlice(ctx.allocator, entry.path) catch {};
                    output.appendSlice(ctx.allocator, ":\n") catch {};
                    file_has_match = true;
                }

                const display = if (line.len > MAX_LINE_LENGTH) line[0..MAX_LINE_LENGTH] else line;
                const formatted = std.fmt.allocPrint(
                    ctx.allocator,
                    "  Line {d}: {s}\n",
                    .{ line_num, display },
                ) catch continue;
                output.appendSlice(ctx.allocator, formatted) catch {};
                match_count += 1;

                if (match_count >= MAX_RESULTS) break;
            }
            line_num += 1;
        }
    }

    if (match_count == 0) {
        return ToolResult.ok("No matches found");
    }

    var final = std.ArrayListUnmanaged(u8){};
    const header = std.fmt.allocPrint(ctx.allocator, "Found {d} matches\n\n", .{match_count}) catch "";
    final.appendSlice(ctx.allocator, header) catch {};
    final.appendSlice(ctx.allocator, output.items) catch {};

    return ToolResult.ok(final.toOwnedSlice(ctx.allocator) catch "");
}

pub const tool = Tool{
    .name = "grep",
    .description =
    \\Search for a pattern in files using ripgrep.
    \\Parameters:
    \\  - pattern: Regex pattern to search for (required)
    \\  - path: Directory to search in (optional, default ".")
    \\  - include: Glob pattern to filter files, e.g. "*.zig" (optional)
    \\Returns matching lines with file:line format. Max 100 results.
    ,
    .execute_ctx = executeGrep,
};

// Legacy export
pub const grep_tool = tool;

test "grep tool definition" {
    try std.testing.expectEqualStrings("grep", tool.name);
    try std.testing.expect(tool.execute_ctx != null);
}
