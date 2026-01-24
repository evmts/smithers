const std = @import("std");

const db = @import("db.zig");
const loading_mod = @import("loading.zig");
const environment_mod = @import("environment.zig");
const clock_mod = @import("clock.zig");
const tool_executor_mod = @import("agent/tool_executor.zig");

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
    const KeyHandler = key_handler_mod.KeyHandler(R, Loading, Db, EvLoop);
    const KeyContext = key_handler_mod.KeyContext(R, Loading, Db, EvLoop);
    const MouseHandler = mouse_handler_mod.MouseHandler(R);
    const Input = input_mod.Input(R);
    const ChatHistory = chat_history_mod.ChatHistory(R);
    const Header = header_mod.Header(R);
    const StatusBar = status_bar_mod.StatusBar(R);
    const Frame = frame_mod.FrameRenderer(R, Loading, Db, EvLoop);
    const AgentLoopT = loop_mod.AgentLoop(Agent, Loading, ToolExec);

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
        agent_loop: AgentLoopT,
        has_ai: bool,
        last_tick: i64,
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

            try event_loop.start();

            var input = Input.init(alloc);
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

            var loading = Loading{};
            const key_handler = KeyHandler.init(alloc);
            const mouse_handler = MouseHandler.init(alloc);
            const agent_loop = AgentLoopT.init(alloc, &loading);

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
                .agent_loop = agent_loop,
                .has_ai = has_ai,
                .last_tick = Clk.milliTimestamp(),
                .db_path = db_path,
            };
        }

        pub fn deinit(self: *Self) void {
            self.chat_history.deinit();
            self.input.deinit();
            self.event_loop.deinit();
            self.database.deinit();
            self.alloc.free(self.db_path);
        }

        pub fn run(self: *Self) !void {
            std.log.debug("app.run: starting main loop", .{});
            while (true) {
                std.log.debug("app.run: top of loop, is_loading={}", .{self.loading.is_loading});
                const maybe_event = if (self.loading.is_loading)
                    self.event_loop.tryEvent()
                else
                    self.event_loop.nextEvent();

                std.log.debug("app.run: maybe_event is null={}", .{maybe_event == null});
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

                _ = try self.agent_loop.tick(&self.database, &self.chat_history);

                const now = Clk.milliTimestamp();
                if (now - self.last_tick >= 80) {
                    self.loading.tick();
                    self.status_bar.tickSpinner();
                    self.last_tick = now;
                }

                self.status_bar.setBusy(self.loading.is_loading);

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

                if (self.loading.is_loading) {
                    Clk.sleep(16 * std.time.ns_per_ms);
                }
            }
        }
    };
}
