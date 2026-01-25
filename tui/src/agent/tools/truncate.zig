const std = @import("std");
const Allocator = std.mem.Allocator;

pub const MAX_LINES: usize = 500;
pub const MAX_BYTES: usize = 30 * 1024; // 30KB
pub const MAX_LINE_LENGTH: usize = 300;

pub const TruncateResult = struct {
    pub const TruncatedBy = enum { none, lines, bytes };

    content: []const u8,
    truncated: bool,
    total_lines: usize,
    output_lines: usize,
    total_bytes: usize,
    output_bytes: usize,
    truncated_by: TruncatedBy,
};

/// Truncate from tail (keep last N lines) - for bash output
pub fn truncateTail(
    allocator: Allocator,
    input: []const u8,
    opts: struct {
        max_lines: usize = MAX_LINES,
        max_bytes: usize = MAX_BYTES,
    },
) TruncateResult {
    if (input.len == 0) {
        return .{
            .content = "",
            .truncated = false,
            .total_lines = 0,
            .output_lines = 0,
            .total_bytes = 0,
            .output_bytes = 0,
            .truncated_by = .none,
        };
    }

    var lines = std.ArrayListUnmanaged([]const u8){};
    defer lines.deinit(allocator);

    var iter = std.mem.splitScalar(u8, input, '\n');
    while (iter.next()) |line| {
        lines.append(allocator, line) catch {};
    }

    const total_lines = lines.items.len;
    var start_idx: usize = 0;
    var truncated_by: TruncateResult.TruncatedBy = .none;

    // Truncate by line count first
    if (total_lines > opts.max_lines) {
        start_idx = total_lines - opts.max_lines;
        truncated_by = .lines;
    }

    // Build output and check bytes
    var output = std.ArrayListUnmanaged(u8){};
    var output_lines: usize = 0;

    for (lines.items[start_idx..]) |line| {
        const line_len = line.len + 1; // +1 for newline
        if (output.items.len + line_len > opts.max_bytes) {
            truncated_by = .bytes;
            break;
        }
        if (output.items.len > 0) {
            output.append(allocator, '\n') catch {};
        }
        output.appendSlice(allocator, line) catch {};
        output_lines += 1;
    }

    return .{
        .content = output.toOwnedSlice(allocator) catch "",
        .truncated = truncated_by != .none,
        .total_lines = total_lines,
        .output_lines = output_lines,
        .total_bytes = input.len,
        .output_bytes = output.items.len,
        .truncated_by = truncated_by,
    };
}

/// Truncate from head (keep first N lines) - for file reads
pub fn truncateHead(
    allocator: Allocator,
    input: []const u8,
    opts: struct {
        max_lines: usize = MAX_LINES,
        max_bytes: usize = MAX_BYTES,
    },
) TruncateResult {
    if (input.len == 0) {
        return .{
            .content = "",
            .truncated = false,
            .total_lines = 0,
            .output_lines = 0,
            .total_bytes = 0,
            .output_bytes = 0,
            .truncated_by = .none,
        };
    }

    var output = std.ArrayListUnmanaged(u8){};
    var output_lines: usize = 0;
    var total_lines: usize = 0;
    var truncated_by: TruncateResult.TruncatedBy = .none;

    var iter = std.mem.splitScalar(u8, input, '\n');
    while (iter.next()) |line| {
        total_lines += 1;

        if (output_lines >= opts.max_lines) {
            truncated_by = .lines;
            continue; // Keep counting total lines
        }

        const line_len = line.len + 1;
        if (output.items.len + line_len > opts.max_bytes) {
            truncated_by = .bytes;
            continue; // Keep counting total lines
        }

        if (output.items.len > 0) {
            output.append(allocator, '\n') catch {};
        }
        output.appendSlice(allocator, line) catch {};
        output_lines += 1;
    }

    return .{
        .content = output.toOwnedSlice(allocator) catch "",
        .truncated = truncated_by != .none,
        .total_lines = total_lines,
        .output_lines = output_lines,
        .total_bytes = input.len,
        .output_bytes = output.items.len,
        .truncated_by = truncated_by,
    };
}

/// Truncate a single line to max length
pub fn truncateLine(line: []const u8, max_len: usize) struct { text: []const u8, was_truncated: bool } {
    if (line.len <= max_len) {
        return .{ .text = line, .was_truncated = false };
    }
    return .{ .text = line[0..max_len], .was_truncated = true };
}

/// Format file size for display
pub fn formatSize(allocator: Allocator, bytes: usize) []const u8 {
    if (bytes < 1024) {
        return std.fmt.allocPrint(allocator, "{d}B", .{bytes}) catch "?B";
    } else if (bytes < 1024 * 1024) {
        const kb = @as(f64, @floatFromInt(bytes)) / 1024.0;
        return std.fmt.allocPrint(allocator, "{d:.1}KB", .{kb}) catch "?KB";
    } else {
        const mb = @as(f64, @floatFromInt(bytes)) / (1024.0 * 1024.0);
        return std.fmt.allocPrint(allocator, "{d:.1}MB", .{mb}) catch "?MB";
    }
}
