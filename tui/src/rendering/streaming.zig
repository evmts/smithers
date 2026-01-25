const std = @import("std");
const width_mod = @import("width.zig");

/// Brightness levels for shimmer animation (dim -> normal -> bright -> normal -> dim)
const ShimmerLevel = enum(u3) {
    dim = 0,
    low = 1,
    normal = 2,
    high = 3,
    bright = 4,

    pub fn toColorIndex(self: ShimmerLevel) u8 {
        return switch (self) {
            .dim => 240,
            .low => 245,
            .normal => 250,
            .high => 254,
            .bright => 255,
        };
    }
};

/// Number of characters affected by shimmer at end of stream
const SHIMMER_CHAR_COUNT: usize = 8;

/// Animation frames for shimmer cycle
const SHIMMER_FRAMES: [8]ShimmerLevel = .{
    .dim, .low, .normal, .high, .bright, .high, .normal, .low,
};

/// A single display line with optional shimmer positions
pub const DisplayLine = struct {
    text: []const u8,
    shimmer_start: ?usize, // index where shimmer begins in this line
    shimmer_levels: [SHIMMER_CHAR_COUNT]ShimmerLevel,
};

/// Streaming text component for incrementally arriving text
pub const StreamingText = struct {
    allocator: std.mem.Allocator,
    buffer: std.ArrayListUnmanaged(u8),
    cursor: usize,
    completed: bool,
    animation_frame: u8,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) Self {
        return .{
            .allocator = allocator,
            .buffer = .{},
            .cursor = 0,
            .completed = false,
            .animation_frame = 0,
        };
    }

    pub fn deinit(self: *Self) void {
        self.buffer.deinit(self.allocator);
    }

    /// Append new text chunk to the stream
    pub fn append(self: *Self, text: []const u8) !void {
        try self.buffer.appendSlice(self.allocator, text);
        self.cursor = self.buffer.items.len;
    }

    /// Mark streaming as complete (disables shimmer)
    pub fn complete(self: *Self) void {
        self.completed = true;
    }

    /// Check if streaming is done
    pub fn isComplete(self: *const Self) bool {
        return self.completed;
    }

    /// Get full accumulated text
    pub fn getText(self: *const Self) []const u8 {
        return self.buffer.items;
    }

    /// Clear and reset the stream
    pub fn clear(self: *Self) void {
        self.buffer.clearRetainingCapacity();
        self.cursor = 0;
        self.completed = false;
        self.animation_frame = 0;
    }

    /// Advance animation frame for shimmer effect
    pub fn tick(self: *Self) void {
        if (!self.completed) {
            self.animation_frame = (self.animation_frame + 1) % @as(u8, SHIMMER_FRAMES.len);
        }
    }

    /// Get wrapped lines for display at given width
    /// Caller owns returned slice and must free each line's text
    pub fn getDisplayLines(self: *const Self, allocator: std.mem.Allocator, width: u16) ![]DisplayLine {
        if (width == 0) return &[_]DisplayLine{};

        const text = self.buffer.items;
        if (text.len == 0) return &[_]DisplayLine{};

        var lines: std.ArrayListUnmanaged(DisplayLine) = .{};
        errdefer {
            for (lines.items) |line| {
                allocator.free(line.text);
            }
            lines.deinit(allocator);
        }

        var line_start: usize = 0;
        var col: u32 = 0;
        var i: usize = 0;

        while (i < text.len) {
            const c = text[i];
            if (c == '\n') {
                const line_text = try allocator.dupe(u8, text[line_start..i]);
                try lines.append(allocator, self.makeDisplayLine(line_text, line_start, i));
                line_start = i + 1;
                col = 0;
                i += 1;
            } else {
                const char_width = width_mod.charWidth(c);
                col += char_width;
                if (col >= width) {
                    const line_text = try allocator.dupe(u8, text[line_start .. i + 1]);
                    try lines.append(allocator, self.makeDisplayLine(line_text, line_start, i + 1));
                    line_start = i + 1;
                    col = 0;
                }
                i += 1;
            }
        }

        // Handle remaining text
        if (line_start < text.len) {
            const line_text = try allocator.dupe(u8, text[line_start..]);
            try lines.append(allocator, self.makeDisplayLine(line_text, line_start, text.len));
        }

        return try lines.toOwnedSlice(allocator);
    }

    /// Free display lines allocated by getDisplayLines
    pub fn freeDisplayLines(allocator: std.mem.Allocator, lines: []DisplayLine) void {
        for (lines) |line| {
            allocator.free(line.text);
        }
        allocator.free(lines);
    }

    fn makeDisplayLine(self: *const Self, text: []const u8, start_idx: usize, end_idx: usize) DisplayLine {
        var line = DisplayLine{
            .text = text,
            .shimmer_start = null,
            .shimmer_levels = undefined,
        };

        if (self.completed) return line;

        // Calculate shimmer region (last N chars of total buffer)
        const total_len = self.buffer.items.len;
        if (total_len == 0) return line;

        const shimmer_region_start = if (total_len > SHIMMER_CHAR_COUNT)
            total_len - SHIMMER_CHAR_COUNT
        else
            0;

        // Check if this line overlaps with shimmer region
        if (end_idx > shimmer_region_start and start_idx < total_len) {
            const overlap_start = @max(start_idx, shimmer_region_start);
            const local_start = overlap_start - start_idx;
            line.shimmer_start = local_start;

            // Calculate shimmer levels with wave effect
            for (0..SHIMMER_CHAR_COUNT) |i| {
                const frame_offset = (self.animation_frame + @as(u8, @intCast(i))) % SHIMMER_FRAMES.len;
                line.shimmer_levels[i] = SHIMMER_FRAMES[frame_offset];
            }
        }

        return line;
    }
};
