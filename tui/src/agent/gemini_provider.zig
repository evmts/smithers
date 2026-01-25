// Gemini Provider - makes HTTP calls to Google Gemini API via curl
// Implements AgentProvider interface for Gemini streaming

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;
const obs = @import("../obs.zig");

const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

pub const StreamingState = struct {
    alloc: Allocator,
    child: ?std.process.Child = null,
    accumulated_text: ArrayListUnmanaged(u8) = .{},
    tool_calls: ArrayListUnmanaged(ToolCallInfo) = .{},
    json_buffer: ArrayListUnmanaged(u8) = .{},
    line_buffer: [16384]u8 = undefined,
    line_pos: usize = 0,
    is_done: bool = false,
    message_id: ?i64 = null,
    stop_reason: ?[]const u8 = null,
    argv_alloc: ?[]const []const u8 = null,
    url_alloc: ?[]const u8 = null,
    body_alloc: ?[]const u8 = null,
    in_json_array: bool = false,
    brace_depth: i32 = 0,
    tool_call_counter: u32 = 0,

    pub fn init(alloc: Allocator) StreamingState {
        return .{ .alloc = alloc };
    }

    pub fn processChunk(self: *StreamingState, chunk: []const u8) !void {
        // Gemini streams JSON array elements: [{...}, {...}, ...]
        // We accumulate until we have a complete JSON object
        for (chunk) |c| {
            if (c == '[' and !self.in_json_array) {
                self.in_json_array = true;
                continue;
            }
            if (!self.in_json_array) continue;

            if (c == '{') {
                self.brace_depth += 1;
                try self.json_buffer.append(self.alloc, c);
            } else if (c == '}') {
                self.brace_depth -= 1;
                try self.json_buffer.append(self.alloc, c);
                if (self.brace_depth == 0 and self.json_buffer.items.len > 0) {
                    try self.processJsonObject(self.json_buffer.items);
                    self.json_buffer.clearRetainingCapacity();
                }
            } else if (self.brace_depth > 0) {
                try self.json_buffer.append(self.alloc, c);
            }
        }
    }

    fn processJsonObject(self: *StreamingState, data: []const u8) !void {
        const parsed = json.parseFromSlice(json.Value, self.alloc, data, .{}) catch return;
        defer parsed.deinit();

        if (parsed.value != .object) return;

        // Check for candidates array
        const candidates = parsed.value.object.get("candidates") orelse return;
        if (candidates != .array or candidates.array.items.len == 0) return;

        const candidate = candidates.array.items[0];
        if (candidate != .object) return;

        // Check finish reason
        if (candidate.object.get("finishReason")) |fr| {
            if (fr == .string) {
                self.stop_reason = self.alloc.dupe(u8, fr.string) catch null;
                if (std.mem.eql(u8, fr.string, "STOP")) {
                    self.is_done = true;
                }
            }
        }

        const content = candidate.object.get("content") orelse return;
        if (content != .object) return;

        const parts = content.object.get("parts") orelse return;
        if (parts != .array) return;

        for (parts.array.items) |part| {
            if (part != .object) continue;

            // Handle text content
            if (part.object.get("text")) |text_val| {
                if (text_val == .string) {
                    try self.accumulated_text.appendSlice(self.alloc, text_val.string);
                }
            }

            // Handle function calls (Gemini uses "functionCall")
            if (part.object.get("functionCall")) |fc| {
                if (fc == .object) {
                    try self.processFunctionCall(fc.object);
                }
            }
        }
    }

    fn processFunctionCall(self: *StreamingState, fc: json.ObjectMap) !void {
        const name_val = fc.get("name") orelse return;
        if (name_val != .string) return;

        self.tool_call_counter += 1;
        const id = try std.fmt.allocPrint(self.alloc, "call_{d}_{d}", .{ std.time.milliTimestamp(), self.tool_call_counter });
        const name = try self.alloc.dupe(u8, name_val.string);

        var args_json: []const u8 = "{}";
        if (fc.get("args")) |args_val| {
            args_json = json.stringifyAlloc(self.alloc, args_val, .{}) catch "{}";
        }

        try self.tool_calls.append(self.alloc, .{
            .id = id,
            .name = name,
            .input_json = args_json,
        });
    }
};

pub fn startStream(alloc: Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
    var state = StreamingState.init(alloc);

    // Parse request to get model ID
    var model_id: []const u8 = "gemini-2.0-flash";
    const parsed = json.parseFromSlice(json.Value, alloc, request_body, .{}) catch null;
    if (parsed) |p| {
        defer p.deinit();
        if (p.value == .object) {
            if (p.value.object.get("model")) |m| {
                if (m == .string) {
                    model_id = m.string;
                }
            }
        }
    }

    const url = try std.fmt.allocPrint(alloc, "{s}/{s}:streamGenerateContent?alt=sse&key={s}", .{ GEMINI_API_BASE, model_id, api_key });
    errdefer alloc.free(url);
    const body_copy = try alloc.dupe(u8, request_body);
    errdefer alloc.free(body_copy);

    const argv = try alloc.alloc([]const u8, 10);
    errdefer alloc.free(argv);
    argv[0] = "curl";
    argv[1] = "-s";
    argv[2] = "-N";
    argv[3] = "-X";
    argv[4] = "POST";
    argv[5] = url;
    argv[6] = "-H";
    argv[7] = "Content-Type: application/json";
    argv[8] = "-d";
    argv[9] = "@-";

    var child = std.process.Child.init(argv, alloc);
    child.stdin_behavior = .Pipe;
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    try child.spawn();

    // Write request body to stdin
    if (child.stdin) |stdin| {
        stdin.writeAll(body_copy) catch {};
        stdin.close();
        child.stdin = null;
    }

    // Set stdout non-blocking
    if (child.stdout) |stdout| {
        const stdout_fd = stdout.handle;
        const flags = std.posix.fcntl(stdout_fd, std.posix.F.GETFL, 0) catch 0;
        const o_nonblock: usize = @as(u32, @bitCast(std.posix.O{ .NONBLOCK = true }));
        _ = std.posix.fcntl(stdout_fd, std.posix.F.SETFL, flags | o_nonblock) catch {};
    }

    state.argv_alloc = argv;
    state.url_alloc = url;
    state.body_alloc = body_copy;
    state.child = child;

    return state;
}

pub fn poll(state: *StreamingState) !bool {
    const child = state.child orelse return true;
    const stdout = child.stdout orelse return true;

    var buf: [4096]u8 = undefined;
    const bytes_read = stdout.read(&buf) catch |err| {
        if (err == error.WouldBlock) return false;
        return true;
    };

    if (bytes_read == 0) {
        return state.is_done;
    }

    // Process SSE data lines
    for (buf[0..bytes_read]) |byte| {
        if (byte == '\n') {
            const line = state.line_buffer[0..state.line_pos];
            if (std.mem.startsWith(u8, line, "data: ")) {
                try state.processChunk(line[6..]);
            }
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
    state.json_buffer.deinit(state.alloc);
    state.json_buffer = .{};
    if (state.stop_reason) |sr| state.alloc.free(sr);
    if (state.argv_alloc) |a| state.alloc.free(a);
    if (state.url_alloc) |u| state.alloc.free(u);
    if (state.body_alloc) |b| state.alloc.free(b);
    state.argv_alloc = null;
    state.url_alloc = null;
    state.body_alloc = null;
    state.stop_reason = null;
    state.message_id = null;
    state.is_done = false;
    state.line_pos = 0;
    state.brace_depth = 0;
    state.in_json_array = false;
}

/// Build Gemini-format request body from messages JSON and tools JSON
pub fn buildRequestBody(alloc: Allocator, model_id: []const u8, messages_json: []const u8, tools_json: []const u8) ![]const u8 {
    const gemini_contents = try convertMessagesToGeminiFormat(alloc, messages_json);
    defer alloc.free(gemini_contents);

    const gemini_tools = try convertToolsToGeminiFormat(alloc, tools_json);
    defer alloc.free(gemini_tools);

    return std.fmt.allocPrint(alloc,
        \\{{"model":"{s}","contents":{s},"tools":[{{"functionDeclarations":{s}}}],"generationConfig":{{"maxOutputTokens":4096}}}}
    , .{ model_id, gemini_contents, gemini_tools });
}

/// Convert chat messages to Gemini format (user/model roles, parts array)
fn convertMessagesToGeminiFormat(alloc: Allocator, messages_json: []const u8) ![]const u8 {
    const parsed = json.parseFromSlice(json.Value, alloc, messages_json, .{}) catch {
        return alloc.dupe(u8, "[]");
    };
    defer parsed.deinit();

    if (parsed.value != .array) return alloc.dupe(u8, "[]");

    var result = ArrayListUnmanaged(u8){};
    try result.append(alloc, '[');
    var first = true;

    for (parsed.value.array.items) |msg| {
        if (msg != .object) continue;
        const role_val = msg.object.get("role") orelse continue;
        const content_val = msg.object.get("content") orelse continue;

        if (role_val != .string) continue;

        if (!first) try result.append(alloc, ',');
        first = false;

        // Map roles: user -> user, assistant -> model
        const gemini_role: []const u8 = if (std.mem.eql(u8, role_val.string, "assistant")) "model" else "user";

        // Get content string
        var content_str: []const u8 = "";
        if (content_val == .string) {
            content_str = content_val.string;
        }

        const escaped_content = json.stringifyAlloc(alloc, content_str, .{}) catch continue;
        defer alloc.free(escaped_content);

        const msg_json = std.fmt.allocPrint(alloc,
            \\{{"role":"{s}","parts":[{{"text":{s}}}]}}
        , .{ gemini_role, escaped_content }) catch continue;
        defer alloc.free(msg_json);
        try result.appendSlice(alloc, msg_json);
    }

    try result.append(alloc, ']');
    return try alloc.dupe(u8, result.items);
}

/// Convert Anthropic-style tools JSON to Gemini functionDeclarations format
fn convertToolsToGeminiFormat(alloc: Allocator, anthropic_tools: []const u8) ![]const u8 {
    const parsed = json.parseFromSlice(json.Value, alloc, anthropic_tools, .{}) catch {
        return alloc.dupe(u8, "[]");
    };
    defer parsed.deinit();

    if (parsed.value != .array) return alloc.dupe(u8, "[]");

    var result = ArrayListUnmanaged(u8){};
    try result.append(alloc, '[');
    var first = true;

    for (parsed.value.array.items) |tool| {
        if (tool != .object) continue;
        const name = tool.object.get("name") orelse continue;
        const desc = tool.object.get("description") orelse continue;
        const schema = tool.object.get("input_schema") orelse continue;

        if (name != .string or desc != .string) continue;

        if (!first) try result.append(alloc, ',');
        first = false;

        const schema_json = json.stringifyAlloc(alloc, schema, .{}) catch continue;
        defer alloc.free(schema_json);

        const escaped_desc = json.stringifyAlloc(alloc, desc.string, .{}) catch continue;
        defer alloc.free(escaped_desc);

        const tool_json = std.fmt.allocPrint(alloc,
            \\{{"name":"{s}","description":{s},"parameters":{s}}}
        , .{ name.string, escaped_desc, schema_json }) catch continue;
        defer alloc.free(tool_json);
        try result.appendSlice(alloc, tool_json);
    }

    try result.append(alloc, ']');
    return try alloc.dupe(u8, result.items);
}
