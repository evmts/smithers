// Interactive Mode per God-TUI spec §5 (Phase 11)
// Full TUI mode with chat history, input editor, and agent loop

const std = @import("std");
const Allocator = std.mem.Allocator;

pub const InteractiveMode = struct {
    allocator: Allocator,
    is_running: bool = false,
    model: []const u8 = "claude-sonnet-4",
    version: []const u8 = "0.1.0",
    session_id: ?[]const u8 = null,
    
    // Message storage (simplified for now)
    messages: std.ArrayListUnmanaged(StoredMessage) = .{},

    const Self = @This();

    pub const StoredMessage = struct {
        role: MessageRole,
        content: []const u8,
    };

    pub const MessageRole = enum {
        user,
        assistant,
        system,
    };

    pub fn init(allocator: Allocator) Self {
        return .{
            .allocator = allocator,
            .messages = .{},
        };
    }

    pub fn deinit(self: *Self) void {
        for (self.messages.items) |msg| {
            self.allocator.free(msg.content);
        }
        self.messages.deinit(self.allocator);
    }

    pub fn setModel(self: *Self, model: []const u8) void {
        self.model = model;
    }

    pub fn setSessionId(self: *Self, session_id: []const u8) void {
        self.session_id = session_id;
    }

    pub fn run(self: *Self) !void {
        self.is_running = true;

        // In a real implementation, this would:
        // 1. Initialize terminal in raw mode
        // 2. Set up rendering loop
        // 3. Handle input events
        // 4. Manage agent loop for AI responses
        // 5. Handle slash commands

        // Stub: just mark as not running since we don't have full terminal integration yet
        self.is_running = false;
    }

    pub fn handleInput(self: *Self, input: []const u8) !void {
        if (input.len == 0) return;

        // Check for slash commands
        if (input[0] == '/') {
            self.handleCommand(input[1..]);
            return;
        }

        // Add user message
        try self.addMessage(.user, input);
    }

    fn handleCommand(self: *Self, cmd: []const u8) void {
        if (std.mem.eql(u8, cmd, "help")) {
            self.showHelp();
        } else if (std.mem.eql(u8, cmd, "clear")) {
            self.clear();
        } else if (std.mem.eql(u8, cmd, "exit") or std.mem.eql(u8, cmd, "quit")) {
            self.is_running = false;
        } else if (std.mem.startsWith(u8, cmd, "model ")) {
            self.setModel(cmd[6..]);
        }
    }

    fn showHelp(self: *Self) void {
        self.addMessage(.system, "Available commands:") catch {};
        self.addMessage(.system, "  /help   - Show this help") catch {};
        self.addMessage(.system, "  /clear  - Clear chat history") catch {};
        self.addMessage(.system, "  /model  - Change model") catch {};
        self.addMessage(.system, "  /exit   - Exit god-agent") catch {};
    }

    pub fn addMessage(self: *Self, role: MessageRole, content: []const u8) !void {
        const owned = try self.allocator.dupe(u8, content);
        try self.messages.append(self.allocator, .{ .role = role, .content = owned });
    }

    pub fn clear(self: *Self) void {
        for (self.messages.items) |msg| {
            self.allocator.free(msg.content);
        }
        self.messages.clearRetainingCapacity();
    }

    pub fn messageCount(self: *Self) usize {
        return self.messages.items.len;
    }

    pub fn onAgentResponse(self: *Self, content: []const u8) !void {
        try self.addMessage(.assistant, content);
    }

    pub fn onAgentError(self: *Self, err: []const u8) !void {
        try self.addMessage(.system, err);
    }
};

// ============ Tests ============

test "InteractiveMode init" {
    const allocator = std.testing.allocator;
    var mode = InteractiveMode.init(allocator);
    defer mode.deinit();

    try std.testing.expect(!mode.is_running);
    try std.testing.expectEqualStrings("claude-sonnet-4", mode.model);
}

test "InteractiveMode handle input" {
    const allocator = std.testing.allocator;
    var mode = InteractiveMode.init(allocator);
    defer mode.deinit();

    try mode.handleInput("Hello world");

    try std.testing.expectEqual(@as(usize, 1), mode.messageCount());
}

test "InteractiveMode slash command clear" {
    const allocator = std.testing.allocator;
    var mode = InteractiveMode.init(allocator);
    defer mode.deinit();

    try mode.handleInput("Message 1");
    try mode.handleInput("Message 2");
    try std.testing.expectEqual(@as(usize, 2), mode.messageCount());

    try mode.handleInput("/clear");
    try std.testing.expectEqual(@as(usize, 0), mode.messageCount());
}

test "InteractiveMode slash command exit" {
    const allocator = std.testing.allocator;
    var mode = InteractiveMode.init(allocator);
    defer mode.deinit();

    mode.is_running = true;
    try mode.handleInput("/exit");

    try std.testing.expect(!mode.is_running);
}

test "InteractiveMode set model" {
    const allocator = std.testing.allocator;
    var mode = InteractiveMode.init(allocator);
    defer mode.deinit();

    try mode.handleInput("/model gpt-4");
    try std.testing.expectEqualStrings("gpt-4", mode.model);
}
