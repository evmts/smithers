// AI Provider Abstraction per God-TUI spec §10
// Unified multi-provider LLM streaming interface

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

// ============ Content Types ============

pub const ContentType = enum {
    text,
    thinking,
    image,
    tool_call,
};

pub const TextContent = struct {
    type: ContentType = .text,
    text: []const u8,
    text_signature: ?[]const u8 = null,

    pub fn deinit(self: *TextContent, allocator: Allocator) void {
        allocator.free(self.text);
        if (self.text_signature) |s| allocator.free(s);
    }
};

pub const ThinkingContent = struct {
    type: ContentType = .thinking,
    thinking: []const u8,
    thinking_signature: ?[]const u8 = null,

    pub fn deinit(self: *ThinkingContent, allocator: Allocator) void {
        allocator.free(self.thinking);
        if (self.thinking_signature) |s| allocator.free(s);
    }
};

pub const ImageContent = struct {
    type: ContentType = .image,
    data: []const u8, // Base64
    mime_type: []const u8,

    pub fn deinit(self: *ImageContent, allocator: Allocator) void {
        allocator.free(self.data);
        allocator.free(self.mime_type);
    }
};

pub const ToolCall = struct {
    type: ContentType = .tool_call,
    id: []const u8,
    name: []const u8,
    arguments: []const u8, // JSON

    pub fn deinit(self: *ToolCall, allocator: Allocator) void {
        allocator.free(self.id);
        allocator.free(self.name);
        allocator.free(self.arguments);
    }
};

pub const Content = union(ContentType) {
    text: TextContent,
    thinking: ThinkingContent,
    image: ImageContent,
    tool_call: ToolCall,

    pub fn deinit(self: *Content, allocator: Allocator) void {
        switch (self.*) {
            .text => |*t| t.deinit(allocator),
            .thinking => |*t| t.deinit(allocator),
            .image => |*i| i.deinit(allocator),
            .tool_call => |*tc| tc.deinit(allocator),
        }
    }
};

// ============ Message Types ============

pub const Role = enum {
    user,
    assistant,
    tool_result,

    pub fn toString(self: Role) []const u8 {
        return switch (self) {
            .user => "user",
            .assistant => "assistant",
            .tool_result => "toolResult",
        };
    }
};

pub const Usage = struct {
    input: u32 = 0,
    output: u32 = 0,
    cache_read: u32 = 0,
    cache_write: u32 = 0,
    total_tokens: u32 = 0,

    cost_input: f64 = 0,
    cost_output: f64 = 0,
    cost_cache_read: f64 = 0,
    cost_cache_write: f64 = 0,
    cost_total: f64 = 0,
};

pub const StopReason = enum {
    stop,
    length,
    tool_use,
    @"error",
    aborted,
};

pub const UserMessage = struct {
    role: Role = .user,
    content: []const u8, // Text or JSON array
    timestamp: i64,

    pub fn deinit(self: *UserMessage, allocator: Allocator) void {
        allocator.free(self.content);
    }
};

pub const AssistantMessage = struct {
    role: Role = .assistant,
    content: ArrayListUnmanaged(Content),
    usage: Usage = .{},
    stop_reason: StopReason = .stop,
    error_message: ?[]const u8 = null,
    provider: []const u8,
    model: []const u8,
    timestamp: i64,

    pub fn deinit(self: *AssistantMessage, allocator: Allocator) void {
        for (self.content.items) |*c| c.deinit(allocator);
        self.content.deinit(allocator);
        if (self.error_message) |e| allocator.free(e);
        allocator.free(self.provider);
        allocator.free(self.model);
    }
};

pub const ToolResultMessage = struct {
    role: Role = .tool_result,
    tool_call_id: []const u8,
    tool_name: []const u8,
    content: ArrayListUnmanaged(Content),
    is_error: bool = false,
    timestamp: i64,

    pub fn deinit(self: *ToolResultMessage, allocator: Allocator) void {
        allocator.free(self.tool_call_id);
        allocator.free(self.tool_name);
        for (self.content.items) |*c| c.deinit(allocator);
        self.content.deinit(allocator);
    }
};

pub const Message = union(Role) {
    user: UserMessage,
    assistant: AssistantMessage,
    tool_result: ToolResultMessage,

    pub fn deinit(self: *Message, allocator: Allocator) void {
        switch (self.*) {
            .user => |*m| m.deinit(allocator),
            .assistant => |*m| m.deinit(allocator),
            .tool_result => |*m| m.deinit(allocator),
        }
    }
};

// ============ Streaming Events ============

pub const EventType = enum {
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
    type: EventType,
    content_index: ?usize = null,
    delta: ?[]const u8 = null,
    content: ?[]const u8 = null,
    tool_call: ?ToolCall = null,
    message: ?AssistantMessage = null,
    reason: ?StopReason = null,
};

// ============ Tool Definition ============

pub const Tool = struct {
    name: []const u8,
    description: []const u8,
    parameters: []const u8, // JSON Schema

    pub fn deinit(self: *Tool, allocator: Allocator) void {
        allocator.free(self.name);
        allocator.free(self.description);
        allocator.free(self.parameters);
    }
};

// ============ Context ============

pub const Context = struct {
    system_prompt: ?[]const u8 = null,
    messages: ArrayListUnmanaged(Message),
    tools: ArrayListUnmanaged(Tool),
    allocator: Allocator,

    pub fn init(allocator: Allocator) Context {
        return .{
            .messages = .{},
            .tools = .{},
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Context) void {
        if (self.system_prompt) |s| self.allocator.free(s);
        for (self.messages.items) |*m| m.deinit(self.allocator);
        self.messages.deinit(self.allocator);
        for (self.tools.items) |*t| t.deinit(self.allocator);
        self.tools.deinit(self.allocator);
    }

    pub fn addMessage(self: *Context, message: Message) !void {
        try self.messages.append(self.allocator, message);
    }

    pub fn addTool(self: *Context, tool: Tool) !void {
        try self.tools.append(self.allocator, tool);
    }
};

// ============ Model Definition ============

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
    cost_input: f64, // $/million tokens
    cost_output: f64,
    cost_cache_read: f64,
    cost_cache_write: f64,
    context_window: u32,
    max_tokens: u32,
};

// ============ Thinking Levels ============

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

// ============ Stream Options ============

pub const StreamOptions = struct {
    temperature: ?f32 = null,
    max_tokens: ?u32 = null,
    thinking: ThinkingLevel = .off,
    api_key: ?[]const u8 = null,
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

// ============ Mock Provider for Testing ============

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

// ============ Tests ============

test "Context init/deinit" {
    const allocator = std.testing.allocator;
    var ctx = Context.init(allocator);
    defer ctx.deinit();

    try std.testing.expectEqual(@as(usize, 0), ctx.messages.items.len);
}

test "Usage default values" {
    const usage = Usage{};
    try std.testing.expectEqual(@as(u32, 0), usage.input);
    try std.testing.expectEqual(@as(u32, 0), usage.output);
}

test "ThinkingLevel budget" {
    try std.testing.expectEqual(@as(u32, 0), ThinkingLevel.off.toBudgetTokens());
    try std.testing.expectEqual(@as(u32, 1024), ThinkingLevel.minimal.toBudgetTokens());
    try std.testing.expectEqual(@as(u32, 131072), ThinkingLevel.xhigh.toBudgetTokens());
}

test "MockProvider basic" {
    const allocator = std.testing.allocator;
    var provider = MockProvider.init(allocator);
    defer provider.deinit();

    try provider.addResponse(.{ .type = .start });
    try provider.addResponse(.{ .type = .text_delta, .delta = "Hello" });
    try provider.addResponse(.{ .type = .done, .reason = .stop });

    const model = Model{
        .id = "test",
        .name = "Test Model",
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

    var ctx = Context.init(allocator);
    defer ctx.deinit();

    var stream = try provider.interface().stream(model, &ctx, .{}, allocator);
    defer stream.deinit();

    const e1 = stream.next();
    try std.testing.expect(e1 != null);
    try std.testing.expectEqual(EventType.start, e1.?.type);

    const e2 = stream.next();
    try std.testing.expect(e2 != null);
    try std.testing.expectEqual(EventType.text_delta, e2.?.type);

    const e3 = stream.next();
    try std.testing.expect(e3 != null);
    try std.testing.expectEqual(EventType.done, e3.?.type);

    try std.testing.expect(stream.next() == null);
}

test "Role toString" {
    try std.testing.expectEqualStrings("user", Role.user.toString());
    try std.testing.expectEqualStrings("assistant", Role.assistant.toString());
}
