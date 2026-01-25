const std = @import("std");

pub const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    input_json: []const u8,
};

pub const StreamingState = struct {
    child: ?std.process.Child = null,
    message_id: ?i64 = null,
    accumulated_text: std.ArrayListUnmanaged(u8) = .{},
    tool_calls: std.ArrayListUnmanaged(ToolCallInfo) = .{},
    current_tool_id: ?[]const u8 = null,
    current_tool_name: ?[]const u8 = null,
    current_tool_input: std.ArrayListUnmanaged(u8) = .{},
    line_buffer: [8192]u8 = undefined,
    line_pos: usize = 0,
    is_done: bool = false,
    stop_reason: ?[]const u8 = null,
    alloc: std.mem.Allocator,

    pub fn init(alloc: std.mem.Allocator) StreamingState {
        return .{ .alloc = alloc, .current_tool_input = .{} };
    }

    pub fn deinit(self: *StreamingState) void {
        self.cleanup();
    }

    pub fn startStream(self: *StreamingState, api_key: []const u8, request_body: []const u8) !void {
        const auth_header = try std.fmt.allocPrint(self.alloc, "x-api-key: {s}", .{api_key});
        defer self.alloc.free(auth_header);

        var child = std.process.Child.init(&.{
            "curl", "-s", "-N", "-X", "POST", "https://api.anthropic.com/v1/messages",
            "-H", "content-type: application/json",
            "-H", "anthropic-version: 2023-06-01",
            "-H", auth_header,
            "-d", request_body,
        }, self.alloc);
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Pipe;

        try child.spawn();

        if (child.stdout) |stdout| {
            const fd = stdout.handle;
            const F_GETFL = 3;
            const F_SETFL = 4;
            const O_NONBLOCK: usize = 0x0004;
            const flags = std.posix.fcntl(fd, F_GETFL, 0) catch 0;
            _ = std.posix.fcntl(fd, F_SETFL, flags | O_NONBLOCK) catch {};
        }

        self.child = child;
        self.is_done = false;
        self.line_pos = 0;
    }

    pub fn poll(self: *StreamingState) !bool {
        const child = self.child orelse return true;
        const stdout = child.stdout orelse return true;

        var buf: [4096]u8 = undefined;
        const bytes_read = stdout.read(&buf) catch |err| {
            if (err == error.WouldBlock) return false;
            return true;
        };

        if (bytes_read == 0) {
            if (self.is_done) return true;
            return false;
        }

        for (buf[0..bytes_read]) |byte| {
            if (byte == '\n') {
                const line = self.line_buffer[0..self.line_pos];
                try self.processLine(line);
                self.line_pos = 0;
            } else if (self.line_pos < self.line_buffer.len - 1) {
                self.line_buffer[self.line_pos] = byte;
                self.line_pos += 1;
            }
        }

        return false;
    }

    fn processLine(self: *StreamingState, line: []const u8) !void {
        if (!std.mem.startsWith(u8, line, "data: ")) return;
        const data = line[6..];
        if (std.mem.eql(u8, data, "[DONE]")) {
            self.is_done = true;
            return;
        }

        const parsed = std.json.parseFromSlice(std.json.Value, self.alloc, data, .{}) catch return;
        defer parsed.deinit();

        if (parsed.value != .object) return;

        const type_val = parsed.value.object.get("type") orelse return;
        if (type_val != .string) return;
        const event_type = type_val.string;

        if (std.mem.eql(u8, event_type, "message_delta")) {
            if (parsed.value.object.get("delta")) |delta| {
                if (delta == .object) {
                    if (delta.object.get("stop_reason")) |sr| {
                        if (sr == .string) {
                            if (self.stop_reason) |old| self.alloc.free(old);
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
                                    if (self.current_tool_id) |old| self.alloc.free(old);
                                    self.current_tool_id = self.alloc.dupe(u8, id.string) catch null;
                                }
                            }
                            if (block.object.get("name")) |name| {
                                if (name == .string) {
                                    if (self.current_tool_name) |old| self.alloc.free(old);
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
    }

    pub fn getText(self: *StreamingState) []const u8 {
        return self.accumulated_text.items;
    }

    pub fn hasToolCalls(self: *StreamingState) bool {
        return self.tool_calls.items.len > 0;
    }

    pub fn cleanup(self: *StreamingState) void {
        if (self.child) |*child| {
            _ = child.kill() catch {};
            _ = child.wait() catch {};
        }
        self.child = null;
        self.accumulated_text.deinit(self.alloc);
        self.accumulated_text = .{};
        for (self.tool_calls.items) |tc| {
            self.alloc.free(tc.id);
            self.alloc.free(tc.name);
            self.alloc.free(tc.input_json);
        }
        self.tool_calls.deinit(self.alloc);
        self.tool_calls = .{};
        self.current_tool_input.deinit(self.alloc);
        self.current_tool_input = .{};
        if (self.current_tool_id) |id| self.alloc.free(id);
        if (self.current_tool_name) |name| self.alloc.free(name);
        if (self.stop_reason) |sr| self.alloc.free(sr);
        self.current_tool_id = null;
        self.current_tool_name = null;
        self.stop_reason = null;
        self.message_id = null;
        self.is_done = false;
        self.line_pos = 0;
    }
};
