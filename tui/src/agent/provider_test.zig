const std = @import("std");
const provider = @import("provider.zig");
const ProviderConfig = provider.ProviderConfig;
const AgentProvider = provider.AgentProvider;
const MockProvider = provider.MockProvider;
const ThinkingLevel = provider.ThinkingLevel;
const StreamEvent = provider.StreamEvent;
const SimpleEvent = provider.SimpleEvent;
const Context = provider.Context;
const Model = provider.Model;
const InputType = provider.InputType;
const createMockWithResponse = provider.createMockWithResponse;

test "ProviderConfig defaults" {
    const config = ProviderConfig{};
    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", config.model_id);
    try std.testing.expect(config.api_key == null);
    try std.testing.expectEqual(ThinkingLevel.off, config.thinking);
}

test "AgentProvider init" {
    const allocator = std.testing.allocator;
    var mock = MockProvider.init(allocator);
    defer mock.deinit();

    const config = ProviderConfig{};
    const agent_provider = AgentProvider.init(allocator, mock.interface(), config);

    const model = agent_provider.getModel();
    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", model.id);
}

test "SimpleEvent fromStreamEvent" {
    const text_event = StreamEvent{ .type = .text_delta, .delta = "Hello" };
    const simple = SimpleEvent.fromStreamEvent(text_event);
    try std.testing.expect(simple != null);
    switch (simple.?) {
        .text => |t| try std.testing.expectEqualStrings("Hello", t),
        else => return error.UnexpectedEvent,
    }

    const done_event = StreamEvent{ .type = .done, .reason = .stop };
    const simple_done = SimpleEvent.fromStreamEvent(done_event);
    try std.testing.expect(simple_done != null);
    switch (simple_done.?) {
        .done => {},
        else => return error.UnexpectedEvent,
    }

    const start_event = StreamEvent{ .type = .start };
    try std.testing.expect(SimpleEvent.fromStreamEvent(start_event) == null);
}

test "createMockWithResponse" {
    const allocator = std.testing.allocator;
    var mock = try createMockWithResponse(allocator, "Test response");
    defer mock.deinit();

    var ctx = Context.init(allocator);
    defer ctx.deinit();

    const model = Model{
        .id = "test",
        .name = "Test",
        .api = .anthropic_messages,
        .provider = .anthropic,
        .base_url = "",
        .input = &[_]InputType{.text},
        .cost_input = 0,
        .cost_output = 0,
        .cost_cache_read = 0,
        .cost_cache_write = 0,
        .context_window = 100000,
        .max_tokens = 4096,
    };

    var strm = try mock.interface().stream(model, &ctx, .{}, allocator);
    defer strm.deinit();

    _ = strm.next(); // start
    const text_ev = strm.next();
    try std.testing.expect(text_ev != null);
    try std.testing.expectEqualStrings("Test response", text_ev.?.delta.?);
}
