const std = @import("std");
const extension = @import("extension.zig");

const ExtensionAPI = extension.ExtensionAPI;
const ExtensionContext = extension.ExtensionContext;
const ExtensionRunner = extension.ExtensionRunner;
const EventBus = extension.EventBus;
const Event = extension.Event;
const EventResult = extension.EventResult;
const ToolResult = extension.ToolResult;

test "ExtensionAPI init/deinit" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    try std.testing.expectEqual(@as(usize, 0), api.tools.items.len);
}

test "ExtensionAPI event handlers" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    try api.on(.session_start, struct {
        fn dummy(_: *const Event, _: *ExtensionContext) EventResult {
            return .{};
        }
    }.dummy);

    const handlers = api.handlers.get(.session_start);
    try std.testing.expect(handlers != null);
    try std.testing.expectEqual(@as(usize, 1), handlers.?.items.len);
}

test "ExtensionAPI tool registration" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    const dummy_execute = struct {
        fn f(_: []const u8, _: []const u8, _: *ExtensionContext) ToolResult {
            return .{ .content = "[]" };
        }
    }.f;

    try api.registerTool(.{
        .name = "test_tool",
        .description = "A test tool",
        .parameters = "{}",
        .execute = dummy_execute,
    });

    try std.testing.expectEqual(@as(usize, 1), api.tools.items.len);
    try std.testing.expectEqualStrings("test_tool", api.tools.items[0].name);
}

test "ExtensionAPI command registration" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    const dummy_handler = struct {
        fn f(_: []const u8, _: *ExtensionContext) void {}
    }.f;

    try api.registerCommand("test", .{
        .description = "Test command",
        .handler = dummy_handler,
    });

    const cmd = api.getCommand("test");
    try std.testing.expect(cmd != null);
    try std.testing.expectEqualStrings("Test command", cmd.?.description);
}

test "ExtensionAPI shortcut registration" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    const dummy_handler = struct {
        fn f(_: *ExtensionContext) void {}
    }.f;

    try api.registerShortcut("ctrl+k", .{
        .description = "Kill line",
        .handler = dummy_handler,
    });

    const shortcut = api.getShortcut("ctrl+k");
    try std.testing.expect(shortcut != null);
    try std.testing.expectEqualStrings("Kill line", shortcut.?.description);
}

test "ExtensionAPI flag registration" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    try api.registerFlag("verbose", .{
        .description = "Verbose output",
        .flag_type = .boolean,
    });

    try api.setFlag("verbose", "true");

    const value = api.getFlag("verbose");
    try std.testing.expect(value != null);
    try std.testing.expectEqualStrings("true", value.?);
}

test "ExtensionAPI emit with cancel" {
    const allocator = std.testing.allocator;
    var api = ExtensionAPI.init(allocator, "/home/user");
    defer api.deinit();

    try api.on(.session_start, struct {
        fn handler(_: *const Event, _: *ExtensionContext) EventResult {
            return .{ .cancel = true };
        }
    }.handler);

    try api.on(.session_start, struct {
        fn handler(_: *const Event, _: *ExtensionContext) EventResult {
            return .{};
        }
    }.handler);

    const event = Event{ .type = .session_start };
    const result = api.emit(&event);
    try std.testing.expect(result.cancel);
}

test "EventBus pub/sub" {
    const allocator = std.testing.allocator;
    var bus = EventBus.init(allocator);
    defer bus.deinit();

    try bus.subscribe("test_channel", struct {
        fn dummy(_: ?*anyopaque) void {}
    }.dummy);

    bus.publish("test_channel", null);
}

test "ExtensionRunner" {
    const allocator = std.testing.allocator;
    var runner = ExtensionRunner.init(allocator);
    defer runner.deinit();

    try std.testing.expectEqual(@as(usize, 0), runner.extensions.items.len);
}

test "ExtensionContext UI callbacks" {
    var ctx = ExtensionContext{
        .cwd = "/home/user",
        .allocator = std.testing.allocator,
    };

    ctx.notify("test", .info);
    try std.testing.expect(!ctx.confirm("title", "msg"));
    try std.testing.expect(ctx.select("title", &[_][]const u8{}) == null);
    try std.testing.expect(ctx.input("prompt") == null);
}

test "Event.getData" {
    var data: u32 = 42;
    var event = Event{
        .type = .tool_call,
    };
    event.setData(u32, &data);

    const retrieved = event.getData(u32);
    try std.testing.expect(retrieved != null);
    try std.testing.expectEqual(@as(u32, 42), retrieved.?.*);
}

test "Event.getData returns null for wrong type" {
    var data: u32 = 42;
    var event = Event{
        .type = .tool_call,
    };
    event.setData(u32, &data);

    const retrieved = event.getData(i64);
    try std.testing.expect(retrieved == null);
}
