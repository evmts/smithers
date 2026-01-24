const std = @import("std");
const slash_command = @import("../commands/slash_command.zig");
const SlashCommand = slash_command.SlashCommand;
const CommandEntry = slash_command.CommandEntry;
const builtInSlashCommands = slash_command.builtInSlashCommands;

// ============================================================================
// SlashCommand.parse Tests - Valid Commands
// ============================================================================

test "parse: all valid commands return correct enum" {
    const test_cases = [_]struct { input: []const u8, expected: SlashCommand }{
        .{ .input = "exit", .expected = .exit },
        .{ .input = "help", .expected = .help },
        .{ .input = "clear", .expected = .clear },
        .{ .input = "new", .expected = .new },
        .{ .input = "model", .expected = .model },
        .{ .input = "compact", .expected = .compact },
        .{ .input = "status", .expected = .status },
        .{ .input = "diff", .expected = .diff },
        .{ .input = "init", .expected = .init },
        .{ .input = "mcp", .expected = .mcp },
    };

    for (test_cases) |tc| {
        const result = SlashCommand.parse(tc.input);
        try std.testing.expect(result != null);
        try std.testing.expectEqual(tc.expected, result.?);
    }
}

// ============================================================================
// SlashCommand.parse Tests - Invalid Commands
// ============================================================================

test "parse: empty string returns null" {
    try std.testing.expect(SlashCommand.parse("") == null);
}

test "parse: unknown command returns null" {
    try std.testing.expect(SlashCommand.parse("unknown") == null);
    try std.testing.expect(SlashCommand.parse("foo") == null);
    try std.testing.expect(SlashCommand.parse("bar") == null);
    try std.testing.expect(SlashCommand.parse("quit") == null);
}

test "parse: case sensitive - uppercase returns null" {
    try std.testing.expect(SlashCommand.parse("EXIT") == null);
    try std.testing.expect(SlashCommand.parse("HELP") == null);
    try std.testing.expect(SlashCommand.parse("Clear") == null);
    try std.testing.expect(SlashCommand.parse("New") == null);
}

test "parse: whitespace handling - leading/trailing space returns null" {
    try std.testing.expect(SlashCommand.parse(" exit") == null);
    try std.testing.expect(SlashCommand.parse("exit ") == null);
    try std.testing.expect(SlashCommand.parse(" help ") == null);
}

test "parse: partial matches return null" {
    try std.testing.expect(SlashCommand.parse("exi") == null);
    try std.testing.expect(SlashCommand.parse("hel") == null);
    try std.testing.expect(SlashCommand.parse("clea") == null);
}

test "parse: command with slash prefix returns null" {
    try std.testing.expect(SlashCommand.parse("/exit") == null);
    try std.testing.expect(SlashCommand.parse("/help") == null);
}

// ============================================================================
// SlashCommand.command Tests
// ============================================================================

test "command: returns correct string for all commands" {
    try std.testing.expectEqualStrings("exit", SlashCommand.exit.command());
    try std.testing.expectEqualStrings("help", SlashCommand.help.command());
    try std.testing.expectEqualStrings("clear", SlashCommand.clear.command());
    try std.testing.expectEqualStrings("new", SlashCommand.new.command());
    try std.testing.expectEqualStrings("model", SlashCommand.model.command());
    try std.testing.expectEqualStrings("compact", SlashCommand.compact.command());
    try std.testing.expectEqualStrings("status", SlashCommand.status.command());
    try std.testing.expectEqualStrings("diff", SlashCommand.diff.command());
    try std.testing.expectEqualStrings("init", SlashCommand.init.command());
    try std.testing.expectEqualStrings("mcp", SlashCommand.mcp.command());
}

test "command: round-trip with parse" {
    const cmds = builtInSlashCommands();
    for (cmds) |entry| {
        const cmd_str = entry.cmd.command();
        const parsed = SlashCommand.parse(cmd_str);
        try std.testing.expect(parsed != null);
        try std.testing.expectEqual(entry.cmd, parsed.?);
    }
}

// ============================================================================
// SlashCommand.description Tests
// ============================================================================

test "description: all commands have non-empty descriptions" {
    const all_commands = [_]SlashCommand{
        .exit, .help, .clear, .new, .model,
        .compact, .status, .diff, .init, .mcp,
    };

    for (all_commands) |cmd| {
        const desc = cmd.description();
        try std.testing.expect(desc.len > 0);
    }
}

test "description: returns correct descriptions" {
    try std.testing.expectEqualStrings("Exit the application", SlashCommand.exit.description());
    try std.testing.expectEqualStrings("Show available commands", SlashCommand.help.description());
    try std.testing.expectEqualStrings("Clear chat history", SlashCommand.clear.description());
    try std.testing.expectEqualStrings("Start a new conversation", SlashCommand.new.description());
    try std.testing.expectEqualStrings("Change the AI model", SlashCommand.model.description());
    try std.testing.expectEqualStrings("Compact conversation context", SlashCommand.compact.description());
    try std.testing.expectEqualStrings("Show session status", SlashCommand.status.description());
    try std.testing.expectEqualStrings("Show git diff", SlashCommand.diff.description());
    try std.testing.expectEqualStrings("Initialize a new project", SlashCommand.init.description());
    try std.testing.expectEqualStrings("Manage MCP servers", SlashCommand.mcp.description());
}

// ============================================================================
// builtInSlashCommands Tests
// ============================================================================

test "builtInSlashCommands: returns correct count" {
    const cmds = builtInSlashCommands();
    try std.testing.expectEqual(@as(usize, 10), cmds.len);
}

test "builtInSlashCommands: all entries have valid names" {
    const cmds = builtInSlashCommands();
    for (cmds) |entry| {
        try std.testing.expect(entry.name.len > 0);
    }
}

test "builtInSlashCommands: names match command strings" {
    const cmds = builtInSlashCommands();
    for (cmds) |entry| {
        try std.testing.expectEqualStrings(entry.name, entry.cmd.command());
    }
}

test "builtInSlashCommands: contains all expected commands" {
    const cmds = builtInSlashCommands();
    const expected = [_][]const u8{
        "exit", "help", "clear", "new", "model",
        "compact", "status", "diff", "init", "mcp",
    };

    for (expected) |name| {
        var found = false;
        for (cmds) |entry| {
            if (std.mem.eql(u8, entry.name, name)) {
                found = true;
                break;
            }
        }
        try std.testing.expect(found);
    }
}

test "builtInSlashCommands: no duplicate names" {
    const cmds = builtInSlashCommands();
    for (cmds, 0..) |entry, i| {
        for (cmds[i + 1 ..]) |other| {
            try std.testing.expect(!std.mem.eql(u8, entry.name, other.name));
        }
    }
}

test "builtInSlashCommands: no duplicate commands" {
    const cmds = builtInSlashCommands();
    for (cmds, 0..) |entry, i| {
        for (cmds[i + 1 ..]) |other| {
            try std.testing.expect(entry.cmd != other.cmd);
        }
    }
}

// ============================================================================
// CommandEntry Tests
// ============================================================================

test "CommandEntry: struct layout" {
    const entry = CommandEntry{
        .name = "test",
        .cmd = .help,
    };
    try std.testing.expectEqualStrings("test", entry.name);
    try std.testing.expectEqual(SlashCommand.help, entry.cmd);
}

// ============================================================================
// Edge Cases and Argument Extraction Patterns
// ============================================================================

test "parse: special characters return null" {
    try std.testing.expect(SlashCommand.parse("exit\n") == null);
    try std.testing.expect(SlashCommand.parse("help\t") == null);
    try std.testing.expect(SlashCommand.parse("clear\r") == null);
    try std.testing.expect(SlashCommand.parse("new\x00") == null);
}

test "parse: unicode returns null" {
    try std.testing.expect(SlashCommand.parse("héłp") == null);
    try std.testing.expect(SlashCommand.parse("日本語") == null);
}

test "parse: very long input returns null" {
    const long_input = "a" ** 1000;
    try std.testing.expect(SlashCommand.parse(long_input) == null);
}

// ============================================================================
// Consistency Tests
// ============================================================================

test "consistency: all enum values covered in builtInSlashCommands" {
    const cmds = builtInSlashCommands();
    const enum_count = @typeInfo(SlashCommand).@"enum".fields.len;
    try std.testing.expectEqual(enum_count, cmds.len);
}

test "consistency: parse finds all builtInSlashCommands" {
    const cmds = builtInSlashCommands();
    for (cmds) |entry| {
        const parsed = SlashCommand.parse(entry.name);
        try std.testing.expect(parsed != null);
        try std.testing.expectEqual(entry.cmd, parsed.?);
    }
}
