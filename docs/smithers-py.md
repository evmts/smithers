---
title: Smithers-Py
description: Python orchestration library with React-like semantics
---

# Smithers-Py

<Warning>
**🚧 WORK IN PROGRESS 🚧**

Smithers-Py is under active development. APIs may change. Not production-ready.
</Warning>

Python rebuild of Smithers with identical semantics but native Python tooling.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    smithersd (Python daemon)                     │
│  - SQLite durable state                                          │
│  - Render → Commit → Effects loop                                │
│  - PydanticAI agent runtime                                      │
│  - MCP server (stdio + Streamable HTTP)                          │
├─────────────────────────────────────────────────────────────────┤
│                    Zig WebUI Desktop App                         │
│  - Launches smithersd                                            │
│  - Embedded browser/webview                                      │
├─────────────────────────────────────────────────────────────────┤
│                    Solid.js Frontend                             │
│  - Connects via MCP Streamable HTTP                              │
│  - Live plan tree + frame timeline + logs                        │
└─────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Render → Commit → Effects Loop

Mimics React's mental model:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. STATE SNAPSHOT    │ Freeze db_state, vol_state, frame_clock │
│ 2. RENDER (pure)     │ Components → Plan Tree (no side effects)│
│ 3. RECONCILE         │ Diff tree, detect mount/unmount         │
│ 4. COMMIT            │ Persist frame to SQLite                 │
│ 5. EXECUTE           │ Start tasks for newly mounted nodes     │
│ 6. EFFECTS           │ Run effects whose deps changed          │
│ 7. STATE FLUSH       │ Apply queued updates atomically         │
└─────────────────────────────────────────────────────────────────┘
```

**Key invariant**: State never changes during render. Writes queue until flush.

### State Model

| Layer | Storage | Use Case |
|-------|---------|----------|
| `ctx.state` | SQLite | Durable, survives restart |
| `ctx.vol` | Memory | UI flags, caches, ephemeral |
| `ctx.fs` | Files | Instrumented file operations |

## DSL Options

### Option 1: Python JSX (`.px` files)

```python
# coding: jsx
from smithers_py import component, Ralph, Phase, Claude, If

@component
def ImplementPhase(ctx):
    return (
        <Phase name="implement">
            <Claude
                model="sonnet"
                prompt="Fix failing tests"
                on_finished=lambda r: ctx.state.set("phase", "done", trigger="claude.finished")
            />
        </Phase>
    )
```

### Option 2: Context Managers

```python
from smithers_py import plan, Phase, Claude

@plan
def ImplementPhase(ctx):
    with Phase("implement"):
        Claude(
            model="sonnet",
            prompt="Fix failing tests",
        ).on_finished(lambda r: ctx.state.set("phase", "done", trigger="claude.finished"))
```

### Option 3: Decorators

```python
from smithers_py import phase, claude_task

@phase("implement")
def implement(ctx):

    @claude_task(model="sonnet", prompt="Fix failing tests")
    def on_done(result):
        ctx.state.set("phase", "done", trigger="claude.finished")
```

## Node Primitives

| Node | Purpose |
|------|---------|
| `If` / `Switch` / `Each` | Declarative branching and list rendering |
| `While` / `Ralph` | Iterative loops with persisted iteration |
| `Phase` / `Step` / `Parallel` | Progression model with persisted progress |
| `Claude` | Agent node (PydanticAI-backed) |
| `Effect` | Run side-effects after commit |
| `Stop` / `End` | Explicit termination |

## Agent Runtime

Built on PydanticAI:

```python
class LLMNode(BaseNode):
    model: str                      # e.g., "sonnet", "opus"
    prompt: str | list[Node]        # Text or structured prompt
    tools: ToolPolicy               # Allow/deny tool config
    schema: type[BaseModel] | None  # Structured output validation
    max_turns: int = 50             # Per-node turn budget
    # Event handlers: on_finished, on_error, on_progress
```

### Session Persistence

Agents persist:
- Message history (or summarized form)
- Tool call transcripts
- Run IDs / session IDs
- Structured outputs

Resume modes:
- `continue`: Continue conversation history
- `restart`: Start over using last known state
- `fail`: Fail fast for manual decision

## Signals & Reactivity

```python
class Signal[T]:
    def get(self) -> T: ...   # Registers dependency during render
    def set(self, value: T): ...  # Queues action (batched)

class Computed[T]:
    def __init__(self, fn: Callable[[], T]): ...
    def get(self) -> T: ...   # Cached until invalidated
```

### Reactive Reads (MVP)

Key-based invalidation:
- `ctx.state.get("phase")` subscribes to key `"phase"`
- When `"phase"` changes, dependents invalidate and re-render

## Effects

Effects are first-class observable nodes (not hidden callbacks):

```python
<Effect
  id="sync-phase"
  deps={[ctx.state.get("phase")]}
  run={lambda: ctx.vol.set("phase_label", f"Phase={ctx.state.get('phase')}")}
/>
```

Or as a hook:

```python
ctx.use_effect("sync-phase", deps=[ctx.state.get("phase")], fn=...)
```

## Error Handling

### Error Classification

| Type | Examples | Behavior |
|------|----------|----------|
| Retryable | 429, 500, 502, 503, 504, timeouts | Exponential backoff + jitter |
| Non-retryable | Auth failure, invalid request | Fail immediately |

### Global Rate Limit Coordinator

Prevents retry amplification across agents:

```python
class RateLimitCoordinator:
    backoff_windows: dict[str, BackoffWindow]  # Per provider/model
    global_concurrency: Semaphore = Semaphore(10)
```

## Crash Recovery

### Task Leasing

```python
class TaskLeaseManager:
    lease_duration_ms: int = 30_000      # 30 seconds
    heartbeat_interval_ms: int = 10_000  # 10 seconds
```

On startup, orphaned tasks (expired leases) are either retried or marked failed based on policy.

### Stale Result Handling

When a task completes but its node is gone from the plan tree:
- Record completion for audit
- **Do NOT** fire `on_finished` handler
- Log warning

## SQLite Schema (Core Tables)

```sql
executions     -- Execution lifecycle
state_kv       -- Durable key/value state
frames         -- Rendered plan tree per frame
node_instances -- Mount/unmount tracking
tasks          -- Running/pending tasks with leases
agents         -- Agent run records
events         -- Audit log
transitions    -- State change history
```

## MCP Server

Transport-agnostic with secure defaults:

```
┌─────────────────────────────────────────────────────────────────┐
│                         McpCore                                  │
│   handle(json_rpc_msg) -> list[Response | Event]                │
├─────────────────────────────────────────────────────────────────┤
│  StdioTransport        │  HttpTransport                         │
│  - NDJSON on stdio     │  - Streamable HTTP                     │
│  - For CLI             │  - localhost only                      │
│                        │  - Origin validation                   │
│                        │  - Bearer token auth                   │
└─────────────────────────────────────────────────────────────────┘
```

### Security Requirements

- Bind to `127.0.0.1` only
- Origin header validation
- Random bearer token printed at startup

## CLI

```bash
# Run a plan
smithers_py run script.px

# Auto-registers .px import hook for Python JSX
```

## Milestones

| M | Deliverable | Status |
|---|-------------|--------|
| M0 | Repo scaffold + DB schema + CLI | 🚧 |
| M1 | Node models + JSX runtime | 🚧 |
| M2 | Engine loop (render/commit/effects) | 📋 |
| M3 | Agent node with PydanticAI | 📋 |
| M4 | While/Ralph + Phase/Step | 📋 |
| M5 | Logging/monitoring parity | 📋 |
| M6 | MCP server (stdio + HTTP) | 📋 |
| M7 | Desktop UI (Zig WebUI + Solid) | 📋 |
| M8 | Harness UI (production-grade) | 📋 |
| M9 | Artifacts system | 📋 |

## Package Structure

```
smithers_py/
├── dsl/jsx.py              # python-jsx integration
├── nodes/
│   ├── base.py             # BaseNode, TextNode
│   ├── structural.py       # If, Each, Fragment
│   ├── control.py          # While, Ralph, Phase, Step
│   ├── agent.py            # Claude, Smithers (subagent)
│   └── effects.py          # Effect, Stop, End
├── runtime/
│   ├── engine.py           # Render/commit/effect loop
│   ├── context.py          # ctx (state, vol, fs)
│   ├── signals.py          # Signal, Computed
│   └── tasks.py            # Task registry
├── state/
│   ├── sqlite_store.py     # Durable state
│   ├── volatile_store.py   # In-memory state
│   └── batching.py         # Write queue, flush
├── agents/
│   ├── pydantic_adapter.py # PydanticAI wrapper
│   ├── tools.py            # Tool registration
│   └── history.py          # History processors
├── db/
│   ├── schema.py           # Table definitions
│   ├── migrations.py       # Schema migrations
│   └── queries.py          # Common queries
└── mcp/
    ├── server.py           # MCP core
    ├── stdio.py            # stdio transport
    └── http.py             # Streamable HTTP
```

## Key Design Decisions

1. **Writes always queued** — state never changes during render
2. **Flushed state change triggers new frame** (unless stop requested)
3. **Stable node identity** via key-path hashing (not Python `hash()`)
4. **Agent nodes resumable** via persisted history and status
5. **Effects are observable nodes** (visible in plan tree)
6. **Task leases from day one** (crash safety)
7. **Frame coalescing** (250ms throttle, immediate for task completion)

## Comparison: TypeScript vs Python

| Aspect | Smithers (TS) | Smithers-Py |
|--------|---------------|-------------|
| Runtime | Bun + React | Python + PydanticAI |
| DSL | JSX/TSX | Python JSX (.px) |
| State | SQLite | SQLite |
| Agents | Claude SDK | PydanticAI |
| Testing | Bun test | pytest + TestModel |
| UI | TBD | Zig WebUI + Solid.js |

---

<CardGroup cols={2}>
  <Card title="TypeScript Docs" icon="code" href="/introduction">
    Main Smithers framework
  </Card>
  <Card title="PRD" icon="file" href="https://github.com/your-repo/issues/smithers-py.md">
    Full engineering spec
  </Card>
</CardGroup>
