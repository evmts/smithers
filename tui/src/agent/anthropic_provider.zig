// Anthropic Provider - makes HTTP calls to the Anthropic API via curl
// Implements ProviderInterface for real LLM calls

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;
const process = std.process;

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

// Import database types
const db = @import("../db.zig");
const DbMessage = db.Message;
const DbRole = db.Role;

// API message types for JSON serialization
const SimpleMessage = struct {
    role: []const u8,
    content: []const u8,
};

/// Result from chat API call
pub const ChatResult = union(enum) {
    text: []const u8,  // Caller owns this memory
    err: []const u8,   // Static error string
    
    pub fn isError(self: ChatResult) bool {
        return self == .err;
    }
    
    pub fn getText(self: ChatResult) ?[]const u8 {
        return switch (self) {
            .text => |t| t,
            .err => null,
        };
    }
    
    pub fn getError(self: ChatResult) ?[]const u8 {
        return switch (self) {
            .err => |e| e,
            .text => null,
        };
    }
};

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

    /// Simple API: call with DB messages directly, returns response text
    /// This is the preferred API - reads from SQLite as source of truth
    pub fn chat(self: *Self, messages: []const DbMessage, allocator: Allocator) !ChatResult {
        const api_key = self.api_key orelse std.posix.getenv("ANTHROPIC_API_KEY") orelse {
            return ChatResult{ .err = "Missing ANTHROPIC_API_KEY" };
        };

        // Build messages JSON from DB messages (skip system messages - Anthropic doesn't support them inline)
        var messages_buf = ArrayListUnmanaged(u8){};
        defer messages_buf.deinit(allocator);
        
        try messages_buf.append(allocator, '[');
        var first = true;
        
        for (messages) |msg| {
            // Skip system and ephemeral messages
            if (msg.role == .system or msg.ephemeral) continue;
            
            if (!first) try messages_buf.append(allocator, ',');
            first = false;
            
            const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
            const m = SimpleMessage{ .role = role_str, .content = msg.content };
            const msg_json = json.Stringify.valueAlloc(allocator, m, .{}) catch return error.OutOfMemory;
            defer allocator.free(msg_json);
            try messages_buf.appendSlice(allocator, msg_json);
        }
        
        try messages_buf.append(allocator, ']');

        // Make API call
        return self.callApi(messages_buf.items, api_key, allocator);
    }

    /// Streaming callback type - called with each text delta
    pub const StreamCallback = *const fn (delta: []const u8, ctx: ?*anyopaque) void;

    /// Chat with streaming - calls callback for each text chunk
    pub fn chatStream(self: *Self, messages: []const DbMessage, callback: StreamCallback, ctx: ?*anyopaque, allocator: Allocator) !ChatResult {
        const api_key = self.api_key orelse std.posix.getenv("ANTHROPIC_API_KEY") orelse {
            return ChatResult{ .err = "Missing ANTHROPIC_API_KEY" };
        };

        // Build messages JSON
        var messages_buf = ArrayListUnmanaged(u8){};
        defer messages_buf.deinit(allocator);
        
        try messages_buf.append(allocator, '[');
        var first = true;
        
        for (messages) |msg| {
            if (msg.role == .system or msg.ephemeral) continue;
            
            if (!first) try messages_buf.append(allocator, ',');
            first = false;
            
            const role_str: []const u8 = if (msg.role == .user) "user" else "assistant";
            const m = SimpleMessage{ .role = role_str, .content = msg.content };
            const msg_json = json.Stringify.valueAlloc(allocator, m, .{}) catch return error.OutOfMemory;
            defer allocator.free(msg_json);
            try messages_buf.appendSlice(allocator, msg_json);
        }
        
        try messages_buf.append(allocator, ']');

        // Build request with stream: true
        const request_body = std.fmt.allocPrint(allocator, 
            \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"stream":true,"messages":{s}}}
        , .{ messages_buf.items }) catch return error.OutOfMemory;
        defer allocator.free(request_body);

        const auth_header = std.fmt.allocPrint(allocator, "x-api-key: {s}", .{api_key}) catch return error.OutOfMemory;
        defer allocator.free(auth_header);

        // Spawn curl with piped stdout for streaming
        var child = std.process.Child.init(&.{
            "curl", "-s", "-N", "-X", "POST", ANTHROPIC_API_URL,
            "-H", "content-type: application/json",
            "-H", "anthropic-version: " ++ ANTHROPIC_VERSION,
            "-H", auth_header,
            "-d", request_body,
        }, allocator);
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Pipe;

        try child.spawn();
        
        // Collect full response text while streaming
        var full_text = ArrayListUnmanaged(u8){};
        defer full_text.deinit(allocator);
        
        // Read and process SSE events line by line
        var line_buf: [8192]u8 = undefined;
        const reader = child.stdout.?.reader();
        
        while (reader.readUntilDelimiterOrEof(&line_buf, '\n') catch null) |line| {
            // SSE format: "data: {...}"
            if (std.mem.startsWith(u8, line, "data: ")) {
                const data = line[6..];
                if (std.mem.eql(u8, data, "[DONE]")) break;
                
                // Parse the JSON event
                const parsed = json.parseFromSlice(json.Value, allocator, data, .{}) catch continue;
                defer parsed.deinit();
                
                if (parsed.value == .object) {
                    // Check for content_block_delta with text
                    if (parsed.value.object.get("type")) |event_type| {
                        if (event_type == .string and std.mem.eql(u8, event_type.string, "content_block_delta")) {
                            if (parsed.value.object.get("delta")) |delta| {
                                if (delta == .object) {
                                    if (delta.object.get("text")) |text| {
                                        if (text == .string) {
                                            callback(text.string, ctx);
                                            try full_text.appendSlice(allocator, text.string);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        _ = child.wait() catch {};

        if (full_text.items.len > 0) {
            return ChatResult{ .text = try allocator.dupe(u8, full_text.items) };
        }
        return ChatResult{ .err = "No text in response" };
    }

    fn callApi(self: *Self, messages_json: []const u8, api_key: []const u8, allocator: Allocator) !ChatResult {
        _ = self;
        
        const request_body = std.fmt.allocPrint(allocator, 
            \\{{"model":"claude-sonnet-4-20250514","max_tokens":4096,"messages":{s}}}
        , .{ messages_json }) catch return error.OutOfMemory;
        defer allocator.free(request_body);

        const auth_header = std.fmt.allocPrint(allocator, "x-api-key: {s}", .{api_key}) catch return error.OutOfMemory;
        defer allocator.free(auth_header);

        const result = process.Child.run(.{
            .allocator = allocator,
            .argv = &.{
                "curl", "-s", "-X", "POST", ANTHROPIC_API_URL,
                "-H", "content-type: application/json",
                "-H", "anthropic-version: " ++ ANTHROPIC_VERSION,
                "-H", auth_header,
                "-d", request_body,
            },
        }) catch {
            return ChatResult{ .err = "Failed to execute curl" };
        };
        defer allocator.free(result.stdout);
        defer allocator.free(result.stderr);

        if (result.term.Exited != 0) {
            return ChatResult{ .err = "curl failed" };
        }

        // Parse response
        const parsed = json.parseFromSlice(json.Value, allocator, result.stdout, .{}) catch {
            return ChatResult{ .err = "Failed to parse response" };
        };
        defer parsed.deinit();

        // Extract text content
        if (parsed.value == .object) {
            if (parsed.value.object.get("error")) |err_obj| {
                if (err_obj == .object) {
                    if (err_obj.object.get("message")) |msg| {
                        if (msg == .string) {
                            return ChatResult{ .err = msg.string };
                        }
                    }
                }
            }
            
            if (parsed.value.object.get("content")) |content_array| {
                if (content_array == .array) {
                    for (content_array.array.items) |block| {
                        if (block == .object) {
                            if (block.object.get("type")) |t| {
                                if (t == .string and std.mem.eql(u8, t.string, "text")) {
                                    if (block.object.get("text")) |text| {
                                        if (text == .string) {
                                            return ChatResult{ .text = try allocator.dupe(u8, text.string) };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return ChatResult{ .err = "No text in response" };
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

        const state = allocator.create(StreamState) catch return error.OutOfMemory;
        state.* = StreamState.init(allocator);

        const api_key = self.api_key orelse std.posix.getenv("ANTHROPIC_API_KEY") orelse {
            state.addEvent(.{ .type = .@"error", .content = "Missing ANTHROPIC_API_KEY" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        };

        // Build messages array from context
        var messages_buf = ArrayListUnmanaged(u8){};
        defer messages_buf.deinit(allocator);
        
        try messages_buf.append(allocator, '[');
        var first = true;
        
        for (context.messages.items) |msg| {
            if (!first) try messages_buf.append(allocator, ',');
            first = false;
            
            const role_str: []const u8 = switch (msg.role) {
                .user => "user",
                .assistant => "assistant",
                .tool_result => "user", // tool results come from user role
            };
            const m = SimpleMessage{ .role = role_str, .content = msg.content };
            const msg_json = json.Stringify.valueAlloc(allocator, m, .{}) catch return error.OutOfMemory;
            defer allocator.free(msg_json);
            try messages_buf.appendSlice(allocator, msg_json);
        }
        
        try messages_buf.append(allocator, ']');
        const messages_json = messages_buf.items;

        const tools_json =
            \\[{"name":"read_file","description":"Read contents of a file","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path to read"}},"required":["path"]}},
            \\{"name":"write_file","description":"Write content to a file","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"Content to write"}},"required":["path","content"]}},
            \\{"name":"edit_file","description":"Edit a file by replacing text","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_text":{"type":"string","description":"Text to find"},"new_text":{"type":"string","description":"Replacement text"}},"required":["path","old_text","new_text"]}},
            \\{"name":"bash","description":"Execute a bash command","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"Command to execute"}},"required":["command"]}},
            \\{"name":"glob","description":"Find files matching pattern","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern"}},"required":["pattern"]}},
            \\{"name":"grep","description":"Search for pattern in files","input_schema":{"type":"object","properties":{"pattern":{"type":"string","description":"Search pattern"},"path":{"type":"string","description":"Directory or file to search"}},"required":["pattern"]}},
            \\{"name":"list_dir","description":"List directory contents","input_schema":{"type":"object","properties":{"path":{"type":"string","description":"Directory path"}},"required":["path"]}}]
        ;

        const max_tokens = options.max_tokens orelse 4096;
        // Build request body - messages_json is already properly escaped by std.json
        const request_body = std.fmt.allocPrint(allocator, 
            \\{{"model":"{s}","max_tokens":{d},"messages":{s},"tools":{s}}}
        , .{ model.id, max_tokens, messages_json, tools_json }) catch return error.OutOfMemory;
        defer allocator.free(request_body);

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

        const parsed = json.parseFromSlice(json.Value, allocator, response_body, .{}) catch {
            state.addEvent(.{ .type = .@"error", .content = "Failed to parse response JSON" });
            state.addEvent(.{ .type = .done, .reason = .@"error" });
            return state.toIterator();
        };
        defer parsed.deinit();

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
                                        const tool_id = if (content_block.object.get("id")) |id| blk: {
                                            break :blk if (id == .string) allocator.dupe(u8, id.string) catch "" else "";
                                        } else "";
                                        const tool_name = if (content_block.object.get("name")) |name| blk: {
                                            break :blk if (name == .string) allocator.dupe(u8, name.string) catch "" else "";
                                        } else "";

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

pub fn createAnthropicProvider(allocator: Allocator) !*AnthropicProvider {
    const api_key = std.posix.getenv("ANTHROPIC_API_KEY");
    if (api_key == null) {
        return error.MissingApiKey;
    }

    const provider_ptr = try allocator.create(AnthropicProvider);
    provider_ptr.* = AnthropicProvider.init(allocator, api_key);
    return provider_ptr;
}

pub fn createAnthropicProviderWithKey(allocator: Allocator, api_key: []const u8) !*AnthropicProvider {
    const provider_ptr = try allocator.create(AnthropicProvider);
    provider_ptr.* = AnthropicProvider.init(allocator, api_key);
    return provider_ptr;
}

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
