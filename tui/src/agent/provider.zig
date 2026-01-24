// Agent Provider - self-contained provider abstraction for agent module
// Can be swapped to wrap ai-zig when imported into main executable

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

const types = @import("types.zig");
const Message = types.Message;
const AgentEvent = types.AgentEvent;
const EventType = types.EventType;

// ============ Provider Types (self-contained for testing) ============

pub const Api = enum {
    anthropic_messages,
    openai_completions,
    openai_responses,
    google_generative_ai,
    bedrock_converse,
};

pub const Provider = enum {
    anthropic,
    openai,
    google,
    bedrock,
    openrouter,
};

pub const InputType = enum {
    text,
    image,
};

pub const Model = struct {
    id: []const u8,
    name: []const u8,
    api: Api,
    provider: Provider,
    base_url: []const u8,
    reasoning: bool = false,
    input: []const InputType,
    cost_input: f64,
    cost_output: f64,
    cost_cache_read: f64,
    cost_cache_write: f64,
    context_window: u32,
    max_tokens: u32,
};

pub const ThinkingLevel = enum {
    off,
    minimal,
    low,
    medium,
    high,
    xhigh,

    pub fn toBudgetTokens(self: ThinkingLevel) u32 {
        return switch (self) {
            .off => 0,
            .minimal => 1024,
            .low => 4096,
            .medium => 16384,
            .high => 65536,
            .xhigh => 131072,
        };
    }
};

pub const StopReason = enum {
    stop,
    length,
    tool_use,
    @"error",
    aborted,
};

pub const ToolCall = struct {
    id: []const u8,
    name: []const u8,
    arguments: []const u8,
};

pub const StreamEventType = enum {
    start,
    text_start,
    text_delta,
    text_end,
    thinking_start,
    thinking_delta,
    thinking_end,
    toolcall_start,
    toolcall_delta,
    toolcall_end,
    done,
    @"error",
};

pub const StreamEvent = struct {
    type: StreamEventType,
    content_index: ?usize = null,
    delta: ?[]const u8 = null,
    content: ?[]const u8 = null,
    tool_call: ?ToolCall = null,
    reason: ?StopReason = null,
};

pub const StreamOptions = struct {
    temperature: ?f32 = null,
    max_tokens: ?u32 = null,
    thinking: ThinkingLevel = .off,
    api_key: ?[]const u8 = null,
};

pub const Context = struct {
    system_prompt: ?[]const u8 = null,
    messages: ArrayListUnmanaged(Message),
    allocator: Allocator,

    pub fn init(allocator: Allocator) Context {
        return .{
            .messages = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Context) void {
        self.messages.deinit(self.allocator);
    }
};

// ============ Provider Interface ============

pub const ProviderInterface = struct {
    ptr: *anyopaque,
    vtable: *const VTable,

    pub const VTable = struct {
        stream: *const fn (ptr: *anyopaque, model: Model, context: *const Context, options: StreamOptions, allocator: Allocator) StreamError!StreamIterator,
        deinit: ?*const fn (ptr: *anyopaque, allocator: Allocator) void = null,
    };

    pub const StreamError = error{
        NetworkError,
        AuthError,
        RateLimited,
        InvalidRequest,
        ServerError,
        Aborted,
        OutOfMemory,
    };

    pub const StreamIterator = struct {
        ptr: *anyopaque,
        next_fn: *const fn (ptr: *anyopaque) ?StreamEvent,
        deinit_fn: ?*const fn (ptr: *anyopaque) void,

        pub fn next(self: *StreamIterator) ?StreamEvent {
            return self.next_fn(self.ptr);
        }

        pub fn deinit(self: *StreamIterator) void {
            if (self.deinit_fn) |f| f(self.ptr);
        }
    };

    pub fn stream(self: ProviderInterface, model: Model, context: *const Context, options: StreamOptions, allocator: Allocator) StreamError!StreamIterator {
        return self.vtable.stream(self.ptr, model, context, options, allocator);
    }

    pub fn deinit(self: ProviderInterface, allocator: Allocator) void {
        if (self.vtable.deinit) |f| f(self.ptr, allocator);
    }
};

// ============ Mock Provider ============

pub const MockProvider = struct {
    responses: ArrayListUnmanaged(StreamEvent),
    current: usize = 0,
    allocator: Allocator,

    pub fn init(allocator: Allocator) MockProvider {
        return .{
            .responses = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *MockProvider) void {
        self.responses.deinit(self.allocator);
    }

    pub fn addResponse(self: *MockProvider, event: StreamEvent) !void {
        try self.responses.append(self.allocator, event);
    }

    pub fn interface(self: *MockProvider) ProviderInterface {
        return .{
            .ptr = self,
            .vtable = &vtable,
        };
    }

    const vtable = ProviderInterface.VTable{
        .stream = streamImpl,
    };

    fn streamImpl(ptr: *anyopaque, _: Model, _: *const Context, _: StreamOptions, _: Allocator) ProviderInterface.StreamError!ProviderInterface.StreamIterator {
        const self: *MockProvider = @ptrCast(@alignCast(ptr));
        self.current = 0;
        return .{
            .ptr = ptr,
            .next_fn = nextEvent,
            .deinit_fn = null,
        };
    }

    fn nextEvent(ptr: *anyopaque) ?StreamEvent {
        const self: *MockProvider = @ptrCast(@alignCast(ptr));
        if (self.current >= self.responses.items.len) return null;
        const event = self.responses.items[self.current];
        self.current += 1;
        return event;
    }
};

pub const ProviderConfig = struct {
    model_id: []const u8 = "claude-sonnet-4-20250514",
    api_key: ?[]const u8 = null,
    base_url: ?[]const u8 = null,
    thinking: ThinkingLevel = .off,
    max_tokens: ?u32 = null,
    temperature: ?f32 = null,
};

pub const AgentProvider = struct {
    interface: ProviderInterface,
    config: ProviderConfig,
    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator, iface: ProviderInterface, config: ProviderConfig) Self {
        return .{
            .interface = iface,
            .config = config,
            .allocator = allocator,
        };
    }

    pub fn getModel(self: Self) Model {
        _ = self;
        return .{
            .id = "claude-sonnet-4-20250514",
            .name = "Claude Sonnet 4",
            .api = .anthropic_messages,
            .provider = .anthropic,
            .base_url = "https://api.anthropic.com",
            .input = &[_]InputType{ .text, .image },
            .cost_input = 3.0,
            .cost_output = 15.0,
            .cost_cache_read = 0.3,
            .cost_cache_write = 3.75,
            .context_window = 200000,
            .max_tokens = 8192,
        };
    }

    pub fn stream(self: *Self, context: *const Context) !ProviderInterface.StreamIterator {
        const options = StreamOptions{
            .temperature = self.config.temperature,
            .max_tokens = self.config.max_tokens,
            .thinking = self.config.thinking,
            .api_key = self.config.api_key,
        };
        return self.interface.stream(self.getModel(), context, options, self.allocator);
    }
};

pub const SimpleEvent = union(enum) {
    text: []const u8,
    thinking: []const u8,
    tool_call: ToolCall,
    done: void,
    err: []const u8,

    pub fn fromStreamEvent(event: StreamEvent) ?SimpleEvent {
        return switch (event.type) {
            .text_delta => if (event.delta) |d| .{ .text = d } else null,
            .thinking_delta => if (event.delta) |d| .{ .thinking = d } else null,
            .toolcall_end => if (event.tool_call) |tc| .{ .tool_call = tc } else null,
            .done => .done,
            .@"error" => .{ .err = event.content orelse "Unknown error" },
            else => null,
        };
    }

    pub fn toAgentEvent(self: SimpleEvent) AgentEvent {
        return switch (self) {
            .text => |t| .{ .type = .text_delta, .text = t },
            .thinking => |t| .{ .type = .text_delta, .text = t },
            .tool_call => |tc| .{ .type = .tool_start, .tool_name = tc.name, .tool_id = tc.id },
            .done => .{ .type = .agent_end },
            .err => |e| .{ .type = .agent_error, .error_message = e },
        };
    }
};

pub fn createMockProvider(allocator: Allocator) MockProvider {
    return MockProvider.init(allocator);
}

pub fn createMockWithResponse(allocator: Allocator, response: []const u8) !MockProvider {
    var prov = MockProvider.init(allocator);
    try prov.addResponse(.{ .type = .start });
    try prov.addResponse(.{ .type = .text_delta, .delta = response });
    try prov.addResponse(.{ .type = .done, .reason = .stop });
    return prov;
}

// Tests

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
