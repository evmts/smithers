const std = @import("std");
const slash_command = @import("../commands/slash_command.zig");

// ============================================================================
// SlashCommand Tests
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
