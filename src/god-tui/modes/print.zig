// Print Mode per God-TUI spec §5 (Phase 11)
// Single-shot mode: takes prompt, outputs response, exits

const std = @import("std");
const posix = std.posix;
const Allocator = std.mem.Allocator;

pub const PrintMode = struct {
    allocator: Allocator,
    model: []const u8 = "claude-sonnet-4",

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        _ = self;
    }

    pub fn setModel(self: *Self, model: []const u8) void {
        self.model = model;
    }

    pub fn run(self: *Self, prompt: []const []const u8) !void {
        if (prompt.len == 0) {
            try self.writeStdout("Error: No prompt provided\n");
            return error.NoPrompt;
        }

        // Join prompt parts
        var full_prompt = std.ArrayListUnmanaged(u8){};
        defer full_prompt.deinit(self.allocator);

        for (prompt, 0..) |part, i| {
            if (i > 0) try full_prompt.append(self.allocator, ' ');
            try full_prompt.appendSlice(self.allocator, part);
        }

        // In a real implementation, this would:
        // 1. Initialize AI provider
        // 2. Send prompt
        // 3. Stream response to stdout
        // 4. Handle tool calls if enabled
        // 5. Exit when complete

        // For now, output a placeholder indicating the mode is working
        const output = try std.fmt.allocPrint(self.allocator, "Prompt: {s}\nModel: {s}\n[Print mode stub - AI integration pending]\n", .{ full_prompt.items, self.model });
        defer self.allocator.free(output);
        try self.writeStdout(output);
    }

    fn writeStdout(_: *Self, data: []const u8) !void {
        _ = try posix.write(posix.STDOUT_FILENO, data);
    }
};

// ============ Tests ============

test "PrintMode init" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator);
    defer mode.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4", mode.model);
}

test "PrintMode set model" {
    const allocator = std.testing.allocator;
    var mode = PrintMode.init(allocator);
    defer mode.deinit();

    mode.setModel("gpt-4");
    try std.testing.expectEqualStrings("gpt-4", mode.model);
}
