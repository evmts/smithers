const std = @import("std");
const agent = @import("agent.zig");
const Agent = agent.Agent;
const AgentState = agent.AgentState;
const AgentResponse = agent.AgentResponse;
const types = @import("types.zig");
const Message = types.Message;

test "Agent init" {
    const allocator = std.testing.allocator;
    var a = Agent.init(allocator, .{});
    defer a.deinit();

    try std.testing.expectEqual(AgentState.idle, a.state);
    try std.testing.expect(!a.hasProvider());
    try std.testing.expectEqual(@as(usize, 0), a.messageCount());
}

test "Agent tool registry initialized" {
    const allocator = std.testing.allocator;
    var a = Agent.init(allocator, .{});
    defer a.deinit();

    try std.testing.expect(a.tool_registry.get("bash") != null);
    try std.testing.expect(a.tool_registry.get("read_file") != null);
    try std.testing.expect(a.tool_registry.get("write_file") != null);
}

test "Agent clearHistory" {
    const allocator = std.testing.allocator;
    var a = Agent.init(allocator, .{});
    defer a.deinit();

    try a.context.messages.append(allocator, Message.user("test"));
    try std.testing.expectEqual(@as(usize, 1), a.messageCount());

    a.clearHistory();
    try std.testing.expectEqual(@as(usize, 0), a.messageCount());
}

test "AgentResponse text handling" {
    const allocator = std.testing.allocator;
    var resp = AgentResponse.init(allocator);
    defer resp.deinit();

    try resp.appendText("Hello ");
    try resp.appendText("World");

    try std.testing.expectEqualStrings("Hello World", resp.getText());
}
