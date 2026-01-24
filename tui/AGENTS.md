# TUI Development Guide

## Quick Reference

```bash
zig build              # Build
zig build test         # Run tests  
zig build run          # Run (use ./zig-out/bin/smithers-tui for interactive)
zig build debug        # Run with SMITHERS_DEBUG_LEVEL=trace
git commit --no-verify # Skip TS pre-commit hooks (TUI is Zig-only)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ main.zig                                                        │
│   └─ App (comptime DI: Db, EventLoop, Renderer, Agent, ...)    │
│        ├─ event_loop.start() ─► vaxis.Loop (input thread)      │
│        └─ run() loop:                                           │
│             nextEvent() ─► KeyHandler ─► action ─► state change │
│             agent_loop.tick() ─► streaming AI                   │
│             Frame.render() ─► vaxis output                      │
└─────────────────────────────────────────────────────────────────┘
```

### Core Files

| File | Purpose |
|------|---------|
| `main.zig` | Entry, production type wiring, test imports |
| `app.zig` | `App(Db,EventLoop,Renderer,Agent,Env,Clock,ToolExec)` - main loop |
| `event_loop.zig` | `EventLoop(Vaxis,Tty,Event)` - wraps vaxis.Loop |
| `event.zig` | `Event(Renderer)` - key_press/mouse/winsize union |
| `obs.zig` | Observability - JSON logging, tracing, ring buffer |
| `db.zig` | `Database(SqliteDb)` - messages, sessions |

### Dependency Injection Pattern

All major types are **comptime generic** for testability:

```zig
// Production (main.zig)
const App = app_mod.App(
    db.Database(sqlite.Db),
    event_loop_mod.EventLoop(vaxis.Vaxis, vaxis.Tty, ProductionEvent),
    renderer_mod.Renderer(renderer_mod.VaxisBackend),
    anthropic.AnthropicStreamingProvider,
    environment_mod.Environment(environment_mod.PosixEnv),
    clock_mod.Clock(clock_mod.StdClock),
    tool_executor_mod.ToolExecutor(tool_executor_mod.BuiltinRegistryFactory),
);

// Tests use mocks: MockRenderer, MockDatabase, etc.
```

**Critical:** Structs returned by value have pointer stability issues. Call `start()`/`init()` methods in `run()` after struct has stable address, not in `init()`.

## Directory Structure

```
src/
├── agent/           # AI providers, tool execution, agent loop
├── commands/        # Slash commands, command popup
├── components/      # Input, chat_history, logo
├── editor/          # Text editor integration
├── extensions/      # Plugin system
├── keys/            # KeyHandler, MouseHandler, bindings
├── markdown/        # Markdown parser/renderer
├── modes/           # UI modes (normal, command, etc.)
├── overlay/         # Modal overlays
├── rendering/       # Renderer abstraction, frame composition
├── session/         # Session management
├── testing/         # Mock types for tests
├── tests/           # Test files
└── ui/              # Header, status bar, layout
```

## State Management

**SQLite is single source of truth.** No useState-style in-memory state.

```zig
// Messages table
database.addMessage(.user, "hello")
database.addToolResult("read_file", "/path", content)
database.updateMessageContent(id, new_content)
database.getMessages(session_id)

// After mutation, reload UI
try chat_history.reload(&database);
```

**Ephemeral UI state only:** cursor position, scroll offset, loading spinners.

## Observability (Debugging)

```bash
SMITHERS_DEBUG_LEVEL=trace ./zig-out/bin/smithers-tui
# or
zig build debug
```

Logs to `/tmp/smithers-debug.log` (JSON Lines):

```json
{"ts":1737...,"lvl":"debug","tid":1,"sid":2,"type":"event.key_press","msg":"cp=97 text=a"}
```

### Instrumenting Code

```zig
const obs = @import("obs.zig");

// Simple log
obs.global.logSimple(.debug, @src(), "event.type", "message");

// With trace correlation
const tid = self.event_loop.lastTraceId();
obs.global.log(.debug, tid, span_id, @src(), "event.type", "msg");

// Spans for timing
var span = obs.global.spanBegin(tid, null, @src(), "operation");
defer obs.global.spanEnd(&span, @src());
```

## Adding Features

### New Component
```zig
// src/components/foo.zig
pub fn Foo(comptime R: type) type {
    return struct {
        pub fn init(alloc: Allocator) Self { ... }
        pub fn deinit(self: *Self) void { ... }
        pub fn draw(self: *Self, renderer: R) void { ... }
    };
}
```

### New Tool
```zig
// src/agent/tools/my_tool.zig
pub const MyTool = struct {
    pub fn execute(args: Args) !Result { ... }
};

// Register in tool_executor.zig BuiltinRegistryFactory
```

### New Keybinding
```zig
// src/keys/handler.zig - in handleKey()
if (key.matches('x', .{ .ctrl = true })) {
    return .{ .custom_action = ... };
}
```

## Testing

```zig
// Use mock types from src/testing/
const MockRenderer = @import("testing/mock_renderer.zig").MockRenderer;
const MockDb = @import("testing/mock_db.zig").MockDatabase;

test "my feature" {
    var renderer = MockRenderer{};
    // ...
}
```

Add test imports to `main.zig`:
```zig
test {
    _ = @import("tests/my_test.zig");
}
```

## Common Pitfalls

### Pointer Stability (CRITICAL)
```zig
// ❌ BAD - pointers dangle after return
pub fn init() Self {
    var self = Self{};
    self.inner.ptr = &self.data;  // Points to stack!
    return self;  // self moves, ptr dangles
}

// ✅ GOOD - set pointers after struct is stable
pub fn start(self: *Self) void {
    self.inner.ptr = &self.data;  // self has stable address
}
```

### Zig 0.15 File API
```zig
// ❌ Old API
f.writer().print(...)

// ✅ New API  
const written = std.fmt.bufPrint(&buf, ...) catch return;
_ = f.write(written) catch {};
```

### TTY Access
`zig build run` fails when stdout is piped. Run binary directly:
```bash
./zig-out/bin/smithers-tui
```

## Upcoming Features

Areas being developed - coordinate before making changes:

| Feature | Description |
|---------|-------------|
| **jj snapshots** | Jujutsu-based automatic state snapshots |
| **Subagents** | Spawn child agents for parallel tasks |
| **Smithers scripts** | `.smithers` script execution |
| **Worktrees** | Git worktree management |
| **Reviews** | Code review workflow |

## Dependencies

All vendored (no package manager):
- `renderer/` - forked libvaxis
- `sqlite/` - SQLite Zig bindings

## Reference

| Resource | Path |
|----------|------|
| Codex TUI (Rust) | `reference/codex/codex-rs/tui/` |
| Pi (TS agents) | `reference/pi-mono/packages/` |
| OpenCode (Go) | `reference/opencode/` |
