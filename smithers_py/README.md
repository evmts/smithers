# Smithers-Py

Python orchestration framework for AI agent coordination with React-like semantics.

## Overview

Smithers-Py provides a declarative, component-based approach to orchestrating AI agents. Key features:

- **React-like render loop**: Frame-by-frame rendering with snapshot isolation
- **SQLite durable state**: All state persisted for crash recovery and resumability
- **Pydantic AI integration**: Native support for Claude and other models
- **MCP server**: Transport-agnostic server (stdio + Streamable HTTP)
- **VCS integration**: Isolated worktrees per execution with snapshot/rollback

## Quick Start

```bash
# Install
pip install smithers-py

# Run an orchestration
python -m smithers_py run workflow.py
```

## Example Workflow

```python
from smithers_py import component, ClaudeNode, PhaseNode, IfNode

@component
def app(ctx):
    phase = ctx.state.get("phase") or "research"
    
    if phase == "research":
        return PhaseNode(
            name="research",
            children=[
                ClaudeNode(
                    id="researcher",
                    model="sonnet",
                    prompt="Research the topic and summarize findings",
                    on_finished=lambda r: ctx.state.set("phase", "implement", trigger="research.done")
                )
            ]
        )
    else:
        return PhaseNode(
            name="implement",
            children=[
                ClaudeNode(
                    id="implementer",
                    model="sonnet",
                    prompt="Implement the solution based on research"
                )
            ]
        )
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     7-Phase Tick Loop                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. State Snapshot  → Freeze db + volatile + fs state            │
│ 2. Render (pure)   → Generate plan tree, track dependencies     │
│ 3. Reconcile       → Diff vs previous, detect mount/unmount     │
│ 4. Commit          → Persist frame to SQLite                    │
│ 5. Execute         → Start tasks for newly mounted nodes        │
│ 6. Effects         → Run effects whose deps changed             │
│ 7. Flush           → Apply queued state updates atomically      │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Node Types

| Node | Description |
|------|-------------|
| `ClaudeNode` | AI agent execution via Pydantic AI |
| `PhaseNode` | Named execution phase with persistence |
| `StepNode` | Step within a phase |
| `IfNode` | Conditional rendering |
| `WhileNode` | Loop with max iterations |
| `RalphNode` | Iterative improvement loop |
| `EachNode` | List iteration with keys |
| `EffectNode` | Post-commit side effects |
| `StopNode` | Graceful termination |

### State Management

```python
# Durable state (SQLite)
ctx.state.get("key")           # Read with dependency tracking
ctx.state.set("key", value, trigger="source")  # Queued write

# Volatile state (in-memory)
ctx.v.get("key")
ctx.v.set("key", value)

# File system (observed)
ctx.fs.read("path")
ctx.fs.write("path", content)
```

### Event Handlers

Event handlers attach to observable nodes (agents, subagents):

```python
ClaudeNode(
    id="my-agent",
    prompt="Do something",
    on_finished=lambda result: ctx.state.set("done", True),
    on_error=lambda error: ctx.state.set("failed", True),
    on_progress=lambda event: print(event)
)
```

### Signals & Reactivity

```python
from smithers_py import Signal, Computed, DependencyTracker

# Create signals
count = Signal(0, "count")

# Computed values (cached until deps change)
doubled = Computed(lambda: count.get() * 2)

# Dependency tracking during render
tracker = DependencyTracker()
tracker.start_frame(1)
value = count.get()  # Tracked
deps = tracker.end_frame()  # {"count"}
```

## MCP Server

```bash
# Start HTTP server
python -m smithers_py.mcp.http --port 8080

# Use stdio transport
python -m smithers_py.mcp.stdio
```

### Resources

| URI | Description |
|-----|-------------|
| `smithers://executions` | List executions |
| `smithers://executions/{id}` | Execution detail |
| `smithers://executions/{id}/frames` | Frame history |
| `smithers://health` | Server health status |

### Tools

- `execution.start` - Start new execution
- `execution.pause` / `execution.resume` - Control execution
- `execution.stop` - Graceful stop
- `node.cancel` / `node.retry` - Node-level control
- `approval.respond` - Respond to approval requests

## VCS Integration

```python
from smithers_py import create_execution_worktree, VCSOperations

# Create isolated worktree
workspace = await create_execution_worktree(Path("."), execution_id)

# VCS operations with graceful degradation
vcs = VCSOperations(workspace)
ref = await vcs.snapshot("Before agent changes")
# ... agent makes changes ...
await vcs.rollback(ref)  # Revert if needed
```

## Logging

```python
from smithers_py import create_logger, EventType

logger = create_logger(execution_id)
logger.frame_start(frame_id, "state_change")
logger.node_status(node_id, "running", frame_id)
logger.state_change("key", old, new, "trigger", frame_id)
logger.close()  # Writes summary
```

Logs stored in `.smithers/executions/{id}/logs/`:
- `stream.ndjson` - Event stream
- `stream.summary.json` - Aggregate statistics

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
python -m pytest smithers_py/ -v

# Type check
pyright smithers_py/

# Lint
ruff check smithers_py/
```

## Requirements

- Python 3.10+
- pydantic >= 2.0
- pydantic-ai
- aiosqlite

## License

MIT License
