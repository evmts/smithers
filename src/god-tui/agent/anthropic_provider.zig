// Anthropic Provider - makes HTTP calls to the Anthropic API via curl
// Implements ProviderInterface for real LLM calls

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;
const process = std.process;

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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/// Anthropic provider that makes HTTP calls to the Anthropic API
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

        // Create collected events buffer
        const state = allocator.create(StreamState) catch return error.OutOfMemory;
        state.* = StreamState.init(allocator);

        // Check for API key
        const api_key = self.api_key orelse std.posix.getenv("ANTHROPIC_API_KEY") orelse {
            state.addEvent(.{ .type = .@"error", .content = "Missing ANTHROPIC_API_KEY" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        };

        // Build messages array for API
        var messages_json = ArrayListUnmanaged(u8){};
        defer messages_json.deinit(allocator);

        messages_json.appendSlice(allocator, "[") catch return error.OutOfMemory;
        var first = true;
        for (context.messages.items) |msg| {
            if (!first) {
                messages_json.appendSlice(allocator, ",") catch return error.OutOfMemory;
            }
            first = false;

            // Escape JSON content
            var escaped = ArrayListUnmanaged(u8){};
            defer escaped.deinit(allocator);
            for (msg.content) |c| {
                switch (c) {
                    '"' => escaped.appendSlice(allocator, "\\\"") catch continue,
                    '\\' => escaped.appendSlice(allocator, "\\\\") catch continue,
                    '\n' => escaped.appendSlice(allocator, "\\n") catch continue,
                    '\r' => escaped.appendSlice(allocator, "\\r") catch continue,
                    '\t' => escaped.appendSlice(allocator, "\\t") catch continue,
                    else => escaped.append(allocator, c) catch continue,
                }
            }

            switch (msg.role) {
                .user => {
                    const msg_json = std.fmt.allocPrint(allocator, "{{\"role\":\"user\",\"content\":\"{s}\"}}", .{escaped.items}) catch return error.OutOfMemory;
                    defer allocator.free(msg_json);
                    messages_json.appendSlice(allocator, msg_json) catch return error.OutOfMemory;
                },
                .assistant => {
                    if (msg.tool_calls) |tool_calls| {
                        // Assistant message with tool_use blocks
                        var content_blocks = ArrayListUnmanaged(u8){};
                        defer content_blocks.deinit(allocator);
                        content_blocks.appendSlice(allocator, "[") catch return error.OutOfMemory;

                        // Add text block first if present
                        if (escaped.items.len > 0) {
                            const text_block = std.fmt.allocPrint(allocator, "{{\"type\":\"text\",\"text\":\"{s}\"}}", .{escaped.items}) catch return error.OutOfMemory;
                            defer allocator.free(text_block);
                            content_blocks.appendSlice(allocator, text_block) catch return error.OutOfMemory;
                        }

                        // Add tool_use blocks
                        for (tool_calls) |tc| {
                            if (content_blocks.items.len > 1) {
                                content_blocks.appendSlice(allocator, ",") catch return error.OutOfMemory;
                            }
                            const tc_block = std.fmt.allocPrint(allocator, "{{\"type\":\"tool_use\",\"id\":\"{s}\",\"name\":\"{s}\",\"input\":{s}}}", .{ tc.id, tc.name, tc.arguments }) catch return error.OutOfMemory;
                            defer allocator.free(tc_block);
                            content_blocks.appendSlice(allocator, tc_block) catch return error.OutOfMemory;
                        }
                        content_blocks.appendSlice(allocator, "]") catch return error.OutOfMemory;

                        const msg_json = std.fmt.allocPrint(allocator, "{{\"role\":\"assistant\",\"content\":{s}}}", .{content_blocks.items}) catch return error.OutOfMemory;
                        defer allocator.free(msg_json);
                        messages_json.appendSlice(allocator, msg_json) catch return error.OutOfMemory;
                    } else {
                        const msg_json = std.fmt.allocPrint(allocator, "{{\"role\":\"assistant\",\"content\":\"{s}\"}}", .{escaped.items}) catch return error.OutOfMemory;
                        defer allocator.free(msg_json);
                        messages_json.appendSlice(allocator, msg_json) catch return error.OutOfMemory;
                    }
                },
                .tool_result => {
                    // Tool results go as user messages with tool_result content block
                    const tool_id = msg.tool_call_id orelse "";
                    const msg_json = std.fmt.allocPrint(allocator, "{{\"role\":\"user\",\"content\":[{{\"type\":\"tool_result\",\"tool_use_id\":\"{s}\",\"content\":\"{s}\"}}]}}", .{ tool_id, escaped.items }) catch return error.OutOfMemory;
                    defer allocator.free(msg_json);
                    messages_json.appendSlice(allocator, msg_json) catch return error.OutOfMemory;
                },
            }
        }
        messages_json.appendSlice(allocator, "]") catch return error.OutOfMemory;

        // Tool definitions
        const tools_json =
            \\[{"name":"read_file","description":"Read contents of a file","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path to read"}},"required":["path"]}},
            \\{"name":"write_file","description":"Write content to a file","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"Content to write"}},"required":["path","content"]}},
            \\{"name":"edit_file","description":"Edit a file by replacing text","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_text":{"type":"string","description":"Text to find"},"new_text":{"type":"string","description":"Replacement text"}},"required":["path","old_text","new_text"]}},
            \\{"name":"bash","description":"Execute a bash command","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Command to execute"}},"required":["command"]}},
            \\{"name":"glob","description":"Find files matching pattern","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"}},"required":["pattern"]}},
            \\{"name":"grep","description":"Search for pattern in files","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Search pattern"},"path":{"type":"string","description":"Directory or file to search"}},"required":["pattern"]}},
            \\{"name":"list_dir","description":"List directory contents","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"Directory path"}},"required":["path"]}}]
        ;

        // Build request body
        const max_tokens = options.max_tokens orelse 4096;
        const request_body = std.fmt.allocPrint(allocator, "{{\"model\":\"{s}\",\"max_tokens\":{d},\"messages\":{s},\"tools\":{s}}}", .{ model.id, max_tokens, messages_json.items, tools_json }) catch return error.OutOfMemory;
        defer allocator.free(request_body);

        // Build curl command
        const auth_header = std.fmt.allocPrint(allocator, "x-api-key: {s}", .{api_key}) catch return error.OutOfMemory;
        defer allocator.free(auth_header);

        const result = process.Child.run(.{
            .allocator = allocator,
            .argv = &.{
                "curl",
                "-s",
                "-X",
                "POST",
                ANTHROPIC_API_URL,
                "-H",
                "content-type: application/json",
                "-H",
                "anthropic-version: " ++ ANTHROPIC_VERSION,
                "-H",
                auth_header,
                "-d",
                request_body,
            },
        }) catch {
            state.addEvent(.{ .type = .@"error", .content = "Failed to execute curl" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        };
        defer allocator.free(result.stdout);
        defer allocator.free(result.stderr);

        state.addEvent(.{ .type = .start });

        if (result.term.Exited != 0) {
            state.addEvent(.{ .type = .@"error", .content = "curl failed" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        }

        const response_body = result.stdout;

        // Parse JSON response to extract text
        const parsed = json.parseFromSlice(json.Value, allocator, response_body, .{}) catch {
            state.addEvent(.{ .type = .@"error", .content = "Failed to parse response JSON" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        };
        defer parsed.deinit();

        // Extract content from response
        var has_tool_use = false;
        if (parsed.value == .object) {
            if (parsed.value.object.get("content")) |content_array| {
                if (content_array == .array) {
                    for (content_array.array.items) |content_block| {
                        if (content_block == .object) {
                            if (content_block.object.get("type")) |type_val| {
                                if (type_val == .string) {
                                    if (std.mem.eql(u8, type_val.string, "text")) {
                                        if (content_block.object.get("text")) |text_val| {
                                            if (text_val == .string) {
                                                const text_copy = allocator.dupe(u8, text_val.string) catch continue;
                                                state.addEventOwned(.{ .type = .text_delta, .delta = text_copy });
                                            }
                                        }
                                    } else if (std.mem.eql(u8, type_val.string, "tool_use")) {
                                        has_tool_use = true;
                                        // Extract tool call info
                                        const tool_id = if (content_block.object.get("id")) |id| blk: {
                                            break :blk if (id == .string) allocator.dupe(u8, id.string) catch "" else "";
                                        } else "";
                                        const tool_name = if (content_block.object.get("name")) |name| blk: {
                                            break :blk if (name == .string) allocator.dupe(u8, name.string) catch "" else "";
                                        } else "";

                                        // Serialize input JSON
                                        const input_json = if (content_block.object.get("input")) |input_val| blk: {
                                            break :blk std.json.Stringify.valueAlloc(allocator, input_val, .{}) catch allocator.dupe(u8, "{}") catch "{}";
                                        } else allocator.dupe(u8, "{}") catch "{}";

                                        if (tool_id.len > 0) state.owned_strings.append(allocator, tool_id) catch {};
                                        if (tool_name.len > 0) state.owned_strings.append(allocator, tool_name) catch {};
                                        if (input_json.len > 0) state.owned_strings.append(allocator, input_json) catch {};

                                        state.addEvent(.{
                                            .type = .toolcall_end,
                                            .tool_call = .{
                                                .id = tool_id,
                                                .name = tool_name,
                                                .arguments = input_json,
                                            },
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Check for error
            if (parsed.value.object.get("error")) |error_obj| {
                if (error_obj == .object) {
                    if (error_obj.object.get("message")) |msg| {
                        if (msg == .string) {
                            const err_copy = allocator.dupe(u8, msg.string) catch "API error";
                            state.addEventOwned(.{ .type = .@"error", .content = err_copy });
                        }
                    }
                }
            }
        }

        const reason: StopReason = if (has_tool_use) .tool_use else .stop;
        state.addEvent(.{ .type = .done, .reason = reason });
        return state.toIterator();
    }
};

/// Internal state for collecting stream events
const StreamState = struct {
    events: ArrayListUnmanaged(StreamEvent),
    owned_strings: ArrayListUnmanaged([]const u8),
    current: usize,
    allocator: Allocator,

    fn init(allocator: Allocator) StreamState {
        return .{
            .events = .{},
            .owned_strings = .{},
            .current = 0,
            .allocator = allocator,
        };
    }

    fn deinit(self: *StreamState) void {
        // Free owned strings
        for (self.owned_strings.items) |s| {
            self.allocator.free(s);
        }
        self.owned_strings.deinit(self.allocator);
        self.events.deinit(self.allocator);
    }

    fn addEvent(self: *StreamState, event: StreamEvent) void {
        self.events.append(self.allocator, event) catch {};
    }

    fn addEventOwned(self: *StreamState, event: StreamEvent) void {
        // Track owned strings for cleanup
        if (event.delta) |d| {
            self.owned_strings.append(self.allocator, d) catch {};
        }
        if (event.content) |c| {
            self.owned_strings.append(self.allocator, c) catch {};
        }
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
