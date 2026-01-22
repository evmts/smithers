// God-TUI E2E Integration Tests (Phase 12.5)
// Tests full integration flow between CLI, Config, Agent, and Modes

const std = @import("std");
const Allocator = std.mem.Allocator;

const agent = @import("agent");
const Agent = agent.Agent;
const AgentConfig = agent.AgentConfig;
const AgentEvent = agent.AgentEvent;
const Message = agent.Message;
const ToolRegistry = agent.ToolRegistry;
const ToolResult = agent.ToolResult;
const ToolParams = agent.tools.ToolParams;
const MockProvider = agent.MockProvider;
const AgentProvider = agent.AgentProvider;
const ProviderConfig = agent.ProviderConfig;
const provider = agent.provider;

const config_mod = @import("config");
const GlobalConfig = config_mod.GlobalConfig;
const ThinkingLevel = config_mod.ThinkingLevel;

const print_mode = @import("print_mode");
const PrintMode = print_mode.PrintMode;

// ============ CLI Config Integration Tests ============

test "CLI config builds with correct defaults" {
    const allocator = std.testing.allocator;
    var global = GlobalConfig.init(allocator);
    defer global.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4", global.model);
    try std.testing.expectEqual(ThinkingLevel.medium, global.thinking_level);
    try std.testing.expectEqual(@as(u32, 100), global.max_turns);
    try std.testing.expect(global.color);
}

test "GlobalConfig translates to AgentConfig" {
    const allocator = std.testing.allocator;
    var global = GlobalConfig.init(allocator);
    defer global.deinit();

    const agent_config = AgentConfig{
        .model = global.model,
        .max_turns = global.max_turns,
    };

    try std.testing.expectEqualStrings("claude-sonnet-4", agent_config.model);
    try std.testing.expectEqual(@as(u32, 100), agent_config.max_turns);
}

test "Config JSON parsing integration" {
    const json =
        \\{
        \\  "model": "claude-opus-4",
        \\  "thinking_level": "high",
        \\  "max_turns": 50,
        \\  "color": false
        \\}
    ;

    const config = try config_mod.parseConfig(std.testing.allocator, json);
    try std.testing.expectEqualStrings("claude-opus-4", config.model);
    try std.testing.expectEqual(ThinkingLevel.high, config.thinking_level);
    try std.testing.expectEqual(@as(u32, 50), config.max_turns);
    try std.testing.expect(!config.color);
}

// ============ Agent + Tool Registry Integration Tests ============

test "Agent initializes with builtin tool registry" {
    const allocator = std.testing.allocator;
    var agent_inst = Agent.init(allocator, .{});
    defer agent_inst.deinit();

    try std.testing.expect(agent_inst.tool_registry.count() >= 7);
    try std.testing.expect(agent_inst.tool_registry.get("read_file") != null);
    try std.testing.expect(agent_inst.tool_registry.get("write_file") != null);
    try std.testing.expect(agent_inst.tool_registry.get("edit_file") != null);
    try std.testing.expect(agent_inst.tool_registry.get("bash") != null);
    try std.testing.expect(agent_inst.tool_registry.get("glob") != null);
    try std.testing.expect(agent_inst.tool_registry.get("grep") != null);
    try std.testing.expect(agent_inst.tool_registry.get("list_dir") != null);
}

test "Agent executes tool via registry" {
    const allocator = std.testing.allocator;
    var registry = ToolRegistry.init(allocator);
    defer registry.deinit();

    registry.register(.{
        .name = "test_tool",
        .description = "A test tool for e2e",
        .execute = struct {
            fn exec(_: ToolParams) ToolResult {
                return ToolResult.ok("e2e test result");
            }
        }.exec,
    });

    const result = registry.execute("test_tool", .null);
    try std.testing.expect(result.success);
    try std.testing.expectEqualStrings("e2e test result", result.content);

    const unknown = registry.execute("unknown_tool", .null);
    try std.testing.expect(!unknown.success);
    try std.testing.expectEqualStrings("Unknown tool", unknown.error_message.?);
}

test "Agent with mock provider streams response" {
    const allocator = std.testing.allocator;

    var mock = try provider.createMockWithResponse(allocator, "Hello from E2E mock");
    defer mock.deinit();

    const prov_config = ProviderConfig{};
    const agent_provider = AgentProvider.init(allocator, mock.interface(), prov_config);

    var agent_inst = Agent.init(allocator, .{}).withProvider(agent_provider);
    defer agent_inst.deinit();

    agent_inst.on_event = struct {
        fn callback(_: AgentEvent) void {}
    }.callback;

    try agent_inst.prompt(Message.user("Test prompt"));

    try std.testing.expect(agent_inst.messageCount() >= 2);
    try std.testing.expectEqual(@as(u32, 1), agent_inst.current_turn);
}

// ============ PrintMode + Agent Integration Tests ============

test "PrintMode uses Agent correctly" {
    const allocator = std.testing.allocator;

    var agent_inst = Agent.init(allocator, .{ .max_turns = 5 });
    defer agent_inst.deinit();

    var mode = PrintMode.init(allocator, &agent_inst);
    defer mode.deinit();

    try std.testing.expect(!mode.owns_agent);
    try std.testing.expectEqual(&agent_inst, mode.agent);
    try std.testing.expectEqual(@as(u32, 5), mode.agent.config.max_turns);
}

test "PrintMode initWithConfig creates configured agent" {
    const allocator = std.testing.allocator;

    const agent_config = AgentConfig{
        .model = "test-model",
        .max_turns = 10,
        .system_prompt = "You are a test assistant",
    };

    var mode = try PrintMode.initWithConfig(allocator, agent_config);
    defer mode.deinit();

    try std.testing.expect(mode.owns_agent);
    try std.testing.expectEqualStrings("test-model", mode.agent.config.model);
    try std.testing.expectEqual(@as(u32, 10), mode.agent.config.max_turns);
    try std.testing.expectEqualStrings("You are a test assistant", mode.agent.config.system_prompt.?);
}

test "PrintMode with MockProvider flows correctly" {
    const allocator = std.testing.allocator;

    var mock = try provider.createMockWithResponse(allocator, "Mock LLM Response");
    defer mock.deinit();

    const prov_config = ProviderConfig{};
    const agent_provider = AgentProvider.init(allocator, mock.interface(), prov_config);

    var agent_inst = Agent.init(allocator, .{}).withProvider(agent_provider);
    defer agent_inst.deinit();

    var mode = PrintMode.init(allocator, &agent_inst);
    defer mode.deinit();

    try std.testing.expect(mode.agent.llm_provider != null);
}

// ============ Event Flow Integration Tests ============

test "Agent events propagate correctly" {
    const allocator = std.testing.allocator;

    const State = struct {
        var turn_started: bool = false;
        var turn_ended: bool = false;
        var agent_ended: bool = false;
    };

    State.turn_started = false;
    State.turn_ended = false;
    State.agent_ended = false;

    var agent_inst = Agent.init(allocator, .{});
    defer agent_inst.deinit();

    agent_inst.on_event = struct {
        fn callback(event: AgentEvent) void {
            switch (event.type) {
                .turn_start => State.turn_started = true,
                .turn_end => State.turn_ended = true,
                .agent_end => State.agent_ended = true,
                else => {},
            }
        }
    }.callback;

    try agent_inst.prompt(Message.user("Test event flow"));

    try std.testing.expect(State.turn_started);
    try std.testing.expect(State.turn_ended);
    try std.testing.expect(State.agent_ended);
}

test "Agent steering queue integration" {
    const allocator = std.testing.allocator;

    var agent_inst = Agent.init(allocator, .{});
    defer agent_inst.deinit();

    agent_inst.steer(Message.user("Priority message 1"));
    agent_inst.steer(Message.user("Priority message 2"));

    try std.testing.expectEqual(@as(usize, 2), agent_inst.steering_queue.items.len);

    try agent_inst.prompt(Message.user("Normal message"));

    try std.testing.expectEqual(@as(usize, 1), agent_inst.steering_queue.items.len);
}

test "Agent follow-up queue integration" {
    const allocator = std.testing.allocator;

    var agent_inst = Agent.init(allocator, .{});
    defer agent_inst.deinit();

    agent_inst.followUp(Message.user("Follow-up 1"));
    agent_inst.followUp(Message.user("Follow-up 2"));

    try std.testing.expectEqual(@as(usize, 2), agent_inst.follow_up_queue.items.len);

    try agent_inst.prompt(Message.user("Initial message"));

    try std.testing.expectEqual(@as(usize, 0), agent_inst.follow_up_queue.items.len);
}

// ============ Full Flow Integration Test ============

test "Full E2E: Config → Agent → PrintMode" {
    const allocator = std.testing.allocator;

    var global = GlobalConfig.init(allocator);
    defer global.deinit();

    const agent_config = AgentConfig{
        .model = global.model,
        .max_turns = global.max_turns,
    };

    var mock = try provider.createMockWithResponse(allocator, "Full flow response");
    defer mock.deinit();

    const prov_config = ProviderConfig{};
    const agent_provider = AgentProvider.init(allocator, mock.interface(), prov_config);

    var agent_inst = Agent.init(allocator, agent_config).withProvider(agent_provider);
    defer agent_inst.deinit();

    var mode = PrintMode.init(allocator, &agent_inst);
    defer mode.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4", mode.agent.config.model);
    try std.testing.expectEqual(@as(u32, 100), mode.agent.config.max_turns);
    try std.testing.expect(mode.agent.llm_provider != null);
    try std.testing.expect(mode.agent.tool_registry.count() >= 7);
}

test "Max turns enforced in agent loop" {
    const allocator = std.testing.allocator;

    var agent_inst = Agent.init(allocator, .{ .max_turns = 0 });
    defer agent_inst.deinit();

    agent_inst.on_event = struct {
        fn callback(_: AgentEvent) void {}
    }.callback;

    try agent_inst.prompt(Message.user("Should hit max turns"));

    try std.testing.expectEqual(@as(u32, 0), agent_inst.current_turn);
}
