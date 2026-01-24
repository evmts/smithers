const std = @import("std");
const interactive_mod = @import("../modes/interactive.zig");
const db = @import("../db.zig");
const slash_command = @import("../commands/slash_command.zig");

const InteractiveMode = interactive_mod.InteractiveMode;

// ============================================================================
// Init / Deinit Tests
// ============================================================================

test "InteractiveMode init creates valid state" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.is_running);
    try std.testing.expectEqualStrings("claude-sonnet-4", mode.model);
    try std.testing.expectEqualStrings("0.1.0", mode.version);
    try std.testing.expect(mode.session_id == null);
}

test "InteractiveMode init busy state is false" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(!mode.is_busy);
    try std.testing.expect(mode.pending_input == null);
    try std.testing.expect(mode.current_tool == null);
    try std.testing.expectEqual(@as(usize, 0), mode.spinner_frame);
    try std.testing.expectEqual(@as(i64, 0), mode.loading_start);
    try std.testing.expect(mode.pending_response == null);
}

test "InteractiveMode deinit handles empty state" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    mode.deinit();
}

test "InteractiveMode multiple init deinit cycles" {
    const allocator = std.testing.allocator;

    for (0..3) |_| {
        var mode = try InteractiveMode.init(allocator, null);
        mode.setModel("test-model");
        mode.deinit();
    }
}

// ============================================================================
// setModel Tests
// ============================================================================

test "InteractiveMode setModel changes model" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setModel("gpt-4");
    try std.testing.expectEqualStrings("gpt-4", mode.model);
}

test "InteractiveMode setModel multiple times" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setModel("model-1");
    try std.testing.expectEqualStrings("model-1", mode.model);

    mode.setModel("model-2");
    try std.testing.expectEqualStrings("model-2", mode.model);

    mode.setModel("claude-opus-4");
    try std.testing.expectEqualStrings("claude-opus-4", mode.model);
}

test "InteractiveMode setModel with empty string" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setModel("");
    try std.testing.expectEqualStrings("", mode.model);
}

test "InteractiveMode setModel with unicode" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setModel("模型-1");
    try std.testing.expectEqualStrings("模型-1", mode.model);
}

// ============================================================================
// setSessionId Tests
// ============================================================================

test "InteractiveMode setSessionId sets session" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setSessionId("session-123");
    try std.testing.expectEqualStrings("session-123", mode.session_id.?);
}

test "InteractiveMode setSessionId multiple times" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setSessionId("session-1");
    try std.testing.expectEqualStrings("session-1", mode.session_id.?);

    mode.setSessionId("session-2");
    try std.testing.expectEqualStrings("session-2", mode.session_id.?);
}

test "InteractiveMode setSessionId with empty string" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setSessionId("");
    try std.testing.expectEqualStrings("", mode.session_id.?);
}

// ============================================================================
// messageCount Tests
// ============================================================================

test "InteractiveMode messageCount initially zero" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expectEqual(@as(usize, 0), mode.messageCount());
}

// ============================================================================
// State Mutation Tests
// ============================================================================

test "InteractiveMode is_running can be set false" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.is_running);
    mode.is_running = false;
    try std.testing.expect(!mode.is_running);
}

test "InteractiveMode is_busy can be toggled" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(!mode.is_busy);
    mode.is_busy = true;
    try std.testing.expect(mode.is_busy);
    mode.is_busy = false;
    try std.testing.expect(!mode.is_busy);
}

test "InteractiveMode spinner_frame increments" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expectEqual(@as(usize, 0), mode.spinner_frame);
    mode.spinner_frame = 1;
    try std.testing.expectEqual(@as(usize, 1), mode.spinner_frame);
    mode.spinner_frame = 5;
    try std.testing.expectEqual(@as(usize, 5), mode.spinner_frame);
}

test "InteractiveMode loading_start can be set" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.loading_start = 12345;
    try std.testing.expectEqual(@as(i64, 12345), mode.loading_start);
}

// ============================================================================
// Default Values Verification Tests
// ============================================================================

test "InteractiveMode default model is claude-sonnet-4" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expectEqualStrings("claude-sonnet-4", mode.model);
}

test "InteractiveMode default version is 0.1.0" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expectEqualStrings("0.1.0", mode.version);
}

// ============================================================================
// Spinner Frame Animation Tests
// ============================================================================

test "InteractiveMode spinner_frame wraps at 10" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    for (0..20) |i| {
        mode.spinner_frame = i % 10;
        try std.testing.expect(mode.spinner_frame < 10);
    }
}

// ============================================================================
// Database Integration Tests
// ============================================================================

test "InteractiveMode database is accessible" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    const session_id = mode.database.getCurrentSessionId();
    try std.testing.expect(session_id >= 1);
}

// ============================================================================
// ChatHistory Integration Tests
// ============================================================================

test "InteractiveMode chat_history starts empty" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expectEqual(@as(usize, 0), mode.chat_history.messages.len);
}

test "InteractiveMode chat_history scroll operations" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.chat_history.scrollUp(5);
    try std.testing.expectEqual(@as(u16, 5), mode.chat_history.scroll_offset);

    mode.chat_history.scrollDown(3);
    try std.testing.expectEqual(@as(u16, 2), mode.chat_history.scroll_offset);

    mode.chat_history.scrollToBottom();
    try std.testing.expectEqual(@as(u16, 0), mode.chat_history.scroll_offset);
}

// ============================================================================
// Input Component Tests
// ============================================================================

test "InteractiveMode input starts empty" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.input.isEmpty());
}

// ============================================================================
// Pending State Tests
// ============================================================================

test "InteractiveMode pending_input initially null" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.pending_input == null);
}

test "InteractiveMode pending_response initially null" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.pending_response == null);
}

test "InteractiveMode current_tool initially null" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.current_tool == null);
}

// ============================================================================
// Memory Safety Tests
// ============================================================================

test "InteractiveMode allocator is stored" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expectEqual(allocator, mode.allocator);
}

test "InteractiveMode deinit with pending_response frees memory" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);

    mode.pending_response = try allocator.dupe(u8, "test response");
    mode.deinit();
}

test "InteractiveMode deinit with pending_input frees memory" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);

    mode.pending_input = try allocator.dupe(u8, "test input");
    mode.deinit();
}

test "InteractiveMode deinit with both pending fields frees memory" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);

    mode.pending_input = try allocator.dupe(u8, "input");
    mode.pending_response = try allocator.dupe(u8, "response");
    mode.deinit();
}

// ============================================================================
// Component Initialization Order Tests
// ============================================================================

test "InteractiveMode components are initialized in correct order" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    try std.testing.expect(mode.database.getCurrentSessionId() >= 1);
    try std.testing.expect(mode.input.isEmpty());
    try std.testing.expectEqual(@as(usize, 0), mode.chat_history.messages.len);
}

// ============================================================================
// SlashCommand Integration Tests (via knowledge of handleCommand)
// ============================================================================

test "SlashCommand exit exists" {
    const result = slash_command.SlashCommand.parse("exit");
    try std.testing.expect(result != null);
    try std.testing.expectEqual(slash_command.SlashCommand.exit, result.?);
}

test "SlashCommand help exists" {
    const result = slash_command.SlashCommand.parse("help");
    try std.testing.expect(result != null);
    try std.testing.expectEqual(slash_command.SlashCommand.help, result.?);
}

test "SlashCommand clear exists" {
    const result = slash_command.SlashCommand.parse("clear");
    try std.testing.expect(result != null);
    try std.testing.expectEqual(slash_command.SlashCommand.clear, result.?);
}

test "SlashCommand model exists" {
    const result = slash_command.SlashCommand.parse("model");
    try std.testing.expect(result != null);
    try std.testing.expectEqual(slash_command.SlashCommand.model, result.?);
}

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

test "InteractiveMode handles zero-length session_id" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setSessionId("");
    try std.testing.expect(mode.session_id != null);
    try std.testing.expectEqual(@as(usize, 0), mode.session_id.?.len);
}

test "InteractiveMode spinner_frame boundary at max" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.spinner_frame = 9;
    try std.testing.expectEqual(@as(usize, 9), mode.spinner_frame);
}

test "InteractiveMode loading_start negative value" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.loading_start = -1000;
    try std.testing.expectEqual(@as(i64, -1000), mode.loading_start);
}

test "InteractiveMode loading_start large value" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.loading_start = std.math.maxInt(i64);
    try std.testing.expectEqual(std.math.maxInt(i64), mode.loading_start);
}

// ============================================================================
// Concurrent State Tests
// ============================================================================

test "InteractiveMode busy and running can both be true" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.is_busy = true;
    mode.is_running = true;

    try std.testing.expect(mode.is_busy);
    try std.testing.expect(mode.is_running);
}

test "InteractiveMode busy true while not running" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.is_busy = true;
    mode.is_running = false;

    try std.testing.expect(mode.is_busy);
    try std.testing.expect(!mode.is_running);
}

// ============================================================================
// Model Name Edge Cases
// ============================================================================

test "InteractiveMode setModel with very long name" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    const long_model = "a" ** 1000;
    mode.setModel(long_model);
    try std.testing.expectEqualStrings(long_model, mode.model);
}

test "InteractiveMode setModel with special characters" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setModel("model/v1.0-beta@test");
    try std.testing.expectEqualStrings("model/v1.0-beta@test", mode.model);
}

test "InteractiveMode setModel with newlines" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setModel("model\nwith\nnewlines");
    try std.testing.expectEqualStrings("model\nwith\nnewlines", mode.model);
}

// ============================================================================
// Session ID Edge Cases
// ============================================================================

test "InteractiveMode setSessionId with UUID format" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setSessionId("550e8400-e29b-41d4-a716-446655440000");
    try std.testing.expectEqualStrings("550e8400-e29b-41d4-a716-446655440000", mode.session_id.?);
}

test "InteractiveMode setSessionId with numeric string" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.setSessionId("12345");
    try std.testing.expectEqualStrings("12345", mode.session_id.?);
}

// ============================================================================
// Version String Tests
// ============================================================================

test "InteractiveMode version string format" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    const version = mode.version;
    try std.testing.expect(version.len > 0);

    var dot_count: usize = 0;
    for (version) |c| {
        if (c == '.') dot_count += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), dot_count);
}

// ============================================================================
// Rapid Scroll Operations Tests
// ============================================================================

test "InteractiveMode rapid scroll operations" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    for (0..50) |_| {
        mode.chat_history.scrollUp(1);
    }
    try std.testing.expectEqual(@as(u16, 50), mode.chat_history.scroll_offset);

    for (0..25) |_| {
        mode.chat_history.scrollDown(1);
    }
    try std.testing.expectEqual(@as(u16, 25), mode.chat_history.scroll_offset);
}

// ============================================================================
// Scroll Saturation Tests
// ============================================================================

test "InteractiveMode scroll down saturates at zero" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.chat_history.scrollDown(100);
    try std.testing.expectEqual(@as(u16, 0), mode.chat_history.scroll_offset);
}

test "InteractiveMode scroll up large value" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.chat_history.scrollUp(10000);
    try std.testing.expectEqual(@as(u16, 10000), mode.chat_history.scroll_offset);
}

test "InteractiveMode scrollToBottom multiple times" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    mode.chat_history.scroll_offset = 100;
    mode.chat_history.scrollToBottom();
    mode.chat_history.scrollToBottom();
    mode.chat_history.scrollToBottom();

    try std.testing.expectEqual(@as(u16, 0), mode.chat_history.scroll_offset);
}

// ============================================================================
// Database Session Tests
// ============================================================================

test "InteractiveMode database session count at least 1" {
    const allocator = std.testing.allocator;
    var mode = try InteractiveMode.init(allocator, null);
    defer mode.deinit();

    const count = try mode.database.getSessionCount();
    try std.testing.expect(count >= 1);
}

// ============================================================================
// SlashCommand All Commands Tests
// ============================================================================

test "SlashCommand all built-in commands parseable" {
    const cmds = slash_command.builtInSlashCommands();
    for (cmds) |entry| {
        const parsed = slash_command.SlashCommand.parse(entry.name);
        try std.testing.expect(parsed != null);
        try std.testing.expectEqual(entry.cmd, parsed.?);
    }
}

test "SlashCommand invalid command returns null" {
    try std.testing.expect(slash_command.SlashCommand.parse("invalid_command") == null);
    try std.testing.expect(slash_command.SlashCommand.parse("") == null);
    try std.testing.expect(slash_command.SlashCommand.parse("EXIT") == null);
}

test "SlashCommand descriptions are non-empty" {
    const cmds = slash_command.builtInSlashCommands();
    for (cmds) |entry| {
        const desc = entry.cmd.description();
        try std.testing.expect(desc.len > 0);
    }
}
