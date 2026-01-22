// Extension System per God-TUI spec §11
// Plugin architecture for extending agent functionality

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

// ============ Event Types ============

pub const EventType = enum {
    session_start,
    session_before_switch,
    session_switch,
    session_before_fork,
    session_fork,
    session_before_compact,
    session_compact,
    session_before_tree,
    session_tree,
    session_shutdown,
    input,
    before_agent_start,
    agent_start,
    agent_end,
    context,
    turn_start,
    turn_end,
    tool_call,
    tool_result,
    model_select,
    user_bash,
};

// ============ Event Payload ============

pub const Event = struct {
    type: EventType,
    data: ?*anyopaque = null,

    pub fn getData(self: *const Event, comptime T: type) ?*T {
        if (self.data) |d| {
            return @ptrCast(@alignCast(d));
        }
        return null;
    }
};

// ============ Event Result ============

pub const EventResult = struct {
    cancel: bool = false,
    modified_data: ?*anyopaque = null,
};

// ============ Tool Definition ============

pub const ToolExecuteFn = *const fn (
    id: []const u8,
    params: []const u8, // JSON
    ctx: *ExtensionContext,
) ToolResult;

pub const ToolRenderCallFn = *const fn (
    args: []const u8,
    allocator: Allocator,
) [][]const u8;

pub const ToolRenderResultFn = *const fn (
    result: []const u8,
    allocator: Allocator,
) [][]const u8;

pub const ToolDefinition = struct {
    name: []const u8,
    label: ?[]const u8 = null,
    description: []const u8,
    parameters: []const u8, // JSON Schema
    execute: ToolExecuteFn,
    render_call: ?ToolRenderCallFn = null,
    render_result: ?ToolRenderResultFn = null,
};

pub const ToolResult = struct {
    content: []const u8, // JSON array of content blocks
    is_error: bool = false,
};

// ============ Command Definition ============

pub const CommandHandler = *const fn (args: []const u8, ctx: *ExtensionContext) void;
pub const CompletionFn = *const fn (prefix: []const u8, allocator: Allocator) []CompletionItem;

pub const CommandOptions = struct {
    description: []const u8,
    handler: CommandHandler,
    get_completions: ?CompletionFn = null,
};

pub const CompletionItem = struct {
    value: []const u8,
    label: []const u8,
    description: ?[]const u8 = null,
};

// ============ Shortcut Definition ============

pub const ShortcutHandler = *const fn (ctx: *ExtensionContext) void;

pub const ShortcutOptions = struct {
    description: []const u8,
    handler: ShortcutHandler,
};

// ============ Flag Definition ============

pub const FlagType = enum {
    boolean,
    string,
};

pub const FlagOptions = struct {
    description: []const u8,
    flag_type: FlagType = .boolean,
    default_value: ?[]const u8 = null,
};

// ============ Extension Context ============

pub const ExtensionContext = struct {
    cwd: []const u8,
    session_file: ?[]const u8 = null,
    allocator: Allocator,

    // UI callbacks (set at runtime)
    ui_notify: ?*const fn (message: []const u8, level: NotifyLevel) void = null,
    ui_confirm: ?*const fn (title: []const u8, message: []const u8) bool = null,
    ui_select: ?*const fn (title: []const u8, items: []const []const u8) ?[]const u8 = null,
    ui_input: ?*const fn (prompt: []const u8) ?[]const u8 = null,

    pub fn notify(self: *ExtensionContext, message: []const u8, level: NotifyLevel) void {
        if (self.ui_notify) |f| f(message, level);
    }

    pub fn confirm(self: *ExtensionContext, title: []const u8, message: []const u8) bool {
        if (self.ui_confirm) |f| return f(title, message);
        return false;
    }

    pub fn select(self: *ExtensionContext, title: []const u8, items: []const []const u8) ?[]const u8 {
        if (self.ui_select) |f| return f(title, items);
        return null;
    }

    pub fn input(self: *ExtensionContext, prompt: []const u8) ?[]const u8 {
        if (self.ui_input) |f| return f(prompt);
        return null;
    }
};

pub const NotifyLevel = enum {
    info,
    warning,
    @"error",
    success,
};

// ============ Event Handler ============

pub const EventHandler = *const fn (event: *const Event, ctx: *ExtensionContext) EventResult;

// ============ Extension API ============

pub const ExtensionAPI = struct {
    handlers: std.AutoHashMapUnmanaged(EventType, ArrayListUnmanaged(EventHandler)),
    tools: ArrayListUnmanaged(ToolDefinition),
    commands: std.StringHashMapUnmanaged(CommandOptions),
    shortcuts: std.StringHashMapUnmanaged(ShortcutOptions),
    flags: std.StringHashMapUnmanaged(FlagOptions),
    flag_values: std.StringHashMapUnmanaged([]const u8),
    allocator: Allocator,
    ctx: ExtensionContext,

    const Self = @This();

    pub fn init(allocator: Allocator, cwd: []const u8) Self {
        return .{
            .handlers = .{},
            .tools = .{},
            .commands = .{},
            .shortcuts = .{},
            .flags = .{},
            .flag_values = .{},
            .allocator = allocator,
            .ctx = .{
                .cwd = cwd,
                .allocator = allocator,
            },
        };
    }

    pub fn deinit(self: *Self) void {
        var handler_it = self.handlers.iterator();
        while (handler_it.next()) |entry| {
            entry.value_ptr.deinit(self.allocator);
        }
        self.handlers.deinit(self.allocator);
        self.tools.deinit(self.allocator);
        self.commands.deinit(self.allocator);
        self.shortcuts.deinit(self.allocator);
        self.flags.deinit(self.allocator);
        self.flag_values.deinit(self.allocator);
    }

    // === Event Subscription ===

    pub fn on(self: *Self, event_type: EventType, handler: EventHandler) !void {
        const entry = try self.handlers.getOrPut(self.allocator, event_type);
        if (!entry.found_existing) {
            entry.value_ptr.* = .{};
        }
        try entry.value_ptr.append(self.allocator, handler);
    }

    pub fn emit(self: *Self, event: *const Event) EventResult {
        var result = EventResult{};

        if (self.handlers.get(event.type)) |handlers| {
            for (handlers.items) |handler| {
                const handler_result = handler(event, &self.ctx);
                if (handler_result.cancel) {
                    result.cancel = true;
                    break;
                }
                if (handler_result.modified_data != null) {
                    result.modified_data = handler_result.modified_data;
                }
            }
        }

        return result;
    }

    // === Tool Registration ===

    pub fn registerTool(self: *Self, tool: ToolDefinition) !void {
        try self.tools.append(self.allocator, tool);
    }

    pub fn getTools(self: *const Self) []const ToolDefinition {
        return self.tools.items;
    }

    // === Command Registration ===

    pub fn registerCommand(self: *Self, name: []const u8, options: CommandOptions) !void {
        try self.commands.put(self.allocator, name, options);
    }

    pub fn getCommand(self: *const Self, name: []const u8) ?CommandOptions {
        return self.commands.get(name);
    }

    // === Shortcut Registration ===

    pub fn registerShortcut(self: *Self, key: []const u8, options: ShortcutOptions) !void {
        try self.shortcuts.put(self.allocator, key, options);
    }

    pub fn getShortcut(self: *const Self, key: []const u8) ?ShortcutOptions {
        return self.shortcuts.get(key);
    }

    // === Flag Registration ===

    pub fn registerFlag(self: *Self, name: []const u8, options: FlagOptions) !void {
        try self.flags.put(self.allocator, name, options);
    }

    pub fn getFlag(self: *const Self, name: []const u8) ?[]const u8 {
        return self.flag_values.get(name);
    }

    pub fn setFlag(self: *Self, name: []const u8, value: []const u8) !void {
        try self.flag_values.put(self.allocator, name, value);
    }
};

// ============ Extension Runner ============

pub const ExtensionRunner = struct {
    extensions: ArrayListUnmanaged(*ExtensionAPI),
    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
        return .{
            .extensions = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        for (self.extensions.items) |ext| {
            ext.deinit();
            self.allocator.destroy(ext);
        }
        self.extensions.deinit(self.allocator);
    }

    pub fn register(self: *Self, extension: *ExtensionAPI) !void {
        try self.extensions.append(self.allocator, extension);
    }

    pub fn emit(self: *Self, event: *const Event) EventResult {
        var result = EventResult{};

        for (self.extensions.items) |ext| {
            const ext_result = ext.emit(event);
            if (ext_result.cancel) {
                result.cancel = true;
                break;
            }
            if (ext_result.modified_data != null) {
                result.modified_data = ext_result.modified_data;
            }
        }

        return result;
    }

    pub fn getAllTools(self: *const Self) ![]ToolDefinition {
        var all_tools = ArrayListUnmanaged(ToolDefinition){};
        for (self.extensions.items) |ext| {
            try all_tools.appendSlice(self.allocator, ext.tools.items);
        }
        return all_tools.toOwnedSlice(self.allocator);
    }
};

// ============ Inter-Extension Event Bus ============

pub const EventBus = struct {
    subscribers: std.StringHashMapUnmanaged(ArrayListUnmanaged(BusHandler)),
    allocator: Allocator,

    pub const BusHandler = *const fn (data: ?*anyopaque) void;

    pub fn init(allocator: Allocator) EventBus {
        return .{
            .subscribers = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *EventBus) void {
        var it = self.subscribers.iterator();
        while (it.next()) |entry| {
            entry.value_ptr.deinit(self.allocator);
        }
        self.subscribers.deinit(self.allocator);
    }

    pub fn subscribe(self: *EventBus, channel: []const u8, handler: BusHandler) !void {
        const entry = try self.subscribers.getOrPut(self.allocator, channel);
        if (!entry.found_existing) {
            entry.value_ptr.* = .{};
        }
        try entry.value_ptr.append(self.allocator, handler);
    }

    pub fn publish(self: *EventBus, channel: []const u8, data: ?*anyopaque) void {
        if (self.subscribers.get(channel)) |handlers| {
            for (handlers.items) |handler| {
                handler(data);
            }
        }
    }
};

// ============ Tests ============

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

    // Test registration
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

test "EventBus pub/sub" {
    const allocator = std.testing.allocator;
    var bus = EventBus.init(allocator);
    defer bus.deinit();

    try bus.subscribe("test_channel", struct {
        fn dummy(_: ?*anyopaque) void {}
    }.dummy);

    bus.publish("test_channel", null);
    // Handler registered and publish called without crash
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

    // Without callbacks set, methods should be no-ops
    ctx.notify("test", .info);
    try std.testing.expect(!ctx.confirm("title", "msg"));
    try std.testing.expect(ctx.select("title", &[_][]const u8{}) == null);
    try std.testing.expect(ctx.input("prompt") == null);
}
