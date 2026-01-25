// OpenAI Provider - makes HTTP calls to OpenAI Chat Completions API via curl
// Implements AgentProvider interface for OpenAI streaming

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;
const json = std.json;
const obs = @import("../obs.zig");

const provider_interface = @import("provider_interface.zig");
const ToolCallInfo = provider_interface.ToolCallInfo;

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

pub const StreamingState = struct {
    alloc: Allocator,
    child: ?std.process.Child = null,
    accumulated_text: ArrayListUnmanaged(u8) = .{},
    tool_calls: ArrayListUnmanaged(ToolCallInfo) = .{},
    current_tool_id: ?[]const u8 = null,
    current_tool_name: ?[]const u8 = null,
    current_tool_input: ArrayListUnmanaged(u8) = .{},
    line_buffer: [16384]u8 = undefined,
    line_pos: usize = 0,
    is_done: bool = false,
    message_id: ?i64 = null,
    stop_reason: ?[]const u8 = null,
    argv_alloc: ?[]const []const u8 = null,
    auth_header_alloc: ?[]const u8 = null,
    body_alloc: ?[]const u8 = null,

    pub fn init(alloc: Allocator) StreamingState {
        return .{ .alloc = alloc };
    }

    pub fn processLine(self: *StreamingState, line: []const u8) !void {
        if (!std.mem.startsWith(u8, line, "data: ")) return;
        const data = line[6..];
        if (std.mem.eql(u8, data, "[DONE]")) {
            self.is_done = true;
            return;
        }

        const parsed = json.parseFromSlice(json.Value, self.alloc, data, .{}) catch return;
        defer parsed.deinit();

        if (parsed.value != .object) return;

        const choices = parsed.value.object.get("choices") orelse return;
        if (choices != .array or choices.array.items.len == 0) return;

        const choice = choices.array.items[0];
        if (choice != .object) return;

        // Check finish_reason
        if (choice.object.get("finish_reason")) |fr| {
            if (fr == .string) {
                self.stop_reason = self.alloc.dupe(u8, fr.string) catch null;
                if (std.mem.eql(u8, fr.string, "tool_calls")) {
                    self.finalizeCurrentToolCall();
                }
            }
        }

        const delta = choice.object.get("delta") orelse return;
        if (delta != .object) return;

        // Handle text content
        if (delta.object.get("content")) |content| {
            if (content == .string) {
                try self.accumulated_text.appendSlice(self.alloc, content.string);
            }
        }

        // Handle tool calls (OpenAI uses "tool_calls" array in delta)
        if (delta.object.get("tool_calls")) |tool_calls_arr| {
            if (tool_calls_arr == .array) {
                for (tool_calls_arr.array.items) |tc| {
                    if (tc != .object) continue;
                    try self.processToolCallDelta(tc.object);
                }
            }
        }
    }

    fn processToolCallDelta(self: *StreamingState, tc: json.ObjectMap) !void {
        // Check for new tool call (has id and function.name)
        if (tc.get("id")) |id_val| {
            if (id_val == .string) {
                self.finalizeCurrentToolCall();
                self.current_tool_id = try self.alloc.dupe(u8, id_val.string);
            }
        }

        if (tc.get("function")) |func| {
            if (func == .object) {
                if (func.object.get("name")) |name_val| {
                    if (name_val == .string) {
                        if (self.current_tool_name) |n| self.alloc.free(n);
                        self.current_tool_name = try self.alloc.dupe(u8, name_val.string);
                    }
                }
                if (func.object.get("arguments")) |args_val| {
                    if (args_val == .string) {
                        try self.current_tool_input.appendSlice(self.alloc, args_val.string);
                    }
                }
            }
        }
    }

    fn finalizeCurrentToolCall(self: *StreamingState) void {
        if (self.current_tool_id != null and self.current_tool_name != null) {
            const input_copy = self.alloc.dupe(u8, self.current_tool_input.items) catch return;
            self.tool_calls.append(self.alloc, .{
                .id = self.current_tool_id.?,
                .name = self.current_tool_name.?,
                .input_json = input_copy,
            }) catch return;
            self.current_tool_id = null;
            self.current_tool_name = null;
            self.current_tool_input.clearRetainingCapacity();
        }
    }
};

pub fn startStream(alloc: Allocator, api_key: []const u8, request_body: []const u8) !StreamingState {
    var state = StreamingState.init(alloc);

    const auth_header = try std.fmt.allocPrint(alloc, "Authorization: Bearer {s}", .{api_key});
    errdefer alloc.free(auth_header);
    const body_copy = try alloc.dupe(u8, request_body);
    errdefer alloc.free(body_copy);

    const argv = try alloc.alloc([]const u8, 12);
    errdefer alloc.free(argv);
    argv[0] = "curl";
    argv[1] = "-s";
    argv[2] = "-N";
    argv[3] = "-X";
    argv[4] = "POST";
    argv[5] = OPENAI_API_URL;
    argv[6] = "-H";
    argv[7] = "Content-Type: application/json";
    argv[8] = "-H";
    argv[9] = auth_header;
    argv[10] = "-d";
    argv[11] = "@-";

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
    state.auth_header_alloc = auth_header;
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

/// Build OpenAI-format request body from messages JSON and tools JSON
pub fn buildRequestBody(alloc: Allocator, model_id: []const u8, messages_json: []const u8, tools_json: []const u8) ![]const u8 {
    const openai_tools = try convertToolsToOpenAIFormat(alloc, tools_json);
    defer alloc.free(openai_tools);

    return std.fmt.allocPrint(alloc,
        \\{{"model":"{s}","max_tokens":4096,"stream":true,"stream_options":{{"include_usage":true}},"messages":{s},"tools":{s}}}
    , .{ model_id, messages_json, openai_tools });
}

/// Convert Anthropic-style tools JSON to OpenAI function format
fn convertToolsToOpenAIFormat(alloc: Allocator, anthropic_tools: []const u8) ![]const u8 {
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
            \\{{"type":"function","function":{{"name":"{s}","description":{s},"parameters":{s}}}}}
        , .{ name.string, escaped_desc, schema_json }) catch continue;
        defer alloc.free(tool_json);
        try result.appendSlice(alloc, tool_json);
    }

    try result.append(alloc, ']');
    return try alloc.dupe(u8, result.items);
}
