const std = @import("std");
const vaxis = @import("vaxis");

const Input = @import("../components/input.zig").Input;
const ChatHistory = @import("../components/chat_history.zig").ChatHistory;
const db = @import("../db.zig");
const StatusBar = @import("../ui/status.zig").StatusBar;
const EventLoop = @import("../event_loop.zig").EventLoop;
const loading_mod = @import("../loading.zig");
const help = @import("../help.zig");
const editor_utils = @import("../editor.zig");
const git_utils = @import("../git.zig");
const Event = @import("../event.zig").Event;

pub const KeyContext = struct {
    input: *Input,
    chat_history: *ChatHistory,
    database: *db.Database,
    status_bar: *StatusBar,
    event_loop: *EventLoop,
    loading: *loading_mod.LoadingState,
    has_ai: bool,
};

pub const Action = union(enum) {
    none,
    exit,
    suspend_tui,
    redraw,
    reload_chat,
    start_ai_query: []const u8,
};

pub const KeyHandler = struct {
    alloc: std.mem.Allocator,
    prefix_mode: bool = false,
    last_ctrl_c: i64 = 0,

    pub fn init(alloc: std.mem.Allocator) KeyHandler {
        return .{ .alloc = alloc };
    }

    pub fn handleKey(self: *KeyHandler, key: vaxis.Key, ctx: *KeyContext) !Action {
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
                    _ = try ctx.database.addMessage(.user, edited_text);
                    try ctx.chat_history.reload(ctx.database);
                    if (ctx.has_ai) {
                        ctx.loading.pending_query = try self.alloc.dupe(u8, edited_text);
                        ctx.loading.startLoading();
                    }
                }
            } else |_| {}
            return .none;
        }

        // Escape - dismiss help or interrupt loading
        if (key.matches(vaxis.Key.escape, .{})) {
            if (ctx.status_bar.isHelpVisible()) {
                ctx.status_bar.hideHelp();
                return .none;
            }
            if (ctx.loading.is_loading) {
                ctx.loading.cleanup(self.alloc);
                _ = try ctx.database.addMessage(.system, "Interrupted.");
                try ctx.chat_history.reload(ctx.database);
            }
            return .none;
        }

        // ? - show help message when input empty (ephemeral)
        if (key.text) |text| {
            if (text.len == 1 and text[0] == '?' and ctx.input.isEmpty()) {
                _ = try ctx.database.addEphemeralMessage(.assistant, help.INLINE_HELP);
                try ctx.chat_history.reload(ctx.database);
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
                const count = try ctx.database.getSessionCount();
                var name_buf: [16]u8 = undefined;
                const name = std.fmt.bufPrint(&name_buf, "tab-{d}", .{count + 1}) catch "new";
                const new_id = try ctx.database.createSession(name);
                ctx.database.switchSession(new_id);
                try ctx.chat_history.reload(ctx.database);
                return .none;
            }

            // n - next tab
            if (key.codepoint == 'n') {
                const sessions = try ctx.database.getSessions(self.alloc);
                defer db.Database.freeSessions(self.alloc, sessions);
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
                return .none;
            }

            // p - previous tab
            if (key.codepoint == 'p') {
                const sessions = try ctx.database.getSessions(self.alloc);
                defer db.Database.freeSessions(self.alloc, sessions);
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
                return .none;
            }

            // 0-9 - switch to tab by number
            if (key.codepoint >= '0' and key.codepoint <= '9') {
                const tab_num = if (key.codepoint == '0') 9 else key.codepoint - '1';
                const sessions = try ctx.database.getSessions(self.alloc);
                defer db.Database.freeSessions(self.alloc, sessions);
                if (tab_num < sessions.len) {
                    ctx.database.switchSession(sessions[tab_num].id);
                    try ctx.chat_history.reload(ctx.database);
                }
                return .none;
            }

            // Any other key - just exit prefix mode (already done above)
            return .none;
        }

        if (!ctx.loading.is_loading) {
            // Arrow keys scroll 5 lines (~1 message), PageUp/PageDown scroll faster
            if (key.matches(vaxis.Key.up, .{})) {
                ctx.chat_history.scrollUp(5);
                return .none;
            } else if (key.matches(vaxis.Key.down, .{})) {
                ctx.chat_history.scrollDown(5);
                return .none;
            } else if (key.matches(vaxis.Key.page_up, .{})) {
                ctx.chat_history.scrollUp(20);
                return .none;
            } else if (key.matches(vaxis.Key.page_down, .{})) {
                ctx.chat_history.scrollDown(20);
                return .none;
            } else if (try ctx.input.handleEvent(Event{ .key_press = key })) |command| {
                defer self.alloc.free(command);

                if (std.mem.eql(u8, command, "/exit")) {
                    return .exit;
                } else if (std.mem.eql(u8, command, "/clear")) {
                    try ctx.database.clearMessages();
                    try ctx.chat_history.reload(ctx.database);
                } else if (std.mem.eql(u8, command, "/new")) {
                    try ctx.database.clearMessages();
                    _ = try ctx.database.addMessage(.system, "Started new conversation.");
                    try ctx.chat_history.reload(ctx.database);
                } else if (std.mem.eql(u8, command, "/help")) {
                    _ = try ctx.database.addEphemeralMessage(.assistant, help.INLINE_HELP);
                    try ctx.chat_history.reload(ctx.database);
                } else if (std.mem.eql(u8, command, "/model")) {
                    _ = try ctx.database.addEphemeralMessage(.system, "Current model: claude-sonnet-4-20250514");
                    try ctx.chat_history.reload(ctx.database);
                } else if (std.mem.eql(u8, command, "/status")) {
                    const msgs = try ctx.database.getMessages(self.alloc);
                    defer db.Database.freeMessages(self.alloc, msgs);
                    const status_msg = try std.fmt.allocPrint(
                        self.alloc,
                        "Session: {d} | Messages: {d} | AI: {s}",
                        .{ ctx.database.getCurrentSessionId(), msgs.len, if (ctx.has_ai) "connected" else "demo" },
                    );
                    defer self.alloc.free(status_msg);
                    _ = try ctx.database.addEphemeralMessage(.system, status_msg);
                    try ctx.chat_history.reload(ctx.database);
                } else if (std.mem.eql(u8, command, "/diff")) {
                    const diff_result = git_utils.runGitDiff(self.alloc) catch |err| blk: {
                        break :blk try std.fmt.allocPrint(self.alloc, "Error running git diff: {s}", .{@errorName(err)});
                    };
                    defer self.alloc.free(diff_result);
                    if (diff_result.len > 0) {
                        _ = try ctx.database.addEphemeralMessage(.assistant, diff_result);
                    } else {
                        _ = try ctx.database.addEphemeralMessage(.system, "No uncommitted changes.");
                    }
                    try ctx.chat_history.reload(ctx.database);
                } else {
                    // Regular message - add to history and call AI
                    _ = try ctx.database.addMessage(.user, command);
                    try ctx.chat_history.reload(ctx.database);

                    if (ctx.has_ai) {
                        ctx.loading.pending_query = try self.alloc.dupe(u8, command);
                        ctx.loading.startLoading();
                    } else {
                        _ = try ctx.database.addMessage(.assistant, "I'm running in demo mode (no API key). Set ANTHROPIC_API_KEY to enable AI responses.");
                        try ctx.chat_history.reload(ctx.database);
                    }
                }
            }
        }

        return .none;
    }
};
