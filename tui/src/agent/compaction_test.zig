const std = @import("std");
const compaction = @import("compaction.zig");
const db = @import("../db.zig");

test "estimateTokens basic" {
    try std.testing.expectEqual(@as(u64, 1), compaction.estimateTokens("abc"));
    try std.testing.expectEqual(@as(u64, 1), compaction.estimateTokens("abcd"));
    try std.testing.expectEqual(@as(u64, 2), compaction.estimateTokens("abcde"));
    try std.testing.expectEqual(@as(u64, 0), compaction.estimateTokens(""));
}

test "estimateTokens longer strings" {
    const content = "a" ** 100;
    try std.testing.expectEqual(@as(u64, 25), compaction.estimateTokens(content));
}

test "estimateTokens very long content" {
    const content = "x" ** 4000;
    try std.testing.expectEqual(@as(u64, 1000), compaction.estimateTokens(content));
}

test "estimateContextTokens sums messages" {
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "hello", .timestamp = 0 },
        .{ .id = 2, .role = .assistant, .content = "world", .timestamp = 0 },
    };
    const tokens = compaction.estimateContextTokens(&messages);
    try std.testing.expectEqual(@as(u64, 4), tokens);
}

test "estimateContextTokens includes tool fields" {
    const messages = [_]db.Message{
        .{
            .id = 1,
            .role = .user,
            .content = "test",
            .timestamp = 0,
            .tool_name = "read_file",
            .tool_input = "{\"path\":\"/tmp/test.txt\"}",
        },
    };
    const tokens = compaction.estimateContextTokens(&messages);
    try std.testing.expect(tokens > 1);
}

test "shouldCompact returns false when under limit" {
    const settings = compaction.CompactionSettings{
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(!compaction.shouldCompact(50000, settings));
}

test "shouldCompact returns true when over limit" {
    const settings = compaction.CompactionSettings{
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(compaction.shouldCompact(90000, settings));
}

test "shouldCompact returns true at exactly threshold" {
    const settings = compaction.CompactionSettings{
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(compaction.shouldCompact(83617, settings));
}

test "shouldCompact respects enabled flag" {
    const settings = compaction.CompactionSettings{
        .enabled = false,
        .model_context_limit = 100000,
        .reserve_tokens = 16384,
    };
    try std.testing.expect(!compaction.shouldCompact(90000, settings));
}

test "findCutPoint returns null for empty messages" {
    const messages = [_]db.Message{};
    const settings = compaction.DEFAULT_SETTINGS;
    try std.testing.expect(compaction.findCutPoint(&messages, settings) == null);
}

test "findCutPoint returns null when under keep_recent_tokens" {
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "short", .timestamp = 0 },
    };
    const settings = compaction.CompactionSettings{
        .keep_recent_tokens = 10000,
    };
    try std.testing.expect(compaction.findCutPoint(&messages, settings) == null);
}

test "findCutPoint finds cut point when over limit" {
    const long_content = "x" ** 4000;
    var messages: [10]db.Message = undefined;
    for (&messages, 0..) |*msg, i| {
        msg.* = .{
            .id = @intCast(i + 1),
            .role = if (i % 2 == 0) .user else .assistant,
            .content = long_content,
            .timestamp = @intCast(i),
        };
    }

    const settings = compaction.CompactionSettings{
        .keep_recent_tokens = 2000,
    };

    const result = compaction.findCutPoint(&messages, settings);
    try std.testing.expect(result != null);
    try std.testing.expect(result.?.first_kept_idx > 0);
    try std.testing.expect(result.?.first_kept_idx < messages.len);
}

test "findCutPoint preserves turn boundaries" {
    const long_content = "x" ** 4000;
    var messages: [6]db.Message = undefined;
    messages[0] = .{ .id = 1, .role = .user, .content = long_content, .timestamp = 0 };
    messages[1] = .{ .id = 2, .role = .assistant, .content = long_content, .timestamp = 1 };
    messages[2] = .{ .id = 3, .role = .user, .content = long_content, .timestamp = 2 };
    messages[3] = .{ .id = 4, .role = .assistant, .content = long_content, .timestamp = 3 };
    messages[4] = .{ .id = 5, .role = .user, .content = long_content, .timestamp = 4 };
    messages[5] = .{ .id = 6, .role = .assistant, .content = long_content, .timestamp = 5 };

    const settings = compaction.CompactionSettings{
        .keep_recent_tokens = 2500,
    };

    const result = compaction.findCutPoint(&messages, settings);
    try std.testing.expect(result != null);
    const first_kept = messages[result.?.first_kept_idx];
    try std.testing.expectEqual(db.Role.user, first_kept.role);
}

test "serializeConversation formats correctly" {
    const allocator = std.testing.allocator;
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "Hello", .timestamp = 0 },
        .{ .id = 2, .role = .assistant, .content = "Hi there!", .timestamp = 0 },
    };

    const result = try compaction.serializeConversation(allocator, &messages);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "[User]: Hello") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "[Assistant]: Hi there!") != null);
}

test "serializeConversation handles system messages" {
    const allocator = std.testing.allocator;
    const messages = [_]db.Message{
        .{ .id = 1, .role = .system, .content = "System prompt", .timestamp = 0 },
        .{ .id = 2, .role = .user, .content = "Hello", .timestamp = 0 },
    };

    const result = try compaction.serializeConversation(allocator, &messages);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "[System]: System prompt") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "[User]: Hello") != null);
}

test "buildSummarizationPrompt creates valid prompt" {
    const allocator = std.testing.allocator;
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "Write a test", .timestamp = 0 },
        .{ .id = 2, .role = .assistant, .content = "Here's a test", .timestamp = 0 },
    };

    const result = try compaction.buildSummarizationPrompt(allocator, &messages, null);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "<conversation>") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "</conversation>") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "## Original Request") != null);
}

test "buildSummarizationPrompt includes previous summary" {
    const allocator = std.testing.allocator;
    const messages = [_]db.Message{
        .{ .id = 1, .role = .user, .content = "Continue work", .timestamp = 0 },
    };

    const result = try compaction.buildSummarizationPrompt(allocator, &messages, "Previous work summary");
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "## Previous Summary") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "Previous work summary") != null);
}

test "FileOperations init and deinit" {
    const allocator = std.testing.allocator;
    var ops = compaction.FileOperations.init(allocator);
    defer ops.deinit();

    try ops.addRead("/tmp/test.txt");
    try ops.addWritten("/tmp/output.txt");
    try ops.addEdited("/tmp/edit.txt");

    try std.testing.expect(ops.read.contains("/tmp/test.txt"));
    try std.testing.expect(ops.written.contains("/tmp/output.txt"));
    try std.testing.expect(ops.edited.contains("/tmp/edit.txt"));
}

test "formatFileOperations creates xml tags" {
    const allocator = std.testing.allocator;
    var ops = compaction.FileOperations.init(allocator);
    defer ops.deinit();

    try ops.addRead("/tmp/read.txt");
    try ops.addWritten("/tmp/write.txt");

    const result = try compaction.formatFileOperations(allocator, &ops);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "<read-files>") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "<modified-files>") != null);
}

test "formatFileOperations excludes read files that were modified" {
    const allocator = std.testing.allocator;
    var ops = compaction.FileOperations.init(allocator);
    defer ops.deinit();

    try ops.addRead("/tmp/file.txt");
    try ops.addEdited("/tmp/file.txt");

    const result = try compaction.formatFileOperations(allocator, &ops);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "<read-files>") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "<modified-files>") != null);
}

test "prepareCompaction returns null for empty messages" {
    const allocator = std.testing.allocator;
    const messages = [_]db.Message{};
    const settings = compaction.DEFAULT_SETTINGS;

    const result = try compaction.prepareCompaction(allocator, &messages, null, settings);
    try std.testing.expect(result == null);
}

test "prepareCompaction returns preparation when over threshold" {
    const allocator = std.testing.allocator;
    const long_content = "x" ** 4000;
    var messages: [10]db.Message = undefined;
    for (&messages, 0..) |*msg, i| {
        msg.* = .{
            .id = @intCast(i + 1),
            .role = if (i % 2 == 0) .user else .assistant,
            .content = long_content,
            .timestamp = @intCast(i),
        };
    }

    const settings = compaction.CompactionSettings{
        .keep_recent_tokens = 2000,
    };

    const result = try compaction.prepareCompaction(allocator, &messages, null, settings);
    try std.testing.expect(result != null);
    try std.testing.expect(result.?.messages_to_summarize.len > 0);
    try std.testing.expect(result.?.first_kept_msg_id > 0);
}

test "CompactionDetails toJson creates valid JSON" {
    const allocator = std.testing.allocator;
    const details = compaction.CompactionDetails{
        .read_files = &[_][]const u8{ "/tmp/a.txt", "/tmp/b.txt" },
        .modified_files = &[_][]const u8{"/tmp/c.txt"},
    };

    const json = try details.toJson(allocator);
    defer allocator.free(json);

    try std.testing.expect(std.mem.indexOf(u8, json, "readFiles") != null);
    try std.testing.expect(std.mem.indexOf(u8, json, "modifiedFiles") != null);
}

test "DEFAULT_SETTINGS has reasonable values" {
    const settings = compaction.DEFAULT_SETTINGS;
    try std.testing.expect(settings.enabled);
    try std.testing.expect(settings.reserve_tokens > 0);
    try std.testing.expect(settings.keep_recent_tokens > 0);
    try std.testing.expect(settings.model_context_limit > settings.reserve_tokens);
    try std.testing.expect(settings.model_context_limit > settings.keep_recent_tokens);
}
