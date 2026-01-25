const std = @import("std");
const types = @import("types.zig");
const Message = types.Message;
const Role = types.Role;
const AgentEvent = types.AgentEvent;
const EventQueue = types.EventQueue;

test "Message creation helpers" {
    const user_msg = Message.user("hello");
    try std.testing.expectEqual(Role.user, user_msg.role);
    try std.testing.expectEqualStrings("hello", user_msg.content);
    try std.testing.expect(user_msg.tool_call_id == null);

    const asst_msg = Message.assistant("response");
    try std.testing.expectEqual(Role.assistant, asst_msg.role);

    const tool_msg = Message.toolResult("id123", "result");
    try std.testing.expectEqual(Role.tool_result, tool_msg.role);
    try std.testing.expectEqualStrings("id123", tool_msg.tool_call_id.?);
}

test "AgentEvent union types" {
    const start: AgentEvent = .agent_start;
    try std.testing.expect(start == .agent_start);

    const turn_start: AgentEvent = .{ .turn_start = 1 };
    try std.testing.expectEqual(@as(u32, 1), turn_start.turn_start);

    const msg_start: AgentEvent = .{ .message_start = .{ .message_id = 42 } };
    try std.testing.expectEqual(@as(?i64, 42), msg_start.message_start.message_id);

    const tool_start: AgentEvent = .{ .tool_start = .{
        .tool_call_id = "tc_123",
        .tool_name = "read_file",
        .args_json = "{}",
    } };
    try std.testing.expectEqualStrings("read_file", tool_start.tool_start.tool_name);

    const tool_end: AgentEvent = .{ .tool_end = .{
        .tool_call_id = "tc_123",
        .tool_name = "read_file",
        .result = "file contents",
        .is_error = false,
    } };
    try std.testing.expect(!tool_end.tool_end.is_error);

    const err: AgentEvent = .{ .agent_error = "something failed" };
    try std.testing.expectEqualStrings("something failed", err.agent_error);
}

test "EventQueue push and pop" {
    const Queue = EventQueue(8);
    var queue: Queue = .{};

    try std.testing.expect(queue.isEmpty());
    try std.testing.expectEqual(@as(usize, 0), queue.len());

    // Push events
    try std.testing.expect(queue.push(.agent_start));
    try std.testing.expect(queue.push(.{ .turn_start = 1 }));
    try std.testing.expect(queue.push(.{ .message_start = .{ .message_id = 10 } }));

    try std.testing.expect(!queue.isEmpty());
    try std.testing.expectEqual(@as(usize, 3), queue.len());

    // Pop events in FIFO order
    const e1 = queue.pop();
    try std.testing.expect(e1 != null);
    try std.testing.expect(e1.? == .agent_start);

    const e2 = queue.pop();
    try std.testing.expect(e2 != null);
    try std.testing.expectEqual(@as(u32, 1), e2.?.turn_start);

    const e3 = queue.pop();
    try std.testing.expect(e3 != null);
    try std.testing.expectEqual(@as(?i64, 10), e3.?.message_start.message_id);

    // Queue should be empty
    try std.testing.expect(queue.isEmpty());
    try std.testing.expect(queue.pop() == null);
}

test "EventQueue drainInto" {
    const Queue = EventQueue(16);
    var queue: Queue = .{};

    // Push several events
    _ = queue.push(.agent_start);
    _ = queue.push(.{ .turn_start = 1 });
    _ = queue.push(.{ .message_start = .{} });
    _ = queue.push(.{ .turn_end = .{ .turn = 1, .has_tool_calls = false } });
    _ = queue.push(.agent_end);

    try std.testing.expectEqual(@as(usize, 5), queue.len());

    // Drain into buffer
    var buffer: [10]AgentEvent = undefined;
    const count = queue.drainInto(&buffer);

    try std.testing.expectEqual(@as(usize, 5), count);
    try std.testing.expect(queue.isEmpty());

    // Verify order
    try std.testing.expect(buffer[0] == .agent_start);
    try std.testing.expectEqual(@as(u32, 1), buffer[1].turn_start);
    try std.testing.expect(buffer[2] == .message_start);
    try std.testing.expect(buffer[3] == .turn_end);
    try std.testing.expect(buffer[4] == .agent_end);
}

test "EventQueue capacity limit" {
    const Queue = EventQueue(4);
    var queue: Queue = .{};

    // Fill queue (capacity - 1 usable slots in ring buffer)
    try std.testing.expect(queue.push(.agent_start));
    try std.testing.expect(queue.push(.{ .turn_start = 1 }));
    try std.testing.expect(queue.push(.agent_end));

    // Queue full - push should fail
    try std.testing.expect(!queue.push(.agent_start));

    // Pop one, now push should succeed
    _ = queue.pop();
    try std.testing.expect(queue.push(.{ .turn_start = 2 }));
}

test "AgentEvent format" {
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    const writer = fbs.writer();

    const event: AgentEvent = .{ .tool_start = .{
        .tool_call_id = "tc_1",
        .tool_name = "bash",
        .args_json = "{}",
    } };
    try event.format("{}", .{}, writer);
    try std.testing.expectEqualStrings("tool_start(bash)", fbs.getWritten());
}
