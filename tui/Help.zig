// Help message content and formatting for the TUI

pub const HELP_MESSAGE = 
    \\Smithers TUI Help
    \\================
    \\
    \\Basic Commands:
    \\  /help     - Show this help message
    \\  /clear    - Clear current chat session
    \\  /new      - Start a new chat session
    \\  /exit     - Exit the application
    \\  /diff     - Show git diff in current directory
    \\
    \\Navigation:
    \\  Ctrl+C    - Exit application
    \\  Ctrl+E    - Open external editor for current input
    \\  Ctrl+L    - Clear screen and redraw
    \\
    \\Session Management (Ctrl+B prefix):
    \\  Ctrl+B, c - Create new session
    \\  Ctrl+B, n - Next session
    \\  Ctrl+B, p - Previous session
    \\  Ctrl+B, d - Delete current session
    \\  Ctrl+B, r - Rename current session
    \\  Ctrl+B, l - List all sessions
    \\
    \\Scrolling:
    \\  Page Up/Down    - Scroll chat history
    \\  Home/End        - Jump to start/end of chat
    \\  Mouse wheel     - Scroll chat history
    \\
    \\Text Selection:
    \\  Mouse drag      - Select text
    \\  Ctrl+A          - Select all in input field
    \\
    \\Input Field:
    \\  Enter           - Send message
    \\  Shift+Enter     - New line in input
    \\  Up/Down arrows  - Navigate input history
    \\  Ctrl+U          - Clear current input
    \\
    \\Tips:
    \\  - Use Ctrl+E to compose longer messages in your preferred editor
    \\  - Chat history is automatically saved to ~/.smithers/chat.db
    \\  - Tool calls from the AI are executed automatically
    \\  - Use /diff to see current git changes in context
;

pub fn formatHelpMessage() []const u8 {
    return HELP_MESSAGE;
}