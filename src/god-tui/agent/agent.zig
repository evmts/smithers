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
pub const ToolCallInfo = types.ToolCallInfo;

pub const tools = @import("tools/registry.zig");
pub const ToolRegistry = tools.ToolRegistry;
pub const ToolResult = tools.ToolResult;

pub const provider = @import("provider.zig");
pub const ProviderInterface = provider.ProviderInterface;
pub const MockProvider = provider.MockProvider;
pub const AgentProvider = provider.AgentProvider;
pub const ProviderConfig = provider.ProviderConfig;

// Anthropic provider (real LLM calls via ai-zig)
pub const anthropic_provider = @import("anthropic_provider.zig");
pub const AnthropicProvider = anthropic_provider.AnthropicProvider;
pub const createAnthropicProvider = anthropic_provider.createAnthropicProvider;
pub const createAnthropicProviderWithKey = anthropic_provider.createAnthropicProviderWithKey;
pub const getDefaultModel = anthropic_provider.getDefaultModel;

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
    owned_strings: ArrayListUnmanaged([]const u8) = .{},
    owned_tool_call_slices: ArrayListUnmanaged([]const ToolCallInfo) = .{},

    const Self = @This();

    pub fn init(allocator: Allocator, config: AgentConfig) Self {
        return .{
            .allocator = allocator,
            .messages = .{},
            .config = config,
            .steering_queue = .{},
            .follow_up_queue = .{},
            .tool_registry = ToolRegistry.initBuiltin(allocator),
            .owned_strings = .{},
            .owned_tool_call_slices = .{},
        };
    }

    pub fn withProvider(self: Self, llm_provider: AgentProvider) Self {
        var agent = self;
        agent.llm_provider = llm_provider;
        return agent;
    }

    pub fn deinit(self: *Self) void {
        // Free owned response strings
        for (self.owned_strings.items) |s| {
            self.allocator.free(s);
        }
        self.owned_strings.deinit(self.allocator);
        // Free owned tool call slices
        for (self.owned_tool_call_slices.items) |s| {
            self.allocator.free(s);
        }
        self.owned_tool_call_slices.deinit(self.allocator);
        self.messages.deinit(self.allocator);
        self.steering_queue.deinit(self.allocator);
        self.follow_up_queue.deinit(self.allocator);
        self.tool_registry.deinit();
    }

    const ProviderResponse = struct {
        text: []const u8,
        tool_calls: []const ToolCallInfo,
        stop_reason: provider.StopReason,
    };

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
            const response = try self.callProvider();
            const response_msg = if (response.tool_calls.len > 0)
                Message.assistantWithToolCalls(response.text, response.tool_calls)
            else
                Message.assistant(response.text);
            try self.messages.append(self.allocator, response_msg);

            self.emitEvent(.{ .type = .turn_end, .turn = self.current_turn });

            // Handle tool calls if present
            if (response.stop_reason == .tool_use and response.tool_calls.len > 0) {
                for (response.tool_calls) |tc| {
                    self.emitEvent(.{ .type = .tool_start, .tool_name = tc.name, .tool_id = tc.id });

                    // Parse tool arguments and execute
                    const parsed_args = std.json.parseFromSlice(std.json.Value, self.allocator, tc.arguments, .{}) catch {
                        const err_result = Message.toolResult(tc.id, "Failed to parse tool arguments");
                        try self.messages.append(self.allocator, err_result);
                        self.emitEvent(.{ .type = .tool_end, .tool_name = tc.name, .tool_id = tc.id });
                        continue;
                    };
                    defer parsed_args.deinit();

                    const tool_result = self.tool_registry.execute(tc.name, parsed_args.value);
                    const result_content = if (tool_result.success) tool_result.content else (tool_result.error_message orelse "Tool error");

                    const result_msg = Message.toolResult(tc.id, result_content);
                    try self.messages.append(self.allocator, result_msg);
                    self.emitEvent(.{ .type = .tool_end, .tool_name = tc.name, .tool_id = tc.id });
                }
                // Continue loop to get LLM response to tool results
                continue;
            }

            // No tool calls - done
            break;
        }

        // Process follow-up queue after main loop
        while (self.follow_up_queue.items.len > 0) {
            const follow_up = self.follow_up_queue.pop().?;
            try self.messages.append(self.allocator, follow_up);
        }

        self.emitEvent(.{ .type = .agent_end });
    }

    fn callProvider(self: *Self) !ProviderResponse {
        if (self.llm_provider) |*llm| {
            var ctx = provider.Context.init(self.allocator);
            defer ctx.deinit();

            // Build context from messages
            if (self.config.system_prompt) |sys| {
                ctx.system_prompt = sys;
            }

            // Copy agent messages to context
            for (self.messages.items) |msg| {
                try ctx.messages.append(self.allocator, msg);
            }

            // Stream from provider
            var stream = try llm.stream(&ctx);
            defer stream.deinit();

            var response_parts = std.ArrayListUnmanaged(u8){};
            var tool_calls = std.ArrayListUnmanaged(ToolCallInfo){};
            var stop_reason: provider.StopReason = .stop;

            while (stream.next()) |event| {
                switch (event.type) {
                    .text_delta => {
                        if (event.delta) |delta| {
                            self.emitEvent(.{ .type = .text_delta, .text = delta });
                            response_parts.appendSlice(self.allocator, delta) catch {};
                        }
                    },
                    .toolcall_end => {
                        if (event.tool_call) |tc| {
                            // Duplicate tool call strings since they're owned by the stream
                            const id_copy = self.allocator.dupe(u8, tc.id) catch continue;
                            const name_copy = self.allocator.dupe(u8, tc.name) catch continue;
                            const args_copy = self.allocator.dupe(u8, tc.arguments) catch continue;
                            self.owned_strings.append(self.allocator, id_copy) catch {};
                            self.owned_strings.append(self.allocator, name_copy) catch {};
                            self.owned_strings.append(self.allocator, args_copy) catch {};
                            tool_calls.append(self.allocator, .{
                                .id = id_copy,
                                .name = name_copy,
                                .arguments = args_copy,
                            }) catch {};
                        }
                    },
                    .done => {
                        stop_reason = event.reason orelse .stop;
                    },
                    .@"error" => {
                        if (event.content) |content| {
                            self.emitEvent(.{ .type = .agent_error, .error_message = content });
                        }
                    },
                    else => {},
                }
            }

            const text = if (response_parts.items.len > 0) blk: {
                const owned = response_parts.toOwnedSlice(self.allocator) catch {
                    response_parts.deinit(self.allocator);
                    break :blk "";
                };
                self.owned_strings.append(self.allocator, owned) catch {};
                break :blk owned;
            } else "";

            const owned_tool_calls = tool_calls.toOwnedSlice(self.allocator) catch &.{};
            if (owned_tool_calls.len > 0) {
                self.owned_tool_call_slices.append(self.allocator, owned_tool_calls) catch {};
            }
            return .{
                .text = text,
                .tool_calls = owned_tool_calls,
                .stop_reason = stop_reason,
            };
        }
        return .{ .text = "Response from LLM", .tool_calls = &.{}, .stop_reason = .stop };
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
