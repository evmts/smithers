# Smithers-Py PRD and Engineering Design

**Date:** 2026-01-21
**Status:** Draft (implementation-ready)
**Scope:** Python orchestration library + transport-agnostic MCP server + desktop web GUI (Zig + WebUI + Solid.js)

This document is written to (a) preserve the key Smithers mental model and semantics, and (b) specify the missing operational details: how the render loop works, how "effects" and batching work, how we model signals, how agent sessions persist and resume, and how we handle real-world failure modes (rate limits, network outages, crashes).

---

# 1) Product Requirements Document

## 1.1 Problem statement

You have a React/JSX-based orchestration library (Smithers) where:

* **State is observable** and persisted via SQLite.
* **Plans are declarative components** (XML/JSX tree) rendered **frame-by-frame**.
* A **React-like loop** repeatedly renders the plan from state, executes "mounted" agent nodes, and re-renders when state changes.
* **Event handlers** (e.g., `onFinished`) live on the observable nodes returned by JSX; this makes plan transitions auditable and much simpler than hidden state machines.

You want a Python rebuild that works **almost identically**, but uses:

* **Pydantic AI** as the core agent runtime and tool framework.
* **pydantic-graph** internally for runtime state-machine/graph execution (encapsulated).
* **python-jsx** for the initial DSL (Python JSX).
* A simple, React-like "render → commit → effects" event loop with batching semantics similar to React.
* A **transport-agnostic MCP server** (stdio + Streamable HTTP at minimum).
* A **desktop GUI** using Zig + WebUI and a Solid.js frontend that consumes the MCP server.

## 1.2 Goals

### Functional parity goals (Smithers-like)

1. **Render-loop orchestration**: Re-render the component tree whenever observable state changes; stop when idle and no tasks are running.
2. **SQLite durable state** as the primary source of truth; use reactive reads to decide what to render.
3. **Frame-by-frame**: every loop iteration produces a frame containing the full "observable plan tree" plus statuses and events.
4. **Event emitters only on observable nodes**: handlers like `onFinished` attach to nodes that are part of the rendered plan tree.
5. **Loop nodes**: While/Ralph with persisted loop iteration and resumability requirements (stable IDs).
6. **Phases/Steps**: a declarative progression system whose progress is persisted, resumable, and visible.
7. **Error handling patterns** that can be expressed as "render different plan based on state."
8. **Monitoring + logs**: NDJSON streaming events, summarization thresholds, and easy inspection.

### Improvements vs original (explicitly requested)

1. **Agents built from the ground up** using Pydantic AI (not relying on Claude Code behavior).
2. **React-like batching and effects**: state changes don't "take effect" until after the frame (commit/effect boundary).
3. **Volatile state** in `ctx` alongside durable SQLite state.
4. **Transport-agnostic MCP server** with secure defaults (Origin validation, localhost binding, auth).
5. **A "great conductor-style UI"**: plan tree, timeline, logs, tool calls, state diffs, replay, restart from frame/step, etc.

## 1.3 Non-goals

* Re-implementing React or Solid DOM rendering. We render a plan tree to a structured "observable graph," not a GUI DOM.
* Building a distributed workflow engine (Temporal-class) initially. This is a local-first harness; remote/distributed later.
* Perfect reactive SQL query invalidation for arbitrary SQL in v1.

## 1.4 Target users and use cases

### Users

* Developers building agentic workflows (code, data pipelines, research).
* Teams needing **auditability** (frame history + state transitions visible).
* Agents themselves: the DSL must be "LLM-writeable" and easy to one-shot.

### Primary use cases (MVP)

1. **Code-fix loop**: render phase based on state, run agent, update phase when done.
2. **Multi-step pipeline**: query → analyze → write report; branch on success/failure.
3. **While/Ralph iterative improvements**: run until tests pass or max iterations reached.
4. **Human-in-the-loop** review gates.

## 1.5 Success metrics

* Time-to-first-workflow (from empty repo): < 10 minutes.
* Typical workflow script: < 80 lines; readable in code review.
* Ability to resume after crash: deterministic and clear.
* Debug time reduction: "what happened?" answerable from the plan tree + logs without reproducing.
* Token efficiency: explicit controls, history trimming, test models for CI.

---

# 2) Product requirements (detailed)

## 2.1 Core runtime semantics

### 2.1.1 "Render → Commit → Effects" loop

We explicitly mimic React's mental model:

* React describes "render and commit" as separate steps; renders can happen without committing; committing is when changes are applied.
* React batches state updates and processes them after the event handler finishes.
* React effects (`useEffect`) are generally deferred until after the browser paints.

**Smithers-Py mapping:**

* **Render**: compute the plan tree from (durable + volatile + fs) snapshot; no mutations.
* **Commit**: persist the frame, reconcile node instances, and finalize which nodes are "mounted/active."
* **Effects**: flush queued state updates and schedule runnable work (agents/tools) after the frame is produced.

### 2.1.2 Stopping conditions (idle semantics)

Smithers' Ralph loop stops when:

* no component "mounts" and registers tasks, and
* no state changes trigger re-render for some short grace period,
* and no tasks are still running (tracked in DB).

Smithers-Py must replicate:

* A "task registry" concept that blocks loop termination until tasks complete.
* A configurable idle timeout (~500ms default).

### 2.1.3 Observable nodes and event handlers

Requirement: event handlers are attached to observable nodes (the rendered plan), not arbitrary data. This enables:

* deterministic auditing of transitions
* "what caused phase to change?" traced to `node_id + handler_name + trigger`.

This will be enforced by type system and runtime checks:

* Only node models accept `on_finished`, `on_error`, etc.
* Handler executions are logged as events and run in the effect phase (never during render).

---

## 2.2 State model requirements

### 2.2.1 Durable state (SQLite)

* SQLite is the durable state source of truth.
* Must support key/value storage and additional structured tables for tasks, agents, phases, steps.
* Must support reactive reads ("signals") such that when state changes, the loop schedules a new frame.

### 2.2.2 Volatile state (in-memory)

* Available as `ctx.vol` (or `ctx.v`) for:
  * UI-only flags (selected node, debug filters)
  * in-flight backoff timers
  * caches (computed selectors)
  * ephemeral scratch across frames (optional)
* Volatile state participates in the same batching semantics.

### 2.2.3 File system as observable state

* Provide `ctx.fs` abstraction:
  * read/write operations instrumented and logged
  * file changes can trigger re-render (watcher integration)
  * record file hashes/metadata for audit and diff

---

## 2.3 Component model requirements

### 2.3.1 JSX (Python JSX) as v1 DSL

* Use python-jsx to implement `<If>`, `<Claude>`, `<Ralph>`, `<Phase>`, `<Step>`, etc.
* JSX runtime returns **Pydantic node objects** (not HTML strings).

### 2.3.2 Required primitives

* **If / Switch / Each**: purely declarative branching and list rendering.
* **While / Ralph**: iterative loops with persisted iteration and stable IDs.
* **Phase / Step / Parallel**: progression model; persisted progress; predictable semantics.
* **Agent nodes**: `ClaudeNode` analog built on PydanticAI.
* **Stop / End** nodes (explicit termination), plus global stop conditions.
* **Hooks / Effect**: run side-effects after commit.

---

## 2.4 Agent runtime requirements

### 2.4.1 Use PydanticAI as the runtime

* Each agent node maps to a PydanticAI `Agent` with:
  * tools registered via decorators or toolsets
  * output validation with retries (`ModelRetry` pattern)
  * optional history processors for trimming/token savings

### 2.4.2 Turn budgeting

* Per-node `max_turns` and per-execution/global stop conditions (tokens, agents, time).
* Define "turn" as one full "model request → tool calls → final output" step.

### 2.4.3 Session persistence + resumability

* Persist:
  * message history (or a summarized form)
  * tool call transcripts
  * run IDs / session IDs
  * outputs and validated structured outputs
* Allow restart behavior:
  * `resume_mode="continue"`: continue conversation history
  * `resume_mode="restart"`: start over using last known state
  * `resume_mode="fail"`: fail fast to force manual decision

---

## 2.5 Reliability + edge-case requirements

### 2.5.1 Network down / rate limiting / provider outages

* Classify errors into:
  * retryable (timeouts, 429, transient 5xx)
  * non-retryable (auth failure, invalid request)
* For retryable:
  * exponential backoff + jitter
  * persist attempt count and next retry time so restarts don't reset backoff
  * surface status in the plan tree (node status = `blocked(rate_limit)`)

### 2.5.2 Tool failures + permissions

* Tools can fail; must capture:
  * tool name, input, output/error, duration
  * approval state (if requiring approval)
* Support allow/deny lists similar to Smithers agent tool restrictions.

### 2.5.3 Crash recovery

* Must tolerate process crashes mid-run.
* At restart:
  * locate incomplete execution
  * recover DB state
  * reconcile "running tasks" and decide restart policy

---

## 2.6 Monitoring + UI requirements

### 2.6.1 Logging

* Provide NDJSON stream event logs and summaries.
* Provide log summarization thresholds and fallback truncation.

### 2.6.2 GUI features ("great conductor-like UI")

Minimum "must have" UI features:

1. **Plan tree viewer** per frame
2. **Frame timeline**
3. **Agent session panel**
4. **State inspector + diff**
5. **Controls**: pause/resume, stop, restart from frame
6. **Failure triage**
7. **Cost & token usage**
8. **Replay**

### 2.6.3 Desktop wrapper

* Use Zig WebUI to run as a lightweight desktop app.
* Solid.js frontend using signals for fine-grained state updates.

---

# 3) Engineering Design Document

## 3.1 High-level architecture

### 3.1.1 Processes

**Option A (recommended for v1):**

* **Python runtime daemon** (`smithersd`)
  * owns SQLite DB
  * runs render loop + agents
  * hosts MCP server (Streamable HTTP on localhost)
* **Zig WebUI desktop app**
  * launches `smithersd` (child process)
  * opens embedded browser/webview to the Solid UI
* **Solid.js UI**
  * connects to MCP Streamable HTTP endpoint
  * streams frames/logs and sends control commands

### 3.1.2 Key modules (Python)

```
smithers_py/
├── __init__.py           # Main exports
├── dsl/
│   └── jsx.py            # python-jsx integration
├── nodes/
│   ├── __init__.py       # Node exports
│   ├── base.py           # BaseNode, TextNode
│   ├── structural.py     # If, Each, Fragment
│   ├── control.py        # While, Ralph, Phase, Step
│   ├── agent.py          # Claude, Smithers (subagent)
│   └── effects.py        # Effect, Stop, End
├── runtime/
│   ├── engine.py         # Render/commit/effect loop
│   ├── context.py        # ctx object (state, vol, fs)
│   ├── signals.py        # Signal, Computed, dependency tracking
│   └── tasks.py          # Task registry
├── state/
│   ├── sqlite_store.py   # Durable state + event log
│   ├── volatile_store.py # In-memory state
│   └── batching.py       # Write queue, flush logic
├── agents/
│   ├── pydantic_adapter.py  # PydanticAI wrapper
│   ├── tools.py          # Tool registration
│   └── history.py        # History processors
├── db/
│   ├── schema.py         # Table definitions
│   ├── migrations.py     # Schema migrations
│   └── queries.py        # Common queries
├── serialize/
│   └── xml.py            # XML serialization
├── logs/
│   └── ndjson.py         # NDJSON event stream
└── mcp/
    ├── server.py         # MCP core server
    ├── stdio.py          # stdio transport
    └── http.py           # Streamable HTTP transport
```

---

## 3.2 Data model (SQLite)

### 3.2.1 Tables (v1)

**`executions`**
- `id` (pk)
- `created_at`, `updated_at`
- `status` (running|stopped|completed|failed)
- `root_component` (string)
- `config_json` (json)
- `stop_reason` (nullable)

**`state_kv`** (durable)
- `execution_id`
- `key` (pk scoped by execution)
- `value_json`
- `type_name`
- `updated_at`
- `updated_by_event_id` (fk)

**`frames`**
- `id` (pk)
- `execution_id`
- `frame_index`
- `created_at`
- `tree_json` (the rendered plan node tree)
- `state_diff_json`
- `vol_diff_json`
- `reason`

**`node_instances`**
- `execution_id`
- `node_id` (stable ID derived from key path)
- `node_type`
- `mounted_at_frame`
- `last_seen_frame`
- `status` (pending|running|success|error|skipped|blocked)

**`tasks`**
- `execution_id`
- `task_id`
- `node_id`
- `status` (running|done|error)
- `started_at`, `ended_at`
- `error_json`

**`agents`**
- `execution_id`
- `node_id`
- `run_id`
- `model`
- `status`
- `started_at`, `ended_at`
- `turns_used`
- `usage_json`
- `output_text`
- `output_structured_json`
- `error_json`

**`events`** (audit log)
- `id`
- `execution_id`
- `timestamp`
- `source` (node|runtime|tool|mcp)
- `node_id` (nullable)
- `type`
- `payload_json`

**`phases` / `steps`**
- persisted progress

### 3.2.2 File layout

```
.smithers/
├── db.sqlite
└── executions/<id>/
    └── logs/
        ├── stream.ndjson
        └── stream.summary.json
```

---

## 3.3 Node model (Pydantic)

All rendered "observable things" are instances of:

```python
class BaseNode(BaseModel):
    type: str
    key: str | None = None
    children: list["Node"] = Field(default_factory=list)
    props: dict[str, Any] = Field(default_factory=dict)
    handlers: NodeHandlers = Field(default_factory=NodeHandlers, exclude=True)
    meta: NodeMeta = Field(default_factory=NodeMeta)
```

### 3.3.1 Stable node IDs

Rule: `node_id = hash(parent_node_id + "/" + (key or index) + ":" + node_type)`

For loops (`Each`, `While`), require explicit keys or stable IDs.

---

## 3.4 React-like batching, snapshots, and effects

### 3.4.1 Snapshot semantics

During a frame render:
* reads come from a frozen snapshot
* writes are queued (never applied in-render)

### 3.4.2 Batched updates

`ctx.dispatch(action)` queues updates.
`ctx.state.set(...)` is sugar for dispatching `StateSet(key,value,trigger=...)`.

**Flush points:**
1. End of effect phase for the current frame.
2. End of event handler execution.
3. End of tool callback execution.

### 3.4.3 Effect primitive

**Node form (JSX-friendly):**
```python
<Effect
  id="sync-phase"
  deps={[ctx.state.get("phase")]}
  run={lambda: ctx.vol.set("phase_label", f"Phase={ctx.state.get('phase')}")}
/>
```

**Hook form (Python-friendly):**
```python
ctx.use_effect("sync-phase", deps=[ctx.state.get("phase")], fn=...)
```

---

## 3.5 Signals and dependency tracking

### 3.5.1 Backend signal design (Python)

```python
class Signal[T]:
    def get(self) -> T: ...  # registers dependency during render
    def set(self, value: T) -> None: ...  # queues action

class Computed[T]:
    def __init__(self, fn: Callable[[], T]): ...
    def get(self) -> T: ...  # cached until invalidated
```

### 3.5.2 SQLite "reactivity"

**Level 1 (MVP): key-based invalidation**
- `ctx.state.get("phase")` subscribes to key `"phase"`.
- When `"phase"` changes, invalidate dependents.

---

## 3.6 Using pydantic-graph internally (encapsulated)

We use pydantic-graph to implement the **runtime engine state machine**, not user plans.

**EngineGraph nodes:**
1. `LoadExecution`
2. `RenderFrame`
3. `CommitFrame`
4. `RunEffects`
5. `ScheduleRunnableNodes`
6. `WaitForEvent`
7. `Stop`

User-facing API never exposes graph internals.

---

## 3.7 Agent runtime: PydanticAI adapter

### 3.7.1 Agent node definition

```python
class LLMNode(BaseNode):
    model: str
    prompt: str | list[Node]
    tools: ToolPolicy = Field(default_factory=ToolPolicy)
    schema: type[BaseModel] | None = None
    max_turns: int = 50
    # handlers: on_finished, on_error, on_progress (excluded from serialization)
```

### 3.7.2 Testing and CI

Use PydanticAI's `TestModel` and `FunctionModel` for deterministic response scripts in unit tests.

---

# 4) DSL: JSX v1 and two alternatives

## 4.1 JSX v1 (python-jsx) – canonical API

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

## 4.2 Alternative #1: Typed builder DSL with context managers

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

## 4.3 Alternative #2: Decorator-based "observable classes"

```python
from smithers_py import phase, claude_task

@phase("implement")
def implement(ctx):

    @claude_task(model="sonnet", prompt="Fix failing tests")
    def on_done(result):
        ctx.state.set("phase", "done", trigger="claude.finished")
```

---

# 5) Engineering milestones with verification

## Milestone 0: Repo scaffold + DB schema + CLI skeleton

**Deliverables**
- `smithers_py` package skeleton
- SQLite migrations for executions/state/frames/tasks/events
- CLI: `smithers_py run script.py`

**Verification**
- Unit test: creates db, writes/reads `state_kv`
- Manual: run CLI creates execution row and frame 0

## Milestone 1: Node models + JSX runtime (python-jsx)

**Deliverables**
- Pydantic node classes for If/Each/Text/Fragment
- python-jsx runtime that returns node objects

**Verification**
- Unit: render simple JSX tree → JSON
- Manual: print tree in CLI

## Milestone 2: Engine loop v1 (render/commit/effects) with batching

**Deliverables**
- Render snapshot isolation
- Batched state updates flushed after effect boundary
- Idle stop semantics + task registry

**Verification**
- Unit: three `ctx.state.set` calls in one handler produce one DB transaction
- Manual: simple script toggles state and shows multiple frames

## Milestone 3: Agent node using PydanticAI (with TestModel)

**Deliverables**
- `Claude`-like node that runs PydanticAI agent
- Tools integration scaffold
- Records to `agents` table and NDJSON logs

**Verification**
- CI uses `TestModel`/`FunctionModel` to simulate responses
- Manual: "Hello agent" script runs once and transitions state

## Milestone 4: While/Ralph + Phase/Step progression

**Deliverables**
- While/Ralph persisted iteration
- Phase/Step tables and semantics

**Verification**
- Unit: resume from DB and continue iteration
- Manual: fix-tests loop that stops after condition or maxIterations

## Milestone 5: Logging/monitoring parity

**Deliverables**
- NDJSON stream, summary file, truncation/summarization knobs

**Verification**
- Manual: tail logs and correlate node IDs
- Unit: event writer produces correct summary counts

## Milestone 6: MCP server (stdio + Streamable HTTP)

**Deliverables**
- MCP server core with both transports
- Tools: list executions, subscribe frames, stop/pause

**Verification**
- Unit: JSON-RPC request/response tests
- Manual: `curl`/client connects to Streamable HTTP on localhost
- Security: Origin validation and auth enforced

## Milestone 7: Desktop UI (Zig WebUI + Solid)

**Deliverables**
- Zig app boots UI
- Solid UI shows live plan tree + frames + logs
- Pause/resume/stop controls

**Verification**
- Manual: run a workflow and watch frames stream
- Regression test: recorded run replay

---

# 6) Key design decisions (explicit defaults)

1. **Writes are always queued**; state never changes during render; writes flush at effect/handler boundaries.
2. **Any flushed state change triggers a new frame** (unless stop requested).
3. **Node identity is stable** using key-path hashing; loops require stable IDs.
4. **Agent nodes are resumable** by persisting run history and node status.
5. **MCP transport support**: stdio + Streamable HTTP; secure defaults.
6. **UI is a first-class consumer** of the frame stream, not an afterthought.
