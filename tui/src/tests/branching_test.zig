const std = @import("std");
const testing = std.testing;

// Import the database module
const db_module = @import("../db.zig");

// Create a mock SQLite type for testing
const MockSqlite = struct {
    const Self = @This();
    
    pub fn init(_: anytype) !Self {
        return Self{};
    }
    
    pub fn deinit(_: *Self) void {}
    
    pub fn exec(_: *Self, _: anytype, _: anytype, _: anytype) !void {}
    
    pub fn prepare(_: *Self, _: anytype) !MockStatement {
        return MockStatement{};
    }
    
    pub fn getLastInsertRowID(_: *Self) i64 {
        return 1;
    }
};

const MockStatement = struct {
    pub fn deinit(_: *MockStatement) void {}
    
    pub fn one(_: *MockStatement, comptime T: type, _: anytype, _: anytype) !?T {
        return null;
    }
    
    pub fn oneAlloc(_: *MockStatement, comptime T: type, _: anytype, _: anytype, _: anytype) !?T {
        return null;
    }
    
    pub fn iterator(_: *MockStatement, comptime _: type, _: anytype) !MockIterator {
        return MockIterator{};
    }
};

const MockIterator = struct {
    pub fn nextAlloc(_: *MockIterator, _: anytype, _: anytype) !?void {
        return null;
    }
};

test "Message struct has entry_id and parent_id fields" {
    const msg = db_module.Message{
        .id = 1,
        .role = .user,
        .content = "test",
        .timestamp = 0,
        .entry_id = "abc12345",
        .parent_id = "def67890",
    };
    
    try testing.expectEqualStrings("abc12345", msg.entry_id.?);
    try testing.expectEqualStrings("def67890", msg.parent_id.?);
}

test "Label struct fields" {
    const label = db_module.Label{
        .id = 1,
        .target_id = "abc12345",
        .label = "checkpoint1",
        .created_at = 1234567890,
    };
    
    try testing.expectEqualStrings("abc12345", label.target_id);
    try testing.expectEqualStrings("checkpoint1", label.label);
    try testing.expectEqual(@as(i64, 1234567890), label.created_at);
}

test "Role enum values" {
    try testing.expectEqualStrings("user", db_module.Role.user.toString());
    try testing.expectEqualStrings("assistant", db_module.Role.assistant.toString());
    try testing.expectEqualStrings("system", db_module.Role.system.toString());
}

test "MessageStatus enum values" {
    try testing.expectEqualStrings("sent", db_module.MessageStatus.sent.toString());
    try testing.expectEqualStrings("pending", db_module.MessageStatus.pending.toString());
}
