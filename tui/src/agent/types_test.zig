const std = @import("std");
const types = @import("types.zig");
const Message = types.Message;
const Role = types.Role;

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
