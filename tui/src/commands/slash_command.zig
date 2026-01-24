const std = @import("std");

/// Built-in slash commands for the TUI
pub const SlashCommand = enum {
    exit,
    help,
    clear,
    new,
    model,
    compact,
    status,
    diff,
    init,
    mcp,

    const Self = @This();

    /// Get the command string (without leading slash)
    pub fn command(self: Self) []const u8 {
        return switch (self) {
            .exit => "exit",
            .help => "help",
            .clear => "clear",
            .new => "new",
            .model => "model",
            .compact => "compact",
            .status => "status",
            .diff => "diff",
            .init => "init",
            .mcp => "mcp",
        };
    }

    /// Get a description of what the command does
    pub fn description(self: Self) []const u8 {
        return switch (self) {
            .exit => "Exit the application",
            .help => "Show available commands",
            .clear => "Clear chat history",
            .new => "Start a new conversation",
            .model => "Change the AI model",
            .compact => "Compact conversation context",
            .status => "Show session status",
            .diff => "Show git diff",
            .init => "Initialize a new project",
            .mcp => "Manage MCP servers",
        };
    }

    /// Parse a command string to SlashCommand
    pub fn parse(str: []const u8) ?Self {
        const cmds = builtInSlashCommands();
        for (cmds) |entry| {
            if (std.mem.eql(u8, entry.name, str)) {
                return entry.cmd;
            }
        }
        return null;
    }
};

pub const CommandEntry = struct {
    name: []const u8,
    cmd: SlashCommand,
};

/// Get all built-in slash commands in presentation order
pub fn builtInSlashCommands() []const CommandEntry {
    return &[_]CommandEntry{
        .{ .name = "exit", .cmd = .exit },
        .{ .name = "help", .cmd = .help },
        .{ .name = "clear", .cmd = .clear },
        .{ .name = "new", .cmd = .new },
        .{ .name = "model", .cmd = .model },
        .{ .name = "compact", .cmd = .compact },
        .{ .name = "status", .cmd = .status },
        .{ .name = "diff", .cmd = .diff },
        .{ .name = "init", .cmd = .init },
        .{ .name = "mcp", .cmd = .mcp },
    };
}

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
