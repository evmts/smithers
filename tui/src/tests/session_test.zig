const std = @import("std");
const session = @import("../session/session.zig");

// ============ EntryType tests ============

test "EntryType enum variants" {
    const types = [_]session.EntryType{
        .session,
        .message,
        .compaction,
        .custom,
    };
    try std.testing.expectEqual(@as(usize, 4), types.len);
}

// ============ Role tests ============

test "Role toString user" {
    try std.testing.expectEqualStrings("user", session.Role.user.toString());
}

test "Role toString assistant" {
    try std.testing.expectEqualStrings("assistant", session.Role.assistant.toString());
}

test "Role toString system" {
    try std.testing.expectEqualStrings("system", session.Role.system.toString());
}

test "Role toString tool_result" {
    try std.testing.expectEqualStrings("toolResult", session.Role.tool_result.toString());
}

test "Role fromString user" {
    try std.testing.expectEqual(session.Role.user, session.Role.fromString("user"));
}

test "Role fromString assistant" {
    try std.testing.expectEqual(session.Role.assistant, session.Role.fromString("assistant"));
}

test "Role fromString system" {
    try std.testing.expectEqual(session.Role.system, session.Role.fromString("system"));
}

test "Role fromString toolResult" {
    try std.testing.expectEqual(session.Role.tool_result, session.Role.fromString("toolResult"));
}

test "Role fromString unknown returns null" {
    try std.testing.expect(session.Role.fromString("unknown") == null);
    try std.testing.expect(session.Role.fromString("") == null);
    try std.testing.expect(session.Role.fromString("USER") == null);
}

test "Role roundtrip" {
    const roles = [_]session.Role{ .user, .assistant, .system, .tool_result };
    for (roles) |role| {
        const str = role.toString();
        const parsed = session.Role.fromString(str);
        try std.testing.expectEqual(role, parsed.?);
    }
}

// ============ SessionHeader tests ============

test "SessionHeader default version" {
    const allocator = std.testing.allocator;
    var header = session.SessionHeader{
        .id = try allocator.dupe(u8, "test-id"),
        .timestamp = try allocator.dupe(u8, "2024-01-01T00:00:00Z"),
        .cwd = try allocator.dupe(u8, "/home/user"),
    };
    defer header.deinit(allocator);

    try std.testing.expectEqual(@as(u8, 1), header.version);
    try std.testing.expect(header.leaf_id == null);
    try std.testing.expect(header.name == null);
}

test "SessionHeader deinit frees memory" {
    const allocator = std.testing.allocator;
    var header = session.SessionHeader{
        .id = try allocator.dupe(u8, "id-123"),
        .timestamp = try allocator.dupe(u8, "ts"),
        .cwd = try allocator.dupe(u8, "/cwd"),
        .leaf_id = try allocator.dupe(u8, "leaf"),
        .name = try allocator.dupe(u8, "Session Name"),
    };
    header.deinit(allocator);
}

// ============ MessageEntry tests ============

test "MessageEntry fields" {
    const allocator = std.testing.allocator;
    var entry = session.MessageEntry{
        .id = try allocator.dupe(u8, "msg-1"),
        .parent_id = try allocator.dupe(u8, "parent"),
        .timestamp = try allocator.dupe(u8, "2024-01-01"),
        .role = .user,
        .content = try allocator.dupe(u8, "Hello"),
    };
    defer entry.deinit(allocator);

    try std.testing.expectEqualStrings("msg-1", entry.id);
    try std.testing.expectEqual(session.Role.user, entry.role);
}

test "MessageEntry null parent_id" {
    const allocator = std.testing.allocator;
    var entry = session.MessageEntry{
        .id = try allocator.dupe(u8, "msg-root"),
        .parent_id = null,
        .timestamp = try allocator.dupe(u8, "ts"),
        .role = .system,
        .content = try allocator.dupe(u8, "System message"),
    };
    defer entry.deinit(allocator);

    try std.testing.expect(entry.parent_id == null);
}

// ============ CompactionEntry tests ============

test "CompactionEntry fields" {
    const allocator = std.testing.allocator;
    var entry = session.CompactionEntry{
        .id = try allocator.dupe(u8, "compact-1"),
        .parent_id = null,
        .timestamp = try allocator.dupe(u8, "ts"),
        .summary = try allocator.dupe(u8, "Summary of previous"),
        .first_kept_entry_id = try allocator.dupe(u8, "msg-5"),
        .tokens_before = 5000,
    };
    defer entry.deinit(allocator);

    try std.testing.expectEqual(@as(u32, 5000), entry.tokens_before);
}

// ============ CustomEntry tests ============

test "CustomEntry fields" {
    const allocator = std.testing.allocator;
    var entry = session.CustomEntry{
        .id = try allocator.dupe(u8, "custom-1"),
        .parent_id = null,
        .timestamp = try allocator.dupe(u8, "ts"),
        .custom_type = try allocator.dupe(u8, "bookmark"),
        .data = try allocator.dupe(u8, "{\"line\": 42}"),
    };
    defer entry.deinit(allocator);

    try std.testing.expectEqualStrings("bookmark", entry.custom_type);
}

test "CustomEntry null data" {
    const allocator = std.testing.allocator;
    var entry = session.CustomEntry{
        .id = try allocator.dupe(u8, "custom-2"),
        .parent_id = null,
        .timestamp = try allocator.dupe(u8, "ts"),
        .custom_type = try allocator.dupe(u8, "marker"),
        .data = null,
    };
    defer entry.deinit(allocator);

    try std.testing.expect(entry.data == null);
}

// ============ Memory tests ============

test "MessageEntry deinit with all fields" {
    const allocator = std.testing.allocator;
    var entry = session.MessageEntry{
        .id = try allocator.dupe(u8, "id"),
        .parent_id = try allocator.dupe(u8, "parent"),
        .timestamp = try allocator.dupe(u8, "ts"),
        .role = .assistant,
        .content = try allocator.dupe(u8, "Response"),
    };
    entry.deinit(allocator);
}

test "Role size is minimal" {
    try std.testing.expect(@sizeOf(session.Role) <= 2);
}

test "EntryType size is minimal" {
    try std.testing.expect(@sizeOf(session.EntryType) <= 2);
}
