// Chat Container per God-TUI spec §5 (Phase 11)
// Message history display with user/assistant/tool call rendering

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayListUnmanaged = std.ArrayListUnmanaged;

pub const RenderError = error{OutOfMemory};

pub const MessageRole = enum {
    user,
    assistant,
    system,
    tool,
};

pub const ToolCall = struct {
    id: []const u8,
    name: []const u8,
    arguments: []const u8,
    result: ?[]const u8 = null,
    is_complete: bool = false,
};

pub const ChatMessage = struct {
    role: MessageRole,
    content: []const u8,
    tool_call: ?ToolCall = null,
    timestamp: i64,
};

pub const ChatContainer = struct {
    messages: ArrayListUnmanaged(ChatMessage) = .{},
    allocator: Allocator,
    scroll_offset: u32 = 0,
    cached_lines: ?[][]const u8 = null,
    cached_width: u32 = 0,
    valid: bool = false,

    const Self = @This();
    const USER_PREFIX = "\x1b[1;34m❯\x1b[0m ";
    const ASSISTANT_PREFIX = "\x1b[1;32m●\x1b[0m ";
    const TOOL_PREFIX = "\x1b[1;33m⚙\x1b[0m ";
    const SYSTEM_PREFIX = "\x1b[2m•\x1b[0m ";

    pub fn init(allocator: Allocator) Self {
        return .{
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        self.clearCache();
        self.messages.deinit(self.allocator);
    }

    pub fn addUserMessage(self: *Self, content: []const u8) void {
        self.messages.append(self.allocator, .{
            .role = .user,
            .content = content,
            .timestamp = std.time.timestamp(),
        }) catch return;
        self.invalidate();
    }

    pub fn addAssistantMessage(self: *Self, content: []const u8) void {
        self.messages.append(self.allocator, .{
            .role = .assistant,
            .content = content,
            .timestamp = std.time.timestamp(),
        }) catch return;
        self.invalidate();
    }

    pub fn addSystemMessage(self: *Self, content: []const u8) void {
        self.messages.append(self.allocator, .{
            .role = .system,
            .content = content,
            .timestamp = std.time.timestamp(),
        }) catch return;
        self.invalidate();
    }

    pub fn addToolCall(self: *Self, tool: ToolCall) void {
        self.messages.append(self.allocator, .{
            .role = .tool,
            .content = "",
            .tool_call = tool,
            .timestamp = std.time.timestamp(),
        }) catch return;
        self.invalidate();
    }

    pub fn updateToolResult(self: *Self, tool_id: []const u8, result: []const u8) void {
        for (self.messages.items) |*msg| {
            if (msg.tool_call) |*tc| {
                if (std.mem.eql(u8, tc.id, tool_id)) {
                    tc.result = result;
                    tc.is_complete = true;
                    self.invalidate();
                    return;
                }
            }
        }
    }

    pub fn clear(self: *Self) void {
        self.messages.clearRetainingCapacity();
        self.scroll_offset = 0;
        self.invalidate();
    }

    pub fn messageCount(self: *const Self) usize {
        return self.messages.items.len;
    }

    pub fn scrollUp(self: *Self, lines: u32) void {
        if (self.scroll_offset >= lines) {
            self.scroll_offset -= lines;
        } else {
            self.scroll_offset = 0;
        }
        self.invalidate();
    }

    pub fn scrollDown(self: *Self, lines: u32) void {
        self.scroll_offset += lines;
        self.invalidate();
    }

    pub fn invalidate(self: *Self) void {
        self.valid = false;
        self.clearCache();
    }

    fn clearCache(self: *Self) void {
        if (self.cached_lines) |lines| {
            for (lines) |line| {
                self.allocator.free(@constCast(line));
            }
            self.allocator.free(lines);
            self.cached_lines = null;
        }
    }

    pub fn render(self: *Self, width: u32) ![][]const u8 {
        return self.renderWithAllocator(width, self.allocator);
    }

    pub fn renderWithAllocator(self: *Self, width: u32, allocator: Allocator) RenderError![][]const u8 {
        if (width == 0) {
            return try allocator.alloc([]const u8, 0);
        }

        var all_lines = ArrayListUnmanaged([]const u8){};
        errdefer {
            for (all_lines.items) |line| allocator.free(@constCast(line));
            all_lines.deinit(allocator);
        }

        for (self.messages.items) |msg| {
            const prefix = switch (msg.role) {
                .user => USER_PREFIX,
                .assistant => ASSISTANT_PREFIX,
                .tool => TOOL_PREFIX,
                .system => SYSTEM_PREFIX,
            };

            if (msg.role == .tool) {
                if (msg.tool_call) |tc| {
                    const tool_line = try std.fmt.allocPrint(allocator, "{s}{s}({s})", .{ prefix, tc.name, tc.arguments });
                    try all_lines.append(allocator, tool_line);

                    if (tc.result) |result| {
                        const result_line = try std.fmt.allocPrint(allocator, "  → {s}", .{result});
                        try all_lines.append(allocator, result_line);
                    } else if (!tc.is_complete) {
                        const pending = try allocator.dupe(u8, "  → Running...");
                        try all_lines.append(allocator, pending);
                    }
                }
            } else {
                const line = try std.fmt.allocPrint(allocator, "{s}{s}", .{ prefix, msg.content });
                try all_lines.append(allocator, line);
            }

            // Empty line between messages
            try all_lines.append(allocator, try allocator.dupe(u8, ""));
        }

        return try all_lines.toOwnedSlice(allocator);
    }

};

// ============ Tests ============

test "ChatContainer add messages" {
    const allocator = std.testing.allocator;
    var chat = ChatContainer.init(allocator);
    defer chat.deinit();

    chat.addUserMessage("Hello");
    chat.addAssistantMessage("Hi there!");

    try std.testing.expectEqual(@as(usize, 2), chat.messageCount());
}

test "ChatContainer render user message" {
    const allocator = std.testing.allocator;
    var chat = ChatContainer.init(allocator);
    defer chat.deinit();

    chat.addUserMessage("Test message");

    const lines = try chat.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(lines.len >= 1);
    try std.testing.expect(std.mem.indexOf(u8, lines[0], "Test message") != null);
}

test "ChatContainer add tool call" {
    const allocator = std.testing.allocator;
    var chat = ChatContainer.init(allocator);
    defer chat.deinit();

    chat.addToolCall(.{
        .id = "tool_1",
        .name = "read_file",
        .arguments = "path=/test.txt",
    });

    try std.testing.expectEqual(@as(usize, 1), chat.messageCount());

    const lines = try chat.renderWithAllocator(80, allocator);
    defer {
        for (lines) |line| allocator.free(@constCast(line));
        allocator.free(lines);
    }

    try std.testing.expect(std.mem.indexOf(u8, lines[0], "read_file") != null);
}

test "ChatContainer clear" {
    const allocator = std.testing.allocator;
    var chat = ChatContainer.init(allocator);
    defer chat.deinit();

    chat.addUserMessage("Message 1");
    chat.addUserMessage("Message 2");
    try std.testing.expectEqual(@as(usize, 2), chat.messageCount());

    chat.clear();
    try std.testing.expectEqual(@as(usize, 0), chat.messageCount());
}

test "ChatContainer zero width" {
    const allocator = std.testing.allocator;
    var chat = ChatContainer.init(allocator);
    defer chat.deinit();

    chat.addUserMessage("Test");

    const lines = try chat.renderWithAllocator(0, allocator);
    defer allocator.free(lines);

    try std.testing.expectEqual(@as(usize, 0), lines.len);
}
