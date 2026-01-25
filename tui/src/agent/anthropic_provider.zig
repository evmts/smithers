// Anthropic Provider - makes HTTP calls to the Anthropic API via curl
// Implements ProviderInterface for real LLM calls
// Also implements the AgentProvider interface for AgentLoop

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;
const process = std.process;
const obs = @import("../obs.zig");

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

const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;

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

// ============ AgentProvider Interface Implementation ============
// This implements the comptime generic interface for AgentLoop

pub const AnthropicStreamingProvider = struct {
    pub const StreamingState = struct {
        child: ?std.process.Child = null,
        message_id: ?i64 = null,
        accumulated_text: ArrayListUnmanaged(u8) = .{},
        tool_calls: ArrayListUnmanaged(ToolCallInfo) = .{},
        current_tool_id: ?[]const u8 = null,
        current_tool_name: ?[]const u8 = null,
        current_tool_input: ArrayListUnmanaged(u8) = .{},
        line_buffer: [8192]u8 = undefined,
        line_pos: usize = 0,
        is_done: bool = false,
        stop_reason: ?[]const u8 = null,
        alloc: Allocator,
        // Allocated strings that must be freed on cleanup (used by curl argv)
        argv_alloc: ?[]const []const u8 = null,
        auth_header_alloc: ?[]const u8 = null,
        body_alloc: ?[]const u8 = null,

        pub fn init(alloc: Allocator) StreamingState {
            return .{ .alloc = alloc, .current_tool_input = .{} };
        }

        fn processLine(self: *StreamingState, line: []const u8) !void {
            // Log every line we process
            var log_buf: [256]u8 = undefined;
            const preview_len = @min(line.len, 80);
            const msg = std.fmt.bufPrint(&log_buf, "line len={d}: {s}", .{ line.len, line[0..preview_len] }) catch "?";
            obs.global.logSimple(.debug, @src(), "curl.processLine", msg);

            if (!std.mem.startsWith(u8, line, "data: ")) {
                obs.global.logSimple(.trace, @src(), "curl.processLine", "not data line, skipping");
                return;
            }
            const data = line[6..];
            if (std.mem.eql(u8, data, "[DONE]")) {
                obs.global.logSimple(.debug, @src(), "curl.processLine", "got [DONE]");
                self.is_done = true;
                return;
            }

            const parsed = json.parseFromSlice(json.Value, self.alloc, data, .{}) catch |err| {
                const err_msg = std.fmt.bufPrint(&log_buf, "JSON parse error: {s}", .{@errorName(err)}) catch "?";
                obs.global.logSimple(.warn, @src(), "curl.processLine", err_msg);
                return;
            };
            defer parsed.deinit();

            if (parsed.value != .object) {
                obs.global.logSimple(.warn, @src(), "curl.processLine", "parsed value not object");
                return;
            }

            const type_val = parsed.value.object.get("type") orelse {
                obs.global.logSimple(.warn, @src(), "curl.processLine", "no 'type' field");
                return;
            };
            if (type_val != .string) return;
            const event_type = type_val.string;

            const type_msg = std.fmt.bufPrint(&log_buf, "event_type={s}", .{event_type}) catch "?";
            obs.global.logSimple(.debug, @src(), "curl.processLine", type_msg);

            if (std.mem.eql(u8, event_type, "message_delta")) {
                if (parsed.value.object.get("delta")) |delta| {
                    if (delta == .object) {
                        if (delta.object.get("stop_reason")) |sr| {
                            if (sr == .string) {
                                self.stop_reason = self.alloc.dupe(u8, sr.string) catch null;
                            }
                        }
                    }
                }
                return;
            }

            if (std.mem.eql(u8, event_type, "content_block_start")) {
                if (parsed.value.object.get("content_block")) |block| {
                    if (block == .object) {
                        if (block.object.get("type")) |bt| {
                            if (bt == .string and std.mem.eql(u8, bt.string, "tool_use")) {
                                if (block.object.get("id")) |id| {
                                    if (id == .string) {
                                        self.current_tool_id = self.alloc.dupe(u8, id.string) catch null;
                                    }
                                }
                                if (block.object.get("name")) |name| {
                                    if (name == .string) {
                                        self.current_tool_name = self.alloc.dupe(u8, name.string) catch null;
                                    }
                                }
                                self.current_tool_input.clearRetainingCapacity();
                            }
                        }
                    }
                }
                return;
            }

            if (std.mem.eql(u8, event_type, "content_block_delta")) {
                const delta = parsed.value.object.get("delta") orelse return;
                if (delta != .object) return;

                if (delta.object.get("type")) |dt| {
                    if (dt == .string) {
                        if (std.mem.eql(u8, dt.string, "text_delta")) {
                            if (delta.object.get("text")) |text| {
                                if (text == .string) {
                                    const text_msg = std.fmt.bufPrint(&log_buf, "GOT TEXT: len={d} total={d}", .{ text.string.len, self.accumulated_text.items.len }) catch "?";
                                    obs.global.logSimple(.debug, @src(), "curl.processLine", text_msg);
                                    try self.accumulated_text.appendSlice(self.alloc, text.string);
                                }
                            }
                        } else if (std.mem.eql(u8, dt.string, "input_json_delta")) {
                            if (delta.object.get("partial_json")) |pj| {
                                if (pj == .string) {
                                    try self.current_tool_input.appendSlice(self.alloc, pj.string);
                                }
                            }
                        }
                    }
                }
                return;
            }

            if (std.mem.eql(u8, event_type, "content_block_stop")) {
                if (self.current_tool_id != null and self.current_tool_name != null) {
                    obs.global.logSimple(.debug, @src(), "curl.processLine", "saving tool call");
                    try self.tool_calls.append(self.alloc, .{
                        .id = self.current_tool_id.?,
                        .name = self.current_tool_name.?,
                        .input_json = try self.alloc.dupe(u8, self.current_tool_input.items),
                    });
                    self.current_tool_id = null;
                    self.current_tool_name = null;
                    self.current_tool_input.clearRetainingCapacity();
                }
                return;
            }

            if (std.mem.eql(u8, event_type, "message_stop")) {
                obs.global.logSimple(.debug, @src(), "curl.processLine", "message_stop - stream complete");
                self.is_done = true;
                return;
            }
        }
    };

    pub fn startStream(alloc: Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
        var log_buf: [256]u8 = undefined;

        var msg = std.fmt.bufPrint(&log_buf, "init: body_len={d} api_key_len={d}", .{ request_body.len, api_key.len }) catch "init";
        obs.global.logSimple(.debug, @src(), "curl.start", msg);

        var state = StreamingState.init(alloc);

        const auth_header = try std.fmt.allocPrint(alloc, "x-api-key: {s}", .{api_key});
        errdefer alloc.free(auth_header);
        const body_copy = try alloc.dupe(u8, request_body);
        errdefer alloc.free(body_copy);

        msg = std.fmt.bufPrint(&log_buf, "auth_header_len={d}", .{auth_header.len}) catch "?";
        obs.global.logSimple(.debug, @src(), "curl.start", msg);

        // Use -d @- to read body from stdin
        const argv = try alloc.alloc([]const u8, 14);
        errdefer alloc.free(argv);
        argv[0] = "curl";
        argv[1] = "-s";
        argv[2] = "-N";
        argv[3] = "-X";
        argv[4] = "POST";
        argv[5] = ANTHROPIC_API_URL;
        argv[6] = "-H";
        argv[7] = "content-type: application/json";
        argv[8] = "-H";
        argv[9] = "anthropic-version: " ++ ANTHROPIC_VERSION;
        argv[10] = "-H";
        argv[11] = auth_header;
        argv[12] = "-d";
        argv[13] = "@-";

        obs.global.logSimple(.debug, @src(), "curl.start", "calling child.spawn()");

        var child = std.process.Child.init(argv, alloc);
        child.stdin_behavior = .Pipe;
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Pipe;

        child.spawn() catch |err| {
            msg = std.fmt.bufPrint(&log_buf, "spawn FAILED: {s}", .{@errorName(err)}) catch "spawn error";
            obs.global.logSimple(.err, @src(), "curl.start", msg);
            alloc.free(argv);
            alloc.free(auth_header);
            alloc.free(body_copy);
            return err;
        };

        // Log child process info
        msg = std.fmt.bufPrint(&log_buf, "spawned: id={d} stdin={} stdout={} stderr={}", .{
            child.id,
            child.stdin != null,
            child.stdout != null,
            child.stderr != null,
        }) catch "?";
        obs.global.logSimple(.debug, @src(), "curl.start", msg);

        // Write request body to curl's stdin
        if (child.stdin) |stdin| {
            const stdin_fd = stdin.handle;
            msg = std.fmt.bufPrint(&log_buf, "writing {d} bytes to stdin fd={d}", .{ body_copy.len, stdin_fd }) catch "?";
            obs.global.logSimple(.debug, @src(), "curl.start", msg);

            const written = stdin.writeAll(body_copy) catch |err| {
                msg = std.fmt.bufPrint(&log_buf, "stdin write FAILED: {s}", .{@errorName(err)}) catch "?";
                obs.global.logSimple(.err, @src(), "curl.start", msg);
                return err;
            };
            _ = written;

            obs.global.logSimple(.debug, @src(), "curl.start", "stdin write complete, closing stdin");
            stdin.close();
            child.stdin = null;
        } else {
            obs.global.logSimple(.err, @src(), "curl.start", "NO STDIN PIPE!");
        }

        // Set stdout non-blocking
        if (child.stdout) |stdout| {
            const stdout_fd = stdout.handle;
            msg = std.fmt.bufPrint(&log_buf, "setting non-blocking on stdout fd={d}", .{stdout_fd}) catch "?";
            obs.global.logSimple(.debug, @src(), "curl.start", msg);

            const F_GETFL = 3;
            const F_SETFL = 4;
            const O_NONBLOCK: usize = 0x0004;
            const flags = std.posix.fcntl(stdout_fd, F_GETFL, 0) catch |err| blk: {
                msg = std.fmt.bufPrint(&log_buf, "fcntl GETFL failed: {s}", .{@errorName(err)}) catch "?";
                obs.global.logSimple(.err, @src(), "curl.start", msg);
                break :blk 0;
            };
            _ = std.posix.fcntl(stdout_fd, F_SETFL, flags | O_NONBLOCK) catch |err| {
                msg = std.fmt.bufPrint(&log_buf, "fcntl SETFL failed: {s}", .{@errorName(err)}) catch "?";
                obs.global.logSimple(.err, @src(), "curl.start", msg);
            };
        } else {
            obs.global.logSimple(.err, @src(), "curl.start", "NO STDOUT PIPE!");
        }

        state.argv_alloc = argv;
        state.auth_header_alloc = auth_header;
        state.body_alloc = body_copy;
        state.child = child;
        state.is_done = false;
        state.line_pos = 0;

        obs.global.logSimple(.debug, @src(), "curl.start", "stream ready, returning state");

        return state;
    }

    var poll_count: u64 = 0;

    pub fn poll(state: *StreamingState) !bool {
        poll_count += 1;
        var log_buf: [256]u8 = undefined;

        const child = state.child orelse {
            obs.global.logSimple(.debug, @src(), "curl.poll", "ERROR: no child in state");
            return true;
        };

        // Log child id periodically
        if (poll_count % 100 == 1) {
            const msg = std.fmt.bufPrint(&log_buf, "poll#{d} child_id={d}", .{ poll_count, child.id }) catch "?";
            obs.global.logSimple(.debug, @src(), "curl.poll", msg);
        }

        const stdout = child.stdout orelse {
            obs.global.logSimple(.debug, @src(), "curl.poll", "ERROR: no stdout pipe");
            return true;
        };

        const stdout_fd = stdout.handle;

        var buf: [4096]u8 = undefined;
        const bytes_read = stdout.read(&buf) catch |err| {
            if (err == error.WouldBlock) {
                // Only log periodically to avoid spam
                if (poll_count % 100 == 1) {
                    const msg = std.fmt.bufPrint(&log_buf, "poll#{d} fd={d} WouldBlock", .{ poll_count, stdout_fd }) catch "?";
                    obs.global.logSimple(.trace, @src(), "curl.poll", msg);
                }
                return false;
            }
            const msg = std.fmt.bufPrint(&log_buf, "poll#{d} fd={d} read error: {s}", .{ poll_count, stdout_fd, @errorName(err) }) catch "?";
            obs.global.logSimple(.err, @src(), "curl.poll", msg);

            // Read stderr
            if (child.stderr) |stderr| {
                var err_output: [512]u8 = undefined;
                const err_len = stderr.read(&err_output) catch 0;
                if (err_len > 0) {
                    obs.global.logSimple(.err, @src(), "curl.stderr", err_output[0..@min(err_len, 256)]);
                }
            }
            return true;
        };

        if (bytes_read == 0) {
            // Check stderr when we get EOF
            if (child.stderr) |stderr| {
                var err_output: [512]u8 = undefined;
                const err_len = stderr.read(&err_output) catch 0;
                if (err_len > 0) {
                    const msg = std.fmt.bufPrint(&log_buf, "stderr ({d} bytes): {s}", .{ err_len, err_output[0..@min(err_len, 200)] }) catch "?";
                    obs.global.logSimple(.warn, @src(), "curl.poll", msg);
                }
            }

            if (state.is_done) {
                const msg = std.fmt.bufPrint(&log_buf, "poll#{d} stream complete, text_len={d}", .{ poll_count, state.accumulated_text.items.len }) catch "?";
                obs.global.logSimple(.debug, @src(), "curl.poll", msg);
                return true;
            }
            return false;
        }

        // We got data!
        const msg = std.fmt.bufPrint(&log_buf, "poll#{d} READ {d} bytes! total_text={d}", .{ poll_count, bytes_read, state.accumulated_text.items.len }) catch "?";
        obs.global.logSimple(.debug, @src(), "curl.poll", msg);

        var read_buf: [64]u8 = undefined;
        const read_msg = std.fmt.bufPrint(&read_buf, "read {d} bytes", .{bytes_read}) catch "?";
        obs.global.logSimple(.trace, @src(), "anthropic.poll", read_msg);

        for (buf[0..bytes_read]) |byte| {
            if (byte == '\n') {
                const line = state.line_buffer[0..state.line_pos];
                try state.processLine(line);
                state.line_pos = 0;
            } else if (state.line_pos < state.line_buffer.len - 1) {
                state.line_buffer[state.line_pos] = byte;
                state.line_pos += 1;
            }
        }

        return false;
    }

    pub fn getText(state: *StreamingState) []const u8 {
        return state.accumulated_text.items;
    }

    pub fn hasToolCalls(state: *StreamingState) bool {
        return state.tool_calls.items.len > 0;
    }

    pub fn getToolCalls(state: *StreamingState) []const ToolCallInfo {
        return state.tool_calls.items;
    }

    pub fn cleanup(state: *StreamingState, _: Allocator) void {
        if (state.child) |*child| {
            _ = child.kill() catch {};
            _ = child.wait() catch {};
        }
        state.child = null;
        state.accumulated_text.deinit(state.alloc);
        state.accumulated_text = .{};
        for (state.tool_calls.items) |tc| {
            state.alloc.free(tc.id);
            state.alloc.free(tc.name);
            state.alloc.free(tc.input_json);
        }
        state.tool_calls.deinit(state.alloc);
        state.tool_calls = .{};
        state.current_tool_input.deinit(state.alloc);
        state.current_tool_input = .{};
        if (state.current_tool_id) |id| state.alloc.free(id);
        if (state.current_tool_name) |name| state.alloc.free(name);
        if (state.stop_reason) |sr| state.alloc.free(sr);
        // Free curl argv allocations
        if (state.argv_alloc) |a| state.alloc.free(a);
        if (state.auth_header_alloc) |h| state.alloc.free(h);
        if (state.body_alloc) |b| state.alloc.free(b);
        state.argv_alloc = null;
        state.auth_header_alloc = null;
        state.body_alloc = null;
        state.current_tool_id = null;
        state.current_tool_name = null;
        state.stop_reason = null;
        state.message_id = null;
        state.is_done = false;
        state.line_pos = 0;
    }
};

test "AnthropicStreamingProvider interface validation" {
    provider_interface.validateProviderInterface(AnthropicStreamingProvider);
}
