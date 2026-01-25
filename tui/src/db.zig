const std = @import("std");
const obs = @import("obs.zig");

/// Message role in conversation
pub const Role = enum {
    user,
    assistant,
    system,

    pub fn toString(self: Role) [:0]const u8 {
        return switch (self) {
            .user => "user",
            .assistant => "assistant",
            .system => "system",
        };
    }

    pub fn fromString(s: []const u8) ?Role {
        if (std.mem.eql(u8, s, "user")) return .user;
        if (std.mem.eql(u8, s, "assistant")) return .assistant;
        if (std.mem.eql(u8, s, "system")) return .system;
        return null;
    }
};

/// Message status for queue support
pub const MessageStatus = enum {
    sent,
    pending, // queued while AI is responding, displayed gray

    pub fn toString(self: MessageStatus) [:0]const u8 {
        return switch (self) {
            .sent => "sent",
            .pending => "pending",
        };
    }

    pub fn fromString(s: []const u8) MessageStatus {
        if (std.mem.eql(u8, s, "pending")) return .pending;
        return .sent;
    }
};

/// Agent run status for crash recovery
pub const AgentRunStatus = enum {
    pending, // waiting to start
    streaming, // receiving AI response
    tools, // executing tools
    continuing, // continuation stream after tool execution
    complete, // finished successfully
    error_state, // failed (can't use 'error' - reserved)

    pub fn toString(self: AgentRunStatus) [:0]const u8 {
        return switch (self) {
            .pending => "pending",
            .streaming => "streaming",
            .tools => "tools",
            .continuing => "continuing",
            .complete => "complete",
            .error_state => "error",
        };
    }

    pub fn fromString(s: []const u8) AgentRunStatus {
        if (std.mem.eql(u8, s, "pending")) return .pending;
        if (std.mem.eql(u8, s, "streaming")) return .streaming;
        if (std.mem.eql(u8, s, "tools")) return .tools;
        if (std.mem.eql(u8, s, "continuing")) return .continuing;
        if (std.mem.eql(u8, s, "complete")) return .complete;
        if (std.mem.eql(u8, s, "error")) return .error_state;
        return .pending;
    }
};

/// A chat message
pub const Message = struct {
    id: i64,
    role: Role,
    content: []const u8,
    timestamp: i64,
    ephemeral: bool = false,
    tool_name: ?[]const u8 = null,
    tool_input: ?[]const u8 = null,
    status: MessageStatus = .sent,
};

/// Row type for SELECT query
const MessageRow = struct {
    id: i64,
    role: []const u8,
    content: []const u8,
    timestamp: i64,
    ephemeral: i64,
    tool_name: ?[]const u8,
    tool_input: ?[]const u8,
    status: []const u8,
};

/// A session/tab
pub const Session = struct {
    id: i64,
    name: []const u8,
    created_at: i64,
};

const SessionRow = struct {
    id: i64,
    name: []const u8,
    created_at: i64,
};

/// An agent run (tool execution state for crash recovery)
pub const AgentRun = struct {
    id: i64,
    session_id: i64,
    status: AgentRunStatus,
    pending_tools_json: ?[]const u8,
    current_tool_idx: i64,
    tool_results_json: ?[]const u8,
    assistant_content_json: ?[]const u8,
    created_at: i64,
    updated_at: i64,
};

const AgentRunRow = struct {
    id: i64,
    session_id: i64,
    status: []const u8,
    pending_tools_json: ?[]const u8,
    current_tool_idx: i64,
    tool_results_json: ?[]const u8,
    assistant_content_json: ?[]const u8,
    created_at: i64,
    updated_at: i64,
};

/// Generic Database for chat history, parameterized over SQLite backend
pub fn Database(comptime SqliteDb: type) type {
    return struct {
        db: SqliteDb,
        allocator: std.mem.Allocator,
        current_session_id: i64,

        const Self = @This();

        pub fn init(allocator: std.mem.Allocator, path: ?[:0]const u8) !Self {
            var db = try SqliteDb.init(.{
                .mode = if (path) |p| .{ .File = p } else .Memory,
                .open_flags = .{ .write = true, .create = true },
            });

            // Create sessions table
            try db.exec(
                \\CREATE TABLE IF NOT EXISTS sessions (
                \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
                \\    name TEXT NOT NULL,
                \\    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                \\)
            , .{}, .{});

            // Create messages table with session_id
            try db.exec(
                \\CREATE TABLE IF NOT EXISTS messages (
                \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
                \\    session_id INTEGER NOT NULL DEFAULT 1,
                \\    role TEXT NOT NULL,
                \\    content TEXT NOT NULL,
                \\    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                \\    ephemeral INTEGER NOT NULL DEFAULT 0,
                \\    tool_name TEXT,
                \\    tool_input TEXT,
                \\    status TEXT NOT NULL DEFAULT 'sent'
                \\)
            , .{}, .{});

            // Migration: add columns if they don't exist
            // SQLiteError is expected for "duplicate column" - log other errors
            db.exec("ALTER TABLE messages ADD COLUMN tool_name TEXT", .{}, .{}) catch |err| {
                if (err != error.SQLiteError) {
                    obs.global.logSimple(.err, @src(), "db.migration", @errorName(err));
                }
            };
            db.exec("ALTER TABLE messages ADD COLUMN tool_input TEXT", .{}, .{}) catch |err| {
                if (err != error.SQLiteError) {
                    obs.global.logSimple(.err, @src(), "db.migration", @errorName(err));
                }
            };
            db.exec("ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'", .{}, .{}) catch |err| {
                if (err != error.SQLiteError) {
                    obs.global.logSimple(.err, @src(), "db.migration", @errorName(err));
                }
            };

            // Create agent_runs table for crash recovery
            try db.exec(
                \\CREATE TABLE IF NOT EXISTS agent_runs (
                \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
                \\    session_id INTEGER NOT NULL,
                \\    status TEXT NOT NULL DEFAULT 'pending',
                \\    pending_tools_json TEXT,
                \\    current_tool_idx INTEGER NOT NULL DEFAULT 0,
                \\    tool_results_json TEXT,
                \\    assistant_content_json TEXT,
                \\    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                \\    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                \\)
            , .{}, .{});

            // Ensure at least one session exists
            var count_stmt = try db.prepare("SELECT COUNT(*) FROM sessions");
            defer count_stmt.deinit();
            const count_result = try count_stmt.one(struct { count: i64 }, .{}, .{});
            
            var session_id: i64 = 1;
            if (count_result == null or count_result.?.count == 0) {
                try db.exec("INSERT INTO sessions (name) VALUES (?)", .{}, .{"main"});
                session_id = db.getLastInsertRowID();
            } else {
                // Get first session
                var first_stmt = try db.prepare("SELECT id FROM sessions ORDER BY id LIMIT 1");
                defer first_stmt.deinit();
                if (try first_stmt.one(struct { id: i64 }, .{}, .{})) |row| {
                    session_id = row.id;
                }
            }

            return Self{
                .db = db,
                .allocator = allocator,
                .current_session_id = session_id,
            };
        }

        pub fn deinit(self: *Self) void {
            self.db.deinit();
        }

        /// Add a message to history
        pub fn addMessage(self: *Self, role: Role, content: []const u8) !i64 {
            return self.addMessageEx(role, content, false);
        }

        /// Add an ephemeral message (not persisted on reload)
        pub fn addEphemeralMessage(self: *Self, role: Role, content: []const u8) !i64 {
            return self.addMessageEx(role, content, true);
        }

        fn addMessageEx(self: *Self, role: Role, content: []const u8, ephemeral: bool) !i64 {
            try self.db.exec(
                "INSERT INTO messages (session_id, role, content, ephemeral) VALUES (?, ?, ?, ?)",
                .{},
                .{ self.current_session_id, role.toString(), content, @as(i64, if (ephemeral) 1 else 0) },
            );
            return self.db.getLastInsertRowID();
        }

        /// Add a tool result message with metadata
        pub fn addToolResult(self: *Self, tool_name: []const u8, tool_input: []const u8, content: []const u8) !i64 {
            try self.db.exec(
                "INSERT INTO messages (session_id, role, content, tool_name, tool_input) VALUES (?, ?, ?, ?, ?)",
                .{},
                .{ self.current_session_id, "system", content, tool_name, tool_input },
            );
            return self.db.getLastInsertRowID();
        }

        /// Get messages for current session
        pub fn getMessages(self: *Self, allocator: std.mem.Allocator) ![]Message {
            var stmt = try self.db.prepare(
                "SELECT id, role, content, timestamp, ephemeral, tool_name, tool_input, status FROM messages WHERE session_id = ? ORDER BY id"
            );
            defer stmt.deinit();

            var messages: std.ArrayListUnmanaged(Message) = .empty;
            errdefer {
                for (messages.items) |msg| {
                    allocator.free(msg.content);
                    if (msg.tool_name) |tn| allocator.free(tn);
                    if (msg.tool_input) |ti| allocator.free(ti);
                }
                messages.deinit(allocator);
            }

            var iter = try stmt.iterator(MessageRow, .{ self.current_session_id });
            while (try iter.nextAlloc(allocator, .{})) |row| {
                const role = Role.fromString(row.role) orelse .user;
                const status = MessageStatus.fromString(row.status);
                // Free parsed enum strings - they're no longer needed after conversion
                allocator.free(row.role);
                allocator.free(row.status);

                try messages.append(allocator, .{
                    .id = row.id,
                    .role = role,
                    .content = row.content,
                    .timestamp = row.timestamp,
                    .ephemeral = row.ephemeral != 0,
                    .tool_name = row.tool_name,
                    .tool_input = row.tool_input,
                    .status = status,
                });
            }

            return messages.toOwnedSlice(allocator);
        }

        /// Delete ephemeral messages (call on startup to clean old ephemeral messages)
        pub fn deleteEphemeralMessages(self: *Self) !void {
            try self.db.exec("DELETE FROM messages WHERE ephemeral = 1", .{}, .{});
        }

        /// Clear messages for current session
        pub fn clearMessages(self: *Self) !void {
            try self.db.exec("DELETE FROM messages WHERE session_id = ?", .{}, .{self.current_session_id});
        }

        /// Update message content by ID (for streaming updates)
        pub fn updateMessageContent(self: *Self, message_id: i64, content: []const u8) !void {
            try self.db.exec("UPDATE messages SET content = ? WHERE id = ?", .{}, .{ content, message_id });
        }

        /// Add a pending message (queued while AI is responding)
        pub fn addPendingMessage(self: *Self, role: Role, content: []const u8) !i64 {
            try self.db.exec(
                "INSERT INTO messages (session_id, role, content, status) VALUES (?, ?, ?, 'pending')",
                .{},
                .{ self.current_session_id, role.toString(), content },
            );
            return self.db.getLastInsertRowID();
        }

        /// Get the oldest pending message (FIFO queue)
        pub fn getNextPendingMessage(self: *Self, allocator: std.mem.Allocator) !?Message {
            var stmt = try self.db.prepare(
                "SELECT id, role, content, timestamp, ephemeral, tool_name, tool_input, status FROM messages WHERE session_id = ? AND status = 'pending' ORDER BY id LIMIT 1"
            );
            defer stmt.deinit();

            if (try stmt.oneAlloc(MessageRow, allocator, .{}, .{self.current_session_id})) |row| {
                const role = Role.fromString(row.role) orelse .user;
                // Free parsed enum strings - they're no longer needed after conversion
                allocator.free(row.role);
                allocator.free(row.status);

                return Message{
                    .id = row.id,
                    .role = role,
                    .content = row.content,
                    .timestamp = row.timestamp,
                    .ephemeral = row.ephemeral != 0,
                    .tool_name = row.tool_name,
                    .tool_input = row.tool_input,
                    .status = .pending,
                };
            }
            return null;
        }

        /// Mark a pending message as sent
        pub fn markMessageSent(self: *Self, message_id: i64) !void {
            try self.db.exec("UPDATE messages SET status = 'sent' WHERE id = ?", .{}, .{message_id});
        }

        /// Check if there are any pending messages
        pub fn hasPendingMessages(self: *Self) !bool {
            var stmt = try self.db.prepare("SELECT COUNT(*) as c FROM messages WHERE session_id = ? AND status = 'pending'");
            defer stmt.deinit();
            if (try stmt.one(struct { c: i64 }, .{}, .{self.current_session_id})) |row| {
                return row.c > 0;
            }
            return false;
        }

        // ============ Session Management ============

        /// Create a new session/tab
        pub fn createSession(self: *Self, name: []const u8) !i64 {
            try self.db.exec("INSERT INTO sessions (name) VALUES (?)", .{}, .{name});
            return self.db.getLastInsertRowID();
        }

        /// Get all sessions
        pub fn getSessions(self: *Self, allocator: std.mem.Allocator) ![]Session {
            var stmt = try self.db.prepare("SELECT id, name, created_at FROM sessions ORDER BY id");
            defer stmt.deinit();

            var sessions: std.ArrayListUnmanaged(Session) = .empty;
            errdefer {
                for (sessions.items) |s| allocator.free(s.name);
                sessions.deinit(allocator);
            }

            var iter = try stmt.iterator(SessionRow, .{});
            while (try iter.nextAlloc(allocator, .{})) |row| {
                try sessions.append(allocator, .{
                    .id = row.id,
                    .name = row.name,
                    .created_at = row.created_at,
                });
            }

            return sessions.toOwnedSlice(allocator);
        }

        /// Free sessions array
        pub fn freeSessions(allocator: std.mem.Allocator, sessions: []Session) void {
            for (sessions) |s| {
                allocator.free(s.name);
            }
            allocator.free(sessions);
        }

        /// Switch to a session
        pub fn switchSession(self: *Self, session_id: i64) void {
            self.current_session_id = session_id;
        }

        /// Get current session ID
        pub fn getCurrentSessionId(self: *const Self) i64 {
            return self.current_session_id;
        }

        /// Delete a session and its messages
        pub fn deleteSession(self: *Self, session_id: i64) !void {
            try self.db.exec("DELETE FROM messages WHERE session_id = ?", .{}, .{session_id});
            try self.db.exec("DELETE FROM sessions WHERE id = ?", .{}, .{session_id});
        }

        /// Rename a session
        pub fn renameSession(self: *Self, session_id: i64, new_name: []const u8) !void {
            try self.db.exec("UPDATE sessions SET name = ? WHERE id = ?", .{}, .{ new_name, session_id });
        }

        /// Get session count
        pub fn getSessionCount(self: *Self) !i64 {
            var stmt = try self.db.prepare("SELECT COUNT(*) FROM sessions");
            defer stmt.deinit();
            if (try stmt.one(struct { count: i64 }, .{}, .{})) |row| {
                return row.count;
            }
            return 0;
        }

        /// Free messages array
        pub fn freeMessages(allocator: std.mem.Allocator, messages: []Message) void {
            for (messages) |msg| {
                allocator.free(msg.content);
                if (msg.tool_name) |tn| allocator.free(tn);
                if (msg.tool_input) |ti| allocator.free(ti);
            }
            allocator.free(messages);
        }

        // ============ Agent Run Management (crash recovery) ============

        /// Create a new agent run for current session
        pub fn createAgentRun(self: *Self) !i64 {
            try self.db.exec(
                "INSERT INTO agent_runs (session_id, status) VALUES (?, 'pending')",
                .{},
                .{self.current_session_id},
            );
            return self.db.getLastInsertRowID();
        }

        /// Get active (non-complete) agent run for current session
        pub fn getActiveAgentRun(self: *Self, allocator: std.mem.Allocator) !?AgentRun {
            var stmt = try self.db.prepare(
                "SELECT id, session_id, status, pending_tools_json, current_tool_idx, tool_results_json, assistant_content_json, created_at, updated_at FROM agent_runs WHERE session_id = ? AND status NOT IN ('complete', 'error') ORDER BY id DESC LIMIT 1",
            );
            defer stmt.deinit();

            if (try stmt.oneAlloc(AgentRunRow, allocator, .{}, .{self.current_session_id})) |row| {
                const status = AgentRunStatus.fromString(row.status);
                // Free parsed enum string - no longer needed after conversion
                allocator.free(row.status);

                return AgentRun{
                    .id = row.id,
                    .session_id = row.session_id,
                    .status = status,
                    .pending_tools_json = row.pending_tools_json,
                    .current_tool_idx = row.current_tool_idx,
                    .tool_results_json = row.tool_results_json,
                    .assistant_content_json = row.assistant_content_json,
                    .created_at = row.created_at,
                    .updated_at = row.updated_at,
                };
            }
            return null;
        }

        /// Update agent run status
        pub fn updateAgentRunStatus(self: *Self, run_id: i64, status: AgentRunStatus) !void {
            try self.db.exec(
                "UPDATE agent_runs SET status = ?, updated_at = strftime('%s', 'now') WHERE id = ?",
                .{},
                .{ status.toString(), run_id },
            );
        }

        /// Update agent run pending tools
        pub fn updateAgentRunTools(self: *Self, run_id: i64, pending_tools_json: ?[]const u8, current_idx: i64) !void {
            try self.db.exec(
                "UPDATE agent_runs SET pending_tools_json = ?, current_tool_idx = ?, updated_at = strftime('%s', 'now') WHERE id = ?",
                .{},
                .{ pending_tools_json, current_idx, run_id },
            );
        }

        /// Update agent run tool results
        pub fn updateAgentRunResults(self: *Self, run_id: i64, tool_results_json: ?[]const u8) !void {
            try self.db.exec(
                "UPDATE agent_runs SET tool_results_json = ?, updated_at = strftime('%s', 'now') WHERE id = ?",
                .{},
                .{ tool_results_json, run_id },
            );
        }

        /// Update agent run assistant content (for continuation)
        pub fn updateAgentRunAssistantContent(self: *Self, run_id: i64, assistant_content_json: ?[]const u8) !void {
            try self.db.exec(
                "UPDATE agent_runs SET assistant_content_json = ?, updated_at = strftime('%s', 'now') WHERE id = ?",
                .{},
                .{ assistant_content_json, run_id },
            );
        }

        /// Mark agent run complete
        pub fn completeAgentRun(self: *Self, run_id: i64) !void {
            try self.db.exec(
                "UPDATE agent_runs SET status = 'complete', pending_tools_json = NULL, tool_results_json = NULL, assistant_content_json = NULL, updated_at = strftime('%s', 'now') WHERE id = ?",
                .{},
                .{run_id},
            );
        }

        /// Mark agent run as error
        pub fn failAgentRun(self: *Self, run_id: i64) !void {
            try self.db.exec(
                "UPDATE agent_runs SET status = 'error', updated_at = strftime('%s', 'now') WHERE id = ?",
                .{},
                .{run_id},
            );
        }

        /// Free agent run (if it has allocated strings)
        pub fn freeAgentRun(allocator: std.mem.Allocator, run: AgentRun) void {
            if (run.pending_tools_json) |p| allocator.free(p);
            if (run.tool_results_json) |r| allocator.free(r);
            if (run.assistant_content_json) |a| allocator.free(a);
        }
    };
}
