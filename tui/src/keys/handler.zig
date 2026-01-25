const std = @import("std");

const input_mod = @import("../components/input.zig");
const chat_history_mod = @import("../components/chat_history.zig");
const db = @import("../db.zig");
const status_bar_mod = @import("../ui/status.zig");
const event_loop_mod = @import("../event_loop.zig");
const help = @import("../help.zig");
const editor_utils = @import("../editor.zig");
const git_utils = @import("../git.zig");
const event_mod = @import("../event.zig");
const obs = @import("../obs.zig");

pub const Action = union(enum) {
    none,
    exit,
    suspend_tui,
    redraw,
    reload_chat,
    start_ai_query,
};

/// KeyContext generic over Renderer, Loading, Database, and EventLoop types
pub fn KeyContext(comptime R: type, comptime Loading: type, comptime Db: type, comptime EvLoop: type, comptime AgentThreadT: type) type {
    return struct {
        input: *input_mod.Input(R),
        chat_history: *chat_history_mod.ChatHistory(R),
        database: *Db,
        status_bar: *status_bar_mod.StatusBar(R),
        event_loop: *EvLoop,
        loading: *Loading,
        agent_thread: *AgentThreadT,
        has_ai: bool,

        const Self = @This();

        /// Execute a database operation while holding the agent thread mutex.
        /// This ensures thread-safe access to SQLite from the main thread.
        pub fn withDbLock(self: *Self, comptime func: anytype, args: anytype) @typeInfo(@TypeOf(func)).@"fn".return_type.? {
            self.agent_thread.lockForRead();
            defer self.agent_thread.unlockForRead();
            return @call(.auto, func, args);
        }
    };
}

/// KeyHandler generic over Renderer, Loading, Database, and EventLoop types
pub fn KeyHandler(comptime R: type, comptime Loading: type, comptime Db: type, comptime EvLoop: type, comptime AgentThreadT: type) type {
    const Key = R.Key;
    const Event = event_mod.Event(R);
    return struct {
        pub const Context = KeyContext(R, Loading, Db, EvLoop, AgentThreadT);
        const Self = @This();

        alloc: std.mem.Allocator,
        prefix_mode: bool = false,
        last_ctrl_c: i64 = 0,

        pub fn init(alloc: std.mem.Allocator) Self {
            return .{ .alloc = alloc };
        }

        pub fn handleKey(self: *Self, key: Key, ctx: *Context) !Action {
            // Ctrl+Z to suspend (like vim)
            if (key.matches('z', .{ .ctrl = true })) {
                return .suspend_tui;
            }

            // Ctrl+L - clear/redraw screen
            if (key.matches('l', .{ .ctrl = true })) {
                return .redraw;
            }

            // Ctrl+E - open external editor for input
            if (key.matches('e', .{ .ctrl = true })) {
                if (editor_utils.openExternalEditor(self.alloc, ctx.event_loop, ctx.input)) |edited_text| {
                    defer self.alloc.free(edited_text);
                    if (edited_text.len > 0) {
                        ctx.agent_thread.lockForRead();
                        _ = try ctx.database.addMessage(.user, edited_text);
                        try ctx.chat_history.reload(ctx.database);
                        ctx.agent_thread.unlockForRead();
                        if (ctx.has_ai) {
                            ctx.loading.pending_query = try self.alloc.dupe(u8, edited_text);
                            ctx.loading.startLoading();
                        }
                    }
                } else |_| {}
                return .none;
            }

            // Escape - dismiss help or interrupt loading
            if (key.matches(Key.escape, .{})) {
                if (ctx.status_bar.isHelpVisible()) {
                    ctx.status_bar.hideHelp();
                    return .none;
                }
                if (ctx.loading.isLoading()) {
                    // Signal agent thread to cancel - it owns ALL cleanup
                    // (DB writes, agent_run state, "Interrupted" message)
                    // See issue 008: cancellation ownership must be single-threaded
                    ctx.loading.requestCancel();
                }
                return .none;
            }

            // ? - show help message when input empty (ephemeral)
            if (key.text) |text| {
                if (text.len == 1 and text[0] == '?' and ctx.input.isEmpty()) {
                    ctx.agent_thread.lockForRead();
                    _ = try ctx.database.addEphemeralMessage(.assistant, help.INLINE_HELP);
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                }
            }

            // Ctrl+C - clear input, or exit if pressed twice
            if (key.matches('c', .{ .ctrl = true })) {
                if (!ctx.input.isEmpty()) {
                    ctx.input.clear();
                } else {
                    const now_ms = std.time.milliTimestamp();
                    if (now_ms - self.last_ctrl_c < 1500) {
                        return .exit;
                    }
                    self.last_ctrl_c = now_ms;
                }
                return .none;
            }

            // Ctrl+D - exit if input is empty
            if (key.matches('d', .{ .ctrl = true })) {
                if (ctx.input.isEmpty()) {
                    return .exit;
                }
                return .none;
            }

            // Ctrl+B - enter prefix mode (tmux-style)
            if (key.matches('b', .{ .ctrl = true })) {
                self.prefix_mode = true;
                ctx.status_bar.setCustomStatus(" [Ctrl+B] c:new n:next p:prev 0-9:switch");
                return .none;
            }

            // Handle prefix mode commands
            if (self.prefix_mode) {
                self.prefix_mode = false;
                ctx.status_bar.setCustomStatus(null);

                // c - new tab
                if (key.codepoint == 'c') {
                    ctx.agent_thread.lockForRead();
                    const count = try ctx.database.getSessionCount();
                    var name_buf: [16]u8 = undefined;
                    const name = std.fmt.bufPrint(&name_buf, "tab-{d}", .{count + 1}) catch "new";
                    const new_id = try ctx.database.createSession(name);
                    ctx.database.switchSession(new_id);
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                    return .none;
                }

                // n - next tab
                if (key.codepoint == 'n') {
                    ctx.agent_thread.lockForRead();
                    const sessions = try ctx.database.getSessions(self.alloc);
                    defer Db.freeSessions(self.alloc, sessions);
                    if (sessions.len > 1) {
                        const current = ctx.database.getCurrentSessionId();
                        var next_id: ?i64 = null;
                        var first_id: ?i64 = null;
                        for (sessions, 0..) |s, i| {
                            if (first_id == null) first_id = s.id;
                            if (s.id == current and i + 1 < sessions.len) {
                                next_id = sessions[i + 1].id;
                                break;
                            }
                        }
                        ctx.database.switchSession(next_id orelse first_id orelse current);
                        try ctx.chat_history.reload(ctx.database);
                    }
                    ctx.agent_thread.unlockForRead();
                    return .none;
                }

                // p - previous tab
                if (key.codepoint == 'p') {
                    ctx.agent_thread.lockForRead();
                    const sessions = try ctx.database.getSessions(self.alloc);
                    defer Db.freeSessions(self.alloc, sessions);
                    if (sessions.len > 1) {
                        const current = ctx.database.getCurrentSessionId();
                        var prev_id: ?i64 = null;
                        for (sessions, 0..) |s, i| {
                            if (s.id == current) {
                                if (i > 0) {
                                    prev_id = sessions[i - 1].id;
                                } else {
                                    prev_id = sessions[sessions.len - 1].id;
                                }
                                break;
                            }
                        }
                        if (prev_id) |pid| {
                            ctx.database.switchSession(pid);
                            try ctx.chat_history.reload(ctx.database);
                        }
                    }
                    ctx.agent_thread.unlockForRead();
                    return .none;
                }

                // 0-9 - switch to tab by number
                if (key.codepoint >= '0' and key.codepoint <= '9') {
                    ctx.agent_thread.lockForRead();
                    const tab_num = if (key.codepoint == '0') 9 else key.codepoint - '1';
                    const sessions = try ctx.database.getSessions(self.alloc);
                    defer Db.freeSessions(self.alloc, sessions);
                    if (tab_num < sessions.len) {
                        ctx.database.switchSession(sessions[tab_num].id);
                        try ctx.chat_history.reload(ctx.database);
                    }
                    ctx.agent_thread.unlockForRead();
                    return .none;
                }

                // Any other key - just exit prefix mode (already done above)
                return .none;
            }

            // Arrow keys scroll 5 lines (~1 message), PageUp/PageDown scroll faster
            if (key.matches(Key.up, .{})) {
                ctx.chat_history.scrollUp(5);
                return .none;
            } else if (key.matches(Key.down, .{})) {
                ctx.chat_history.scrollDown(5);
                return .none;
            } else if (key.matches(Key.page_up, .{})) {
                ctx.chat_history.scrollUp(20);
                return .none;
            } else if (key.matches(Key.page_down, .{})) {
                ctx.chat_history.scrollDown(20);
                return .none;
            } else if (try ctx.input.handleEvent(Event{ .key_press = key })) |command| {
                defer self.alloc.free(command);

                if (std.mem.eql(u8, command, "/exit")) {
                    return .exit;
                } else if (std.mem.eql(u8, command, "/clear")) {
                    ctx.agent_thread.lockForRead();
                    try ctx.database.clearMessages();
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                } else if (std.mem.eql(u8, command, "/new")) {
                    ctx.agent_thread.lockForRead();
                    try ctx.database.clearMessages();
                    _ = try ctx.database.addMessage(.system, "Started new conversation.");
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                } else if (std.mem.eql(u8, command, "/help")) {
                    ctx.agent_thread.lockForRead();
                    _ = try ctx.database.addEphemeralMessage(.assistant, help.INLINE_HELP);
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                } else if (std.mem.eql(u8, command, "/model")) {
                    ctx.agent_thread.lockForRead();
                    _ = try ctx.database.addEphemeralMessage(.system, "Current model: claude-sonnet-4-20250514");
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                } else if (std.mem.eql(u8, command, "/status")) {
                    ctx.agent_thread.lockForRead();
                    const msgs = try ctx.database.getMessages(self.alloc);
                    defer Db.freeMessages(self.alloc, msgs);
                    const status_msg = try std.fmt.allocPrint(
                        self.alloc,
                        "Session: {d} | Messages: {d} | AI: {s}",
                        .{ ctx.database.getCurrentSessionId(), msgs.len, if (ctx.has_ai) "connected" else "demo" },
                    );
                    defer self.alloc.free(status_msg);
                    _ = try ctx.database.addEphemeralMessage(.system, status_msg);
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                } else if (std.mem.eql(u8, command, "/diff")) {
                    const diff_result = git_utils.runGitDiff(self.alloc) catch |err| blk: {
                        break :blk try std.fmt.allocPrint(self.alloc, "Error running git diff: {s}", .{@errorName(err)});
                    };
                    defer self.alloc.free(diff_result);
                    ctx.agent_thread.lockForRead();
                    if (diff_result.len > 0) {
                        _ = try ctx.database.addEphemeralMessage(.assistant, diff_result);
                    } else {
                        _ = try ctx.database.addEphemeralMessage(.system, "No uncommitted changes.");
                    }
                    try ctx.chat_history.reload(ctx.database);
                    ctx.agent_thread.unlockForRead();
                } else {
                    // Regular message submission
                    obs.global.logSimple(.debug, @src(), "keys.submit", "user submitted message");

                    if (ctx.loading.isLoading()) {
                        // AI is busy - queue as pending message (shows gray in UI)
                        obs.global.logSimple(.debug, @src(), "keys.submit", "queueing as pending (AI busy)");
                        ctx.agent_thread.lockForRead();
                        _ = try ctx.database.addPendingMessage(.user, command);
                        try ctx.chat_history.reload(ctx.database);
                        ctx.agent_thread.unlockForRead();
                    } else {
                        // AI is idle - send immediately
                        ctx.agent_thread.lockForRead();
                        _ = try ctx.database.addMessage(.user, command);
                        try ctx.chat_history.reload(ctx.database);
                        ctx.agent_thread.unlockForRead();

                        if (ctx.has_ai) {
                            var buf: [128]u8 = undefined;
                            const msg = std.fmt.bufPrint(&buf, "setting pending_query len={d} has_ai=true", .{command.len}) catch "?";
                            obs.global.logSimple(.debug, @src(), "keys.submit", msg);
                            ctx.loading.pending_query = try self.alloc.dupe(u8, command);
                            ctx.loading.startLoading();
                            return .start_ai_query;
                        } else {
                            obs.global.logSimple(.debug, @src(), "keys.submit", "demo mode - no AI");
                            ctx.agent_thread.lockForRead();
                            _ = try ctx.database.addMessage(.assistant, "I'm running in demo mode (no API key). Set ANTHROPIC_API_KEY to enable AI responses.");
                            try ctx.chat_history.reload(ctx.database);
                            ctx.agent_thread.unlockForRead();
                        }
                    }
                }
            }

            return .none;
        }
    };
}


