# Smithers-Py PRD and Engineering Design

**Date:** 2026-01-21
**Status:** Draft (implementation-ready)
**Scope:** Python orchestration library + transport-agnostic MCP server + desktop web GUI (Zig + WebUI + Solid.js)

---

## ⚠️ Before Implementation: Review Required Documents

Before working on smithers-py, read these reviews first:

1. **[reviews/20-python-implementation-review.md](../reviews/20-python-implementation-review.md)** - Critical bugs, architecture issues, and prioritized fixes for the current Python implementation
2. **[reviews/10-test-coverage-audit.md](../reviews/10-test-coverage-audit.md)** - Test coverage gaps that also apply to Python port

### P0 Issues to Address First
- Duplicate SqliteStore classes (`state/sqlite.py` vs `db/database.py`)
- Handler plumbing broken (JSX handlers not wired to EventSystem/TickLoop)
- Task exceptions never retrieved
- ClaudeExecutor silent failure when pydantic_ai missing

---

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

## 3.0 Toolchain Requirements

### 3.0.1 Package Manager: uv (Required)

**All development and deployment uses [uv](https://docs.astral.sh/uv/)** - the fast Python package manager from Astral.

**Why uv:**
- 10-100x faster than pip/poetry
- Built-in virtual environment management
- Lockfile support for reproducible builds
- Native PyPI publishing support
- Written in Rust, single binary install

**Required Commands:**

```bash
# Install uv (if not present)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Development setup
cd smithers_py
uv sync                    # Install all deps from lockfile
uv sync --all-extras       # Install with jsx + dev extras

# Running
uv run smithers-py run script.py
uv run pytest              # Run tests

# Adding dependencies
uv add pydantic-ai         # Add to dependencies
uv add --dev pytest        # Add to dev dependencies

# Building & Publishing
uv build                   # Build wheel + sdist
uv publish                 # Publish to PyPI
uv publish --token $PYPI_TOKEN  # With explicit token
```

### 3.0.2 Project Structure for uv

```
smithers_py/
├── pyproject.toml         # Single source of truth (PEP 621)
├── uv.lock                # Lockfile (committed to git)
├── .python-version        # Pin Python version (e.g., "3.12")
├── README.md
├── CHANGELOG.md
├── py.typed               # PEP 561 marker
└── smithers_py/           # Package source
    └── ...
```

### 3.0.3 CI/CD with uv

```yaml
# .github/workflows/ci.yml
- uses: astral-sh/setup-uv@v4
  with:
    version: "latest"
- run: uv sync --all-extras
- run: uv run pytest
- run: uv run ruff check .
- run: uv run mypy .

# Publishing (on release tag)
- run: uv build
- run: uv publish --token ${{ secrets.PYPI_TOKEN }}
```

### 3.0.4 Version Management

- Version in `pyproject.toml` is the single source of truth
- Use `uv version` to bump (or manual edit)
- Tag releases: `git tag v1.0.0 && git push --tags`
- CI publishes on tag push

---

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

## Testing Philosophy

**All milestones require extensive end-to-end (E2E) tests** in addition to unit tests. E2E tests should:

1. **Test complete workflows** - from script execution through state changes to final output
2. **Use real (or TestModel) agent execution** - verify the full tick loop with actual node mounting/unmounting
3. **Verify crash recovery** - kill process mid-execution, restart, confirm resumption
4. **Test MCP integration** - client connects, subscribes, receives frames, sends commands
5. **Cover edge cases** - rate limits, network failures, concurrent operations, frame storms

E2E tests live in `smithers_py/e2e/` and use pytest fixtures that spin up real databases and executors.

---

## Observability & Debugging Requirements

**Every component must be observable and debuggable.** When something goes wrong, operators must be able to answer "what happened?" within 30 seconds.

### Required Observability Features

1. **Structured Logging**
   - All events emit structured NDJSON with `timestamp`, `level`, `component`, `execution_id`, `node_id`
   - Log levels: `debug`, `info`, `warn`, `error`, `fatal`
   - Correlation IDs propagate through async boundaries

2. **State Introspection**
   - `smithers-py db state <execution_id>` - dump current state snapshot
   - `smithers-py db transitions <execution_id>` - show state change history with triggers
   - `smithers-py db frames <execution_id>` - list frames with plan tree diffs

3. **Execution Tracing**
   - Every frame records: trigger reason, nodes mounted/unmounted, state keys read/written
   - Agent runs record: prompt, model, tokens, duration, tool calls, output
   - Tool calls record: name, input, output, duration, errors

4. **Debug Mode**
   - `SMITHERS_DEBUG=1` enables verbose logging (all phases, all state reads)
   - `SMITHERS_TRACE=1` enables frame-by-frame plan tree dumps
   - `--dry-run` validates plan without executing agents

5. **Error Context**
   - Exceptions include: node_id, frame_id, execution_id, last 3 state changes
   - Stack traces map back to user script line numbers (source maps for .px files)
   - Retryable vs non-retryable errors clearly distinguished

6. **Time-Travel Debugging**
   - Any frame can be inspected: plan tree, state snapshot, events
   - Fork-from-frame creates new execution with historical state
   - Replay mode re-executes with recorded agent responses

### CLI Debug Commands

```bash
# Inspect execution state
smithers-py db state <exec-id>
smithers-py db transitions <exec-id> --last 20
smithers-py db frames <exec-id> --from 5 --to 10

# Live tail logs
smithers-py logs <exec-id> --follow --level debug

# Dump execution for offline analysis
smithers-py export <exec-id> --output bundle.zip

# Replay execution without model calls
smithers-py replay bundle.zip --verify-determinism
```

### Metrics (Future)

- Frame rate, frame duration histogram
- Agent latency by model
- Token usage by execution/phase
- Error rate by type
- Queue depth for pending tasks

```python
# Example E2E test structure
@pytest.fixture
def execution_harness():
    """Full execution environment with DB, tick loop, and MCP server."""
    db = create_smithers_db(":memory:")
    yield ExecutionHarness(db)
    db.close()

async def test_multi_phase_workflow_with_crash_recovery(execution_harness):
    """E2E: Run 3-phase workflow, crash at phase 2, resume, verify completion."""
    # Start execution
    exec_id = await execution_harness.start("multi_phase.py")
    
    # Wait for phase 2
    await execution_harness.wait_for_state("phase", "implement")
    
    # Simulate crash
    execution_harness.force_kill()
    
    # Resume
    await execution_harness.resume(exec_id)
    
    # Verify completion
    assert await execution_harness.wait_for_status("completed")
    assert execution_harness.db.state.get("phase") == "done"
```

---

## Milestone 0: Repo scaffold + DB schema + CLI skeleton

**Deliverables**
- `smithers_py` package skeleton
- SQLite migrations for executions/state/frames/tasks/events
- CLI: `smithers_py run script.py`

**Verification**
- Unit test: creates db, writes/reads `state_kv`
- Manual: run CLI creates execution row and frame 0
- **E2E: CLI executes minimal script, produces correct DB state, exits cleanly**

## Milestone 1: Node models + JSX runtime (python-jsx)

**Deliverables**
- Pydantic node classes for If/Each/Text/Fragment
- python-jsx runtime that returns node objects

**Verification**
- Unit: render simple JSX tree → JSON
- Manual: print tree in CLI
- **E2E: Complex nested tree with conditionals renders correctly across multiple frames**

## Milestone 2: Engine loop v1 (render/commit/effects) with batching

**Deliverables**
- Render snapshot isolation
- Batched state updates flushed after effect boundary
- Idle stop semantics + task registry

**Verification**
- Unit: three `ctx.state.set` calls in one handler produce one DB transaction
- Manual: simple script toggles state and shows multiple frames
- **E2E: Multi-step workflow with state dependencies executes in correct order**
- **E2E: Frame storm prevention triggers and halts runaway execution**
- **E2E: Quiescence detection stops loop when no work remains**

## Milestone 3: Agent node using PydanticAI (with TestModel)

**Deliverables**
- `Claude`-like node that runs PydanticAI agent
- Tools integration scaffold
- Records to `agents` table and NDJSON logs

**Verification**
- CI uses `TestModel`/`FunctionModel` to simulate responses
- Manual: "Hello agent" script runs once and transitions state
- **E2E: Agent executes, streams tokens, calls tools, persists result**
- **E2E: Agent failure triggers on_error handler, state updates correctly**
- **E2E: Rate limit simulation with backoff and retry**

## Milestone 4: While/Ralph + Phase/Step progression

**Deliverables**
- While/Ralph persisted iteration
- Phase/Step tables and semantics

**Verification**
- Unit: resume from DB and continue iteration
- Manual: fix-tests loop that stops after condition or maxIterations
- **E2E: While loop runs 5 iterations, crash at iteration 3, resume continues from 3**
- **E2E: Phase progression with nested steps and parallel agents**
- **E2E: Max iterations limit enforced, loop terminates gracefully**

## Milestone 5: Logging/monitoring parity

**Deliverables**
- NDJSON stream, summary file, truncation/summarization knobs

**Verification**
- Manual: tail logs and correlate node IDs
- Unit: event writer produces correct summary counts
- **E2E: Full execution produces parseable NDJSON with all event types**
- **E2E: Log truncation at threshold produces valid summary**

## Milestone 6: MCP server (stdio + Streamable HTTP)

**Deliverables**
- MCP server core with both transports
- Tools: list executions, subscribe frames, stop/pause

**Verification**
- Unit: JSON-RPC request/response tests
- Manual: `curl`/client connects to Streamable HTTP on localhost
- Security: Origin validation and auth enforced
- **E2E: Client subscribes, execution runs, client receives all frame events**
- **E2E: Client sends pause command, execution halts, resume continues**
- **E2E: Reconnection with Last-Event-ID replays missed events**
- **E2E: Invalid origin rejected, invalid auth rejected**

## Milestone 7: Desktop UI (Zig WebUI + Solid)

**Deliverables**
- Zig app boots UI
- Solid UI shows live plan tree + frames + logs
- Pause/resume/stop controls

**Verification**
- Manual: run a workflow and watch frames stream
- Regression test: recorded run replay
- **E2E: Zig app launches, connects to MCP, displays live execution**
- **E2E: UI controls (pause/resume/stop) affect running execution**

## Milestone 8: Harness UI (Production-Grade)

**Deliverables**
- Full navigation: Dashboard, Executions, Run, Approvals, Artifacts, Settings
- Execution detail page with 3-pane layout (Plan Tree / Timeline+Frame / Inspector)
- Operator actions: pause/resume/stop/terminate/retry/rerun-from-node/fork-from-frame
- State editing with audit trail
- Failure views with repeated-failure detection
- Saved views for execution filtering

**Verification**
- Manual: full operator workflow (start → monitor → intervene → complete)
- Artifact display: markdown, tables, progress bars render correctly
- Approval queue: file edit approval with diff viewer
- Export/replay: download execution bundle, replay without model calls
- **E2E: Fork-from-frame creates new execution with correct state snapshot**
- **E2E: Retry-node re-executes failed agent with same signature**
- **E2E: State edit via UI triggers re-render and audit log entry**

## Milestone 9: Artifacts System

**Deliverables**
- ArtifactSystem API: markdown, table, progress, link, image
- Key vs keyless artifact semantics
- Database schema with partial unique constraint
- MCP resource for artifacts
- UI rendering in execution detail and global artifacts page

**Verification**
- Unit: artifact CRUD operations
- Integration: agent creates progress artifact, updates in-place
- UI: artifacts display correctly with live updates
- **E2E: Agent creates keyed progress artifact, updates 10x, UI shows latest**
- **E2E: Keyless artifacts append correctly, history preserved**
- **E2E: Image artifact with data URL displays in UI**

---

# 6) Key design decisions (explicit defaults)

1. **Writes are always queued**; state never changes during render; writes flush at effect/handler boundaries.
2. **Any flushed state change triggers a new frame** (unless stop requested).
3. **Node identity is stable** using key-path hashing; loops require stable IDs.
4. **Agent nodes are resumable** by persisting run history and node status.
5. **MCP transport support**: stdio + Streamable HTTP; secure defaults.
6. **UI is a first-class consumer** of the frame stream, not an afterthought.

---

# 7) Hardening Specifications (Production Robustness)

This section codifies the detailed requirements for making the system reliable in production. These specifications close the gap between "works" and "works reliably."

## 7.1 Frame & Scheduling Specification

### 7.1.1 Strict Frame Phases

Each frame executes in **7 sequential phases**. Violations are runtime errors.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: STATE SNAPSHOT                                             │
│   - Freeze: db_state, v_state, tasks table, frame_clock            │
│   - Immutable for duration of frame                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 2: RENDER (pure)                                              │
│   - Execute components → Plan Tree (Pydantic nodes)                 │
│   - NO side effects allowed (no DB writes, no task starts)          │
│   - Track dependency reads for invalidation                         │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 3: RECONCILE                                                  │
│   - Diff Plan Tree vs previous frame by stable node_id              │
│   - Categorize: newly_mounted, still_running, unmounted             │
│   - Unmounted running nodes: send cancel signal                     │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 4: COMMIT                                                     │
│   - Persist frame (plan + statuses) to SQLite                       │
│   - Single atomic transaction                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 5: EXECUTE                                                    │
│   - Start tasks for newly_mounted runnable nodes                    │
│   - Update tasks table immediately as tasks start                   │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 6: POST-COMMIT EFFECTS                                        │
│   - Run effects whose deps changed since last frame                 │
│   - Effects may enqueue state updates (queued, not applied)         │
├─────────────────────────────────────────────────────────────────────┤
│ Phase 7: STATE UPDATE FLUSH                                         │
│   - Apply all queued updates as ONE atomic transaction              │
│   - Schedule next frame if anything changed                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.1.2 Render Purity Enforcement

During Phase 2 (Render), the following are **errors**:
- `ctx.state.set()` → raises `RenderPhaseWriteError`
- `ctx.db.execute()` (write) → raises `RenderPhaseWriteError`
- Starting async tasks → raises `RenderPhaseTaskError`

**Allowed**: `ctx.state.get()`, `ctx.v.get()`, pure computations.

### 7.1.3 Frame Coalescing (Throttling)

To prevent frame explosion during streaming/events:

```python
class FrameScheduler:
    min_frame_interval_ms: int = 250  # configurable
    immediate_triggers: set = {"task_finished", "state_flush", "stop_requested"}

    def should_render(self, event_type: str, last_frame_time: float) -> bool:
        if event_type in self.immediate_triggers:
            return True
        return (now() - last_frame_time) >= self.min_frame_interval_ms
```

**Frame triggers:**
- task started → coalesced (throttled)
- task progressed (stream chunk) → coalesced
- task finished → **immediate**
- state flush → **immediate**
- explicit timer tick → coalesced
- stop requested → **immediate**

---

## 7.2 Node Identity & Reconciliation Specification

### 7.2.1 Identity Algorithm

```python
def compute_node_id(parent_id: str | None, key_or_index: str | int, node_type: str) -> str:
    """
    Priority:
    1. Explicit `id` prop on node (highest precedence)
    2. Deterministic path: parent_id + "/" + (key or index) + ":" + node_type
    """
    if node.props.get("id"):
        return node.props["id"]

    path = f"{parent_id or 'root'}/{key_or_index}:{node_type}"
    return hashlib.sha256(path.encode()).hexdigest()[:16]
```

### 7.2.2 List Rendering Keys

For `<Each>` components, **explicit keys are required**:

```python
# ❌ WRONG - will remount on reorder
<Each items={tasks}>
    {task => <Claude prompt={task.prompt} />}
</Each>

# ✅ CORRECT - stable identity
<Each items={tasks}>
    {task => <Claude key={task.id} prompt={task.prompt} />}
</Each>
```

### 7.2.3 Reconciliation Result

```python
@dataclass
class ReconcileResult:
    newly_mounted: list[NodeId]      # should start execution
    still_running: list[NodeId]      # no restart
    unmounted: list[NodeId]          # send cancel, ignore results
    stale_results: list[TaskId]      # completed but node gone
```

### 7.2.4 Stale Result Handling

When a task completes but its node is no longer in the plan tree:
- Record completion in DB (for audit)
- **DO NOT** fire `on_finished` handler
- Log warning: `"Stale result for node {node_id}, task {task_id}"`

### 7.2.5 Resume Identity Validation

On execution resume, validate:

```python
@dataclass
class ResumeContext:
    script_hash: str          # SHA256 of script file
    git_commit: str | None    # If in git repo
    engine_version: str       # e.g., "0.1.0"
    schema_version: int       # DB schema version

def validate_resume(saved: ResumeContext, current: ResumeContext) -> list[Warning]:
    warnings = []
    if saved.script_hash != current.script_hash:
        warnings.append(Warning("Script changed since last run - identity may not match"))
    if saved.engine_version != current.engine_version:
        warnings.append(Warning(f"Engine version mismatch: {saved} vs {current}"))
    return warnings
```

---

## 7.3 Task Lifecycle Specification

### 7.3.1 Task Table Schema (Extended)

```sql
CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL,  -- pending|running|done|error|cancelled|orphaned

    -- Lease management (for crash safety)
    lease_owner TEXT,           -- process ID owning this task
    lease_expires_at TIMESTAMP, -- when lease expires
    heartbeat_at TIMESTAMP,     -- last heartbeat

    -- Retry management
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    last_error_json TEXT,

    -- Timing
    started_at TIMESTAMP,
    ended_at TIMESTAMP,

    FOREIGN KEY (execution_id) REFERENCES executions(id)
);
```

### 7.3.2 Lease Protocol

```python
class TaskLeaseManager:
    lease_duration_ms: int = 30_000  # 30 seconds
    heartbeat_interval_ms: int = 10_000  # 10 seconds

    async def acquire_lease(self, task_id: str) -> bool:
        """Attempt to acquire lease. Returns False if already leased."""

    async def heartbeat(self, task_id: str) -> None:
        """Extend lease. Called periodically during execution."""

    async def release_lease(self, task_id: str) -> None:
        """Release lease on completion."""
```

### 7.3.3 Orphan Recovery (On Startup)

```python
async def recover_orphans(db: SmithersDB, policy: OrphanPolicy) -> list[TaskAction]:
    """Called on engine startup to handle tasks from crashed processes."""

    orphans = db.query("""
        SELECT * FROM tasks
        WHERE status = 'running'
        AND lease_expires_at < ?
    """, [now()])

    actions = []
    for task in orphans:
        if policy.should_retry(task):
            actions.append(RetryTask(task.task_id))
            db.update_task(task.task_id, status="pending", retry_count=task.retry_count + 1)
        else:
            actions.append(MarkFailed(task.task_id))
            db.update_task(task.task_id, status="orphaned")

    return actions
```

### 7.3.4 Cancellation Semantics

When a node disappears from the plan tree:

```python
class CancellationHandler:
    async def cancel_task(self, task_id: str) -> None:
        """
        1. Set status to 'cancelling'
        2. Send cancel signal to executor
        3. If task completes anyway:
           - Record completion (for audit)
           - Do NOT fire event handlers (node is gone)
           - Set status to 'cancelled'
        """
```

---

## 7.4 State Model Specification

### 7.4.1 State Actions

All state modifications are **actions** queued during a frame:

```python
@dataclass
class StateAction:
    key: str
    action_type: Literal["set", "delete", "update"]
    value: Any | None = None
    reducer: Callable[[Any], Any] | None = None  # For "update" type
    trigger: str | None = None
    frame_id: int = 0
    task_id: str | None = None
    action_index: int = 0  # For ordering

# Deterministic ordering for flush:
# sorted by (frame_id, task_id, action_index)
```

### 7.4.2 Conflict Resolution

When multiple actions target the same key in one flush:

```python
def resolve_conflicts(actions: list[StateAction]) -> StateAction:
    """
    Apply in order. Last write wins for 'set'.
    'update' runs reducer against latest value.
    """
    current = db.state.get(actions[0].key)
    for action in sorted(actions, key=lambda a: (a.frame_id, a.task_id, a.action_index)):
        if action.action_type == "set":
            current = action.value
        elif action.action_type == "delete":
            current = None
        elif action.action_type == "update":
            current = action.reducer(current)
    return current
```

### 7.4.3 Transition Audit Log

Every state change is logged:

```sql
CREATE TABLE transitions (
    id INTEGER PRIMARY KEY,
    execution_id TEXT NOT NULL,
    key TEXT NOT NULL,
    old_value_json TEXT,
    new_value_json TEXT,
    trigger TEXT,           -- e.g., "claude.finished", "user.set"
    node_id TEXT,
    frame_id INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7.4.4 Reactive Reads (v1 Strategy)

**Level 1 (MVP)**: Key-based invalidation only.

```python
class DependencyTracker:
    def __init__(self):
        self.current_frame_deps: set[str] = set()

    def track_read(self, key: str) -> None:
        """Called when ctx.state.get(key) is invoked during render."""
        self.current_frame_deps.add(key)

    def should_rerender(self, changed_keys: set[str]) -> bool:
        return bool(self.current_frame_deps & changed_keys)
```

For raw SQL queries, require explicit invalidation hints:
```python
# Explicit invalidation for complex queries
result = ctx.db.query("SELECT ...", invalidate_on=["tasks", "agents"])
```

---

## 7.5 Effects Specification

### 7.5.1 EffectNode (First-Class Observable)

Effects are **visible in the plan tree**, not hidden callbacks:

```python
class EffectNode(BaseNode):
    type: Literal["effect"] = "effect"
    id: str                          # REQUIRED for identity
    deps: list[Any]                  # Dependency values
    run: Callable[[], None]          # Effect function (excluded from serialization)
    cleanup: Callable[[], None] | None = None
    phase: Literal["post_commit"] = "post_commit"

    class Config:
        arbitrary_types_allowed = True
```

### 7.5.2 Effect Registry

```python
class EffectRegistry:
    def __init__(self):
        self.previous_deps: dict[str, list[Any]] = {}
        self.cleanups: dict[str, Callable] = {}
        self.run_count_this_frame: dict[str, int] = {}
        self.max_runs_per_frame: int = 10  # Prevent infinite loops

    def should_run(self, effect_id: str, current_deps: list[Any]) -> bool:
        prev = self.previous_deps.get(effect_id)
        if prev is None:
            return True  # First run
        return not self._deps_equal(prev, current_deps)

    def _deps_equal(self, a: list[Any], b: list[Any]) -> bool:
        """Use stable JSON canonicalization for comparison."""
        return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
```

### 7.5.3 Effect Loop Detection

```python
class EffectLoopDetector:
    def __init__(self, threshold: int = 3):
        self.history: deque[tuple[str, list[Any]]] = deque(maxlen=10)
        self.threshold = threshold

    def check(self, effect_id: str, deps: list[Any]) -> bool:
        """Returns True if likely in an infinite loop."""
        signature = (effect_id, json.dumps(deps, sort_keys=True))
        count = sum(1 for s in self.history if s == signature)
        self.history.append(signature)

        if count >= self.threshold:
            raise EffectLoopError(
                f"Effect {effect_id} triggered {count} times with same deps. "
                "Possible infinite loop."
            )
```

### 7.5.4 Strict Effects Mode (Dev/Test)

Optional mode that double-invokes effects to catch non-idempotent code:

```python
if config.strict_effects:
    # Run setup twice
    effect.run()
    if effect.cleanup:
        effect.cleanup()
    effect.run()
```

---

## 7.6 Retry & Rate Limit Specification

### 7.6.1 Error Classification

```python
class ErrorClassifier:
    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
    RETRYABLE_EXCEPTIONS = (TimeoutError, ConnectionError)

    def classify(self, error: Exception) -> ErrorClass:
        if isinstance(error, httpx.HTTPStatusError):
            if error.response.status_code in self.RETRYABLE_STATUS_CODES:
                return ErrorClass.RETRYABLE
            return ErrorClass.NON_RETRYABLE
        if isinstance(error, self.RETRYABLE_EXCEPTIONS):
            return ErrorClass.RETRYABLE
        return ErrorClass.NON_RETRYABLE
```

### 7.6.2 Global Rate Limit Coordinator

Prevents retry amplification when multiple agents hit limits:

```python
class RateLimitCoordinator:
    def __init__(self):
        self.backoff_windows: dict[str, BackoffWindow] = {}  # keyed by provider/model
        self.global_concurrency: Semaphore = Semaphore(10)

    async def acquire(self, provider: str, model: str) -> None:
        """Wait for rate limit window and acquire slot."""
        key = f"{provider}:{model}"
        if key in self.backoff_windows:
            await self.backoff_windows[key].wait()
        await self.global_concurrency.acquire()

    def report_rate_limit(self, provider: str, model: str, retry_after: float) -> None:
        """Called when 429 received. Sets backoff for all requests to this endpoint."""
        key = f"{provider}:{model}"
        self.backoff_windows[key] = BackoffWindow(
            until=now() + retry_after,
            jitter=random.uniform(0, retry_after * 0.1)
        )
```

### 7.6.3 Persisted Retry State

```sql
-- Part of tasks table (see 7.3.1)
retry_count INTEGER DEFAULT 0,
max_retries INTEGER DEFAULT 3,
next_retry_at TIMESTAMP,
last_error_json TEXT,
backoff_ms INTEGER DEFAULT 1000,
```

### 7.6.4 Global Stop Conditions

```python
@dataclass
class StopConditions:
    max_wall_clock_ms: int | None = None
    max_total_tokens: int | None = None
    max_tool_calls: int | None = None
    max_retries_per_task: int = 3
    max_cost_usd: float | None = None
    stop_requested: bool = False  # UI can toggle
```

---

## 7.7 Streaming Storage Specification

### 7.7.1 Stream Events Table

Streaming tokens stored separately from frames (prevents frame explosion):

```sql
CREATE TABLE agent_stream_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    kind TEXT NOT NULL,  -- 'token', 'tool_start', 'tool_end', 'thinking'
    payload_json TEXT,

    FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

CREATE INDEX idx_stream_events_task ON agent_stream_events(task_id, timestamp);
```

### 7.7.2 Streaming Protocol

```python
async def stream_agent_output(task_id: str, stream: AsyncIterator[StreamEvent]) -> None:
    """Write stream events to DB as they arrive."""
    async for event in stream:
        db.execute("""
            INSERT INTO agent_stream_events (task_id, kind, payload_json)
            VALUES (?, ?, ?)
        """, [task_id, event.kind, json.dumps(event.payload)])

        # UI can tail this table for live updates
```

### 7.7.3 Node Status During Streaming

```python
class StreamingNodeStatus:
    status: Literal["running"]
    last_token_at: datetime
    partial_text: str  # Last N characters for preview
    tokens_received: int
```

---

## 7.8 MCP Server Specification

### 7.8.1 Transport Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         McpCore                                     │
│   handle(json_rpc_msg) -> list[Response | Event]                   │
│   - Composes resources and tools                                    │
│   - Session management                                              │
├─────────────────────────────────────────────────────────────────────┤
│                    Transport Adapters                               │
│  ┌─────────────────────┐    ┌─────────────────────┐                │
│  │   StdioTransport    │    │   HttpTransport     │                │
│  │   - NDJSON on stdio │    │   - Streamable HTTP │                │
│  │   - For CLI         │    │   - localhost only  │                │
│  └─────────────────────┘    │   - Origin validate │                │
│                              │   - Auth required   │                │
│                              └─────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.8.2 Security Requirements (HTTP Transport)

```python
class HttpTransportSecurity:
    # MUST bind to localhost only
    bind_address: str = "127.0.0.1"

    # MUST validate Origin header
    allowed_origins: list[str] = ["http://localhost:*", "http://127.0.0.1:*"]

    # Auth: random bearer token printed at startup
    auth_token: str = secrets.token_urlsafe(32)

    def validate_request(self, request: Request) -> bool:
        # Check Origin header
        origin = request.headers.get("Origin")
        if origin and not self._origin_allowed(origin):
            raise SecurityError(f"Origin {origin} not allowed")

        # Check auth token
        auth = request.headers.get("Authorization")
        if auth != f"Bearer {self.auth_token}":
            raise AuthError("Invalid or missing auth token")

        return True
```

### 7.8.3 Session Management

```python
@dataclass
class McpSession:
    session_id: str
    created_at: datetime
    last_seen_at: datetime
    event_cursor: int  # For resuming event streams

class SessionManager:
    sessions: dict[str, McpSession] = {}
    session_timeout_ms: int = 300_000  # 5 minutes

    def get_or_create(self, session_id: str | None) -> McpSession:
        """Get existing session or create new one."""
```

### 7.8.4 Backpressure

```python
class EventBuffer:
    max_size: int = 1000
    drop_policy: Literal["oldest", "newest"] = "oldest"

    def push(self, event: Event) -> None:
        if len(self.buffer) >= self.max_size:
            if self.drop_policy == "oldest":
                self.buffer.popleft()
            else:
                return  # Drop newest
        self.buffer.append(event)
```

---

## 7.9 Framework Constraints (Auditability)

### 7.9.1 No Hidden State

```python
# Runtime warning for workflow-critical state in locals
@component
def MyComponent(ctx):
    phase = "init"  # WARNING: Local state won't persist across restarts

    # Use ctx.state instead:
    phase = ctx.state.get("phase") or "init"
```

### 7.9.2 Explicit Phase Transitions

```python
# Encouraged pattern: explicit trigger annotation
ctx.state.set("phase", "implement", trigger="claude.finished")

# Transition logged as:
# {key: "phase", old: "research", new: "implement", trigger: "claude.finished", node_id: "...", frame_id: 42}
```

### 7.9.3 Plan Linting Rules

```python
class PlanLinter:
    rules = [
        # Every runnable node should have explicit id
        Rule("runnable-needs-id",
             check=lambda n: n.is_runnable and not n.props.get("id"),
             severity="warning",
             message="Runnable node {node_type} at {path} lacks explicit id"),

        # Every list item needs key
        Rule("list-needs-key",
             check=lambda n: n.parent_type == "each" and not n.props.get("key"),
             severity="warning",
             message="List item at {path} lacks key - may cause remounts"),

        # While/Ralph must have max_iterations
        Rule("loop-needs-max",
             check=lambda n: n.type in ("while", "ralph") and not n.props.get("max_iterations"),
             severity="warning",
             message="Loop at {path} lacks max_iterations"),

        # ClaudeNode should specify max_turns
        Rule("agent-needs-max-turns",
             check=lambda n: n.type == "claude" and not n.props.get("max_turns"),
             severity="info",
             message="Agent at {path} using default max_turns"),
    ]
```

### 7.9.4 Deterministic Randomness/Time

```python
class DeterministicContext:
    def __init__(self, frame_id: int, seed: int | None = None):
        self._frame_id = frame_id
        self._rng = random.Random(seed or frame_id)
        self._frame_time = datetime.now()  # Frozen for frame duration

    def now(self) -> datetime:
        """Returns frozen time for this frame."""
        return self._frame_time

    def rand(self) -> float:
        """Deterministic random based on frame seed."""
        return self._rng.random()
```

---

## 7.10 JSX in Python: Operational Details

### 7.10.1 File Extension Convention

- Use `.px` extension for Smithers plan files
- Clear signal that file contains Python JSX

### 7.10.2 CLI Integration

```bash
# Auto-registers import hook for .px files
smithers_py run script.px

# Equivalent to:
python -c "import pyjsx.auto_setup" && python script.px
```

### 7.10.3 Source Map Support

```python
class SourceMapper:
    def __init__(self, px_file: str):
        self.mappings: dict[int, int] = {}  # transpiled_line -> original_line

    def map_traceback(self, tb: traceback) -> traceback:
        """Map transpiled line numbers back to .px source."""
```

---

## 7.11 VCS/Worktree Integration

### 7.11.1 Workspace Abstraction

```python
@dataclass
class Workspace:
    base_repo_path: Path
    execution_worktree: Path  # Isolated per-execution
    vcs_type: Literal["git", "jj", "none"]

    async def snapshot(self, message: str) -> str:
        """Create snapshot/commit. Returns ref."""

    async def rollback(self, ref: str) -> None:
        """Rollback to snapshot."""

    async def diff(self, from_ref: str, to_ref: str) -> str:
        """Get diff between refs."""
```

### 7.11.2 Graceful Degradation

```python
class VCSOperations:
    def __init__(self, workspace: Workspace):
        self.workspace = workspace
        self.available = self._check_availability()

    def _check_availability(self) -> bool:
        """Return False if VCS not available (no git/jj installed)."""

    async def snapshot(self, message: str) -> str | None:
        if not self.available:
            logger.warning("VCS not available, skipping snapshot")
            return None
        return await self.workspace.snapshot(message)
```

---

## 7.12 Zig-WebUI Architecture Decision

**Chosen: Option A - Zig launches browser + embeds HTTP server**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Zig WebUI App                                │
│  1. Spawns Python MCP server (child process)                        │
│  2. Captures auth token from stdout                                 │
│  3. Opens webview with Solid.js app                                 │
│  4. Passes auth token via query param / localStorage                │
├─────────────────────────────────────────────────────────────────────┤
│                     Python MCP Server                               │
│  - Serves Solid.js static assets                                    │
│  - Provides MCP Streamable HTTP endpoint                            │
│  - Single port for both                                             │
├─────────────────────────────────────────────────────────────────────┤
│                      Solid.js Frontend                              │
│  - Connects to MCP endpoint with auth token                         │
│  - Streams frames/events via SSE                                    │
│  - Sends commands via JSON-RPC                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Auth Token Handoff:**
```python
# Python prints token on startup
print(f"AUTH_TOKEN={auth_token}", file=sys.stderr)

# Zig captures and passes to webview
webui.eval(f"window.SMITHERS_AUTH_TOKEN = '{auth_token}';")
```

---

## 7.13 Revised Design Decisions Summary

Based on this hardening review, the following decisions are **revised** or **added**:

1. **Effects are first-class observable nodes** (EffectNode), not hidden callbacks
2. **Task leases + orphan handling** from day one (crash safety)
3. **Frame coalescing with throttling** (250ms default, immediate for task completion)
4. **Render purity enforced** at runtime (errors on writes during render)
5. **Node identity explicit and stable** with linter warnings
6. **Retries as coordinated subsystem** (global rate limit coordinator)
7. **Streaming stored separately** from frames (agent_stream_events table)
8. **MCP security enforced** (Origin validation, localhost bind, auth token)
9. **Stale result handling** (no event handlers for unmounted nodes)

---

# 8) Design Review Addendum (Robustness Polish)

This section addresses additional design review feedback to close remaining gaps between demo and production-ready.

## 8.1 Phase Naming Clarification

To prevent semantic drift, use unambiguous phase names:

```
1. render(snapshot) -> plan
2. persist_frame(plan, snapshot_metadata)    # always happens
3. reconcile_instances(plan)                 # mount/unmount bookkeeping
4. execute_runnables(plan)                   # side effects; may queue actions
5. commit_actions()                          # the ONLY place state changes become visible
6. run_effects()                             # post-commit
7. commit_actions()                          # optional second flush
```

## 8.2 Deterministic Node IDs (CRITICAL)

**Python's `hash()` MUST NOT be used** - it is salted per-process and not stable between runs.

```python
import hashlib

def compute_node_id(parent_id: str | None, key_or_index: str | int, node_type: str) -> str:
    """Deterministic SHA256-based node identity."""
    path = f"{parent_id or 'root'}/{key_or_index}:{node_type}"
    return hashlib.sha256(path.encode('utf-8')).hexdigest()[:12]
```

Include **component boundary + key** in identity. For loops, require explicit keys and error if missing.

## 8.3 Runtime Event Validation

At JSX runtime, validate event props and raise clear errors:

```python
class EventValidationError(SmithersError):
    def __init__(self, node_type: str, prop_name: str, source_location: str | None = None):
        msg = f"Event prop '{prop_name}' not allowed on non-observable node type '{node_type}'"
        if source_location:
            msg += f" at {source_location}"
        super().__init__(msg)

# In jsx_runtime.py
if prop_name.startswith('on') and prop_name[2].isupper():
    if node_type not in OBSERVABLE_NODE_TYPES:
        raise EventValidationError(node_type, prop_name)
```

## 8.4 State Write Rules

**Default: Disallow `ctx.state.set()` during render.**

```python
class RenderPhaseWriteError(SmithersError):
    """Raised when state.set() called during render phase."""
    message = "Cannot call ctx.state.set() during render. Use Effect or event handler."

# Escape hatch for initialization only:
ctx.state.init(key, value)  # Sets only if missing, queued for post-frame commit
```

## 8.5 Handler Atomicity

Treat handler execution as a transaction:

```python
@dataclass
class HandlerTransaction:
    actions: list[StateAction] = field(default_factory=list)

    def commit(self) -> None:
        """Merge into global pending actions."""
        global_pending_actions.extend(self.actions)

    def rollback(self) -> None:
        """Discard all queued actions on error."""
        self.actions.clear()

# Usage in event handler execution:
try:
    handler_tx = HandlerTransaction()
    ctx.set_transaction(handler_tx)
    handler(result)
    handler_tx.commit()
except Exception as e:
    handler_tx.rollback()
    node.mark_error(e)
    log.exception("Handler failed", node_id=node.id)
```

## 8.6 Volatile State Configuration

```python
@dataclass
class VolatileStateConfig:
    persist_volatile_snapshots: bool = False  # Default off
    dev_mode: bool = False  # In dev, default to True for debugging

# Enable time-travel debugging even with volatile state
if config.persist_volatile_snapshots:
    db.frames.save_volatile_diff(frame_id, volatile_diff)
```

## 8.7 Loop Detection and Frame Storm Prevention

```python
@dataclass
class FrameStormGuard:
    max_frames_per_second: int = 10
    max_frames_per_run: int = 1000
    max_frames_per_minute: int = 200

    def check_loop(self, plan_hash: str, state_hash: str) -> bool:
        """Detect infinite loop: same plan + state repeating."""
        signature = (plan_hash, state_hash)
        if signature in self.recent_signatures:
            return True  # Loop detected
        self.recent_signatures.append(signature)
        return False

# On loop detection:
if frame_storm_guard.check_loop(plan_hash, state_hash):
    execution.status = "stalled(loop_detected)"
    notify_ui("Loop detected - execution paused")
```

## 8.8 Deterministic Write Ordering

```python
def flush_pending_actions(actions: list[StateAction]) -> None:
    """Apply actions in deterministic order: (frame_id, node_id, action_index)."""
    sorted_actions = sorted(actions, key=lambda a: (a.frame_id, a.node_id, a.action_index))

    for action in sorted_actions:
        if action.action_type == "set":
            db.state.apply_set(action)
        elif action.action_type == "update":
            # Read current value, apply reducer, write result
            current = db.state.get(action.key)
            new_value = action.reducer(current)
            db.state.apply_set(StateAction(key=action.key, value=new_value))
```

## 8.9 Runnable Node Lifecycle States

```python
class NodeLifecycleState(str, Enum):
    IDLE = "idle"           # Never started
    SCHEDULED = "scheduled" # Queued for execution
    RUNNING = "running"     # Currently executing
    SUCCEEDED = "succeeded" # Completed successfully
    FAILED = "failed"       # Completed with error
    BLOCKED = "blocked"     # Waiting (rate limit, approval, dependency)
    CANCELED = "canceled"   # Explicitly canceled
    ABANDONED = "abandoned" # Lost due to crash/lease expiry

# Unmount policy
if node_unmounted_while_running:
    try:
        cancel_task(node.task_id)
        node.status = NodeLifecycleState.CANCELED
    except CancelNotSupported:
        node.status = NodeLifecycleState.ABANDONED
```

## 8.10 Agent Execution Signature

```python
def compute_execution_signature(node: LLMNode) -> str:
    """Deterministic hash for restart detection."""
    components = [
        node.model,
        node.prompt,
        json.dumps(node.tools_policy, sort_keys=True),
        json.dumps(node.schema, sort_keys=True) if node.schema else "",
        str(node.max_turns),
        HISTORY_POLICY_VERSION,
        ENV_FINGERPRINT,
    ]
    return hashlib.sha256("|".join(components).encode()).hexdigest()[:16]
```

## 8.11 SQLite Operational Defaults

```python
def init_database(path: str) -> Database:
    db = sqlite3.connect(path)

    # Required for reliability
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    db.execute("PRAGMA synchronous=NORMAL")

    # Required indexes
    db.execute("CREATE INDEX IF NOT EXISTS idx_frames_exec ON frames(execution_id, frame_index)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_exec ON tasks(execution_id, status)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_events_exec ON events(execution_id, timestamp)")

    return db
```

## 8.12 File System Debouncing

```python
class FileWatcher:
    debounce_ms: int = 300
    ignore_patterns: list[str] = [
        "node_modules/**", ".git/**", "dist/**", "__pycache__/**", "*.pyc"
    ]

    def on_file_change(self, path: str) -> None:
        if self._matches_ignore(path):
            return

        # Debounce: schedule tick, cancel previous pending
        self._cancel_pending_tick()
        self._schedule_tick(delay_ms=self.debounce_ms)
```

## 8.13 Approval Mechanism (Claude Code-style)

```python
class ApprovalRequest:
    kind: Literal["file_edit", "command_exec", "external_api"]
    payload: dict  # Diff, command, etc.
    node_id: str

class ApprovalSystem:
    async def request(self, req: ApprovalRequest) -> ApprovalResult:
        """Block node until user approves/denies."""
        node.status = NodeLifecycleState.BLOCKED
        node.block_reason = f"approval_required:{req.kind}"

        # Notify UI
        emit_event("approval_requested", req)

        # Wait for user decision
        result = await self.wait_for_decision(req.id)
        return result
```

## 8.14 UI Operator Actions

Beyond pause/stop, support:

```python
class OperatorActions:
    def cancel_node(self, node_id: str) -> None:
        """Cancel specific node execution."""

    def retry_node(self, node_id: str, policy_override: dict | None = None) -> None:
        """Retry failed node with optional policy changes."""

    def fork_from_frame(self, frame_id: int) -> str:
        """Create new execution from frame state snapshot. Returns new execution_id."""

    def inject_signal(self, signal_type: str, payload: dict) -> None:
        """Inject external event (approval, webhook, etc.)."""

    def reset_iteration_counters(self, execution_id: str) -> None:
        """Safely reset while/phase counters."""
```

## 8.15 Artifacts API (Prefect-style)

```python
class ArtifactSystem:
    def markdown(self, name: str, content: str, key: str | None = None) -> None:
        """Store markdown artifact for UI display."""

    def table(self, name: str, rows: list[dict], key: str | None = None) -> None:
        """Store tabular artifact."""

    def progress(self, name: str, current: int, total: int, key: str | None = None) -> None:
        """Store progress indicator."""

# Usage in agent:
ctx.artifact.markdown("Analysis Results", analysis_md)
ctx.artifact.table("Metrics", [{"name": "tokens", "value": 1234}])
ctx.artifact.progress("Build", current=3, total=5)
```

## 8.16 Priority Implementation Order

For maximum robustness gains, implement in this order:

1. **Deterministic IDs + execution signatures** - prevents "resume weirdness"
2. **Task leasing + abandoned handling** - prevents silent double-work/charges
3. **Handler atomicity** - prevents half-applied transitions
4. **Effect cleanup + loop detection** - prevents memory leaks and frame storms
5. **Approvals + diff viewer** - prevents unsafe edits; improves trust
6. **Query/key signal API parity** - keeps DSL ergonomic

---

# 9) Harness UI Specification

This section defines the operator UI that makes Smithers-Py production-grade (Conductor/Temporal/Prefect-class).

## 9.1 North-Star UX: 30-Second Answers

Operators must answer in <30 seconds:

1. **What is the current plan?** → Plan tree view
2. **What is happening right now?** → Running/blocked node indicators
3. **Why did we get here?** → Handler transition audit trail
4. **What can I do about it?** → Retry/rerun/pause/edit state
5. **Can I reproduce/replay?** → Download history, replay mode

## 9.2 Information Architecture: Navigation

```
┌─────────────────────────────────────────────────────────────────┐
│ Left Nav                                                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. Dashboard      │ Operational overview                        │
│ 2. Executions     │ List + search + saved views                 │
│ 3. Run            │ Start new execution                         │
│ 4. Approvals      │ Pending approval queue                      │
│ 5. Artifacts      │ Global artifact browser                     │
│ 6. Settings       │ Provider config, policies, UI prefs         │
│ 7. Developer      │ (toggle) Debug tools, raw queries           │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2.1 Dashboard

Panels:
- **Running now**: count + most recent updates
- **Needs attention**: failed, blocked, repeated retries (≥5 consecutive failures)
- **Recent executions**: last 20
- **Cost today / 7 days**: by model, by repo
- **Rate-limit / provider health**: backoff windows active

### 9.2.2 Executions (List View)

Columns: status, name, id, started, duration, last update, model usage, tags

Filters: status, time range, tag, script entrypoint, repo path

**Saved Views**: stored locally (like Temporal), shareable as URL params

### 9.2.3 Run (Start Execution)

Form fields:
- Script (file path or registered definition)
- Execution name
- Script args
- Environment profile (models/tools)
- Idempotency key (optional, for external integrations)
- Correlation ID (optional)

**Run history panel**: last N runs of script, restore form values

### 9.2.4 Approvals Queue

Centralized view for:
- File edit approvals (with diff viewer)
- Shell command approvals
- External side-effect approvals
- Human review nodes

### 9.2.5 Settings

- Model provider configuration (keys, base URLs)
- Default tool policies (allow/deny)
- UI preferences (UTC/local/relative time)
- Retention (frames/events)
- Dangerous actions toggles

## 9.3 Execution Detail Page: Core Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Execution Header                                  │
│  [name] [id] [status badge] [duration] [cost]  [Pause] [Stop] [⋮ Actions]  │
├──────────────────┬────────────────────────────────┬─────────────────────────┤
│   Plan Tree      │      Center: Timeline + Frame  │      Inspector          │
│   (Left Pane)    │           (Center Pane)        │     (Right Pane)        │
│                  │                                │                         │
│ ▼ Phase: Research│  Frame Timeline [====●====]    │  Node: Claude-analyze   │
│   ▼ Step: analyze│                                │                         │
│     ● Claude ✓   │  ┌─────────────────────────┐   │  [Summary] [Input]      │
│     ○ Claude ◐   │  │ Selected Frame Content  │   │  [Output] [Tools]       │
│   ▶ Step: impl   │  │ [Plan][State][Events]   │   │  [Logs] [JSON]          │
│                  │  │ [Workspace Diff]        │   │                         │
│                  │  └─────────────────────────┘   │                         │
└──────────────────┴────────────────────────────────┴─────────────────────────┘
```

### 9.3.1 Plan Tree (Left Pane)

- Tree view with expand/collapse
- Status encoding: pending/running/succeeded/failed/blocked/skipped
- Executed path highlighted (alternatives greyed)
- Handler badges (`onFinished`, `onError`)
- Search/filter by type/status
- Click node → populate inspector

### 9.3.2 Frames Timeline (Center Top)

- Scrubber/slider through frames
- Mini sparkline of key state changes
- Auto-follow latest when live
- Pause follow when user scrubs
- Virtualization for large frame counts

### 9.3.3 Selected Frame (Center Bottom) - Tabs

1. **Plan**: tree at that frame, XML/JSON toggle
2. **State Diff**: persistent + volatile diffs
3. **Events**: handlers invoked, tools called
4. **Workspace Diff**: file changes since previous frame

### 9.3.4 Inspector (Right Pane)

When node selected:

| Tab | Content |
|-----|---------|
| Summary | node type, id, signature, status, durations |
| Input | prompt, tool policy, schema |
| Output | final output + structured output |
| Tools | tool calls with inputs/outputs/durations/errors |
| Logs | streaming logs (tail) |
| JSON | raw serialized records |
| Definition | component source location (file:line) |

## 9.4 Operator Actions

### 9.4.1 Execution-Level

| Action | Description |
|--------|-------------|
| Pause | Halt after current node completes |
| Resume | Continue paused execution |
| Stop | Graceful stop with cleanup |
| Terminate | Immediate stop (emergency) |
| Export | Download execution bundle (db + logs + artifacts) |
| Replay | Run with model calls disabled |

### 9.4.2 Node-Level

| Action | Description |
|--------|-------------|
| Cancel | Cancel running node |
| Retry | Retry with same signature |
| Rerun with edits | Dangerous; gated; edited inputs |
| Rerun from here | New execution branch from this node (Conductor-style) |
| Fork from frame | New execution with state snapshot at frame (Temporal-style) |

### 9.4.3 State-Level

| Action | Description |
|--------|-------------|
| Edit state | Guarded, always audited, confirmation with diff |
| Inject signal | Manual event/approval/override |
| Pin key | Watch key over time |

### 9.4.4 Safety UX

- Confirmation dialogs with diff preview
- "Who did it" recorded in events
- Optional two-step confirmation for dangerous actions
- Audit trail for all state edits

## 9.5 Failure Views

Inspired by Temporal's "Task Failures view":

- Executions with ≥N consecutive failures (configurable threshold)
- Grouped by failure type/error message
- Quick actions: retry all, cancel all
- Trend: failure rate over time

---

# 10) Harness API Specification

MCP-first API serving the UI via Streamable HTTP.

## 10.1 Transport Requirements

Based on MCP Streamable HTTP spec:

```
┌─────────────────────────────────────────────────────────────────┐
│ Single endpoint: /mcp                                           │
│ - POST: JSON-RPC requests, responds JSON or SSE                │
│ - GET: SSE stream for server-to-client notifications           │
├─────────────────────────────────────────────────────────────────┤
│ Headers:                                                        │
│ - Accept: application/json, text/event-stream                  │
│ - MCP-Session-Id: {session_id} (after initialization)          │
│ - MCP-Protocol-Version: 2025-11-25                             │
│ - Last-Event-ID: {event_id} (for SSE resumption)               │
├─────────────────────────────────────────────────────────────────┤
│ Security:                                                       │
│ - Bind to localhost only (127.0.0.1)                           │
│ - Origin validation required                                    │
│ - Bearer token auth (printed at startup)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 10.1.1 Browser SSE Implementation

Native `EventSource` cannot send custom headers. UI must use `fetch()` streaming:

```typescript
async function* streamEvents(sessionId: string, lastEventId?: string) {
  const response = await fetch('/mcp', {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'MCP-Session-Id': sessionId,
      'Authorization': `Bearer ${authToken}`,
      ...(lastEventId && { 'Last-Event-ID': lastEventId })
    }
  });
  // Parse SSE manually from response.body
}
```

## 10.2 Read Models (UI Types)

```python
class ExecutionSummary(BaseModel):
    id: str
    name: str
    status: ExecutionStatus
    started_at: datetime
    updated_at: datetime
    duration_ms: int | None
    model_usage: dict[str, TokenUsage]
    tags: list[str]

class ExecutionDetail(ExecutionSummary):
    script_path: str
    config: ExecutionConfig
    current_frame_index: int
    total_frames: int
    active_nodes: list[str]
    stop_reason: str | None

class FrameSummary(BaseModel):
    frame_index: int
    created_at: datetime
    reason: str
    state_keys_changed: list[str]

class FrameDetail(FrameSummary):
    plan_tree: Node
    state_diff: dict[str, StateDiff]
    vol_diff: dict[str, StateDiff]
    events: list[EventRecord]

class NodeInstanceDetail(BaseModel):
    node_id: str
    node_type: str
    status: NodeStatus
    mounted_at_frame: int
    last_seen_frame: int
    runs: list[AgentRunSummary]
    handlers: list[str]  # ["onFinished", "onError"]

class AgentRunDetail(BaseModel):
    run_id: str
    node_id: str
    model: str
    status: AgentStatus
    started_at: datetime
    ended_at: datetime | None
    turns_used: int
    usage: TokenUsage
    output_text: str | None
    output_structured: dict | None
    tool_calls: list[ToolCallRecord]
    error: ErrorDetail | None

class ArtifactRecord(BaseModel):
    id: str
    execution_id: str
    node_id: str | None
    frame_id: int
    key: str
    type: Literal["markdown", "table", "progress", "link", "image"]
    content: dict
    created_at: datetime
    updated_at: datetime

class ApprovalRequestRecord(BaseModel):
    id: str
    execution_id: str
    node_id: str
    kind: Literal["file_edit", "command_exec", "external_api", "human_review"]
    payload: dict
    status: Literal["pending", "approved", "denied"]
    requested_at: datetime
    responded_at: datetime | None
    responder: str | None
    comment: str | None
```

## 10.3 MCP Resources

| URI Pattern | Description |
|-------------|-------------|
| `smithers://executions` | List all executions (paginated) |
| `smithers://executions/{id}` | Execution detail |
| `smithers://executions/{id}/frames` | Frame list (cursored) |
| `smithers://executions/{id}/frames/{index}` | Frame detail |
| `smithers://executions/{id}/events` | Event stream (cursored) |
| `smithers://executions/{id}/nodes/{node_id}` | Node instance detail |
| `smithers://executions/{id}/nodes/{node_id}/runs` | Agent runs for node |
| `smithers://executions/{id}/artifacts` | Artifacts for execution |
| `smithers://executions/{id}/approvals` | Pending approvals |
| `smithers://scripts` | Available scripts/definitions |
| `smithers://health` | Provider health, rate limit status |

## 10.4 MCP Tools

### Execution Control

```python
# Start new execution
execution.start(
    script: str,
    args: list[str] = [],
    name: str | None = None,
    tags: list[str] = [],
    config: ExecutionConfig | None = None,
    idempotency_key: str | None = None,
    correlation_id: str | None = None
) -> ExecutionSummary

# Pause execution (halt after current node)
execution.pause(execution_id: str) -> ExecutionSummary

# Resume paused execution
execution.resume(execution_id: str) -> ExecutionSummary

# Graceful stop
execution.stop(execution_id: str, reason: str | None = None) -> ExecutionSummary

# Immediate termination
execution.terminate(execution_id: str, reason: str | None = None) -> ExecutionSummary

# Export execution bundle
execution.export(execution_id: str) -> ExportBundle
```

### Node Control

```python
# Cancel running node
node.cancel(execution_id: str, node_id: str) -> NodeInstanceDetail

# Retry failed node
node.retry(execution_id: str, node_id: str) -> NodeInstanceDetail

# Rerun from node (creates new branch)
node.rerun_from(
    execution_id: str,
    node_id: str,
    mode: Literal["continue", "restart"] = "continue",
    overrides: dict | None = None
) -> ExecutionSummary

# Fork from frame (new execution with state snapshot)
execution.fork_from_frame(
    execution_id: str,
    frame_index: int,
    new_name: str | None = None
) -> ExecutionSummary
```

### State Control

```python
# Set state key
state.set(
    execution_id: str,
    key: str,
    value: Any,
    trigger: str
) -> StateChangeResult

# Update state key with reducer
state.update(
    execution_id: str,
    key: str,
    op: Literal["increment", "append", "merge"],
    value: Any,
    trigger: str
) -> StateChangeResult

# Respond to approval
approval.respond(
    execution_id: str,
    approval_id: str,
    decision: Literal["approve", "deny"],
    comment: str | None = None
) -> ApprovalRequestRecord
```

## 10.5 MCP Streaming Notifications

Server pushes via SSE GET stream:

```python
# Frame created
smithers.frame.created:
    execution_id: str
    frame_index: int
    reason: str
    state_keys_changed: list[str]

# Node status updated
smithers.node.updated:
    execution_id: str
    node_id: str
    status: NodeStatus
    run_id: str | None

# Task status updated
smithers.task.updated:
    execution_id: str
    task_id: str
    status: TaskStatus

# Agent streaming output
smithers.agent.stream:
    execution_id: str
    run_id: str
    chunk_type: Literal["token", "tool_start", "tool_end", "thinking"]
    payload: dict

# Approval requested
smithers.approval.requested:
    execution_id: str
    approval_id: str
    kind: str
    node_id: str

# Execution status changed
smithers.execution.status:
    execution_id: str
    status: ExecutionStatus
    reason: str | None
```

### Resumability

- Server includes SSE `id` field on each event
- Client reconnects with `Last-Event-ID` header
- Server replays events since that ID (bounded buffer)

---

# 11) Artifacts System Specification

Artifacts are first-class observable outputs rendered in UI.

## 11.1 Artifact Types

```python
class ArtifactType(str, Enum):
    MARKDOWN = "markdown"
    TABLE = "table"
    PROGRESS = "progress"
    LINK = "link"
    IMAGE = "image"

@dataclass
class MarkdownArtifact:
    type: Literal["markdown"] = "markdown"
    content: str  # Markdown text

@dataclass
class TableArtifact:
    type: Literal["table"] = "table"
    columns: list[str]
    rows: list[dict[str, Any]]

@dataclass
class ProgressArtifact:
    type: Literal["progress"] = "progress"
    current: int
    total: int
    label: str | None = None

@dataclass
class LinkArtifact:
    type: Literal["link"] = "link"
    url: str
    label: str | None = None

@dataclass
class ImageArtifact:
    type: Literal["image"] = "image"
    url: str  # Data URL or file path
    alt: str | None = None
```

## 11.2 Artifact API (Runtime)

```python
class ArtifactSystem:
    def markdown(self, name: str, content: str, *, key: str | None = None) -> str:
        """Create/update markdown artifact. Returns artifact_id."""

    def table(self, name: str, columns: list[str], rows: list[dict], *, key: str | None = None) -> str:
        """Create/update table artifact."""

    def progress(self, name: str, current: int, total: int, *, key: str | None = None, label: str | None = None) -> str:
        """Create/update progress artifact. Same key = in-place update."""

    def link(self, name: str, url: str, *, key: str | None = None, label: str | None = None) -> str:
        """Create link artifact."""

    def image(self, name: str, data: bytes | str, *, key: str | None = None, alt: str | None = None) -> str:
        """Create image artifact (data URL or file path)."""

# Usage in agent:
ctx.artifact.markdown("Analysis Results", analysis_md)
ctx.artifact.table("Metrics", ["name", "value"], [{"name": "tokens", "value": 1234}])
ctx.artifact.progress("Build", 3, 5, key="build-progress", label="Step 3/5")
```

## 11.3 Key vs Keyless Artifacts

| Mode | Behavior |
|------|----------|
| **Keyless** (key=None) | Creates new artifact each call, history preserved |
| **Keyed** (key="my-key") | Updates existing artifact with same key, shows latest |

Progress artifacts should always use keys for in-place updates.

## 11.4 Database Schema

```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT,
    frame_id INTEGER,
    key TEXT,              -- NULL for keyless
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (execution_id) REFERENCES executions(id),
    UNIQUE (execution_id, key) WHERE key IS NOT NULL  -- Keyed artifacts unique
);

CREATE INDEX idx_artifacts_exec ON artifacts(execution_id, created_at);
CREATE INDEX idx_artifacts_key ON artifacts(execution_id, key) WHERE key IS NOT NULL;
```

## 11.5 UI Display

**Per-Execution Artifacts Tab:**
- List artifacts grouped by type
- Progress artifacts show live updates
- Tables sortable/filterable
- Markdown rendered with syntax highlighting

**Global Artifacts Page:**
- Search by key, name, execution
- Filter by type, time range
- Artifact history (versions for keyed artifacts)
