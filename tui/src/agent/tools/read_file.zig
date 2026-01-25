const std = @import("std");
const registry = @import("registry.zig");
const truncate = @import("truncate.zig");
const ToolResult = registry.ToolResult;
const ToolContext = registry.ToolContext;
const Tool = registry.Tool;

const DEFAULT_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

fn executeReadFile(ctx: ToolContext) ToolResult {
    const path = ctx.getString("path") orelse {
        return ToolResult.err("Missing required parameter: path");
    };

    if (ctx.isCancelled()) {
        return ToolResult.err("Cancelled");
    }

    const raw_offset = ctx.getInt("offset") orelse 0;
    const offset: usize = if (raw_offset < 0) 0 else @intCast(raw_offset);
    const raw_limit = ctx.getInt("limit") orelse @as(i64, DEFAULT_LIMIT);
    const limit: usize = if (raw_limit <= 0) DEFAULT_LIMIT else @intCast(@min(raw_limit, 1_000_000));

    const file = std.fs.cwd().openFile(path, .{}) catch |e| {
        return switch (e) {
            error.FileNotFound => ToolResult.err("File not found"),
            error.AccessDenied => ToolResult.err("Access denied"),
            error.IsDir => ToolResult.err("Path is a directory, not a file"),
            else => ToolResult.err("Failed to open file"),
        };
    };
    defer file.close();

    // Binary file detection (check first 4KB for null bytes)
    var detect_buf: [4096]u8 = undefined;
    const detect_len = file.read(&detect_buf) catch 0;
    for (detect_buf[0..detect_len]) |byte| {
        if (byte == 0) {
            return ToolResult.err("Cannot read binary file");
        }
    }

    // Seek back to start
    file.seekTo(0) catch {};

    const max_size = 1024 * 1024; // 1MB limit
    const content = file.readToEndAlloc(ctx.allocator, max_size) catch {
        return ToolResult.err("Failed to read file (file too large?)");
    };
    defer ctx.allocator.free(content);

    // Split into lines
    var lines = std.ArrayListUnmanaged([]const u8){};
    defer lines.deinit(ctx.allocator);

    var iter = std.mem.splitScalar(u8, content, '\n');
    while (iter.next()) |line| {
        lines.append(ctx.allocator, line) catch {};
    }

    const total_lines = lines.items.len;

    // Validate offset
    if (offset >= total_lines) {
        const msg = std.fmt.allocPrint(
            ctx.allocator,
            "Offset {d} is beyond end of file ({d} lines total)",
            .{ offset, total_lines },
        ) catch "Offset beyond end of file";
        return ToolResult.err(msg);
    }

    // Build output - raw content without line numbers (line numbers added at render time)
    var output = std.ArrayListUnmanaged(u8){};

    const end_line = @min(offset + limit, total_lines);
    var lines_written: usize = 0;
    var truncated_by_limit = false;

    for (lines.items[offset..end_line]) |line| {
        if (ctx.isCancelled()) {
            return ToolResult.err("Cancelled");
        }

        // Check output size
        if (output.items.len > truncate.MAX_BYTES) {
            truncated_by_limit = true;
            break;
        }

        // Truncate long lines
        const display_line = if (line.len > MAX_LINE_LENGTH)
            line[0..MAX_LINE_LENGTH]
        else
            line;

        output.appendSlice(ctx.allocator, display_line) catch {};
        output.append(ctx.allocator, '\n') catch {};
        lines_written += 1;
    }

    // Add footer (no leading newline - content already ends with newline)
    const has_more = end_line < total_lines or truncated_by_limit;
    if (truncated_by_limit) {
        const notice = std.fmt.allocPrint(
            ctx.allocator,
            "(Output truncated at {d} bytes. Use 'offset' parameter to read beyond line {d})",
            .{ truncate.MAX_BYTES, offset + lines_written },
        ) catch "";
        defer ctx.allocator.free(notice);
        output.appendSlice(ctx.allocator, notice) catch {};
    } else if (has_more) {
        const notice = std.fmt.allocPrint(
            ctx.allocator,
            "(File has more lines. Use 'offset' parameter to read beyond line {d})",
            .{ end_line },
        ) catch "";
        defer ctx.allocator.free(notice);
        output.appendSlice(ctx.allocator, notice) catch {};
    } else {
        const notice = std.fmt.allocPrint(
            ctx.allocator,
            "(End of file - total {d} lines)",
            .{total_lines},
        ) catch "";
        defer ctx.allocator.free(notice);
        output.appendSlice(ctx.allocator, notice) catch {};
    }

    if (has_more) {
        return ToolResult.okTruncated(output.toOwnedSlice(ctx.allocator) catch "", null);
    }
    return ToolResult.ok(output.toOwnedSlice(ctx.allocator) catch "");
}

pub const tool = Tool{
    .name = "read_file",
    .description =
    \\Read contents of a file with line numbers.
    \\Parameters:
    \\  - path: Path to the file (required)
    \\  - offset: Line number to start from, 0-indexed (optional, default 0)
    \\  - limit: Max lines to read (optional, default 2000)
    \\Output is paginated. Use offset to read more.
    ,
    .execute_ctx = executeReadFile,
};

// Legacy export
pub const read_file_tool = tool;
