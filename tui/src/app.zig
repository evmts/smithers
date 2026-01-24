const std = @import("std");

const db = @import("db.zig");
const loading_mod = @import("loading.zig");

const EventLoop = @import("event_loop.zig").EventLoop;
const Input = @import("components/input.zig").Input;
const ChatHistory = @import("components/chat_history.zig").ChatHistory;
const Header = @import("ui/header.zig").Header;
const StatusBar = @import("ui/status.zig").StatusBar;
const KeyHandler = @import("keys/handler.zig").KeyHandler;
const KeyContext = @import("keys/handler.zig").KeyContext;
const MouseHandler = @import("keys/mouse.zig").MouseHandler;
const AgentLoop = @import("agent/loop.zig").AgentLoop;
const FrameRenderer = @import("rendering/frame.zig").FrameRenderer;

pub const App = struct {
    alloc: std.mem.Allocator,
    database: db.Database,
    event_loop: EventLoop,
    input: Input,
    chat_history: ChatHistory,
    header: Header,
    status_bar: StatusBar,
    loading: loading_mod.LoadingState,
    key_handler: KeyHandler,
    mouse_handler: MouseHandler,
    agent_loop: AgentLoop,
    has_ai: bool,
    last_tick: i64,
    db_path: [:0]const u8,

    pub fn init(alloc: std.mem.Allocator) !App {
        // Use file-based database in ~/.smithers/
        const home = std.posix.getenv("HOME") orelse "/tmp";
        const db_path_slice = try std.fmt.allocPrint(alloc, "{s}/.smithers/chat.db", .{home});
        defer alloc.free(db_path_slice);
        const db_path = try alloc.dupeZ(u8, db_path_slice);
        errdefer alloc.free(db_path);

        // Ensure directory exists
        const dir_path = try std.fmt.allocPrint(alloc, "{s}/.smithers", .{home});
        defer alloc.free(dir_path);
        std.fs.makeDirAbsolute(dir_path) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };

        var database = try db.Database.init(alloc, db_path);
        errdefer database.deinit();

        // Clean up ephemeral messages from previous sessions
        try database.deleteEphemeralMessages();

        var event_loop = try EventLoop.init(alloc);
        errdefer event_loop.deinit();

        try event_loop.start();

        var input = Input.init(alloc);
        errdefer input.deinit();

        var chat_history = ChatHistory.init(alloc);
        errdefer chat_history.deinit();

        // Load existing chat history
        try chat_history.reload(&database);

        const has_ai = std.posix.getenv("ANTHROPIC_API_KEY") != null;
        if (!has_ai) {
            _ = database.addMessage(.system, "Note: ANTHROPIC_API_KEY not set. Running in demo mode.") catch {};
        }

        const header = Header.init(alloc, "0.1.0", if (has_ai) "claude-sonnet-4" else "demo-mode");
        const status_bar = StatusBar.init();

        var loading = loading_mod.LoadingState{};
        const key_handler = KeyHandler.init(alloc);
        const mouse_handler = MouseHandler.init(alloc);
        const agent_loop = AgentLoop.init(alloc, &loading);

        return App{
            .alloc = alloc,
            .database = database,
            .event_loop = event_loop,
            .input = input,
            .chat_history = chat_history,
            .header = header,
            .status_bar = status_bar,
            .loading = loading,
            .key_handler = key_handler,
            .mouse_handler = mouse_handler,
            .agent_loop = agent_loop,
            .has_ai = has_ai,
            .last_tick = std.time.milliTimestamp(),
            .db_path = db_path,
        };
    }

    pub fn deinit(self: *App) void {
        self.chat_history.deinit();
        self.input.deinit();
        self.event_loop.deinit();
        self.database.deinit();
        self.alloc.free(self.db_path);
    }

    pub fn run(self: *App) !void {
        while (true) {
            // Poll for events (non-blocking when loading)
            const maybe_event = if (self.loading.is_loading)
                self.event_loop.tryEvent()
            else
                self.event_loop.nextEvent();

            if (maybe_event) |event| {
                std.log.debug("app: got event", .{});
                switch (event) {
                    .winsize => |ws| {
                        std.log.debug("app: winsize event", .{});
                        try self.event_loop.resize(ws);
                    },
                    .mouse => |mouse| {
                        self.mouse_handler.handleMouse(mouse, &self.chat_history);
                    },
                    .key_press => |key| {
                        std.log.debug("app: key_press codepoint={d} text_is_null={}", .{ key.codepoint, key.text == null });
                        if (key.text) |t| {
                            std.log.debug("app: text='{s}' len={d} ptr={*}", .{ t, t.len, t.ptr });
                        }

                        var ctx = KeyContext{
                            .input = &self.input,
                            .chat_history = &self.chat_history,
                            .database = &self.database,
                            .status_bar = &self.status_bar,
                            .event_loop = &self.event_loop,
                            .loading = &self.loading,
                            .has_ai = self.has_ai,
                        };

                        const action = try self.key_handler.handleKey(key, &ctx);
                        switch (action) {
                            .exit => return,
                            .suspend_tui => try self.event_loop.suspendTui(),
                            .redraw => try self.event_loop.render(),
                            .reload_chat => try self.chat_history.reload(&self.database),
                            .start_ai_query => |_| {},
                            .none => {},
                        }
                    },
                }
            }

            // Process agent loop (streaming, tool execution, continuations)
            _ = try self.agent_loop.tick(&self.database, &self.chat_history);

            // Tick spinner animation
            const now = std.time.milliTimestamp();
            if (now - self.last_tick >= 80) {
                self.loading.tick();
                self.status_bar.tickSpinner();
                self.last_tick = now;
            }

            // Sync status bar busy state with loading
            self.status_bar.setBusy(self.loading.is_loading);

            // Render
            const win = self.event_loop.window();
            var render_ctx = FrameRenderer.RenderContext{
                .header = &self.header,
                .chat_history = &self.chat_history,
                .input = &self.input,
                .status_bar = &self.status_bar,
                .database = &self.database,
                .loading = &self.loading,
                .key_handler = &self.key_handler,
            };
            FrameRenderer.render(win, &render_ctx);

            try self.event_loop.render();

            // Small sleep to avoid busy loop
            if (self.loading.is_loading) {
                std.Thread.sleep(16 * std.time.ns_per_ms);
            }
        }
    }
};
