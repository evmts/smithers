const std = @import("std");
const db = @import("../db.zig");

// ============================================================================
// Mock SQLite Backend for Testing
// ============================================================================

const MockDb = struct {
    allocator: std.mem.Allocator,
    tables: std.StringHashMap(Table),
    last_insert_id: i64 = 0,

    const Table = struct {
        rows: std.ArrayList(std.StringHashMap(Value)),
        allocator: std.mem.Allocator,

        fn init(allocator: std.mem.Allocator) Table {
            return .{
                .rows = std.ArrayList(std.StringHashMap(Value)).init(allocator),
                .allocator = allocator,
            };
        }

        fn deinit(self: *Table) void {
            for (self.rows.items) |*row| {
                var iter = row.iterator();
                while (iter.next()) |entry| {
                    if (entry.value_ptr.* == .string) {
                        self.allocator.free(entry.value_ptr.string);
                    }
                }
                row.deinit();
            }
            self.rows.deinit();
        }
    };

    const Value = union(enum) {
        int: i64,
        string: []const u8,
        null_val: void,
    };

    const InitOptions = struct {
        mode: union(enum) {
            File: [:0]const u8,
            Memory,
        },
        open_flags: struct {
            write: bool = false,
            create: bool = false,
        } = .{},
    };

    fn init(_: InitOptions) !MockDb {
        return .{
            .allocator = std.testing.allocator,
            .tables = std.StringHashMap(Table).init(std.testing.allocator),
        };
    }

    fn deinit(self: *MockDb) void {
        var iter = self.tables.iterator();
        while (iter.next()) |entry| {
            var table = entry.value_ptr;
            table.deinit();
        }
        self.tables.deinit();
    }

    fn exec(_: *MockDb, _: anytype, _: anytype, _: anytype) !void {}

    fn getLastInsertRowID(self: *MockDb) i64 {
        return self.last_insert_id;
    }

    const Statement = struct {
        fn deinit(_: *Statement) void {}
        fn one(_: *Statement, comptime T: type, _: anytype, _: anytype) !?T {
            return null;
        }
        fn iterator(_: *Statement, comptime T: type, _: anytype) !Iterator(T) {
            return .{};
        }
    };

    fn Iterator(comptime T: type) type {
        return struct {
            fn nextAlloc(_: *@This(), _: std.mem.Allocator, _: anytype) !?T {
                return null;
            }
        };
    }

    fn prepare(_: *MockDb, _: anytype) !Statement {
        return .{};
    }
};

// Use actual sqlite for real integration tests
const Sqlite = @import("sqlite").Db;
const TestDatabase = db.Database(Sqlite);

// ============================================================================
// Role Enum Tests
// ============================================================================

test "Role toString returns correct strings" {
    try std.testing.expectEqualStrings("user", db.Role.user.toString());
    try std.testing.expectEqualStrings("assistant", db.Role.assistant.toString());
    try std.testing.expectEqualStrings("system", db.Role.system.toString());
}

test "Role fromString parses valid roles" {
    try std.testing.expectEqual(db.Role.user, db.Role.fromString("user").?);
    try std.testing.expectEqual(db.Role.assistant, db.Role.fromString("assistant").?);
    try std.testing.expectEqual(db.Role.system, db.Role.fromString("system").?);
}

test "Role fromString returns null for invalid roles" {
    try std.testing.expect(db.Role.fromString("invalid") == null);
    try std.testing.expect(db.Role.fromString("") == null);
    try std.testing.expect(db.Role.fromString("USER") == null);
    try std.testing.expect(db.Role.fromString("Admin") == null);
}

test "Role toString and fromString are inverses" {
    inline for (@typeInfo(db.Role).@"enum".fields) |field| {
        const role: db.Role = @enumFromInt(field.value);
        const str = role.toString();
        const parsed = db.Role.fromString(str);
        try std.testing.expectEqual(role, parsed.?);
    }
}

// ============================================================================
// Message Struct Tests
// ============================================================================

test "Message default values" {
    const msg = db.Message{
        .id = 1,
        .role = .user,
        .content = "hello",
        .timestamp = 12345,
    };
    try std.testing.expect(!msg.ephemeral);
    try std.testing.expect(msg.tool_name == null);
    try std.testing.expect(msg.tool_input == null);
}

test "Message with all fields" {
    const msg = db.Message{
        .id = 42,
        .role = .system,
        .content = "tool result",
        .timestamp = 99999,
        .ephemeral = true,
        .tool_name = "bash",
        .tool_input = "{\"command\": \"ls\"}",
    };
    try std.testing.expectEqual(@as(i64, 42), msg.id);
    try std.testing.expectEqual(db.Role.system, msg.role);
    try std.testing.expectEqualStrings("tool result", msg.content);
    try std.testing.expectEqual(@as(i64, 99999), msg.timestamp);
    try std.testing.expect(msg.ephemeral);
    try std.testing.expectEqualStrings("bash", msg.tool_name.?);
    try std.testing.expectEqualStrings("{\"command\": \"ls\"}", msg.tool_input.?);
}

// ============================================================================
// Session Struct Tests
// ============================================================================

test "Session struct fields" {
    const session = db.Session{
        .id = 1,
        .name = "main",
        .created_at = 1700000000,
    };
    try std.testing.expectEqual(@as(i64, 1), session.id);
    try std.testing.expectEqualStrings("main", session.name);
    try std.testing.expectEqual(@as(i64, 1700000000), session.created_at);
}

// ============================================================================
// Database Initialization Tests
// ============================================================================

test "Database init creates tables with in-memory SQLite" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    try std.testing.expect(database.current_session_id >= 1);
}

test "Database init creates default session" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const count = try database.getSessionCount();
    try std.testing.expect(count >= 1);
}

test "Database init is idempotent" {
    const allocator = std.testing.allocator;

    var db1 = try TestDatabase.init(allocator, null);
    defer db1.deinit();

    const initial_count = try db1.getSessionCount();
    try std.testing.expect(initial_count >= 1);
}

// ============================================================================
// Message CRUD Tests
// ============================================================================

test "Database addMessage and getMessages" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const id1 = try database.addMessage(.user, "Hello");
    const id2 = try database.addMessage(.assistant, "Hi there!");

    try std.testing.expect(id1 > 0);
    try std.testing.expect(id2 > id1);

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 2), messages.len);
    try std.testing.expectEqualStrings("Hello", messages[0].content);
    try std.testing.expectEqual(db.Role.user, messages[0].role);
    try std.testing.expectEqualStrings("Hi there!", messages[1].content);
    try std.testing.expectEqual(db.Role.assistant, messages[1].role);
}

test "Database addMessage with different roles" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "user message");
    _ = try database.addMessage(.assistant, "assistant message");
    _ = try database.addMessage(.system, "system message");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 3), messages.len);
    try std.testing.expectEqual(db.Role.user, messages[0].role);
    try std.testing.expectEqual(db.Role.assistant, messages[1].role);
    try std.testing.expectEqual(db.Role.system, messages[2].role);
}

test "Database getMessages returns empty for new session" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const new_session = try database.createSession("empty");
    database.switchSession(new_session);

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 0), messages.len);
}

test "Database updateMessageContent" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const id = try database.addMessage(.assistant, "partial");
    try database.updateMessageContent(id, "complete response");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 1), messages.len);
    try std.testing.expectEqualStrings("complete response", messages[0].content);
}

test "Database clearMessages removes all messages in session" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "msg1");
    _ = try database.addMessage(.assistant, "msg2");
    _ = try database.addMessage(.user, "msg3");

    try database.clearMessages();

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 0), messages.len);
}

test "Database clearMessages only affects current session" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const session1 = database.getCurrentSessionId();
    _ = try database.addMessage(.user, "session1 message");

    const session2 = try database.createSession("session2");
    database.switchSession(session2);
    _ = try database.addMessage(.user, "session2 message");

    database.switchSession(session1);
    try database.clearMessages();

    const msgs1 = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, msgs1);
    try std.testing.expectEqual(@as(usize, 0), msgs1.len);

    database.switchSession(session2);
    const msgs2 = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, msgs2);
    try std.testing.expectEqual(@as(usize, 1), msgs2.len);
}

// ============================================================================
// Ephemeral Message Tests
// ============================================================================

test "Database addEphemeralMessage" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "persistent");
    _ = try database.addEphemeralMessage(.assistant, "ephemeral");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 2), messages.len);
    try std.testing.expect(!messages[0].ephemeral);
    try std.testing.expect(messages[1].ephemeral);
}

test "Database deleteEphemeralMessages" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "keep1");
    _ = try database.addEphemeralMessage(.assistant, "delete1");
    _ = try database.addMessage(.user, "keep2");
    _ = try database.addEphemeralMessage(.assistant, "delete2");

    try database.deleteEphemeralMessages();

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 2), messages.len);
    try std.testing.expectEqualStrings("keep1", messages[0].content);
    try std.testing.expectEqualStrings("keep2", messages[1].content);
}

test "Database deleteEphemeralMessages across all sessions" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addEphemeralMessage(.assistant, "ephemeral in session 1");

    const session2 = try database.createSession("session2");
    database.switchSession(session2);
    _ = try database.addEphemeralMessage(.assistant, "ephemeral in session 2");
    _ = try database.addMessage(.user, "persistent in session 2");

    try database.deleteEphemeralMessages();

    const msgs2 = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, msgs2);
    try std.testing.expectEqual(@as(usize, 1), msgs2.len);
    try std.testing.expectEqualStrings("persistent in session 2", msgs2[0].content);
}

// ============================================================================
// Tool Result Tests
// ============================================================================

test "Database addToolResult" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const id = try database.addToolResult("bash", "{\"command\":\"ls\"}", "file1.txt\nfile2.txt");

    try std.testing.expect(id > 0);

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 1), messages.len);
    try std.testing.expectEqual(db.Role.system, messages[0].role);
    try std.testing.expectEqualStrings("file1.txt\nfile2.txt", messages[0].content);
    try std.testing.expectEqualStrings("bash", messages[0].tool_name.?);
    try std.testing.expectEqualStrings("{\"command\":\"ls\"}", messages[0].tool_input.?);
}

test "Database addToolResult multiple tools" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addToolResult("read", "{\"path\":\"/etc/hosts\"}", "127.0.0.1 localhost");
    _ = try database.addToolResult("bash", "{\"command\":\"pwd\"}", "/home/user");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 2), messages.len);
    try std.testing.expectEqualStrings("read", messages[0].tool_name.?);
    try std.testing.expectEqualStrings("bash", messages[1].tool_name.?);
}

// ============================================================================
// Session Management Tests
// ============================================================================

test "Database createSession" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const initial_count = try database.getSessionCount();
    const new_id = try database.createSession("new session");

    try std.testing.expect(new_id > 0);
    try std.testing.expectEqual(initial_count + 1, try database.getSessionCount());
}

test "Database getSessions" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.createSession("session A");
    _ = try database.createSession("session B");

    const sessions = try database.getSessions(allocator);
    defer TestDatabase.freeSessions(allocator, sessions);

    try std.testing.expect(sessions.len >= 3);

    var found_a = false;
    var found_b = false;
    for (sessions) |s| {
        if (std.mem.eql(u8, s.name, "session A")) found_a = true;
        if (std.mem.eql(u8, s.name, "session B")) found_b = true;
    }
    try std.testing.expect(found_a);
    try std.testing.expect(found_b);
}

test "Database switchSession changes current session" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const initial = database.getCurrentSessionId();
    const new_session = try database.createSession("other");

    database.switchSession(new_session);
    try std.testing.expectEqual(new_session, database.getCurrentSessionId());

    database.switchSession(initial);
    try std.testing.expectEqual(initial, database.getCurrentSessionId());
}

test "Database switchSession isolates messages" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "message in session 1");

    const session2 = try database.createSession("session 2");
    database.switchSession(session2);

    const msgs = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, msgs);
    try std.testing.expectEqual(@as(usize, 0), msgs.len);

    _ = try database.addMessage(.user, "message in session 2");

    const msgs2 = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, msgs2);
    try std.testing.expectEqual(@as(usize, 1), msgs2.len);
    try std.testing.expectEqualStrings("message in session 2", msgs2[0].content);
}

test "Database deleteSession removes session and messages" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const session_to_delete = try database.createSession("temporary");
    database.switchSession(session_to_delete);
    _ = try database.addMessage(.user, "will be deleted");

    const count_before = try database.getSessionCount();

    database.switchSession(database.current_session_id);
    try database.deleteSession(session_to_delete);

    const count_after = try database.getSessionCount();
    try std.testing.expectEqual(count_before - 1, count_after);
}

test "Database renameSession" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const session_id = try database.createSession("old name");
    try database.renameSession(session_id, "new name");

    const sessions = try database.getSessions(allocator);
    defer TestDatabase.freeSessions(allocator, sessions);

    var found = false;
    for (sessions) |s| {
        if (s.id == session_id) {
            try std.testing.expectEqualStrings("new name", s.name);
            found = true;
            break;
        }
    }
    try std.testing.expect(found);
}

test "Database getSessionCount" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const initial = try database.getSessionCount();
    try std.testing.expect(initial >= 1);

    _ = try database.createSession("extra1");
    try std.testing.expectEqual(initial + 1, try database.getSessionCount());

    _ = try database.createSession("extra2");
    try std.testing.expectEqual(initial + 2, try database.getSessionCount());
}

test "Database getCurrentSessionId" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const id = database.getCurrentSessionId();
    try std.testing.expect(id >= 1);
}

// ============================================================================
// Memory Management Tests
// ============================================================================

test "freeMessages handles empty slice" {
    const allocator = std.testing.allocator;
    const empty: []db.Message = &[_]db.Message{};
    TestDatabase.freeMessages(allocator, empty);
}

test "freeSessions handles empty slice" {
    const allocator = std.testing.allocator;
    const empty: []db.Session = &[_]db.Session{};
    TestDatabase.freeSessions(allocator, empty);
}

test "freeMessages properly frees all allocations" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "test message 1");
    _ = try database.addMessage(.assistant, "test message 2");
    _ = try database.addToolResult("tool", "{}", "result");

    const messages = try database.getMessages(allocator);
    TestDatabase.freeMessages(allocator, messages);
}

test "freeSessions properly frees all allocations" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.createSession("session 1");
    _ = try database.createSession("session 2");

    const sessions = try database.getSessions(allocator);
    TestDatabase.freeSessions(allocator, sessions);
}

// ============================================================================
// Edge Cases and Error Handling Tests
// ============================================================================

test "Database handles empty content" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const id = try database.addMessage(.user, "");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 1), messages.len);
    try std.testing.expectEqualStrings("", messages[0].content);
    try std.testing.expectEqual(id, messages[0].id);
}

test "Database handles unicode content" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "Hello 世界 🌍 émoji");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 1), messages.len);
    try std.testing.expectEqualStrings("Hello 世界 🌍 émoji", messages[0].content);
}

test "Database handles very long content" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const long_content = "x" ** 10000;
    _ = try database.addMessage(.user, long_content);

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 1), messages.len);
    try std.testing.expectEqual(@as(usize, 10000), messages[0].content.len);
}

test "Database handles special SQL characters in content" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "SELECT * FROM users; DROP TABLE messages; --");
    _ = try database.addMessage(.assistant, "Content with 'single' and \"double\" quotes");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 2), messages.len);
    try std.testing.expectEqualStrings("SELECT * FROM users; DROP TABLE messages; --", messages[0].content);
    try std.testing.expectEqualStrings("Content with 'single' and \"double\" quotes", messages[1].content);
}

test "Database messages have incrementing IDs" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    const id1 = try database.addMessage(.user, "first");
    const id2 = try database.addMessage(.user, "second");
    const id3 = try database.addMessage(.user, "third");

    try std.testing.expect(id2 > id1);
    try std.testing.expect(id3 > id2);
}

test "Database messages preserve order" {
    const allocator = std.testing.allocator;
    var database = try TestDatabase.init(allocator, null);
    defer database.deinit();

    _ = try database.addMessage(.user, "first");
    _ = try database.addMessage(.assistant, "second");
    _ = try database.addMessage(.user, "third");
    _ = try database.addMessage(.assistant, "fourth");

    const messages = try database.getMessages(allocator);
    defer TestDatabase.freeMessages(allocator, messages);

    try std.testing.expectEqual(@as(usize, 4), messages.len);
    try std.testing.expectEqualStrings("first", messages[0].content);
    try std.testing.expectEqualStrings("second", messages[1].content);
    try std.testing.expectEqualStrings("third", messages[2].content);
    try std.testing.expectEqualStrings("fourth", messages[3].content);
}

// ============================================================================
// Generic Database Type Tests
// ============================================================================

test "Database is generic over SQLite backend" {
    const MockDatabase = db.Database(MockDb);
    try std.testing.expect(@TypeOf(MockDatabase) == type);
}

test "Database can be instantiated with real sqlite" {
    const RealDatabase = db.Database(@import("sqlite").Db);
    try std.testing.expect(@TypeOf(RealDatabase) == type);
}
