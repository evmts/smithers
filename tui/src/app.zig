const std = @import("std");

const db = @import("db.zig");
const loading_mod = @import("loading.zig");
const environment_mod = @import("environment.zig");
const clock_mod = @import("clock.zig");
const tool_executor_mod = @import("agent/tool_executor.zig");
const obs = @import("obs.zig");
const agent_thread_mod = @import("agent_thread.zig");

const input_mod = @import("components/input.zig");
const chat_history_mod = @import("components/chat_history.zig");
const header_mod = @import("ui/header.zig");
const status_bar_mod = @import("ui/status.zig");
const key_handler_mod = @import("keys/handler.zig");
const mouse_handler_mod = @import("keys/mouse.zig");
const loop_mod = @import("agent/loop.zig");
const frame_mod = @import("rendering/frame.zig");

/// Full dependency injection - all types are explicit comptime params
pub fn App(
    comptime Db: type,
    comptime EvLoop: type,
    comptime R: type,
    comptime Agent: type,
    comptime Env: type,
    comptime Clk: type,
    comptime ToolExec: type,
) type {
    const Loading = loading_mod.LoadingState(Clk, ToolExec);
    const ChatHistory = chat_history_mod.ChatHistory(R);
    const AgentLoopT = loop_mod.AgentLoop(Agent, Loading, ToolExec, Db);
    const AgentThreadT = agent_thread_mod.AgentThread(AgentLoopT, Loading, Db, ChatHistory);
    const KeyHandler = key_handler_mod.KeyHandler(R, Loading, Db, EvLoop, AgentThreadT);
    const KeyContext = key_handler_mod.KeyContext(R, Loading, Db, EvLoop, AgentThreadT);
    const MouseHandler = mouse_handler_mod.MouseHandler(R);
    const Input = input_mod.Input(R);
    const Header = header_mod.Header(R);
    const StatusBar = status_bar_mod.StatusBar(R);
    const Frame = frame_mod.FrameRenderer(R, Loading, Db, EvLoop, AgentThreadT);

    return struct {
        alloc: std.mem.Allocator,
        database: Db,
        event_loop: EvLoop,
        input: Input,
        chat_history: ChatHistory,
        header: Header,
        status_bar: StatusBar,
        loading: Loading,
        key_handler: KeyHandler,
        mouse_handler: MouseHandler,
        agent_thread: AgentThreadT,
        has_ai: bool,
        last_tick: i64,
        last_reload: i64 = 0,
        db_path: [:0]const u8,

        const Self = @This();

        pub fn init(alloc: std.mem.Allocator) !Self {
            const home = Env.home() orelse "/tmp";
            const db_path_slice = try std.fmt.allocPrint(alloc, "{s}/.smithers/chat.db", .{home});
            defer alloc.free(db_path_slice);
            const db_path = try alloc.dupeZ(u8, db_path_slice);
            errdefer alloc.free(db_path);

            const dir_path = try std.fmt.allocPrint(alloc, "{s}/.smithers", .{home});
            defer alloc.free(dir_path);
            std.fs.makeDirAbsolute(dir_path) catch |err| switch (err) {
                error.PathAlreadyExists => {},
                else => return err,
            };

            var database = try Db.init(alloc, db_path);
            errdefer database.deinit();

            try database.deleteEphemeralMessages();

            var event_loop = try EvLoop.init(alloc);
            errdefer event_loop.deinit();
            // NOTE: Don't call start() here - event_loop will be moved when Self is returned
            // start() must be called in run() when self has a stable address

            var input = try Input.init(alloc);
            errdefer input.deinit();

            var chat_history = ChatHistory.init(alloc);
            errdefer chat_history.deinit();

            try chat_history.reload(&database);

            const has_ai = Env.anthropicApiKey() != null;
            if (!has_ai) {
                _ = database.addMessage(.system, "Note: ANTHROPIC_API_KEY not set. Running in demo mode.") catch {};
            }

            const header = Header.init(alloc, "0.1.0", if (has_ai) "claude-sonnet-4" else "demo-mode");
            const status_bar = StatusBar.init();

            const loading = Loading{};
            const key_handler = KeyHandler.init(alloc);
            const mouse_handler = MouseHandler.init(alloc);
            // NOTE: agent_thread pointers are set in run() after Self has stable address
            const agent_thread = AgentThreadT.init(alloc, undefined, undefined, undefined);

            return Self{
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
                .agent_thread = agent_thread,
                .has_ai = has_ai,
                .last_tick = Clk.milliTimestamp(),
                .db_path = db_path,
            };
        }

        pub fn deinit(self: *Self) void {
            self.agent_thread.deinit();
            self.chat_history.deinit();
            self.input.deinit();
            self.event_loop.deinit();
            self.database.deinit();
            self.alloc.free(self.db_path);
        }

        pub fn run(self: *Self) !void {
            // Start event loop here when self has stable address (not in init())
            try self.event_loop.start();

            // Fix pointer stability: agent_thread pointers must point to self fields
            // (not the stack-local values from init())
            self.agent_thread.loading = &self.loading;
            self.agent_thread.database = &self.database;
            self.agent_thread.chat_history = &self.chat_history;
            self.agent_thread.agent_loop.loading = &self.loading;

            // Start agent thread (deinit handled by App.deinit())
            try self.agent_thread.start();

            obs.global.logSimple(.info, @src(), "app.run", "starting main loop (threaded)");
            std.log.debug("app.run: starting main loop", .{});
            var loop_count: u64 = 0;
            while (true) {
                loop_count += 1;
                if (obs.global.enabled(.trace)) {
                    var buf: [64]u8 = undefined;
                    const msg = std.fmt.bufPrint(&buf, "loop #{d} is_loading={}", .{ loop_count, self.loading.isLoading() }) catch "loop";
                    obs.global.logSimple(.trace, @src(), "app.loop", msg);
                }

                // Check if agent thread updated state - reload chat from DB (with mutex)
                // Debounce reloads during streaming to reduce DB contention (max every 100ms)
                if (self.agent_thread.consumeStateChanged()) {
                    const now = Clk.milliTimestamp();
                    const should_reload = !self.loading.isLoading() or (now - self.last_reload >= 100);
                    if (should_reload) {
                        self.agent_thread.lockDb();
                        defer self.agent_thread.unlockDb();
                        self.chat_history.reload(&self.database) catch |err| {
                            obs.global.logSimple(.err, @src(), "chat_history.reload", @errorName(err));
                        };
                        self.last_reload = now;
                    }
                }

                // Main thread: poll for events (non-blocking when loading to stay responsive)
                const maybe_event = if (self.loading.isLoading())
                    self.event_loop.tryEvent()
                else
                    self.event_loop.nextEvent();

                if (maybe_event) |event| {
                    const tid = self.event_loop.lastTraceId();
                    var span = obs.global.spanBegin(tid, null, @src(), "app.handle_event");
                    defer obs.global.spanEnd(&span, @src());

                    switch (event) {
                        .winsize => |ws| {
                            obs.global.log(.debug, tid, span.span_id, @src(), "event.winsize", "resize");
                            try self.event_loop.resize(ws);
                        },
                        .mouse => |mouse| {
                            _ = mouse;
                            obs.global.log(.trace, tid, span.span_id, @src(), "event.mouse", "mouse");
                            self.mouse_handler.handleMouse(event.mouse, &self.chat_history);
                        },
                        .key_press => |key| {
                            var kbuf: [64]u8 = undefined;
                            const kmsg = std.fmt.bufPrint(&kbuf, "cp={d} text={s}", .{
                                key.codepoint,
                                if (key.text) |t| t else "(null)",
                            }) catch "key";
                            obs.global.log(.debug, tid, span.span_id, @src(), "event.key_press", kmsg);

                            var ctx = KeyContext{
                                .input = &self.input,
                                .chat_history = &self.chat_history,
                                .database = &self.database,
                                .status_bar = &self.status_bar,
                                .event_loop = &self.event_loop,
                                .loading = &self.loading,
                                .agent_thread = &self.agent_thread,
                                .has_ai = self.has_ai,
                            };

                            const action = try self.key_handler.handleKey(key, &ctx);
                            obs.global.log(.debug, tid, span.span_id, @src(), "key.action", @tagName(action));

                            switch (action) {
                                .exit => return,
                                .suspend_tui => try self.event_loop.suspendTui(),
                                .redraw => try self.event_loop.render(),
                                .reload_chat => {
                                    self.agent_thread.lockDb();
                                    defer self.agent_thread.unlockDb();
                                    try self.chat_history.reload(&self.database);
                                },
                                .start_ai_query => {
                                    // Wake agent thread to process new query
                                    self.agent_thread.wakeForWork();
                                },
                                .none => {},
                            }

                            // If a query was submitted, wake the agent thread (atomic check, no lock needed)
                            if (self.loading.hasPendingWork()) {
                                self.agent_thread.wakeForWork();
                            }
                        },
                    }
                }

                // Main thread: update spinners (UI-only, no blocking)
                const now = Clk.milliTimestamp();
                if (now - self.last_tick >= 80) {
                    self.loading.tick();
                    self.status_bar.tickSpinner();
                    self.last_tick = now;
                }

                self.status_bar.setBusy(self.loading.isLoading());

                // Main thread: render frame
                const win = self.event_loop.window();
                const renderer = R.init(win);
                var render_ctx = Frame.RenderContext{
                    .header = &self.header,
                    .chat_history = &self.chat_history,
                    .input = &self.input,
                    .status_bar = &self.status_bar,
                    .database = &self.database,
                    .loading = &self.loading,
                    .key_handler = &self.key_handler,
                };
                Frame.render(renderer, &render_ctx);

                try self.event_loop.render();

                // When loading, sleep briefly to not spin CPU (agent thread does the work)
                if (self.loading.isLoading()) {
                    Clk.sleep(16 * std.time.ns_per_ms);
                }
            }
        }
    };
}
