const std = @import("std");
const registry = @import("registry.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

const MAX_RESULTS = 100;

fn executeGlob(ctx: ToolContext) ToolResult {
    const pattern = ctx.getString("pattern") orelse {
        return ToolResult.err("Missing required parameter: pattern");
    };

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    const search_path = ctx.getString("path") orelse ".";

    // Try using ripgrep --files with glob
    var child = std.process.Child.init(
        &.{ "rg", "--files", "-g", pattern, search_path },
        ctx.allocator,
    );
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    child.spawn() catch {
        // Fall back to directory walk
        return executeBasicGlob(ctx, pattern, search_path);
    };

    var stdout_list = std.ArrayListUnmanaged(u8){};
    defer stdout_list.deinit(ctx.allocator);

    if (child.stdout) |stdout_file| {
        const content = stdout_file.readToEndAlloc(ctx.allocator, 1024 * 1024) catch "";
        defer ctx.allocator.free(content);
        stdout_list.appendSlice(ctx.allocator, content) catch {};
    }

    _ = child.wait() catch {};

    if (stdout_list.items.len == 0) {
        return ToolResult.ok("No files found matching pattern");
    }

    // Count and potentially truncate results
    var count: usize = 0;
    var truncated = false;
    var output = std.ArrayListUnmanaged(u8){};

    var lines = std.mem.splitScalar(u8, stdout_list.items, '\n');
    while (lines.next()) |line| {
        if (line.len == 0) continue;
        if (count >= MAX_RESULTS) {
            truncated = true;
            break;
        }
        output.appendSlice(ctx.allocator, line) catch {};
        output.append(ctx.allocator, '\n') catch {};
        count += 1;
    }

    if (count == 0) {
        return ToolResult.ok("No files found matching pattern");
    }

    if (truncated) {
        output.appendSlice(ctx.allocator, "\n(Results truncated. Use a more specific pattern or path.)") catch {};
        return ToolResult.okTruncated(output.toOwnedSlice(ctx.allocator) catch "", null);
    }

    return ToolResult.ok(output.toOwnedSlice(ctx.allocator) catch "");
}

fn executeBasicGlob(ctx: ToolContext, pattern: []const u8, search_path: []const u8) ToolResult {
    var output = std.ArrayListUnmanaged(u8){};
    var count: usize = 0;

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
        if (count >= MAX_RESULTS) break;

        // Simple pattern matching (just extension or substring)
        if (matchesPattern(entry.path, pattern)) {
            output.appendSlice(ctx.allocator, entry.path) catch {};
            output.append(ctx.allocator, '\n') catch {};
            count += 1;
        }
    }

    if (count == 0) {
        return ToolResult.ok("No files found matching pattern");
    }

    if (count >= MAX_RESULTS) {
        output.appendSlice(ctx.allocator, "\n(Results truncated. Use a more specific pattern or path.)") catch {};
        return ToolResult.okTruncated(output.toOwnedSlice(ctx.allocator) catch "", null);
    }

    return ToolResult.ok(output.toOwnedSlice(ctx.allocator) catch "");
}

fn matchesPattern(path: []const u8, pattern: []const u8) bool {
    // Handle common glob patterns
    if (std.mem.startsWith(u8, pattern, "*.")) {
        // Extension match: *.zig
        const ext = pattern[1..]; // .zig
        return std.mem.endsWith(u8, path, ext);
    }

    if (std.mem.startsWith(u8, pattern, "**/*.")) {
        // Recursive extension: **/*.zig
        const ext = pattern[3..]; // .zig
        return std.mem.endsWith(u8, path, ext);
    }

    if (std.mem.indexOf(u8, pattern, "*") != null) {
        // Has wildcard - do substring match on non-wildcard parts
        var parts = std.mem.splitScalar(u8, pattern, '*');
        var pos: usize = 0;
        while (parts.next()) |part| {
            if (part.len == 0) continue;
            if (std.mem.indexOfPos(u8, path, pos, part)) |idx| {
                pos = idx + part.len;
            } else {
                return false;
            }
        }
        return true;
    }

    // Literal match
    return std.mem.indexOf(u8, path, pattern) != null;
}

pub const tool = Tool{
    .name = "glob",
    .description =
    \\Find files matching a glob pattern.
    \\Parameters:
    \\  - pattern: Glob pattern, e.g. "*.zig", "**/*.ts" (required)
    \\  - path: Directory to search in (optional, default ".")
    \\Returns list of matching file paths. Max 100 results.
    ,
    .execute_ctx = executeGlob,
};

// Legacy export
pub const glob_tool = tool;

test "glob tool definition" {
    try std.testing.expectEqualStrings("glob", tool.name);
    try std.testing.expect(tool.execute_ctx != null);
}

test "matchesPattern extension" {
    try std.testing.expect(matchesPattern("foo/bar.zig", "*.zig"));
    try std.testing.expect(matchesPattern("src/main.zig", "**/*.zig"));
    try std.testing.expect(!matchesPattern("foo/bar.ts", "*.zig"));
}
