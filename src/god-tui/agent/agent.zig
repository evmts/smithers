const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

pub const types = @import("types.zig");
pub const Message = types.Message;
pub const Role = types.Role;
pub const AgentConfig = types.AgentConfig;
pub const AgentEvent = types.AgentEvent;
pub const EventType = types.EventType;
pub const ThinkingLevel = types.ThinkingLevel;

pub const tools = @import("tools/registry.zig");
pub const ToolRegistry = tools.ToolRegistry;
pub const ToolResult = tools.ToolResult;

pub const provider = @import("provider.zig");
pub const ProviderInterface = provider.ProviderInterface;
pub const MockProvider = provider.MockProvider;
pub const AgentProvider = provider.AgentProvider;
pub const ProviderConfig = provider.ProviderConfig;

pub const Agent = struct {
    allocator: Allocator,
    messages: ArrayListUnmanaged(Message),
    is_running: bool = false,
    current_turn: u32 = 0,
    config: AgentConfig,
    steering_queue: ArrayListUnmanaged(Message),
    follow_up_queue: ArrayListUnmanaged(Message),
    on_event: ?*const fn (AgentEvent) void = null,
    tool_registry: ToolRegistry,
    llm_provider: ?AgentProvider = null,

    const Self = @This();

    pub fn init(allocator: Allocator, config: AgentConfig) Self {
        return .{
            .allocator = allocator,
            .messages = .{},
            .config = config,
            .steering_queue = .{},
            .follow_up_queue = .{},
            .tool_registry = ToolRegistry.initBuiltin(allocator),
        };
    }

    pub fn withProvider(self: Self, llm_provider: AgentProvider) Self {
        var agent = self;
        agent.llm_provider = llm_provider;
        return agent;
    }

    pub fn deinit(self: *Self) void {
        self.messages.deinit(self.allocator);
        self.steering_queue.deinit(self.allocator);
        self.follow_up_queue.deinit(self.allocator);
        self.tool_registry.deinit();
    }

    pub fn prompt(self: *Self, message: Message) !void {
        try self.messages.append(self.allocator, message);

        if (self.current_turn >= self.config.max_turns) {
            self.emitEvent(.{ .type = .agent_error, .error_message = "Max turns reached" });
            return;
        }

        self.is_running = true;
        defer self.is_running = false;

        while (self.current_turn < self.config.max_turns) {
            self.current_turn += 1;
            self.emitEvent(.{ .type = .turn_start, .turn = self.current_turn });

            // Check steering queue first
            if (self.steering_queue.items.len > 0) {
                const steering_msg = self.steering_queue.pop().?;
                try self.messages.append(self.allocator, steering_msg);
            }

            // Call LLM provider if available, else use stub
            const response_text = try self.callProvider();
            const response = Message.assistant(response_text);
            try self.messages.append(self.allocator, response);

            self.emitEvent(.{ .type = .turn_end, .turn = self.current_turn });

            // Check if we should continue (would check for tool calls)
            break;
        }

        // Process follow-up queue after main loop
        while (self.follow_up_queue.items.len > 0) {
            const follow_up = self.follow_up_queue.pop().?;
            try self.messages.append(self.allocator, follow_up);
        }

        self.emitEvent(.{ .type = .agent_end });
    }

    fn callProvider(self: *Self) ![]const u8 {
        if (self.llm_provider) |*llm| {
            var ctx = provider.Context.init(self.allocator);
            defer ctx.deinit();

            // Build context from messages
            if (self.config.system_prompt) |sys| {
                ctx.system_prompt = sys;
            }

            // Stream from provider
            var stream = try llm.stream(&ctx);
            defer stream.deinit();

            var response_text: []const u8 = "";
            while (stream.next()) |event| {
                if (provider.SimpleEvent.fromStreamEvent(event)) |simple| {
                    const agent_event = simple.toAgentEvent();
                    self.emitEvent(agent_event);
                    if (simple == .text) {
                        response_text = simple.text;
                    }
                }
            }
            return if (response_text.len > 0) response_text else "Response from LLM";
        }
        return "Response from LLM";
    }

    pub fn steer(self: *Self, message: Message) void {
        self.steering_queue.append(self.allocator, message) catch {};
    }

    pub fn followUp(self: *Self, message: Message) void {
        self.follow_up_queue.append(self.allocator, message) catch {};
    }

    pub fn abort(self: *Self) void {
        self.is_running = false;
        self.emitEvent(.{ .type = .agent_end });
    }

    pub fn messageCount(self: *Self) usize {
        return self.messages.items.len;
    }

    fn emitEvent(self: *Self, event: AgentEvent) void {
        if (self.on_event) |callback| {
            callback(event);
        }
    }
};

// Tests

test "Agent init and deinit" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    try std.testing.expectEqual(@as(u32, 0), agent.current_turn);
    try std.testing.expect(!agent.is_running);
    try std.testing.expectEqual(@as(usize, 0), agent.messageCount());
    try std.testing.expect(agent.tool_registry.count() > 0); // Has builtin tools
}

test "Agent prompt adds message" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    try agent.prompt(Message.user("Hello"));

    try std.testing.expect(agent.messageCount() >= 1);
    try std.testing.expectEqual(@as(u32, 1), agent.current_turn);
}

test "Agent respects max_turns" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{ .max_turns = 0 });
    defer agent.deinit();

    try agent.prompt(Message.user("test"));
    try std.testing.expectEqual(@as(u32, 0), agent.current_turn);
}

test "Agent steer adds to steering queue" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    agent.steer(Message.user("Steering message"));

    try std.testing.expectEqual(@as(usize, 1), agent.steering_queue.items.len);
}

test "Agent followUp adds to follow-up queue" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    agent.followUp(Message.user("Follow-up"));

    try std.testing.expectEqual(@as(usize, 1), agent.follow_up_queue.items.len);
}

test "Agent abort stops running" {
    const allocator = std.testing.allocator;
    var agent = Agent.init(allocator, .{});
    defer agent.deinit();

    agent.is_running = true;
    agent.abort();

    try std.testing.expect(!agent.is_running);
}

test "Agent with MockProvider" {
    const allocator = std.testing.allocator;

    var mock = try provider.createMockWithResponse(allocator, "Hello from mock");
    defer mock.deinit();

    const config = ProviderConfig{};
    const agent_provider = AgentProvider.init(allocator, mock.interface(), config);

    var agent = Agent.init(allocator, .{}).withProvider(agent_provider);
    defer agent.deinit();

    try std.testing.expect(agent.llm_provider != null);
}

test "Agent prompt with provider emits events" {
    const allocator = std.testing.allocator;

    var mock = try provider.createMockWithResponse(allocator, "Mock response");
    defer mock.deinit();

    const config = ProviderConfig{};
    const agent_provider = AgentProvider.init(allocator, mock.interface(), config);

    var agent = Agent.init(allocator, .{}).withProvider(agent_provider);
    defer agent.deinit();

    agent.on_event = struct {
        fn callback(_: AgentEvent) void {}
    }.callback;

    try agent.prompt(Message.user("Test"));

    try std.testing.expect(agent.messageCount() >= 2); // user + assistant
    try std.testing.expectEqual(@as(u32, 1), agent.current_turn);
}
