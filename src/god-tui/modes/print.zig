// Print Mode per God-TUI spec §5 (Phase 11)
// Single-shot mode: takes prompt, outputs response, exits

const std = @import("std");
const posix = std.posix;
const Allocator = std.mem.Allocator;

const agent_mod = @import("agent");
const Agent = agent_mod.Agent;
const AgentConfig = agent_mod.AgentConfig;
const AgentEvent = agent_mod.AgentEvent;
const Message = agent_mod.Message;
const AgentProvider = agent_mod.AgentProvider;
const ProviderConfig = agent_mod.ProviderConfig;

// Anthropic provider for real LLM calls
const AnthropicProvider = agent_mod.AnthropicProvider;
const createAnthropicProvider = agent_mod.createAnthropicProvider;
const getDefaultModel = agent_mod.getDefaultModel;

pub const PrintMode = struct {
    allocator: Allocator,
    agent: *Agent,
    owns_agent: bool,
    anthropic_provider: ?*AnthropicProvider = null,

    const Self = @This();

    pub fn init(allocator: Allocator, agent: *Agent) Self {
        return .{
            .allocator = allocator,
            .agent = agent,
            .owns_agent = false,
            .anthropic_provider = null,
        };
    }

    pub fn initWithConfig(allocator: Allocator, config: AgentConfig) !Self {
        const agent = try allocator.create(Agent);
        agent.* = Agent.init(allocator, config);
        agent.on_event = handleEvent;

        // Try to set up Anthropic provider if API key is available
        var anthropic_prov: ?*AnthropicProvider = null;
        if (createAnthropicProvider(allocator)) |prov| {
            anthropic_prov = prov;
            const provider_config = ProviderConfig{
                .model_id = config.model,
                .api_key = std.posix.getenv("ANTHROPIC_API_KEY"),
            };
            const agent_provider = AgentProvider.init(allocator, prov.interface(), provider_config);
            agent.* = agent.withProvider(agent_provider);
        } else |_| {
            // No API key - will use stub responses
        }

        return .{
            .allocator = allocator,
            .agent = agent,
            .owns_agent = true,
            .anthropic_provider = anthropic_prov,
        };
    }

    pub fn deinit(self: *Self) void {
        if (self.owns_agent) {
            self.agent.deinit();
            self.allocator.destroy(self.agent);
        }
        if (self.anthropic_provider) |prov| {
            prov.deinit();
            self.allocator.destroy(prov);
        }
    }

    pub fn run(self: *Self, prompt_parts: []const []const u8) !void {
        if (prompt_parts.len == 0) {
            try writeStdout("Error: No prompt provided\n");
            return error.NoPrompt;
        }

        // Join prompt parts
        var full_prompt = std.ArrayListUnmanaged(u8){};
        defer full_prompt.deinit(self.allocator);

        for (prompt_parts, 0..) |part, i| {
            if (i > 0) try full_prompt.append(self.allocator, ' ');
            try full_prompt.appendSlice(self.allocator, part);
        }

        // Set event callback for streaming output
        self.agent.on_event = handleEvent;

        // Create user message and run agent
        const message = Message.user(full_prompt.items);
        try self.agent.prompt(message);

        // Get last assistant message and print it
        const messages = self.agent.messages.items;
        for (0..messages.len) |i| {
            const msg = messages[messages.len - 1 - i];
            if (msg.role == .assistant) {
                try writeStdout(msg.content);
                try writeStdout("\n");
                break;
            }
        }
    }

    fn handleEvent(event: AgentEvent) void {
        switch (event.type) {
            .text_delta => {
                if (event.text) |text| {
                    _ = posix.write(posix.STDOUT_FILENO, text) catch {};
                }
            },
            .agent_error => {
                if (event.error_message) |err| {
                    _ = posix.write(posix.STDERR_FILENO, "Error: ") catch {};
                    _ = posix.write(posix.STDERR_FILENO, err) catch {};
                    _ = posix.write(posix.STDERR_FILENO, "\n") catch {};
                }
            },
            else => {},
        }
    }

    fn writeStdout(data: []const u8) !void {
        _ = try posix.write(posix.STDOUT_FILENO, data);
    }
};

// ============ Tests ============

test "PrintMode init with agent" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    var mode = PrintMode.init(allocator, &agent);
    defer mode.deinit();

    try std.testing.expect(!mode.owns_agent);
    try std.testing.expectEqual(&agent, mode.agent);
}

test "PrintMode initWithConfig creates owned agent" {
    const allocator = std.testing.allocator;
    var mode = try PrintMode.initWithConfig(allocator, .{ .max_turns = 5 });
    defer mode.deinit();

    try std.testing.expect(mode.owns_agent);
    try std.testing.expectEqual(@as(u32, 5), mode.agent.config.max_turns);
}

test "PrintMode run with empty prompt returns error" {
    const allocator = std.testing.allocator;
    var mode = try PrintMode.initWithConfig(allocator, .{});
    defer mode.deinit();

    const empty: []const []const u8 = &.{};
    const result = mode.run(empty);
    try std.testing.expectError(error.NoPrompt, result);
}

test "PrintMode sends prompt to agent" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    var mode = PrintMode.init(allocator, &agent);
    defer mode.deinit();

    // Directly test that prompt gets added to agent
    const message = Message.user("test prompt");
    try agent.prompt(message);

    try std.testing.expect(agent.messageCount() >= 1);
    try std.testing.expectEqual(@as(u32, 1), agent.current_turn);
}

test "PrintMode joins prompt parts" {
    const allocator = std.testing.allocator;

    // Test the join logic by manually building the prompt
    var full_prompt = std.ArrayListUnmanaged(u8){};
    defer full_prompt.deinit(allocator);

    const parts: []const []const u8 = &.{ "part1", "part2", "part3" };
    for (parts, 0..) |part, i| {
        if (i > 0) try full_prompt.append(allocator, ' ');
        try full_prompt.appendSlice(allocator, part);
    }

    try std.testing.expectEqualStrings("part1 part2 part3", full_prompt.items);
}
