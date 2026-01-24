const std = @import("std");

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

/// A chat message
pub const Message = struct {
    id: i64,
    role: Role,
    content: []const u8,
    timestamp: i64,
    ephemeral: bool = false,
    tool_name: ?[]const u8 = null,
    tool_input: ?[]const u8 = null,
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
                \\    tool_input TEXT
                \\)
            , .{}, .{});

            // Migration: add tool_name and tool_input columns if they don't exist
            db.exec("ALTER TABLE messages ADD COLUMN tool_name TEXT", .{}, .{}) catch {};
            db.exec("ALTER TABLE messages ADD COLUMN tool_input TEXT", .{}, .{}) catch {};

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
                "SELECT id, role, content, timestamp, ephemeral, tool_name, tool_input FROM messages WHERE session_id = ? ORDER BY id"
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
                try messages.append(allocator, .{
                    .id = row.id,
                    .role = role,
                    .content = row.content,
                    .timestamp = row.timestamp,
                    .ephemeral = row.ephemeral != 0,
                    .tool_name = row.tool_name,
                    .tool_input = row.tool_input,
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
    };
}
