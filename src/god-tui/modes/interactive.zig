// Interactive Mode per God-TUI spec §5 (Phase 11)
// Full TUI mode with chat history, input editor, and agent loop

const std = @import("std");
const Allocator = std.mem.Allocator;

const terminal_mod = @import("terminal");
const Terminal = terminal_mod.Terminal;
const renderer_mod = @import("rendering");
const RendererState = renderer_mod.RendererState;
const RenderOutput = renderer_mod.RenderOutput;
const header_mod = @import("header");
const HeaderComponent = header_mod.HeaderComponent;
const chat_mod = @import("chat");
const ChatContainer = chat_mod.ChatContainer;
const status_mod = @import("status");
const StatusBar = status_mod.StatusBar;

pub const InteractiveMode = struct {
    allocator: Allocator,
    is_running: bool = false,
    model: []const u8 = "claude-sonnet-4",
    version: []const u8 = "0.1.0",
    session_id: ?[]const u8 = null,

    terminal: Terminal,
    renderer_state: RendererState,
    render_output: RenderOutput,
    header: HeaderComponent,
    chat: ChatContainer,
    status: StatusBar,
    input_buffer: std.ArrayListUnmanaged(u8) = .{},

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
            .terminal = Terminal.init(allocator),
            .renderer_state = RendererState.init(allocator),
            .render_output = RenderOutput.init(allocator),
            .header = HeaderComponent.init(allocator, "0.1.0", "claude-sonnet-4"),
            .chat = ChatContainer.init(allocator),
            .status = StatusBar.init(allocator),
            .input_buffer = .{},
        };
    }

    pub fn deinit(self: *Self) void {
        self.input_buffer.deinit(self.allocator);
        self.status.deinit();
        self.chat.deinit();
        self.header.deinit();
        self.render_output.deinit();
        self.renderer_state.deinit();
        self.terminal.deinit();
    }

    pub fn setModel(self: *Self, new_model: []const u8) void {
        self.model = new_model;
        self.header.setModel(new_model);
    }

    pub fn setSessionId(self: *Self, sid: []const u8) void {
        self.session_id = sid;
        self.header.setSessionId(sid);
    }

    pub fn run(self: *Self) !void {
        self.is_running = true;

        try self.terminal.start(onInputCallback, onResizeCallback, self);
        defer self.terminal.stop();

        try self.renderUI();
        try self.terminal.flush();

        while (self.is_running) {
            var buf: [256]u8 = undefined;
            const n = std.posix.read(self.terminal.stdin, &buf) catch |err| {
                if (err == error.WouldBlock) continue;
                break;
            };
            if (n == 0) break;
            try self.terminal.processInput(buf[0..n]);

            if (self.renderer_state.isRenderRequested()) {
                try self.renderUI();
                try self.terminal.flush();
            }
        }
    }

    fn onInputCallback(data: []const u8, ctx: ?*anyopaque) void {
        const self: *Self = @ptrCast(@alignCast(ctx));
        self.onInput(data) catch {};
    }

    fn onResizeCallback(ctx: ?*anyopaque) void {
        const self: *Self = @ptrCast(@alignCast(ctx));
        self.renderer_state.requestRender();
    }

    fn onInput(self: *Self, data: []const u8) !void {
        for (data) |byte| {
            switch (byte) {
                3 => { // Ctrl+C
                    self.is_running = false;
                    return;
                },
                12 => { // Ctrl+L
                    self.chat.clear();
                    self.renderer_state.requestRender();
                },
                13, 10 => { // Enter
                    if (self.input_buffer.items.len > 0) {
                        try self.handleInput(self.input_buffer.items);
                        self.input_buffer.clearRetainingCapacity();
                        self.renderer_state.requestRender();
                    }
                },
                127 => { // Backspace
                    if (self.input_buffer.items.len > 0) {
                        _ = self.input_buffer.pop();
                        self.renderer_state.requestRender();
                    }
                },
                else => {
                    if (byte >= 32 and byte < 127) {
                        try self.input_buffer.append(self.allocator, byte);
                        self.renderer_state.requestRender();
                    }
                },
            }
        }
    }

    pub fn renderUI(self: *Self) !void {
        const width: u32 = self.terminal.columns;

        var all_lines = std.ArrayListUnmanaged([]const u8){};
        defer {
            for (all_lines.items) |line| self.allocator.free(@constCast(line));
            all_lines.deinit(self.allocator);
        }

        const header_lines = try self.header.renderWithAllocator(width, self.allocator);
        defer self.allocator.free(header_lines);
        for (header_lines) |line| try all_lines.append(self.allocator, line);

        try all_lines.append(self.allocator, try self.allocator.dupe(u8, ""));

        const chat_lines = try self.chat.renderWithAllocator(width, self.allocator);
        defer self.allocator.free(chat_lines);
        for (chat_lines) |line| try all_lines.append(self.allocator, line);

        const input_line = try std.fmt.allocPrint(self.allocator, "> {s}", .{self.input_buffer.items});
        try all_lines.append(self.allocator, input_line);

        try all_lines.append(self.allocator, try self.allocator.dupe(u8, ""));

        const status_lines = try self.status.renderWithAllocator(width, self.allocator);
        defer self.allocator.free(status_lines);
        for (status_lines) |line| try all_lines.append(self.allocator, line);

        try renderer_mod.doRender(
            &self.renderer_state,
            &self.render_output,
            all_lines.items,
            @intCast(width),
            &[_]renderer_mod.Overlay{},
        );

        try self.terminal.write(self.render_output.getOutput());
        self.render_output.clear();
    }

    pub fn handleInput(self: *Self, input: []const u8) !void {
        if (input.len == 0) return;

        if (input[0] == '/') {
            self.handleCommand(input[1..]);
            return;
        }

        self.chat.addUserMessage(input);
    }

    fn handleCommand(self: *Self, cmd: []const u8) void {
        if (std.mem.eql(u8, cmd, "help")) {
            self.showHelp();
        } else if (std.mem.eql(u8, cmd, "clear")) {
            self.chat.clear();
        } else if (std.mem.eql(u8, cmd, "exit") or std.mem.eql(u8, cmd, "quit")) {
            self.is_running = false;
        } else if (std.mem.startsWith(u8, cmd, "model ")) {
            self.setModel(cmd[6..]);
        }
    }

    fn showHelp(self: *Self) void {
        self.chat.addSystemMessage("Available commands:");
        self.chat.addSystemMessage("  /help   - Show this help");
        self.chat.addSystemMessage("  /clear  - Clear chat history");
        self.chat.addSystemMessage("  /model  - Change model");
        self.chat.addSystemMessage("  /exit   - Exit god-agent");
    }

    pub fn messageCount(self: *Self) usize {
        return self.chat.messageCount();
    }

    pub fn onAgentResponse(self: *Self, content: []const u8) void {
        self.chat.addAssistantMessage(content);
    }

    pub fn onAgentError(self: *Self, err_msg: []const u8) void {
        self.chat.addSystemMessage(err_msg);
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
