// Interactive Mode per God-TUI spec §5 (Phase 11)
// Full TUI mode with chat history, input editor, and agent loop

const std = @import("std");
const posix = std.posix;
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
const debug = @import("debug");

const agent_mod = @import("agent");
const Agent = agent_mod.Agent;
const AgentConfig = agent_mod.AgentConfig;
const AgentEvent = agent_mod.AgentEvent;
const Message = agent_mod.Message;
const AgentProvider = agent_mod.AgentProvider;
const ProviderConfig = agent_mod.ProviderConfig;
const AnthropicProvider = agent_mod.AnthropicProvider;
const createAnthropicProvider = agent_mod.createAnthropicProvider;

// Global context for event handler (one interactive mode per process)
var g_interactive_mode: ?*InteractiveMode = null;

pub const InteractiveMode = struct {
    allocator: Allocator,
    is_running: bool = false,
    model: []const u8 = "claude-sonnet-4",
    version: []const u8 = "0.1.0",
    session_id: ?[]const u8 = null,
    is_busy: bool = false,
    pending_input: ?[]const u8 = null, // Queue input while busy
    current_tool: ?[]const u8 = null, // Currently running tool name

    terminal: Terminal,
    renderer_state: RendererState,
    render_output: RenderOutput,
    header: HeaderComponent,
    chat: ChatContainer,
    status: StatusBar,
    input_buffer: std.ArrayListUnmanaged(u8) = .{},
    agent: ?*Agent = null,
    anthropic_provider: ?*AnthropicProvider = null,

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
        debug.init();
        debug.log("InteractiveMode initializing", .{});

        var self = Self{
            .allocator = allocator,
            .terminal = Terminal.init(allocator),
            .renderer_state = RendererState.init(allocator),
            .render_output = RenderOutput.init(allocator),
            .header = HeaderComponent.init(allocator, "0.1.0", "claude-sonnet-4"),
            .chat = ChatContainer.init(allocator),
            .status = StatusBar.init(allocator),
            .input_buffer = .{},
            .agent = null,
            .anthropic_provider = null,
        };

        // Initialize agent with Anthropic provider if available
        self.initAgent();
        debug.log("InteractiveMode initialized, agent={any}", .{self.agent != null});
        return self;
    }

    fn initAgent(self: *Self) void {
        const agent = self.allocator.create(Agent) catch return;
        agent.* = Agent.init(self.allocator, AgentConfig{
            .model = self.model,
            .system_prompt = "You are a helpful AI coding assistant.",
        });

        // Try to set up Anthropic provider
        if (createAnthropicProvider(self.allocator)) |prov| {
            self.anthropic_provider = prov;
            const provider_config = ProviderConfig{
                .model_id = self.model,
                .api_key = posix.getenv("ANTHROPIC_API_KEY"),
            };
            const agent_provider = AgentProvider.init(self.allocator, prov.interface(), provider_config);
            agent.* = agent.withProvider(agent_provider);
        } else |_| {}

        self.agent = agent;
    }

    pub fn deinit(self: *Self) void {
        debug.log("InteractiveMode deinit", .{});
        if (self.pending_input) |pi| {
            self.allocator.free(pi);
        }
        if (self.agent) |agent| {
            agent.deinit();
            self.allocator.destroy(agent);
        }
        if (self.anthropic_provider) |prov| {
            prov.deinit();
            self.allocator.destroy(prov);
        }
        self.input_buffer.deinit(self.allocator);
        self.status.deinit();
        self.chat.deinit();
        self.header.deinit();
        self.render_output.deinit();
        self.renderer_state.deinit();
        self.terminal.deinit();
        debug.deinit();
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

        self.terminal.start(onInputCallback, onResizeCallback, self) catch |err| {
            if (err == error.NotATty) {
                std.debug.print("Error: Interactive mode requires a TTY. Use -p/--print for non-interactive mode.\n", .{});
                return error.NotATty;
            }
            return err;
        };
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
        self.renderUIInternal(false) catch {};
    }

    /// Force a full screen clear and render (used after agent calls)
    pub fn renderUIFull(self: *Self) !void {
        self.renderUIInternal(true) catch {};
    }

    fn renderUIInternal(self: *Self, force_clear: bool) !void {
        const width: u32 = self.terminal.columns;
        debug.logRender("renderUI: width={d}, force_clear={any}", .{ width, force_clear });

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

        // Add cursor marker to input line for proper cursor positioning
        const cursor_marker = "\x1b_pi:c\x07"; // CURSOR_MARKER from renderer
        const input_line = try std.fmt.allocPrint(self.allocator, "> {s}{s}", .{ self.input_buffer.items, cursor_marker });
        try all_lines.append(self.allocator, input_line);

        try all_lines.append(self.allocator, try self.allocator.dupe(u8, ""));

        const status_lines = try self.status.renderWithAllocator(width, self.allocator);
        defer self.allocator.free(status_lines);
        for (status_lines) |line| try all_lines.append(self.allocator, line);

        debug.logRender("renderUI: total lines={d}", .{all_lines.items.len});

        // Force a full clear if requested (resets renderer state)
        if (force_clear) {
            self.renderer_state.previous_width = 0; // Force full_with_clear mode
        }

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
        debug.log("handleInput: len={d}, busy={any}", .{ input.len, self.is_busy });
        if (input.len == 0) return;

        if (input[0] == '/') {
            self.handleCommand(input[1..]);
            return;
        }

        // If busy, queue the input for later
        if (self.is_busy) {
            debug.log("handleInput: busy, queueing input", .{});
            if (self.pending_input) |old| {
                self.allocator.free(old);
            }
            self.pending_input = self.allocator.dupe(u8, input) catch null;
            self.chat.addSystemMessage("(queued - waiting for response...)");
            self.renderer_state.requestRender();
            return;
        }

        // Add user message to chat display
        self.chat.addUserMessage(input);

        // Send to agent if available
        if (self.agent) |agent| {
            self.is_busy = true;
            self.status.setBusy(true);
            self.status.setCustomStatus("Thinking...");
            self.renderer_state.requestRender();

            // Render immediately to show loading state
            self.renderUI() catch {};
            self.terminal.flush() catch {};

            debug.logAgent("sending prompt to agent", .{});

            // Set up event handler to stream responses
            g_interactive_mode = self;
            agent.on_event = handleAgentEvent;

            // Send message to agent
            agent.prompt(Message.user(input)) catch |err| {
                debug.logAgent("agent.prompt error: {any}", .{err});
                self.chat.addSystemMessage("Error: Failed to get response");
                self.is_busy = false;
                self.status.setBusy(false);
                self.status.setCustomStatus(null);
                self.renderer_state.requestRender();
                return;
            };

            debug.logAgent("agent.prompt completed, messages={d}", .{agent.messages.items.len});

            // Get the last assistant message and display it
            const messages = agent.messages.items;
            var found_response = false;
            for (0..messages.len) |i| {
                const msg = messages[messages.len - 1 - i];
                if (msg.role == .assistant) {
                    debug.logAgent("found assistant message, len={d}", .{msg.content.len});
                    self.chat.addAssistantMessage(msg.content);
                    found_response = true;
                    break;
                }
            }

            if (!found_response) {
                debug.logAgent("no assistant message found in {d} messages", .{messages.len});
            }

            self.is_busy = false;
            self.status.setBusy(false);
            self.status.setCustomStatus(null);

            // Force full screen clear after agent call to clean up any stray output
            self.renderUIFull() catch {};
            self.terminal.flush() catch {};

            // Process any pending input
            if (self.pending_input) |pending| {
                debug.log("processing pending input", .{});
                self.pending_input = null;
                defer self.allocator.free(pending);
                self.handleInput(pending) catch {};
            }
        }
    }

    fn handleAgentEvent(event: AgentEvent) void {
        const self = g_interactive_mode orelse return;

        switch (event.type) {
            .tool_start => {
                if (event.tool_name) |name| {
                    debug.logAgent("tool_start: {s}", .{name});
                    // Update status to show tool being used
                    const status_msg = std.fmt.allocPrint(self.allocator, "Running: {s}...", .{name}) catch return;
                    defer self.allocator.free(status_msg);
                    self.status.setCustomStatus(status_msg);
                    self.current_tool = name;

                    // Add tool call to chat display
                    self.chat.addToolCall(.{
                        .id = event.tool_id orelse "",
                        .name = name,
                        .arguments = "",
                    });

                    // Render update
                    self.renderUI() catch {};
                    self.terminal.flush() catch {};
                }
            },
            .tool_end => {
                if (event.tool_name) |name| {
                    debug.logAgent("tool_end: {s}", .{name});
                    // Update tool result in chat
                    if (event.tool_id) |id| {
                        self.chat.updateToolResult(id, "✓ completed");
                    }
                    self.current_tool = null;
                    self.status.setCustomStatus("Thinking...");

                    // Render update
                    self.renderUI() catch {};
                    self.terminal.flush() catch {};
                }
            },
            .turn_start => {
                debug.logAgent("turn_start: {d}", .{event.turn});
            },
            .turn_end => {
                debug.logAgent("turn_end: {d}", .{event.turn});
            },
            .agent_error => {
                if (event.error_message) |err| {
                    debug.logAgent("agent_error: {s}", .{err});
                    self.chat.addSystemMessage(err);
                    self.renderUI() catch {};
                    self.terminal.flush() catch {};
                }
            },
            else => {},
        }
    }

    fn handleCommand(self: *Self, cmd: []const u8) void {
        debug.log("handleCommand: '{s}'", .{cmd});
        if (std.mem.eql(u8, cmd, "help")) {
            self.showHelp();
        } else if (std.mem.eql(u8, cmd, "clear")) {
            self.chat.clear();
            // Force full screen clear to remove any stray content
            self.renderUIFull() catch {};
            self.terminal.flush() catch {};
        } else if (std.mem.eql(u8, cmd, "exit") or std.mem.eql(u8, cmd, "quit")) {
            self.is_running = false;
        } else if (std.mem.eql(u8, cmd, "model")) {
            // /model with no argument - show current model
            const msg = std.fmt.allocPrint(self.allocator, "Current model: {s}. Use /model <name> to change.", .{self.model}) catch return;
            defer self.allocator.free(msg);
            self.chat.addSystemMessage(msg);
            self.renderer_state.requestRender();
        } else if (std.mem.startsWith(u8, cmd, "model ")) {
            const new_model = std.mem.trim(u8, cmd[6..], " ");
            if (new_model.len == 0) {
                self.chat.addSystemMessage("Usage: /model <model-name>");
            } else {
                self.setModel(new_model);
                const msg = std.fmt.allocPrint(self.allocator, "Model changed to: {s}", .{new_model}) catch return;
                defer self.allocator.free(msg);
                self.chat.addSystemMessage(msg);
            }
            self.renderer_state.requestRender();
        } else {
            const msg = std.fmt.allocPrint(self.allocator, "Unknown command: /{s}. Type /help for available commands.", .{cmd}) catch return;
            defer self.allocator.free(msg);
            self.chat.addSystemMessage(msg);
            self.renderer_state.requestRender();
        }
    }

    fn showHelp(self: *Self) void {
        self.chat.addSystemMessage("Available commands:");
        self.chat.addSystemMessage("  /help   - Show this help");
        self.chat.addSystemMessage("  /clear  - Clear chat history");
        self.chat.addSystemMessage("  /model  - Show/change model");
        self.chat.addSystemMessage("  /exit   - Exit god-agent");
        self.renderer_state.requestRender();
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
