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
    low,
    medium,
    high,
};

pub const AgentConfig = struct {
    model: []const u8 = "claude-sonnet-4-20250514",
    max_turns: u32 = 100,
    thinking_level: ThinkingLevel = .off,
    system_prompt: ?[]const u8 = null,
    tools_enabled: bool = true,
};

pub const EventType = enum {
    turn_start,
    turn_end,
    text_delta,
    tool_start,
    tool_end,
    agent_end,
    agent_error,
};

pub const AgentEvent = struct {
    type: EventType,
    turn: u32 = 0,
    text: ?[]const u8 = null,
    tool_name: ?[]const u8 = null,
    tool_id: ?[]const u8 = null,
    error_message: ?[]const u8 = null,
};
