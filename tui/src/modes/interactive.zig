// Interactive Mode - Main TUI orchestration layer
// Ties together: EventLoop, Editor, ChatHistory, Input, Database, SlashCommands

const std = @import("std");
const Allocator = std.mem.Allocator;

const Event = @import("../event.zig").Event;
const db = @import("../db.zig");
const logo_mod = @import("../components/logo.zig");
const SlashCommand = @import("../commands/slash_command.zig").SlashCommand;
const builtInSlashCommands = @import("../commands/slash_command.zig").builtInSlashCommands;

const spinner_frames = [_][]const u8{ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" };

/// Generic InteractiveMode with dependency injection for all components
pub fn InteractiveMode(
    comptime R: type,
    comptime EvLoop: type,
    comptime Db: type,
    comptime Inp: type,
    comptime Chat: type,
) type {
    const Logo = logo_mod.Logo(R);

    return struct {
        allocator: Allocator,
        is_running: bool = true,
        model: []const u8 = "claude-sonnet-4",
        version: []const u8 = "0.1.0",
        session_id: ?[]const u8 = null,

        // Busy state management
        is_busy: bool = false,
        pending_input: ?[]const u8 = null,
        current_tool: ?[]const u8 = null,
        spinner_frame: usize = 0,
        loading_start: i64 = 0,
        pending_response: ?[]const u8 = null,

        // Components
        event_loop: EvLoop,
        database: Db,
        input: Inp,
        chat_history: Chat,

        const Self = @This();

        pub fn init(allocator: Allocator, db_path: ?[:0]const u8) !Self {
            var event_loop = try EvLoop.init(allocator);
            errdefer event_loop.deinit();

            var database = try Db.init(allocator, db_path);
            errdefer database.deinit();

            var input = try Inp.init(allocator);
            errdefer input.deinit();

            var chat_history = Chat.init(allocator);
            errdefer chat_history.deinit();

            // Load existing messages
            try chat_history.reload(&database);

            return Self{
                .allocator = allocator,
                .event_loop = event_loop,
                .database = database,
                .input = input,
                .chat_history = chat_history,
            };
        }

        pub fn deinit(self: *Self) void {
            if (self.pending_input) |pi| self.allocator.free(pi);
            if (self.pending_response) |pr| self.allocator.free(pr);
            self.chat_history.deinit();
            self.input.deinit();
            self.database.deinit();
            self.event_loop.deinit();
        }

        pub fn setModel(self: *Self, new_model: []const u8) void {
            self.model = new_model;
        }

        pub fn setSessionId(self: *Self, sid: []const u8) void {
            self.session_id = sid;
        }

        pub fn run(self: *Self) !void {
            try self.event_loop.start();
            defer self.event_loop.stop();

            var last_tick: i64 = std.time.milliTimestamp();

            while (self.is_running) {
                // Poll or block based on loading state
                const maybe_event = if (self.is_busy)
                    self.event_loop.tryEvent()
                else
                    self.event_loop.nextEvent();

                if (maybe_event) |event| {
                    try self.handleEvent(event);
                }

                // Check if mock loading is complete
                if (self.shouldShowResponse()) {
                    try self.completeResponse();
                }

                // Tick spinner animation
                const now = std.time.milliTimestamp();
                if (now - last_tick >= 80) {
                    self.tickSpinner();
                    last_tick = now;
                }

                // Render
                try self.render();

                // Small sleep during loading to avoid busy loop
                if (self.is_busy) {
                    std.time.sleep(16 * std.time.ns_per_ms);
                }
            }
        }

        fn handleEvent(self: *Self, event: Event) !void {
            switch (event) {
                .winsize => |ws| try self.event_loop.resize(ws),
                .key_press => |key| {
                    // Global keys
                    if (key.matches('c', .{ .ctrl = true })) {
                        self.is_running = false;
                        return;
                    }

                    if (key.matches('z', .{ .ctrl = true })) {
                        try self.event_loop.suspendTui();
                        return;
                    }

                    if (key.matches('l', .{ .ctrl = true })) {
                        try self.database.clearMessages();
                        try self.chat_history.reload(&self.database);
                        return;
                    }

                    // Don't process input while busy (queue it)
                    if (self.is_busy) {
                        return;
                    }

                    // Scrolling - use Key type from Renderer
                    if (key.matches(R.Key.page_up, .{})) {
                        self.chat_history.scrollUp(5);
                        return;
                    }
                    if (key.matches(R.Key.page_down, .{})) {
                        self.chat_history.scrollDown(5);
                        return;
                    }
                    if (key.matches(R.Key.up, .{})) {
                        self.chat_history.scrollUp(1);
                        return;
                    }
                    if (key.matches(R.Key.down, .{})) {
                        self.chat_history.scrollDown(1);
                        return;
                    }

                    // Input handling
                    if (try self.input.handleEvent(event)) |command| {
                        defer self.allocator.free(command);
                        try self.handleCommand(command);
                    }
                },
            }
        }

        fn handleCommand(self: *Self, command: []const u8) !void {
            if (command.len == 0) return;

            // Slash commands
            if (command[0] == '/') {
                const cmd_str = command[1..];

                // Parse command (split on space for args)
                var iter = std.mem.splitScalar(u8, cmd_str, ' ');
                const cmd_name = iter.first();

                if (SlashCommand.parse(cmd_name)) |cmd| {
                    switch (cmd) {
                        .exit => {
                            self.is_running = false;
                        },
                        .help => {
                            try self.showHelp();
                        },
                        .clear => {
                            try self.database.clearMessages();
                            try self.chat_history.reload(&self.database);
                        },
                        .model => {
                            const rest = iter.rest();
                            if (rest.len > 0) {
                                self.setModel(rest);
                                const msg = try std.fmt.allocPrint(self.allocator, "Model changed to: {s}", .{rest});
                                defer self.allocator.free(msg);
                                _ = try self.database.addMessage(.system, msg);
                                try self.chat_history.reload(&self.database);
                            } else {
                                const msg = try std.fmt.allocPrint(self.allocator, "Current model: {s}", .{self.model});
                                defer self.allocator.free(msg);
                                _ = try self.database.addMessage(.system, msg);
                                try self.chat_history.reload(&self.database);
                            }
                        },
                        .compact => {
                            _ = try self.database.addMessage(.system, "Compact not implemented yet");
                            try self.chat_history.reload(&self.database);
                        },
                        .init => {
                            _ = try self.database.addMessage(.system, "Init not implemented yet");
                            try self.chat_history.reload(&self.database);
                        },
                        .mcp => {
                            _ = try self.database.addMessage(.system, "MCP management not implemented yet");
                            try self.chat_history.reload(&self.database);
                        },
                    }
                } else {
                    const msg = try std.fmt.allocPrint(self.allocator, "Unknown command: /{s}. Type /help for available commands.", .{cmd_name});
                    defer self.allocator.free(msg);
                    _ = try self.database.addMessage(.system, msg);
                    try self.chat_history.reload(&self.database);
                }
                return;
            }

            // Regular message - add to history and start loading
            _ = try self.database.addMessage(.user, command);
            try self.chat_history.reload(&self.database);

            // Start mock loading (TODO: integrate real agent)
            try self.startLoading(command);
        }

        fn showHelp(self: *Self) !void {
            _ = try self.database.addMessage(.system, "Commands:");
            const cmds = builtInSlashCommands();
            for (cmds) |entry| {
                const msg = try std.fmt.allocPrint(self.allocator, "  /{s} - {s}", .{ entry.name, entry.cmd.description() });
                defer self.allocator.free(msg);
                _ = try self.database.addMessage(.system, msg);
            }
            _ = try self.database.addMessage(.system, "Keys:");
            _ = try self.database.addMessage(.system, "  ↑/↓      - Scroll chat");
            _ = try self.database.addMessage(.system, "  PgUp/Dn  - Scroll 5 lines");
            _ = try self.database.addMessage(.system, "  Ctrl+L   - Clear chat");
            _ = try self.database.addMessage(.system, "  Ctrl+Z   - Suspend TUI");
            _ = try self.database.addMessage(.system, "  Ctrl+C   - Exit");
            try self.chat_history.reload(&self.database);
        }

        // Mock loading - TODO: replace with real agent integration
        const mock_responses = [_][]const u8{
            "I'm Smithers, your AI orchestration assistant. How can I help you today?",
            "That's an interesting question! Let me think about that...",
            "I'm here to help with multi-agent AI orchestration tasks.",
            "Could you tell me more about what you're trying to accomplish?",
            "I understand. Let me process that for you.",
        };

        // Counter for round-robin mock responses
        var mock_counter: usize = 0;

        fn startLoading(self: *Self, _: []const u8) !void {
            self.is_busy = true;
            self.loading_start = std.time.milliTimestamp();
            self.spinner_frame = 0;

            // Prepare mock response using counter for deterministic cycling
            const idx = mock_counter;
            mock_counter = (mock_counter + 1) % mock_responses.len;
            self.pending_response = try self.allocator.dupe(u8, mock_responses[idx]);
        }

        fn shouldShowResponse(self: *Self) bool {
            if (!self.is_busy) return false;
            const elapsed = std.time.milliTimestamp() - self.loading_start;
            return elapsed >= 1200; // 1.2 second delay
        }

        fn completeResponse(self: *Self) !void {
            if (self.pending_response) |response| {
                _ = try self.database.addMessage(.assistant, response);
                self.allocator.free(response);
                self.pending_response = null;
                self.is_busy = false;
                try self.chat_history.reload(&self.database);
            }
        }

        fn tickSpinner(self: *Self) void {
            if (self.is_busy) {
                self.spinner_frame = (self.spinner_frame + 1) % spinner_frames.len;
            }
        }

        fn getSpinner(self: *Self) []const u8 {
            return spinner_frames[self.spinner_frame];
        }

        fn render(self: *Self) !void {
            const win = self.event_loop.window();
            const renderer = R.init(win);
            renderer.clear();

            const height = renderer.height();

            // Layout: chat area, status bar (1 line), input box (6 lines)
            const status_bar_y: u16 = if (height > 8) height - 7 else 1;
            const chat_height: u16 = status_bar_y;

            if (self.chat_history.messages.len > 0 or self.is_busy) {
                const chat_renderer = renderer.subRegion(0, 0, renderer.width(), chat_height);
                self.chat_history.draw(chat_renderer);
            } else {
                Logo.draw(renderer);
            }

            // Status bar - single line between chat and input
            const status_renderer = renderer.subRegion(0, status_bar_y, renderer.width(), 1);

            if (self.is_busy) {
                const spinner = self.getSpinner();
                const loading_text = " Smithers is thinking...";
                const style: R.Style = .{ .fg = .{ .index = 12 } }; // Bright blue

                status_renderer.drawCell(2, 0, spinner, style);

                const text_renderer = status_renderer.subRegion(4, 0, status_renderer.width() -| 6, 1);
                text_renderer.drawText(0, 0, loading_text, style);
            }

            // Input box at bottom
            const input_height: u16 = 6;
            const input_y: u16 = if (height > input_height) height - input_height else 0;
            const input_renderer = renderer.subRegion(0, input_y, renderer.width(), input_height);
            self.input.draw(input_renderer);

            try self.event_loop.render();
        }

        pub fn messageCount(self: *Self) usize {
            return self.chat_history.messages.len;
        }
    };
}

