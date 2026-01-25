/// Help documentation for the TUI application
pub const HELP_MESSAGE =
    \\Smithers TUI Help
    \\=================
    \\
    \\Basic Usage:
    \\  - Type your message and press Enter to send
    \\  - Use /exit to quit the application
    \\  - Use Ctrl+C to cancel current operation or exit
    \\
    \\Navigation:
    \\  ↑/↓         Scroll through chat history
    \\  Page Up/Dn  Scroll chat history by page
    \\  Home/End    Jump to start/end of chat
    \\  Tab         Cycle through UI elements
    \\  Mouse       Scroll and select text
    \\
    \\Session Management (tmux-style with Ctrl+B prefix):
    \\  Ctrl+B, c   Create new chat session
    \\  Ctrl+B, n   Next session tab
    \\  Ctrl+B, p   Previous session tab
    \\  Ctrl+B, &   Close current session (with confirmation)
    \\  Ctrl+B, ,   Rename current session
    \\  Ctrl+B, l   List all sessions
    \\
    \\Editor Integration:
    \\  Ctrl+E      Open external editor ($EDITOR) for multi-line input
    \\
    \\Commands (type these in the chat input):
    \\  /help       Show this help message
    \\  /clear      Clear current chat history
    \\  /new        Start a new conversation
    \\  /sessions   List all chat sessions
    \\  /rename     Rename current session
    \\  /diff       Show git diff of current changes
    \\  /tools      List available tools
    \\  /exit       Exit the application
    \\
    \\Input Controls:
    \\  Ctrl+A      Move to beginning of line
    \\  Ctrl+E      Open external editor (or move to end if no $EDITOR)
    \\  Ctrl+K      Delete from cursor to end of line
    \\  Ctrl+U      Delete entire line
    \\  Ctrl+W      Delete word before cursor
    \\  Alt+B       Move word backward
    \\  Alt+F       Move word forward
    \\  Ctrl+L      Clear screen and redraw
    \\
    \\Advanced:
    \\  Ctrl+R      Refresh/redraw screen
    \\  Ctrl+Z      Suspend application (return with 'fg')
    \\
    \\Mouse Support:
    \\  - Scroll through chat history
    \\  - Click to position cursor in input field
    \\  - Select text for copying (platform dependent)
    \\
    \\Environment Variables:
    \\  ANTHROPIC_API_KEY  Required for AI functionality
    \\  EDITOR            External editor for multi-line input
    \\  SMITHERS_LOG      Override log file location
    \\
    \\Data Storage:
    \\  Chat history is automatically saved to ~/.smithers/chat.db
    \\  Logs are written to /tmp/smithers-tui.log (or $SMITHERS_LOG)
    \\
    \\Tips:
    \\  - The AI can use tools like file operations, git commands, etc.
    \\  - Use external editor (Ctrl+E) for complex multi-line queries
    \\  - Sessions persist between application runs
    \\  - You can have multiple conversations in different sessions
    \\
;

/// Inline help message for status bar / quick display
pub const INLINE_HELP =
    \\## Keybindings
    \\
    \\**Editing:** Ctrl+K kill→end | Ctrl+U kill→start | Ctrl+W kill word | Ctrl+Y yank
    \\
    \\**Navigation:** ↑/↓ scroll chat | PgUp/PgDn fast scroll | Ctrl+A line start | Alt+B/F word nav
    \\
    \\**Session:** Ctrl+B,c new tab | Ctrl+B,n/p next/prev | Ctrl+B,0-9 switch
    \\
    \\**Other:** Ctrl+E editor | Ctrl+L redraw | Ctrl+Z suspend | Esc interrupt
    \\
    \\## Commands
    \\
    \\- `/help` - Show this help
    \\- `/clear` - Clear chat history
    \\- `/new` - Start new conversation
    \\- `/model` - Show current AI model
    \\- `/status` - Show session status
    \\- `/diff` - Show git diff
    \\- `/exit` - Exit the application
;

/// Quick reference for keyboard shortcuts
pub const SHORTCUTS_SUMMARY =
    \\Quick Reference:
    \\  Enter: Send message    Ctrl+C: Cancel/Exit    Ctrl+E: External editor
    \\  ↑/↓: Scroll           Ctrl+B,c: New session  /help: Full help
    \\  /exit: Quit           /clear: Clear chat     /diff: Show git diff
    \\
;

/// Available slash commands
pub const COMMANDS = [_]struct { name: []const u8, description: []const u8 }{
    .{ .name = "/help", .description = "Show help information" },
    .{ .name = "/clear", .description = "Clear current chat history" },
    .{ .name = "/new", .description = "Start a new conversation" },
    .{ .name = "/sessions", .description = "List all chat sessions" },
    .{ .name = "/rename", .description = "Rename current session" },
    .{ .name = "/diff", .description = "Show git diff of current changes" },
    .{ .name = "/tools", .description = "List available tools" },
    .{ .name = "/exit", .description = "Exit the application" },
};

/// Format a list of available commands
pub fn formatCommands(allocator: std.mem.Allocator) ![]u8 {
    var result = std.ArrayList(u8).init(allocator);
    errdefer result.deinit();
    
    try result.appendSlice("Available Commands:\n");
    for (COMMANDS) |cmd| {
        try result.writer().print("  {s:<12} {s}\n", .{ cmd.name, cmd.description });
    }
    
    return result.toOwnedSlice();
}

const std = @import("std");