# Smithers TUI

Terminal User Interface for the Smithers multi-agent orchestration framework.

## Building

From the repo root:

```bash
zig build
./zig-out/bin/smithers-tui
```

Or run directly (requires TTY):

```bash
./zig-out/bin/smithers-tui
```

## Usage

- Type in the chat input box at the bottom
- `/exit` - Exit the application  
- `Ctrl+C` - Cancel/exit

## Dependencies

All dependencies are vendored:
- `renderer/` - vaxis (forked from [libvaxis](https://github.com/rockorager/libvaxis)) for terminal rendering
- `sqlite/` - SQLite Zig bindings
