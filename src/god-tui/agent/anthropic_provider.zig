// Anthropic Provider - wraps ai-zig for real LLM calls
// Implements ProviderInterface for Anthropic API
//
// NOTE: Due to Zig 0.15 HTTP API changes, this currently provides a stub
// implementation. Real HTTP implementation requires adapting to the new
// std.http.Client API.

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

// Local provider types
const provider = @import("provider.zig");
const ProviderInterface = provider.ProviderInterface;
const StreamEvent = provider.StreamEvent;
const StreamEventType = provider.StreamEventType;
const StreamOptions = provider.StreamOptions;
const Model = provider.Model;
const Context = provider.Context;
const StopReason = provider.StopReason;
const ToolCall = provider.ToolCall;
const InputType = provider.InputType;

/// Anthropic provider that will make HTTP calls to the Anthropic API
pub const AnthropicProvider = struct {
    allocator: Allocator,
    api_key: ?[]const u8,

    const Self = @This();

    pub fn init(allocator: Allocator, api_key: ?[]const u8) Self {
        return .{
            .allocator = allocator,
            .api_key = api_key,
        };
    }

    pub fn deinit(self: *Self) void {
        _ = self;
    }

    pub fn interface(self: *Self) ProviderInterface {
        return .{
            .ptr = self,
            .vtable = &vtable,
        };
    }

    const vtable = ProviderInterface.VTable{
        .stream = streamImpl,
        .deinit = deinitImpl,
    };

    fn deinitImpl(ptr: *anyopaque, _: Allocator) void {
        const self: *Self = @ptrCast(@alignCast(ptr));
        self.deinit();
    }

    fn streamImpl(
        ptr: *anyopaque,
        model: Model,
        context: *const Context,
        options: StreamOptions,
        allocator: Allocator,
    ) ProviderInterface.StreamError!ProviderInterface.StreamIterator {
        const self: *Self = @ptrCast(@alignCast(ptr));
        _ = model;
        _ = options;

        // Create collected events buffer
        const state = allocator.create(StreamState) catch return error.OutOfMemory;
        state.* = StreamState.init(allocator);

        // Check for API key
        const api_key = self.api_key orelse std.posix.getenv("ANTHROPIC_API_KEY") orelse {
            state.addEvent(.{ .type = .@"error", .content = "Missing ANTHROPIC_API_KEY" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        };
        _ = api_key;

        // Build prompt from context
        const types = @import("types.zig");
        var has_user_msg = false;
        for (context.messages.items) |msg| {
            if (msg.role == types.Role.user) {
                has_user_msg = true;
                break;
            }
        }

        // TODO: Implement real HTTP call to Anthropic API
        // The Zig 0.15 HTTP API has significant changes from previous versions.
        //
        // Real implementation would:
        // 1. Build JSON request body with model, messages, max_tokens, stream:true
        // 2. POST to https://api.anthropic.com/v1/messages
        // 3. Parse SSE response stream for content_block_delta events
        // 4. Emit text_delta events for each text chunk

        state.addEvent(.{ .type = .start });

        // Emit stub response indicating the provider is wired but HTTP pending
        if (has_user_msg) {
            state.addEvent(.{ .type = .text_delta, .delta = "[Anthropic provider wired. HTTP implementation pending for Zig 0.15 API.]" });
        } else {
            state.addEvent(.{ .type = .text_delta, .delta = "[Anthropic provider wired. No user message in context.]" });
        }

        state.addEvent(.{ .type = .done, .reason = .stop });
        return state.toIterator();
    }
};

/// Internal state for collecting stream events
const StreamState = struct {
    events: ArrayListUnmanaged(StreamEvent),
    current: usize,
    allocator: Allocator,

    fn init(allocator: Allocator) StreamState {
        return .{
            .events = .{},
            .current = 0,
            .allocator = allocator,
        };
    }

    fn deinit(self: *StreamState) void {
        self.events.deinit(self.allocator);
    }

    fn addEvent(self: *StreamState, event: StreamEvent) void {
        self.events.append(self.allocator, event) catch {};
    }

    fn toIterator(self: *StreamState) ProviderInterface.StreamIterator {
        return .{
            .ptr = self,
            .next_fn = nextEvent,
            .deinit_fn = deinitState,
        };
    }

    fn nextEvent(ptr: *anyopaque) ?StreamEvent {
        const self: *StreamState = @ptrCast(@alignCast(ptr));
        if (self.current >= self.events.items.len) return null;
        const event = self.events.items[self.current];
        self.current += 1;
        return event;
    }

    fn deinitState(ptr: *anyopaque) void {
        const self: *StreamState = @ptrCast(@alignCast(ptr));
        self.deinit();
        self.allocator.destroy(self);
    }
};

/// Create an Anthropic provider with API key from environment
pub fn createAnthropicProvider(allocator: Allocator) !*AnthropicProvider {
    const api_key = std.posix.getenv("ANTHROPIC_API_KEY");
    if (api_key == null) {
        return error.MissingApiKey;
    }

    const provider_ptr = try allocator.create(AnthropicProvider);
    provider_ptr.* = AnthropicProvider.init(allocator, api_key);
    return provider_ptr;
}

/// Create an Anthropic provider with explicit API key
pub fn createAnthropicProviderWithKey(allocator: Allocator, api_key: []const u8) !*AnthropicProvider {
    const provider_ptr = try allocator.create(AnthropicProvider);
    provider_ptr.* = AnthropicProvider.init(allocator, api_key);
    return provider_ptr;
}

/// Get default Claude model
pub fn getDefaultModel() Model {
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

// Tests

test "AnthropicProvider init without API key" {
    const allocator = std.testing.allocator;

    var prov = AnthropicProvider.init(allocator, null);
    defer prov.deinit();

    _ = prov.interface();
}

test "getDefaultModel returns valid model" {
    const model = getDefaultModel();
    try std.testing.expectEqualStrings("claude-sonnet-4-20250514", model.id);
    try std.testing.expectEqual(provider.Api.anthropic_messages, model.api);
}
