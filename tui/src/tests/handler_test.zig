const std = @import("std");
const handler = @import("../keys/handler.zig");

// Test Action enum
test "Action enum has expected variants" {
    const action_none: handler.Action = .none;
    const action_exit: handler.Action = .exit;
    const action_suspend: handler.Action = .suspend_tui;
    const action_redraw: handler.Action = .redraw;
    const action_reload: handler.Action = .reload_chat;
    const action_query: handler.Action = .start_ai_query;

    try std.testing.expect(action_none == .none);
    try std.testing.expect(action_exit == .exit);
    try std.testing.expect(action_suspend == .suspend_tui);
    try std.testing.expect(action_redraw == .redraw);
    try std.testing.expect(action_reload == .reload_chat);
    try std.testing.expect(action_query == .start_ai_query);
}

test "Action variants are distinct" {
    const actions = [_]handler.Action{
        .none,
        .exit,
        .suspend_tui,
        .redraw,
        .reload_chat,
        .start_ai_query,
    };

    for (actions, 0..) |a, i| {
        for (actions, 0..) |b, j| {
            if (i == j) {
                try std.testing.expect(std.meta.eql(a, b));
            } else {
                try std.testing.expect(!std.meta.eql(a, b));
            }
        }
    }
}

test "start_ai_query is a simple tag" {
    const action: handler.Action = .start_ai_query;

    switch (action) {
        .start_ai_query => {},
        else => try std.testing.expect(false),
    }
}

test "Action switch exhaustive" {
    const action: handler.Action = .none;

    const result: u8 = switch (action) {
        .none => 0,
        .exit => 1,
        .suspend_tui => 2,
        .redraw => 3,
        .reload_chat => 4,
        .start_ai_query => 5,
    };

    try std.testing.expectEqual(@as(u8, 0), result);
}

test "Action memory size is reasonable" {
    // Action is now a simple enum with no payload
    try std.testing.expect(@sizeOf(handler.Action) <= 8);
}
