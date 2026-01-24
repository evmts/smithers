const std = @import("std");
const help = @import("../help.zig");

// ============================================================================
// HELP_MESSAGE Tests
// ============================================================================

test "help text is not empty" {
    try std.testing.expect(help.HELP_MESSAGE.len > 0);
}

test "help text contains title" {
    try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, "Smithers TUI Help") != null);
}

test "help text contains expected sections" {
    const sections = [_][]const u8{
        "Basic Usage:",
        "Navigation:",
        "Session Management",
        "Editor Integration:",
        "Commands",
        "Input Controls:",
        "Advanced:",
        "Mouse Support:",
        "Environment Variables:",
        "Data Storage:",
        "Tips:",
    };
    for (sections) |section| {
        try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, section) != null);
    }
}

test "keybindings documented in help" {
    const keybindings = [_][]const u8{
        "Ctrl+C",
        "Ctrl+B",
        "Ctrl+E",
        "Ctrl+A",
        "Ctrl+K",
        "Ctrl+U",
        "Ctrl+W",
        "Ctrl+L",
        "Ctrl+R",
        "Ctrl+Z",
        "Alt+B",
        "Alt+F",
        "Page Up/Dn",
        "Home/End",
        "Tab",
    };
    for (keybindings) |key| {
        try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, key) != null);
    }
}

test "session management keybindings documented" {
    const session_keys = [_][]const u8{
        "Ctrl+B, c",
        "Ctrl+B, n",
        "Ctrl+B, p",
        "Ctrl+B, &",
        "Ctrl+B, ,",
        "Ctrl+B, l",
    };
    for (session_keys) |key| {
        try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, key) != null);
    }
}

test "slash commands documented in help message" {
    const commands = [_][]const u8{
        "/help",
        "/clear",
        "/new",
        "/sessions",
        "/rename",
        "/diff",
        "/tools",
        "/exit",
    };
    for (commands) |cmd| {
        try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, cmd) != null);
    }
}

test "environment variables documented" {
    try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, "ANTHROPIC_API_KEY") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, "EDITOR") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, "SMITHERS_LOG") != null);
}

test "data storage paths documented" {
    try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, "~/.smithers/chat.db") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, "/tmp/smithers-tui.log") != null);
}

// ============================================================================
// INLINE_HELP Tests
// ============================================================================

test "inline help is not empty" {
    try std.testing.expect(help.INLINE_HELP.len > 0);
}

test "inline help contains keybindings section" {
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "## Keybindings") != null);
}

test "inline help contains commands section" {
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "## Commands") != null);
}

test "inline help documents editing keys" {
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "Ctrl+K") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "Ctrl+U") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "Ctrl+W") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "Ctrl+Y") != null);
}

test "inline help documents session keys" {
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "Ctrl+B,c") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.INLINE_HELP, "Ctrl+B,n/p") != null);
}

// ============================================================================
// SHORTCUTS_SUMMARY Tests
// ============================================================================

test "shortcuts summary is not empty" {
    try std.testing.expect(help.SHORTCUTS_SUMMARY.len > 0);
}

test "shortcuts summary contains quick reference" {
    try std.testing.expect(std.mem.indexOf(u8, help.SHORTCUTS_SUMMARY, "Quick Reference:") != null);
}

test "shortcuts summary documents essential shortcuts" {
    try std.testing.expect(std.mem.indexOf(u8, help.SHORTCUTS_SUMMARY, "Enter: Send message") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.SHORTCUTS_SUMMARY, "Ctrl+C: Cancel/Exit") != null);
    try std.testing.expect(std.mem.indexOf(u8, help.SHORTCUTS_SUMMARY, "/help: Full help") != null);
}

// ============================================================================
// COMMANDS Array Tests
// ============================================================================

test "commands array is not empty" {
    try std.testing.expect(help.COMMANDS.len > 0);
}

test "commands array has expected count" {
    try std.testing.expectEqual(@as(usize, 8), help.COMMANDS.len);
}

test "all commands start with slash" {
    for (help.COMMANDS) |cmd| {
        try std.testing.expect(cmd.name.len > 0);
        try std.testing.expectEqual(@as(u8, '/'), cmd.name[0]);
    }
}

test "all commands have descriptions" {
    for (help.COMMANDS) |cmd| {
        try std.testing.expect(cmd.description.len > 0);
    }
}

test "specific commands exist in array" {
    const expected_commands = [_][]const u8{
        "/help",
        "/clear",
        "/new",
        "/sessions",
        "/rename",
        "/diff",
        "/tools",
        "/exit",
    };

    for (expected_commands) |expected| {
        var found = false;
        for (help.COMMANDS) |cmd| {
            if (std.mem.eql(u8, cmd.name, expected)) {
                found = true;
                break;
            }
        }
        try std.testing.expect(found);
    }
}

test "help command has correct description" {
    for (help.COMMANDS) |cmd| {
        if (std.mem.eql(u8, cmd.name, "/help")) {
            try std.testing.expect(std.mem.indexOf(u8, cmd.description, "help") != null);
            return;
        }
    }
    try std.testing.expect(false); // /help not found
}

test "exit command has correct description" {
    for (help.COMMANDS) |cmd| {
        if (std.mem.eql(u8, cmd.name, "/exit")) {
            try std.testing.expect(std.mem.indexOf(u8, cmd.description, "Exit") != null);
            return;
        }
    }
    try std.testing.expect(false); // /exit not found
}

// ============================================================================
// formatCommands Function Tests
// ============================================================================

test "formatCommands returns non-empty result" {
    const allocator = std.testing.allocator;
    const result = try help.formatCommands(allocator);
    defer allocator.free(result);

    try std.testing.expect(result.len > 0);
}

test "formatCommands starts with header" {
    const allocator = std.testing.allocator;
    const result = try help.formatCommands(allocator);
    defer allocator.free(result);

    try std.testing.expect(std.mem.startsWith(u8, result, "Available Commands:\n"));
}

test "formatCommands includes all commands" {
    const allocator = std.testing.allocator;
    const result = try help.formatCommands(allocator);
    defer allocator.free(result);

    for (help.COMMANDS) |cmd| {
        try std.testing.expect(std.mem.indexOf(u8, result, cmd.name) != null);
        try std.testing.expect(std.mem.indexOf(u8, result, cmd.description) != null);
    }
}

test "formatCommands has proper formatting" {
    const allocator = std.testing.allocator;
    const result = try help.formatCommands(allocator);
    defer allocator.free(result);

    // Each command should be indented with 2 spaces
    try std.testing.expect(std.mem.indexOf(u8, result, "  /") != null);
}

// ============================================================================
// Cross-consistency Tests
// ============================================================================

test "COMMANDS array matches documented commands" {
    // All commands in COMMANDS array should be in HELP_MESSAGE
    for (help.COMMANDS) |cmd| {
        try std.testing.expect(std.mem.indexOf(u8, help.HELP_MESSAGE, cmd.name) != null);
    }
}

test "inline help commands match COMMANDS array" {
    // Core commands from INLINE_HELP should exist in COMMANDS array
    const inline_cmds = [_][]const u8{ "/help", "/clear", "/new", "/diff", "/exit" };
    for (inline_cmds) |expected| {
        var found = false;
        for (help.COMMANDS) |cmd| {
            if (std.mem.eql(u8, cmd.name, expected)) {
                found = true;
                break;
            }
        }
        try std.testing.expect(found);
    }
}
