const std = @import("std");

pub const Role = enum {
    user,
    assistant,
    tool_result,
};

pub const ToolCallInfo = struct {
    id: []const u8,
    name: []const u8,
    arguments: []const u8,
};

pub const Message = struct {
    role: Role,
    content: []const u8,
    tool_call_id: ?[]const u8 = null,
    tool_calls: ?[]const ToolCallInfo = null,

    pub fn user(content: []const u8) Message {
        return .{ .role = .user, .content = content };
    }

    pub fn assistant(content: []const u8) Message {
        return .{ .role = .assistant, .content = content };
    }

    pub fn assistantWithToolCalls(content: []const u8, tool_calls: []const ToolCallInfo) Message {
        return .{ .role = .assistant, .content = content, .tool_calls = tool_calls };
    }

    pub fn toolResult(id: []const u8, content: []const u8) Message {
        return .{ .role = .tool_result, .content = content, .tool_call_id = id };
    }
};

pub const ThinkingLevel = enum {
    off,
    minimal,
    low,
    medium,
    high,

    const Self = @This();

    pub fn budgetTokens(self: Self) u32 {
        return switch (self) {
            .off => 0,
            .minimal => 1024,
            .low => 2048,
            .medium => 8192,
            .high => 16384,
        };
    }

    pub fn isEnabled(self: Self) bool {
        return self != .off;
    }

    pub fn toString(self: Self) []const u8 {
        return switch (self) {
            .off => "off",
            .minimal => "minimal",
            .low => "low",
            .medium => "medium",
            .high => "high",
        };
    }

    pub fn parse(str: []const u8) ?Self {
        if (std.mem.eql(u8, str, "off")) return .off;
        if (std.mem.eql(u8, str, "minimal")) return .minimal;
        if (std.mem.eql(u8, str, "low")) return .low;
        if (std.mem.eql(u8, str, "medium")) return .medium;
        if (std.mem.eql(u8, str, "high")) return .high;
        return null;
    }
};

pub const AgentConfig = struct {
    model: []const u8 = "claude-sonnet-4-20250514",
    max_turns: u32 = 100,
    thinking_level: ThinkingLevel = .off,
    system_prompt: ?[]const u8 = null,
    tools_enabled: bool = true,
};

// Event payload structs for rich event data
pub const MessageInfo = struct {
    message_id: ?i64 = null,
    content: []const u8 = "",
};

pub const MessageUpdate = struct {
    message_id: ?i64 = null,
    delta: []const u8 = "",
    accumulated: []const u8 = "",
};

pub const ToolStartInfo = struct {
    tool_call_id: []const u8,
    tool_name: []const u8,
    args_json: []const u8,
};

pub const ToolUpdateInfo = struct {
    tool_call_id: []const u8,
    tool_name: []const u8,
    partial_result: []const u8,
};

pub const ToolEndInfo = struct {
    tool_call_id: []const u8,
    tool_name: []const u8,
    result: []const u8,
    is_error: bool,
};

pub const TurnEndInfo = struct {
    turn: u32,
    has_tool_calls: bool,
};

/// Agent lifecycle events - mirrors Pi implementation
/// Used for decoupled UI updates, logging, and testing
pub const AgentEvent = union(enum) {
    agent_start,
    turn_start: u32,
    message_start: MessageInfo,
    message_update: MessageUpdate,
    message_end: MessageInfo,
    tool_start: ToolStartInfo,
    tool_update: ToolUpdateInfo,
    tool_end: ToolEndInfo,
    turn_end: TurnEndInfo,
    agent_end,
    agent_error: []const u8,

    pub fn format(self: AgentEvent, comptime _: []const u8, _: std.fmt.FormatOptions, writer: anytype) !void {
        switch (self) {
            .agent_start => try writer.writeAll("agent_start"),
            .turn_start => |turn| try writer.print("turn_start({})", .{turn}),
            .message_start => |info| try writer.print("message_start(id={})", .{info.message_id orelse 0}),
            .message_update => |info| try writer.print("message_update(id={}, delta_len={})", .{ info.message_id orelse 0, info.delta.len }),
            .message_end => |info| try writer.print("message_end(id={})", .{info.message_id orelse 0}),
            .tool_start => |info| try writer.print("tool_start({s})", .{info.tool_name}),
            .tool_update => |info| try writer.print("tool_update({s})", .{info.tool_name}),
            .tool_end => |info| try writer.print("tool_end({s}, err={})", .{ info.tool_name, info.is_error }),
            .turn_end => |info| try writer.print("turn_end({}, tools={})", .{ info.turn, info.has_tool_calls }),
            .agent_end => try writer.writeAll("agent_end"),
            .agent_error => |msg| try writer.print("agent_error({s})", .{msg}),
        }
    }
};

/// Thread-safe event queue for agent → UI communication
pub fn EventQueue(comptime capacity: usize) type {
    return struct {
        const Self = @This();

        buffer: [capacity]AgentEvent = undefined,
        write_idx: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
        read_idx: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),

        pub fn push(self: *Self, event: AgentEvent) bool {
            const w = self.write_idx.load(.acquire);
            const r = self.read_idx.load(.acquire);
            const next_w = (w + 1) % capacity;

            // Queue full
            if (next_w == r) return false;

            self.buffer[w] = event;
            self.write_idx.store(next_w, .release);
            return true;
        }

        pub fn pop(self: *Self) ?AgentEvent {
            const r = self.read_idx.load(.acquire);
            const w = self.write_idx.load(.acquire);

            // Queue empty
            if (r == w) return null;

            const event = self.buffer[r];
            self.read_idx.store((r + 1) % capacity, .release);
            return event;
        }

        pub fn isEmpty(self: *const Self) bool {
            return self.read_idx.load(.acquire) == self.write_idx.load(.acquire);
        }

        pub fn len(self: *const Self) usize {
            const w = self.write_idx.load(.acquire);
            const r = self.read_idx.load(.acquire);
            return if (w >= r) w - r else capacity - r + w;
        }

        /// Drain all events into a slice (for batch processing)
        pub fn drainInto(self: *Self, out: []AgentEvent) usize {
            var count: usize = 0;
            while (count < out.len) {
                if (self.pop()) |event| {
                    out[count] = event;
                    count += 1;
                } else break;
            }
            return count;
        }
    };
}

// Legacy types for backward compatibility
pub const EventType = enum {
    turn_start,
    turn_end,
    text_delta,
    tool_start,
    tool_end,
    agent_end,
    agent_error,
};

pub const LegacyAgentEvent = struct {
    type: EventType,
    turn: u32 = 0,
    text: ?[]const u8 = null,
    tool_name: ?[]const u8 = null,
    tool_id: ?[]const u8 = null,
    error_message: ?[]const u8 = null,
};
