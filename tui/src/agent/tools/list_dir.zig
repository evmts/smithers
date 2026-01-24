const std = @import("std");
const registry = @import("registry.zig");
const truncate = @import("truncate.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

const MAX_ENTRIES = 500;
const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 3;

fn executeListDir(ctx: ToolContext) ToolResult {
    const path = ctx.getString("path") orelse ".";
    const depth = @as(usize, @intCast(@max(1, @min(MAX_DEPTH, ctx.getInt("depth") orelse DEFAULT_DEPTH))));

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    var dir = std.fs.cwd().openDir(path, .{ .iterate = true }) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("Directory not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            error.NotDir => ToolResult.err("Path is not a directory"),
            else => ToolResult.err("Failed to open directory"),
        };
    };
    defer dir.close();

    var output = std.ArrayListUnmanaged(u8){};
    var entry_count: usize = 0;

    // Collect entries
    var entries = std.ArrayListUnmanaged(Entry){};
    defer entries.deinit(ctx.allocator);

    collectEntries(ctx.allocator, dir, "", depth, &entries, &entry_count, MAX_ENTRIES) catch {
        return ToolResult.err("Failed to read directory");
    };

    // Sort entries
    std.mem.sort(Entry, entries.items, {}, struct {
        fn lessThan(_: void, a: Entry, b: Entry) bool {
            return std.mem.lessThan(u8, a.sort_key, b.sort_key);
        }
    }.lessThan);

    // Format output
    for (entries.items) |entry| {
        if (ctx.isCancelled()) {
            return ToolResult.err("Cancelled");
        }

        // Indent based on depth
        var i: usize = 0;
        while (i < entry.indent) : (i += 1) {
            output.appendSlice(ctx.allocator, "  ") catch {};
        }

        output.appendSlice(ctx.allocator, entry.name) catch {};

        switch (entry.kind) {
            .directory => output.append(ctx.allocator, '/') catch {},
            .sym_link => output.append(ctx.allocator, '@') catch {},
            else => {},
        }

        output.append(ctx.allocator, '\n') catch {};
    }

    if (entries.items.len == 0) {
        return ToolResult.ok("(empty directory)");
    }

    if (entry_count >= MAX_ENTRIES) {
        output.appendSlice(ctx.allocator, "\n(More than 500 entries, results truncated)") catch {};
        return ToolResult.okTruncated(output.toOwnedSlice(ctx.allocator) catch "", null);
    }

    return ToolResult.ok(output.toOwnedSlice(ctx.allocator) catch "");
}

const Entry = struct {
    name: []const u8,
    sort_key: []const u8,
    kind: std.fs.Dir.Entry.Kind,
    indent: usize,
};

fn collectEntries(
    allocator: std.mem.Allocator,
    dir: std.fs.Dir,
    prefix: []const u8,
    remaining_depth: usize,
    entries: *std.ArrayListUnmanaged(Entry),
    count: *usize,
    max_count: usize,
) !void {
    if (count.* >= max_count) return;

    var iter = dir.iterate();
    while (try iter.next()) |entry| {
        if (count.* >= max_count) break;

        const full_path = if (prefix.len > 0)
            try std.fmt.allocPrint(allocator, "{s}/{s}", .{ prefix, entry.name })
        else
            try allocator.dupe(u8, entry.name);

        entries.append(allocator, .{
            .name = try allocator.dupe(u8, entry.name),
            .sort_key = full_path,
            .kind = entry.kind,
            .indent = if (prefix.len > 0) std.mem.count(u8, prefix, "/") + 1 else 0,
        }) catch {};

        count.* += 1;

        // Recurse into subdirectories
        if (entry.kind == .directory and remaining_depth > 1) {
            var subdir = dir.openDir(entry.name, .{ .iterate = true }) catch continue;
            defer subdir.close();

            collectEntries(allocator, subdir, full_path, remaining_depth - 1, entries, count, max_count) catch {};
        }
    }
}

pub const tool = Tool{
    .name = "list_dir",
    .description =
    \\List contents of a directory.
    \\Parameters:
    \\  - path: Directory path (optional, default ".")
    \\  - depth: How deep to recurse (optional, default 1, max 3)
    \\Directories marked with /, symlinks with @.
    \\Max 500 entries.
    ,
    .execute_ctx = executeListDir,
};

// Legacy export
pub const list_dir_tool = tool;

test "list_dir tool definition" {
    try std.testing.expectEqualStrings("list_dir", tool.name);
    try std.testing.expect(tool.execute_ctx != null);
}
