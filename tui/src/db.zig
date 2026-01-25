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
    entry_id: ?[]const u8 = null,
    parent_id: ?[]const u8 = null,
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
    entry_id: ?[]const u8,
    parent_id: ?[]const u8,
};

/// A label/bookmark on a message entry
pub const Label = struct {
    id: i64,
    target_id: []const u8,
    label: []const u8,
    created_at: i64,
};

const LabelRow = struct {
    id: i64,
    target_id: []const u8,
    label: []const u8,
    created_at: i64,
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

/// A compaction entry for context summarization
pub const CompactionEntry = struct {
    id: i64,
    session_id: i64,
    summary: []const u8,
    first_kept_msg_id: i64,
    tokens_before: i64,
    details_json: ?[]const u8,
    created_at: i64,
};

const CompactionEntryRow = struct {
    id: i64,
    session_id: i64,
    summary: []const u8,
    first_kept_msg_id: i64,
    tokens_before: i64,
    details_json: ?[]const u8,
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
        current_leaf_id: ?[]const u8 = null,

        const Self = @This();

        /// Generate an 8-char UUID prefix for entry_id
        fn generateEntryId(self: *Self) ![8]u8 {
            _ = self;
            const ns = std.time.nanoTimestamp();
            const seed: u64 = @truncate(@as(u128, @bitCast(ns)));
            var prng = std.Random.DefaultPrng.init(seed);
            const random = prng.random();

            var uuid: [8]u8 = undefined;
            for (&uuid) |*byte| {
                const v = random.int(u8) & 0x0F;
                byte.* = if (v < 10) '0' + v else 'a' + (v - 10);
            }
            return uuid;
        }

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

            // Migration: add entry_id and parent_id for branching support
            db.exec("ALTER TABLE messages ADD COLUMN entry_id TEXT", .{}, .{}) catch |err| {
                if (err != error.SQLiteError) {
                    obs.global.logSimple(.err, @src(), "db.migration", @errorName(err));
                }
            };
            db.exec("ALTER TABLE messages ADD COLUMN parent_id TEXT", .{}, .{}) catch |err| {
                if (err != error.SQLiteError) {
                    obs.global.logSimple(.err, @src(), "db.migration", @errorName(err));
                }
            };

            // Create labels table for bookmarking messages
            try db.exec(
                \\CREATE TABLE IF NOT EXISTS labels (
                \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
                \\    session_id INTEGER NOT NULL,
                \\    target_id TEXT NOT NULL,
                \\    label TEXT NOT NULL,
                \\    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                \\    UNIQUE(session_id, label)
                \\)
            , .{}, .{});

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

            // Create compactions table for context summarization
            try db.exec(
                \\CREATE TABLE IF NOT EXISTS compactions (
                \\    id INTEGER PRIMARY KEY AUTOINCREMENT,
                \\    session_id INTEGER NOT NULL,
                \\    summary TEXT NOT NULL,
                \\    first_kept_msg_id INTEGER NOT NULL,
                \\    tokens_before INTEGER NOT NULL,
                \\    details_json TEXT,
                \\    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
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
            if (self.current_leaf_id) |leaf| {
                self.allocator.free(leaf);
            }
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
            const entry_id = try self.generateEntryId();
            try self.db.exec(
                "INSERT INTO messages (session_id, role, content, ephemeral, entry_id, parent_id) VALUES (?, ?, ?, ?, ?, ?)",
                .{},
                .{ self.current_session_id, role.toString(), content, @as(i64, if (ephemeral) 1 else 0), &entry_id, self.current_leaf_id },
            );
            const msg_id = self.db.getLastInsertRowID();

            // Update leaf pointer
            if (self.current_leaf_id) |old| {
                self.allocator.free(old);
            }
            self.current_leaf_id = try self.allocator.dupe(u8, &entry_id);

            return msg_id;
        }

        /// Add a tool result message with metadata
        pub fn addToolResult(self: *Self, tool_name: []const u8, tool_input: []const u8, content: []const u8) !i64 {
            const entry_id = try self.generateEntryId();
            try self.db.exec(
                "INSERT INTO messages (session_id, role, content, tool_name, tool_input, entry_id, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                .{},
                .{ self.current_session_id, "system", content, tool_name, tool_input, &entry_id, self.current_leaf_id },
            );
            const msg_id = self.db.getLastInsertRowID();

            if (self.current_leaf_id) |old| {
                self.allocator.free(old);
            }
            self.current_leaf_id = try self.allocator.dupe(u8, &entry_id);

            return msg_id;
        }

        /// Get messages for current session
        pub fn getMessages(self: *Self, allocator: std.mem.Allocator) ![]Message {
            var stmt = try self.db.prepare(
                "SELECT id, role, content, timestamp, ephemeral, tool_name, tool_input, status, entry_id, parent_id FROM messages WHERE session_id = ? ORDER BY id"
            );
            defer stmt.deinit();

            var messages: std.ArrayListUnmanaged(Message) = .empty;
            errdefer {
                for (messages.items) |msg| {
                    allocator.free(msg.content);
                    if (msg.tool_name) |tn| allocator.free(tn);
                    if (msg.tool_input) |ti| allocator.free(ti);
                    if (msg.entry_id) |eid| allocator.free(eid);
                    if (msg.parent_id) |pid| allocator.free(pid);
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
                    .entry_id = row.entry_id,
                    .parent_id = row.parent_id,
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
                if (msg.entry_id) |eid| allocator.free(eid);
                if (msg.parent_id) |pid| allocator.free(pid);
            }
            allocator.free(messages);
        }

        // ============ Branching & Labels ============

        /// Get current leaf entry_id
        pub fn getCurrentLeafId(self: *const Self) ?[]const u8 {
            return self.current_leaf_id;
        }

        /// Create a branch from a specific entry_id (sets leaf to that point)
        pub fn createBranch(self: *Self, from_entry_id: []const u8) !void {
            // Verify the entry exists
            var stmt = try self.db.prepare(
                "SELECT entry_id FROM messages WHERE session_id = ? AND entry_id = ? LIMIT 1"
            );
            defer stmt.deinit();

            const exists = try stmt.one(struct { entry_id: []const u8 }, .{}, .{ self.current_session_id, from_entry_id });
            if (exists == null) {
                return error.EntryNotFound;
            }

            // Update leaf pointer
            if (self.current_leaf_id) |old| {
                self.allocator.free(old);
            }
            self.current_leaf_id = try self.allocator.dupe(u8, from_entry_id);
        }

        /// Get the path from root to a specific leaf (or current leaf if null)
        pub fn getBranch(self: *Self, leaf_id: ?[]const u8, allocator: std.mem.Allocator) ![]Message {
            const target_leaf = leaf_id orelse self.current_leaf_id orelse return &[_]Message{};

            // Build path by walking parent_id chain
            var path = std.ArrayList([]const u8).init(allocator);
            defer path.deinit();

            var current_id: ?[]const u8 = target_leaf;
            while (current_id) |id| {
                try path.append(id);
                var stmt = try self.db.prepare(
                    "SELECT parent_id FROM messages WHERE session_id = ? AND entry_id = ? LIMIT 1"
                );
                defer stmt.deinit();

                if (try stmt.oneAlloc(struct { parent_id: ?[]const u8 }, allocator, .{}, .{ self.current_session_id, id })) |row| {
                    if (row.parent_id) |pid| {
                        current_id = pid;
                    } else {
                        current_id = null;
                    }
                } else {
                    current_id = null;
                }
            }

            // Reverse path to get root->leaf order
            std.mem.reverse([]const u8, path.items);

            // Fetch full messages in order
            var messages = std.ArrayList(Message).init(allocator);
            errdefer {
                for (messages.items) |msg| {
                    allocator.free(msg.content);
                    if (msg.tool_name) |tn| allocator.free(tn);
                    if (msg.tool_input) |ti| allocator.free(ti);
                    if (msg.entry_id) |eid| allocator.free(eid);
                    if (msg.parent_id) |pid| allocator.free(pid);
                }
                messages.deinit();
            }

            for (path.items) |entry_id| {
                var stmt = try self.db.prepare(
                    "SELECT id, role, content, timestamp, ephemeral, tool_name, tool_input, status, entry_id, parent_id FROM messages WHERE session_id = ? AND entry_id = ? LIMIT 1"
                );
                defer stmt.deinit();

                if (try stmt.oneAlloc(MessageRow, allocator, .{}, .{ self.current_session_id, entry_id })) |row| {
                    const role = Role.fromString(row.role) orelse .user;
                    const status = MessageStatus.fromString(row.status);
                    allocator.free(row.role);
                    allocator.free(row.status);

                    try messages.append(.{
                        .id = row.id,
                        .role = role,
                        .content = row.content,
                        .timestamp = row.timestamp,
                        .ephemeral = row.ephemeral != 0,
                        .tool_name = row.tool_name,
                        .tool_input = row.tool_input,
                        .status = status,
                        .entry_id = row.entry_id,
                        .parent_id = row.parent_id,
                    });
                }
            }

            return messages.toOwnedSlice();
        }

        /// Set a label on an entry_id
        pub fn setLabel(self: *Self, entry_id: []const u8, label: []const u8) !void {
            // Verify the entry exists
            var check_stmt = try self.db.prepare(
                "SELECT entry_id FROM messages WHERE session_id = ? AND entry_id = ? LIMIT 1"
            );
            defer check_stmt.deinit();

            const exists = try check_stmt.one(struct { entry_id: []const u8 }, .{}, .{ self.current_session_id, entry_id });
            if (exists == null) {
                return error.EntryNotFound;
            }

            // Upsert label (replace if exists for this session+label combo)
            try self.db.exec(
                "INSERT OR REPLACE INTO labels (session_id, target_id, label) VALUES (?, ?, ?)",
                .{},
                .{ self.current_session_id, entry_id, label },
            );
        }

        /// Get the label for an entry_id (if any)
        pub fn getLabel(self: *Self, entry_id: []const u8, allocator: std.mem.Allocator) !?[]const u8 {
            var stmt = try self.db.prepare(
                "SELECT label FROM labels WHERE session_id = ? AND target_id = ? LIMIT 1"
            );
            defer stmt.deinit();

            if (try stmt.oneAlloc(struct { label: []const u8 }, allocator, .{}, .{ self.current_session_id, entry_id })) |row| {
                return row.label;
            }
            return null;
        }

        /// Get entry_id by label name
        pub fn getEntryByLabel(self: *Self, label: []const u8, allocator: std.mem.Allocator) !?[]const u8 {
            var stmt = try self.db.prepare(
                "SELECT target_id FROM labels WHERE session_id = ? AND label = ? LIMIT 1"
            );
            defer stmt.deinit();

            if (try stmt.oneAlloc(struct { target_id: []const u8 }, allocator, .{}, .{ self.current_session_id, label })) |row| {
                return row.target_id;
            }
            return null;
        }

        /// Get all labels for current session
        pub fn getLabels(self: *Self, allocator: std.mem.Allocator) ![]Label {
            var stmt = try self.db.prepare(
                "SELECT id, target_id, label, created_at FROM labels WHERE session_id = ? ORDER BY created_at"
            );
            defer stmt.deinit();

            var labels = std.ArrayList(Label).init(allocator);
            errdefer {
                for (labels.items) |l| {
                    allocator.free(l.target_id);
                    allocator.free(l.label);
                }
                labels.deinit();
            }

            var iter = try stmt.iterator(LabelRow, .{ self.current_session_id });
            while (try iter.nextAlloc(allocator, .{})) |row| {
                try labels.append(.{
                    .id = row.id,
                    .target_id = row.target_id,
                    .label = row.label,
                    .created_at = row.created_at,
                });
            }

            return labels.toOwnedSlice();
        }

        /// Free labels array
        pub fn freeLabels(allocator: std.mem.Allocator, labels: []Label) void {
            for (labels) |l| {
                allocator.free(l.target_id);
                allocator.free(l.label);
            }
            allocator.free(labels);
        }

        /// Delete a label
        pub fn deleteLabel(self: *Self, label: []const u8) !void {
            try self.db.exec(
                "DELETE FROM labels WHERE session_id = ? AND label = ?",
                .{},
                .{ self.current_session_id, label },
            );
        }

        /// Check if entry has children (is a branch point)
        pub fn hasChildren(self: *Self, entry_id: []const u8) !bool {
            var stmt = try self.db.prepare(
                "SELECT COUNT(*) as c FROM messages WHERE session_id = ? AND parent_id = ?"
            );
            defer stmt.deinit();
            if (try stmt.one(struct { c: i64 }, .{}, .{ self.current_session_id, entry_id })) |row| {
                return row.c > 1;
            }
            return false;
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

        // ============ Compaction Management ============

        /// Create a compaction entry for the current session
        pub fn createCompaction(
            self: *Self,
            summary: []const u8,
            first_kept_msg_id: i64,
            tokens_before: i64,
            details_json: ?[]const u8,
        ) !i64 {
            try self.db.exec(
                "INSERT INTO compactions (session_id, summary, first_kept_msg_id, tokens_before, details_json) VALUES (?, ?, ?, ?, ?)",
                .{},
                .{ self.current_session_id, summary, first_kept_msg_id, tokens_before, details_json },
            );
            return self.db.getLastInsertRowID();
        }

        /// Get the latest compaction for the current session
        pub fn getLatestCompaction(self: *Self, allocator: std.mem.Allocator) !?CompactionEntry {
            var stmt = try self.db.prepare(
                "SELECT id, session_id, summary, first_kept_msg_id, tokens_before, details_json, created_at FROM compactions WHERE session_id = ? ORDER BY id DESC LIMIT 1",
            );
            defer stmt.deinit();

            if (try stmt.oneAlloc(CompactionEntryRow, allocator, .{}, .{self.current_session_id})) |row| {
                return CompactionEntry{
                    .id = row.id,
                    .session_id = row.session_id,
                    .summary = row.summary,
                    .first_kept_msg_id = row.first_kept_msg_id,
                    .tokens_before = row.tokens_before,
                    .details_json = row.details_json,
                    .created_at = row.created_at,
                };
            }
            return null;
        }

        /// Get messages for current session starting from a specific message ID (for post-compaction context)
        pub fn getMessagesFromId(self: *Self, allocator: std.mem.Allocator, from_id: i64) ![]Message {
            var stmt = try self.db.prepare(
                "SELECT id, role, content, timestamp, ephemeral, tool_name, tool_input, status FROM messages WHERE session_id = ? AND id >= ? ORDER BY id",
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

            var iter = try stmt.iterator(MessageRow, .{ self.current_session_id, from_id });
            while (try iter.nextAlloc(allocator, .{})) |row| {
                const role = Role.fromString(row.role) orelse .user;
                const status = MessageStatus.fromString(row.status);
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

        /// Free compaction entry
        pub fn freeCompaction(allocator: std.mem.Allocator, entry: CompactionEntry) void {
            allocator.free(entry.summary);
            if (entry.details_json) |d| allocator.free(d);
        }

        /// Delete compactions for a session (called when deleting session)
        pub fn deleteSessionCompactions(self: *Self, session_id: i64) !void {
            try self.db.exec("DELETE FROM compactions WHERE session_id = ?", .{}, .{session_id});
        }
    };
}
