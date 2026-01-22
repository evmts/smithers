# god-agent

High-performance AI coding agent TUI written in Zig.

## Build

```bash
zig build
```

Binary output: `zig-out/bin/god-agent`

## Usage

```bash
# Interactive mode
god-agent

# Single prompt
god-agent "Explain this codebase"

# With model selection
god-agent --model claude-opus-4 "Complex refactoring task"

# Continue last session
god-agent --continue

# Print mode (non-interactive)
god-agent --print "Quick question"

# Session management
god-agent session list
god-agent session show <ID>
god-agent session export <ID>
god-agent session delete <ID>

# Configuration
god-agent config show
god-agent config set model claude-opus-4
```

## Options

| Flag | Description |
|------|-------------|
| `-h, --help` | Display help |
| `-V, --version` | Show version |
| `-m, --model <str>` | Model (default: claude-sonnet-4) |
| `-c, --continue` | Continue last session |
| `-R, --restore <ID>` | Resume specific session |
| `-p, --print` | Print mode (non-interactive) |
| `--system <str>` | System prompt override |
| `--tools <str>` | Comma-separated tool list |
| `--no-tools` | Disable all tools |
| `--max-turns <n>` | Maximum agent turns (default: 100) |
| `--thinking <level>` | Thinking level: off\|low\|medium\|high |
| `--no-color` | Disable color output |
| `-v, --verbose` | Increase verbosity |

## Available Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `edit_file` | Edit file with search/replace |
| `bash` | Execute shell commands |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `list_dir` | List directory contents |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        main.zig                              │
│                    (CLI Entry Point)                         │
├─────────────────────────────────────────────────────────────┤
│  modes/              │  agent/              │  ui/           │
│  ├─ interactive.zig  │  ├─ agent.zig        │  ├─ header.zig │
│  └─ print.zig        │  ├─ types.zig        │  ├─ chat.zig   │
│                      │  └─ tools/           │  └─ status.zig │
├─────────────────────────────────────────────────────────────┤
│  session/            │  ai/                 │  extensions/   │
│  └─ session.zig      │  └─ provider.zig     │  └─ extension.zig│
├─────────────────────────────────────────────────────────────┤
│  components/         │  editor/             │  overlay/      │
│  ├─ component.zig    │  ├─ editor.zig       │  └─ overlay.zig│
│  ├─ text.zig         │  ├─ kill_ring.zig    │                │
│  ├─ box.zig          │  └─ undo.zig         │                │
│  ├─ loader.zig       │                      │                │
│  └─ select_list.zig  │                      │                │
├─────────────────────────────────────────────────────────────┤
│  terminal/           │  rendering/                           │
│  ├─ terminal.zig     │  ├─ renderer.zig                      │
│  ├─ ansi.zig         │  └─ width.zig                         │
│  ├─ stdin_buffer.zig │                                       │
│  └─ keys.zig         │                                       │
└─────────────────────────────────────────────────────────────┘
```

## Tests

```bash
# Run all module tests
zig test terminal/keys.zig
zig test rendering/renderer.zig
zig test rendering/width.zig
zig test components/component.zig
zig test editor/editor.zig
zig test overlay/overlay.zig
zig test ai/provider.zig
zig test extensions/extension.zig
zig test session/session.zig

# Total: 113 tests
```

## Status

All 12 phases complete. See [STATUS.md](STATUS.md) for implementation details.
