// Print Mode - Single-shot non-interactive mode
// Takes prompt, sends to agent, prints response, exits

const std = @import("std");
const posix = std.posix;
const Allocator = std.mem.Allocator;

pub const PrintConfig = struct {
    model: []const u8 = "claude-sonnet-4-20250514",
    max_tokens: u32 = 4096,
    system_prompt: ?[]const u8 = null,
};

pub const PrintMode = struct {
    allocator: Allocator,
    config: PrintConfig,

    const Self = @This();

    pub fn init(allocator: Allocator, config: PrintConfig) Self {
        return .{
            .allocator = allocator,
            .config = config,
        };
    }

    pub fn deinit(self: *Self) void {
        _ = self;
    }

    pub fn run(self: *Self, prompt_parts: []const []const u8) !void {
        if (prompt_parts.len == 0) {
            try writeStderr("Error: No prompt provided\n");
            return error.NoPrompt;
        }

        // Join prompt parts with spaces
        var full_prompt = std.ArrayListUnmanaged(u8){};
        defer full_prompt.deinit(self.allocator);

        for (prompt_parts, 0..) |part, i| {
            if (i > 0) try full_prompt.append(self.allocator, ' ');
            try full_prompt.appendSlice(self.allocator, part);
        }

        // TODO: Replace with real agent call when agent module exists
        // For now, stub response for testing
        const response = try self.getResponse(full_prompt.items);
        defer self.allocator.free(response);

        try writeStdout(response);
        try writeStdout("\n");
    }

    pub fn getResponse(self: *Self, prompt: []const u8) ![]const u8 {
        // Check for API key - if available, would call real API
        const api_key = posix.getenv("ANTHROPIC_API_KEY");
        if (api_key != null and api_key.?.len > 0) {
            // TODO: Call actual Anthropic API via agent module
            // For now, return stub indicating API would be called
            return try std.fmt.allocPrint(
                self.allocator,
                "[API call would be made with model: {s}]\nPrompt: {s}",
                .{ self.config.model, prompt },
            );
        }

        // No API key - return stub response
        return try std.fmt.allocPrint(
            self.allocator,
            "[No API key - stub response]\nReceived prompt: {s}",
            .{prompt},
        );
    }

    fn writeStdout(data: []const u8) !void {
        _ = try posix.write(posix.STDOUT_FILENO, data);
    }

    fn writeStderr(data: []const u8) !void {
        _ = try posix.write(posix.STDERR_FILENO, data);
    }
};
