const std = @import("std");
const slash_command = @import("slash_command.zig");

const SlashCommand = slash_command.SlashCommand;
const builtInSlashCommands = slash_command.builtInSlashCommands;

test "SlashCommand.parse valid commands" {
    const testing = std.testing;

    try testing.expectEqual(SlashCommand.exit, SlashCommand.parse("exit").?);
    try testing.expectEqual(SlashCommand.help, SlashCommand.parse("help").?);
    try testing.expectEqual(SlashCommand.clear, SlashCommand.parse("clear").?);
    try testing.expectEqual(SlashCommand.model, SlashCommand.parse("model").?);
}

test "SlashCommand.parse invalid command" {
    const testing = std.testing;
    try testing.expect(SlashCommand.parse("invalid") == null);
    try testing.expect(SlashCommand.parse("") == null);
}

test "SlashCommand.command round-trip" {
    const testing = std.testing;
    const cmds = builtInSlashCommands();
    for (cmds) |entry| {
        try testing.expectEqualStrings(entry.name, entry.cmd.command());
    }
}
