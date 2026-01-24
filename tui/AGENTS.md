# TUI Development Guide

## Git

Always use `--no-verify` to skip TypeScript pre-commit hooks (TUI is Zig-only):
```bash
git commit --no-verify -m "message"
```

## Overview

Zig-based terminal UI for Smithers using vaxis renderer. SQLite is the single source of truth for all state.

## Build & Test

```bash
cd tui
zig build          # Build
zig build test     # Run tests
zig-out/bin/smithers-tui  # Run TUI
```

Logs written to `/tmp/smithers-tui.log`

## Architecture

```
tui/
├── src/
│   ├── main.zig              # Entry point, event loop, streaming state
│   ├── db.zig                # SQLite wrapper - messages, sessions
│   ├── event_loop.zig        # Vaxis event loop integration
│   ├── event.zig             # Event types
│   ├── agent/
│   │   ├── anthropic_provider.zig  # Anthropic API (streaming + blocking)
│   │   └── provider.zig            # Provider interface
│   ├── components/
│   │   ├── input.zig         # Text input widget
│   │   ├── chat_history.zig  # Message display with scrolling
│   │   └── logo.zig          # ASCII logo
│   └── ui/
│       ├── header.zig        # Top bar (model, session tabs)
│       └── status.zig        # Bottom status bar
├── renderer/                 # Forked vaxis renderer
├── sqlite/                   # SQLite zig bindings
└── build.zig
```

## Key Patterns

### State Management
- **All state in SQLite** - no in-memory state except ephemeral UI (cursor pos, scroll offset)
- Messages table: `id, session_id, role, content, timestamp, ephemeral, tool_name, tool_input`
- Sessions table: `id, name, created_at`
- Use `database.addMessage()` / `database.addToolResult()` / `database.updateMessageContent()` / `database.getMessages()`

### Tool Result Storage
- Tool results store metadata: `tool_name` (e.g., "read_file") and `tool_input` (e.g., file path)
- This enables render-time decisions (e.g., markdown rendering for `.md` files)
- **Store raw content** - formatting like line numbers added at render time, not in DB
- Use `database.addToolResult(tool_name, tool_input, content)` for tool outputs

### Streaming AI Responses
`StreamingState` in main.zig handles non-blocking streaming:
1. Spawns curl with `-N` (no buffer) and `stream:true`
2. Sets stdout to O_NONBLOCK via fcntl
3. Polls each frame with `stream.poll()` - returns immediately
4. Parses SSE `data: {...}` events for `content_block_delta`
5. Updates message in DB, reloads chat_history

### Event Loop
```zig
while (true) {
    // 1. Process vaxis events (keyboard, resize)
    // 2. Poll streaming if active
    // 3. Update spinner animation
    // 4. Render frame
}
```

### Component Pattern
Components are structs with:
- `init(allocator, ...)` - constructor
- `deinit()` - cleanup
- `draw(window)` - render to vaxis window
- Optional event handlers

## Keybindings

| Key | Action |
|-----|--------|
| Enter | Send message |
| Ctrl+C (2x) | Exit |
| Ctrl+D | Exit |
| Ctrl+E | Open $EDITOR |
| Ctrl+B,c | New tab |
| Ctrl+B,n/p | Next/prev tab |
| Ctrl+B,0-9 | Switch to tab |
| PageUp/Down | Scroll history |
| Escape | Cancel/interrupt |

## Commands

`/help`, `/clear`, `/new`, `/model`, `/status`, `/diff`, `/exit`

## Adding Features

### New Component
1. Create `src/components/foo.zig` or `src/ui/foo.zig`
2. Implement init/deinit/draw pattern
3. Import in main.zig, instantiate, call draw in render loop

### New Command
In main.zig, find the command handling block:
```zig
if (std.mem.eql(u8, command, "/mycommand")) {
    // Handle command
    _ = try database.addMessage(.system, "Response");
    try chat_history.reload(&database);
}
```

### New API Feature
1. Add to `anthropic_provider.zig` if Anthropic-specific
2. Or add to `provider.zig` interface for multi-provider support
3. Handle in main.zig event loop

## Debugging

### SQLite Database
Database location: `~/.smithers/chat.db`

Query messages:
```bash
sqlite3 ~/.smithers/chat.db "SELECT id, role, tool_name, tool_input, substr(content, 1, 80) FROM messages ORDER BY id DESC LIMIT 10;"
```

Clear chat history:
```bash
sqlite3 ~/.smithers/chat.db "DELETE FROM messages;"
```

Check schema:
```bash
sqlite3 ~/.smithers/chat.db ".schema messages"
```

### Schema Migrations
When adding new columns, add migration in `db.zig` init:
```zig
// Silently add column if it doesn't exist
db.exec("ALTER TABLE messages ADD COLUMN new_col TEXT", .{}, .{}) catch {};
```

### TTY Errors
`zig build run` fails with `/dev/tty` errors when stdout is piped. Run binary directly:
```bash
zig build && ./zig-out/bin/smithers-tui
```

## Common Issues

### fcntl Constants
macOS-specific values used for non-blocking I/O:
```zig
const F_GETFL = 3;
const F_SETFL = 4;
const O_NONBLOCK: usize = 0x0004;
```

### JSON Encoding
Use `std.json.Stringify.valueAlloc()` for proper escaping:
```zig
const escaped = std.json.Stringify.valueAlloc(alloc, content, .{}) catch continue;
defer alloc.free(escaped);
```

### Memory Management
- Always `defer alloc.free()` for allocated strings
- Use `ArrayListUnmanaged` with explicit allocator
- Chat history owns message content - freed in `freeMessages()`

### Markdown Rendering
- `src/markdown/parser.zig` - parses markdown into styled spans
- `chat_history.zig` uses `drawMarkdownMessage()` for assistant messages and markdown files
- `drawCodeWithLineNumbers()` adds line numbers at render time for non-markdown files
- Rendering decisions based on `tool_name`/`tool_input` metadata (e.g., `.md` files get markdown styling)

## Dependencies

- vaxis (vendored in `renderer/`) - terminal rendering, forked from libvaxis
- sqlite (vendored in `sqlite/`) - SQLite Zig bindings
- std.process.Child - curl subprocess for API calls

All dependencies are vendored - no external package manager needed.

## Reference Implementations

Git submodules in `reference/` - use for patterns, API examples, architecture inspiration:

| Project | Path | Description |
|---------|------|-------------|
| **Pi** | `reference/pi-mono/` | Primary reference. TypeScript AI agent framework |
| **Codex** | `reference/codex/` | OpenAI's CLI agent. Rust TUI at `codex-rs/tui/` |
| **OpenCode** | `reference/opencode/` | Go-based AI coding assistant |

### Key TUI References

- `reference/codex/codex-rs/tui/` - Rust/ratatui TUI implementation, see `styles.md` for conventions
- `reference/pi-mono/packages/` - TypeScript packages for agent orchestration
