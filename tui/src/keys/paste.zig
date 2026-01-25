// PasteHandler - Process bracketed paste events from vaxis
// Detects large pastes and optionally collapses them to placeholders

const std = @import("std");

pub const PasteHandler = struct {
    const Self = @This();

    pub const Config = struct {
        max_lines: usize = 10,
        max_chars: usize = 1000,
        collapse_large: bool = true,
    };

    pub const PasteResult = struct {
        text: []const u8,
        is_placeholder: bool,
        id: ?u32,
    };

    allocator: std.mem.Allocator,
    config: Config,
    stored_pastes: std.AutoHashMap(u32, []const u8),
    next_id: u32 = 1,

    pub fn init(allocator: std.mem.Allocator, config: Config) Self {
        return .{
            .allocator = allocator,
            .config = config,
            .stored_pastes = std.AutoHashMap(u32, []const u8).init(allocator),
        };
    }

    pub fn deinit(self: *Self) void {
        var it = self.stored_pastes.valueIterator();
        while (it.next()) |v| {
            self.allocator.free(v.*);
        }
        self.stored_pastes.deinit();
    }

    pub fn isLargePaste(self: *const Self, content: []const u8) bool {
        if (content.len > self.config.max_chars) return true;

        var line_count: usize = 1;
        for (content) |c| {
            if (c == '\n') {
                line_count += 1;
                if (line_count > self.config.max_lines) return true;
            }
        }
        return false;
    }

    pub fn handlePaste(self: *Self, content: []const u8) !PasteResult {
        if (!self.config.collapse_large or !self.isLargePaste(content)) {
            return .{ .text = content, .is_placeholder = false, .id = null };
        }

        const id = self.next_id;
        self.next_id += 1;

        const stored = try self.allocator.dupe(u8, content);
        try self.stored_pastes.put(id, stored);

        const line_count = blk: {
            var count: usize = 1;
            for (content) |c| {
                if (c == '\n') count += 1;
            }
            break :blk count;
        };

        return .{
            .text = try std.fmt.allocPrint(
                self.allocator,
                "[Paste #{d}: {d} lines, {d} chars - use Ctrl+E to expand]",
                .{ id, line_count, content.len },
            ),
            .is_placeholder = true,
            .id = id,
        };
    }

    pub fn getPlaceholder(self: *const Self, id: u32) ?[]const u8 {
        const content = self.stored_pastes.get(id) orelse return null;
        const line_count = blk: {
            var count: usize = 1;
            for (content) |c| {
                if (c == '\n') count += 1;
            }
            break :blk count;
        };
        return std.fmt.allocPrint(
            self.allocator,
            "[Paste #{d}: {d} lines, {d} chars]",
            .{ id, line_count, content.len },
        ) catch null;
    }

    pub fn expandPlaceholder(self: *const Self, id: u32) ?[]const u8 {
        return self.stored_pastes.get(id);
    }

    pub fn freePlaceholder(self: *Self, id: u32) void {
        if (self.stored_pastes.fetchRemove(id)) |kv| {
            self.allocator.free(kv.value);
        }
    }
};
