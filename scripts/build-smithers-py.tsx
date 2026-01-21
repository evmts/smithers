#!/usr/bin/env bun
/** @jsxImportSource smithers-orchestrator */
/**
 * Build Smithers-Py E2E
 *
 * This workflow implements the smithers-py Python library based on the spec in issues/smithers-py.md
 * Uses a Ralph loop to iteratively build each milestone:
 * - M0: Core runtime skeleton (Plan IR, JSX runtime, XML serializer, state stores, tick loop)
 * - M1: Runnable nodes + event handlers (Claude executor, PydanticAI integration)
 * - M2: MCP server MVP (resources, tools, transports)
 * - M3: GUI MVP (Zig-webui + Solid.js)
 * - M4: Advanced workflow constructs (Ralph/While, Phase, Step, Parallel)
 */

import {
  createSmithersRoot,
  createSmithersDB,
  SmithersProvider,
  Ralph,
  Phase,
  Step,
  Claude,
  If,
  useSmithers,
  Smithers,
  createOrchestrationPromise,
  signalOrchestrationCompleteByToken,
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/db";

// Create orchestration promise externally so we can pass token to SmithersProvider
const { promise: orchestrationPromise, token: orchestrationToken } = createOrchestrationPromise();

// Function to manually signal completion (called by Ralph onComplete)
function signalComplete() {
  signalOrchestrationCompleteByToken(orchestrationToken);
}

const db = createSmithersDB({ path: ".smithers/build-smithers-py.db" });

// Resume or start new execution
let executionId: string;
const incomplete = db.execution.findIncomplete();
if (incomplete) {
  executionId = incomplete.id;
  console.log("Resuming execution:", executionId);
} else {
  executionId = db.execution.start("Build Smithers-Py", "build-smithers-py.tsx");
  db.state.set("milestone", "M0", "init");
  db.state.set("phase", "research", "init");
}

const SPEC_PATH = "issues/smithers-py.md";

// ============================================================================
// M0: Core Runtime Skeleton
// ============================================================================

function M0_CoreRuntime() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M0-Research">
          <Step name="analyze-spec">
            <Claude
              model="opus"
              maxTurns={20}
              allowedTools={["Read", "Glob", "Grep"]}
              onFinished={() => setPhase("implement-package")}
            >
{`Read the full spec at ${SPEC_PATH} focusing on M0 requirements:
- Plan IR (Pydantic models for nodes)
- JSX runtime (jsx() function)
- XML serializer
- Volatile + SQLite state with snapshot/write-queue/commit
- Simple tick loop with no runnable nodes

Also study the TypeScript implementation patterns in:
- src/reconciler/ (React reconciler patterns)
- src/db/ (SQLite schema and state management)
- src/components/ (component structure)

Output a structured implementation plan for M0.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-package"}>
        <Phase name="M0-Package-Structure">
          <Step name="create-package">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-nodes")}
            >
{`Create the smithers_py Python package foundation:

1. Create directory: smithers_py/

2. Create pyproject.toml:
   - name: smithers-py
   - python: ">=3.11"
   - dependencies: pydantic>=2.0, pydantic-ai, aiosqlite
   - dev-dependencies: pytest, pytest-asyncio, ruff

3. Create smithers_py/__init__.py with placeholder exports

4. Create smithers_py/py.typed (PEP 561 marker)

5. Create basic README.md explaining this is SmithersPy

Run: cd smithers_py && python -c "import smithers_py" to verify.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-nodes"}>
        <Phase name="M0-Plan-IR">
          <Step name="create-node-models">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-jsx")}
            >
{`Create Pydantic node models based on the spec in ${SPEC_PATH}:

smithers_py/nodes/__init__.py - exports all nodes
smithers_py/nodes/base.py:
  - NodeBase(BaseModel): key, children list
  - Node type alias (discriminated union)

smithers_py/nodes/text.py:
  - TextNode: type="text", text: str

smithers_py/nodes/structural.py:
  - IfNode: type="if", condition: bool, children
  - PhaseNode: type="phase", name: str, children
  - StepNode: type="step", name: str, children
  - RalphNode: type="ralph", id: str, max_iterations: int, children

smithers_py/nodes/runnable.py:
  - ClaudeNode: type="claude", model, prompt, max_turns
  - Event callbacks (onFinished, onError) with Field(exclude=True)

Use Pydantic v2 patterns. All nodes should serialize cleanly to dict/JSON.
Write tests in smithers_py/nodes/test_nodes.py`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-jsx"}>
        <Phase name="M0-JSX-Runtime">
          <Step name="create-jsx-runtime">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-serializer")}
            >
{`Create the JSX runtime in smithers_py/jsx_runtime.py:

1. jsx(type_, props, *children) function:
   - If type_ is str, look up intrinsic node constructor
   - If type_ is callable (component function), call it with props + children
   - Normalize children: flatten lists, convert strings to TextNode
   - Return a Node instance

2. Fragment component for grouping

3. INTRINSICS registry mapping tag names to node classes:
   {"if": IfNode, "phase": PhaseNode, "step": StepNode, ...}

4. Validate event props only on observable nodes (ClaudeNode etc.)
   Raise error if onFinished passed to IfNode

5. Write tests in smithers_py/test_jsx_runtime.py

Reference python-jsx docs for how jsx() is called by the transpiler.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-serializer"}>
        <Phase name="M0-XML-Serializer">
          <Step name="create-xml-serializer">
            <Claude
              model="sonnet"
              maxTurns={30}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-state")}
            >
{`Create XML serializer in smithers_py/serialize/xml.py:

1. serialize_to_xml(node: Node) -> str function
   - Convert node tree to readable XML
   - Tags are node types: <claude>, <phase>, <step>
   - Props become attributes (exclude=True fields omitted)
   - Children become nested elements
   - TextNode becomes text content

2. For event fields, optionally include: events="onFinished,onError"

3. Output should match Smithers TS format for parity

4. Write tests comparing expected XML output

Example output:
<phase name="Research">
  <step name="analyze">
    <claude model="sonnet" prompt="..." events="onFinished"/>
  </step>
</phase>`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-state"}>
        <Phase name="M0-State-Stores">
          <Step name="create-state-stores">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-db")}
            >
{`Create state stores based on spec in ${SPEC_PATH}:

smithers_py/state/base.py:
  - StateStore(Protocol): get, set, snapshot, enqueue, commit
  - WriteOp dataclass for queued writes

smithers_py/state/volatile.py:
  - VolatileStore: in-memory dict with version counter
  - snapshot() returns frozen copy
  - enqueue() queues writes
  - commit() applies all queued writes atomically

smithers_py/state/sqlite.py:
  - SqliteStore: SQLite-backed persistent state
  - Same interface as VolatileStore
  - Uses state table (key, value, updated_at)
  - Writes to transitions table for audit log

Both stores must support:
- get(key) -> value
- set(key, value, trigger=None)
- snapshot() -> frozen dict for render
- Queued writes applied only on commit()

Write tests for both stores.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-db"}>
        <Phase name="M0-Database-Schema">
          <Step name="create-db-schema">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-tick-loop")}
            >
{`Create database layer matching Smithers TS schema:

smithers_py/db/schema.sql:
  - executions: id, name, source_file, status, started_at, completed_at
  - state: key (PK), value (JSON text), updated_at
  - transitions: id, key, old_value, new_value, trigger, agent_id, timestamp
  - render_frames: id, execution_id, sequence_number, xml_content, timestamp
  - tasks: id, name, status, started_at, completed_at, lease_owner, lease_expires_at, heartbeat_at
  - agents: id, execution_id, node_path, model, status, prompt, output
  - tool_calls: id, agent_id, tool_name, input, output, timestamp
  - agent_stream_events: task_id, ts, kind, payload (for streaming tokens)

smithers_py/db/database.py:
  - SmithersDB class wrapping sqlite3/aiosqlite
  - db.execution.start(), .complete(), .findIncomplete()
  - db.state (SqliteStore instance)
  - db.tasks.start(), .complete(), .heartbeat()
  - db.frames.save(), .list()

smithers_py/db/migrations.py:
  - run_migrations() to init schema

Reference src/db/schema.ts for exact schema.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-tick-loop"}>
        <Phase name="M0-Tick-Loop">
          <Step name="create-tick-loop">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m0")}
            >
{`Create the tick loop engine in smithers_py/engine/tick_loop.py:

The loop implements strict phases from the spec:
1. State Snapshot Phase - freeze db_state + v_state + tasks + frame_clock
2. Render Phase (pure) - produce Plan Tree, no side effects, track deps
3. Reconcile Phase - diff vs previous frame by stable node identity
4. Commit Phase - persist frame to SQLite
5. Execute Phase - start runnable tasks for newly mounted nodes
6. Post-Commit Effects Phase - run effects whose deps changed
7. State Update Flush - apply all queued updates atomically

class TickLoop:
   __init__(db, volatile_state, app_component)
   async run() - main loop with frame coalescing (throttle to 250ms min)

Context object (ctx):
   - ctx.v: VolatileStore (snapshot view)
   - ctx.state: SqliteStore (snapshot view)
   - ctx.db: SmithersDB handle
   - ctx.now(): deterministic frame time
   - ctx.frame_id: current frame number

For M0, the loop just renders and exits since no runnable nodes.

Write integration test that:
- Creates app with IfNode + PhaseNode
- Runs tick loop
- Verifies XML frame saved to DB
- Verifies state snapshot isolation (writes don't affect current render)`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m0"}>
        <Phase name="M0-Verification">
          <Step name="run-tests">
            <Claude
              model="sonnet"
              maxTurns={30}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={(r) => {
                if (r.output.includes("passed") || r.output.includes("PASSED")) {
                  setMilestone("M1");
                } else {
                  setPhase("implement-package"); // Retry from start
                }
              }}
            >
{`Run all M0 tests and verify the implementation:

1. cd smithers_py
2. Run: python -m pytest -v
3. Run: python -c "from smithers_py import *; print('Imports OK')"

4. Create a simple integration test smithers_py/test_m0_integration.py:
   - Build a node tree manually
   - Serialize to XML
   - Create DB and save frame
   - Verify frame persisted

If tests pass, we move to M1. If not, identify failures.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// M1: Runnable Nodes + Event Handlers
// ============================================================================

function M1_RunnableNodes() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M1-Research">
          <Step name="study-pydantic-ai">
            <Claude
              model="opus"
              maxTurns={20}
              allowedTools={["Read", "Grep", "Bash"]}
              onFinished={() => setPhase("implement-executor")}
            >
{`Research PydanticAI for M1 implementation:

1. Read pydantic-ai docs: pip show pydantic-ai
2. Understand Agent class and how to run Claude
3. Study how to get structured output with Pydantic schemas
4. Check tool/function calling patterns
5. Study retry functionality and tenacity integration

Also read ${SPEC_PATH} sections on:
- Agent runtime requirements
- Executors using PydanticAI
- Event enforcement + onFinished state transitions
- Task leases and heartbeats for crash safety

Output implementation plan for ClaudeNode executor.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-executor"}>
        <Phase name="M1-Claude-Executor">
          <Step name="create-claude-executor">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-events")}
            >
{`Create Claude executor using PydanticAI:

smithers_py/executors/__init__.py
smithers_py/executors/base.py:
  - Executor(Protocol): async execute(node, ctx) -> AgentResult
  - AgentResult: output, structured, tokens_used, duration_ms

smithers_py/executors/claude.py:
  - ClaudeExecutor implementing Executor
  - Uses pydantic_ai.Agent for Claude API
  - Handles model selection (opus/sonnet/haiku)
  - Captures output, token usage, duration
  - Persists to db.agents table
  - Task leases: set lease_owner, heartbeat during execution
  - Streaming: write chunks to agent_stream_events table

smithers_py/executors/retry.py:
  - Global rate-limit coordinator
  - Shared backoff window per provider/model
  - Classify errors: retryable (429, 5xx, timeout) vs non-retryable
  - Persist retry state for crash recovery

Update tick_loop.py:
  - find_runnable() returns ClaudeNode instances
  - execute() calls ClaudeExecutor for each
  - Store results in DB

Write test with mocked Claude responses using PydanticAI TestModel.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-events"}>
        <Phase name="M1-Event-Handlers">
          <Step name="implement-event-system">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m1")}
            >
{`Implement event handler system:

1. Update tick_loop.py execute phase:
   - After agent completes, call node.onFinished(result) if defined
   - Wrap in try/except, call node.onError(e) on failure
   - Event handlers can call ctx.state.set() to queue updates
   - If node disappeared from plan (stale result), skip event handlers

2. Enforce events only on observable nodes:
   - ClaudeNode, SmithersNode, ReviewNode can have events
   - IfNode, PhaseNode, StepNode cannot
   - Validation in jsx_runtime.py

3. State actions model:
   - All writes become Actions queued during frame
   - Actions: set(key, value), delete(key), update(key, reducer_fn)
   - Flush applies deterministically: (frame_id, task_id, action_index)

4. Update commit phase:
   - All queued state writes from event handlers applied atomically
   - Record transitions: old_value, new_value, trigger, node_id, frame_id
   - This triggers re-render on next tick if state changed

5. Test:
   - ClaudeNode with onFinished that sets state
   - Verify state updated after tick
   - Verify re-render with new state
   - Verify stale results don't trigger handlers`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m1"}>
        <Phase name="M1-Verification">
          <Step name="run-m1-tests">
            <Claude
              model="sonnet"
              maxTurns={30}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={(r) => {
                if (r.output.includes("passed") || r.output.includes("PASSED")) {
                  setMilestone("M2");
                } else {
                  setPhase("implement-executor");
                }
              }}
            >
{`Run M1 tests:

1. python -m pytest smithers_py/ -v
2. Verify ClaudeExecutor tests pass (with mocks)
3. Verify event handler tests pass

Create integration test smithers_py/test_m1_integration.py:
- Build tree with ClaudeNode + onFinished
- Mock the Claude API call
- Run tick loop
- Verify onFinished called
- Verify state updated

Report test results.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// M2: MCP Server MVP
// ============================================================================

function M2_MCPServer() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M2-Research">
          <Step name="study-mcp-sdk">
            <Claude
              model="opus"
              maxTurns={20}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={() => setPhase("implement-resources")}
            >
{`Research Python MCP SDK for M2:

1. pip install mcp (or check if already installed)
2. Read MCP Python SDK docs
3. Understand resources and tools patterns
4. Study stdio and Streamable HTTP transports
5. Review MCP spec security requirements:
   - Origin validation for HTTP
   - localhost binding
   - DNS rebinding protection
   - Session model and reconnection

Read ${SPEC_PATH} section on MCP requirements:
- MCP resources: executions, frames, state
- MCP tools: start/run/tick/stop, set_state
- Both transports required
- Auth model for localhost

Output implementation plan for MCP server.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-resources"}>
        <Phase name="M2-MCP-Resources">
          <Step name="create-mcp-resources">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-tools")}
            >
{`Create MCP resources in smithers_py/mcp/resources.py:

Using the MCP Python SDK:

1. Resource: executions
   - List all executions
   - Get specific execution by ID
   - URI: smithers://executions/{id}

2. Resource: frames
   - List frames for execution
   - Get specific frame XML
   - URI: smithers://executions/{id}/frames/{seq}

3. Resource: state
   - Get current state snapshot
   - URI: smithers://executions/{id}/state

4. Resource: agents
   - List agent runs
   - Get agent details + output + stream events
   - URI: smithers://agents/{id}

5. Resource: stream (SSE-style)
   - Subscribe to live frame/event stream
   - Session IDs for reconnection
   - Event cursors for resumability

Follow MCP resource patterns from SDK examples.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-tools"}>
        <Phase name="M2-MCP-Tools">
          <Step name="create-mcp-tools">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-transports")}
            >
{`Create MCP tools in smithers_py/mcp/tools.py:

1. Tool: start_execution
   - Start new execution with app component
   - Returns execution_id

2. Tool: tick
   - Run single tick of the loop
   - Returns frame XML and state changes

3. Tool: run_until_idle
   - Run loop until no more runnable nodes
   - Returns final state

4. Tool: stop
   - Request graceful stop
   - Returns confirmation

5. Tool: pause / resume
   - Pause execution, resume from pause
   - Returns status

6. Tool: set_state
   - Set a state key
   - Params: key, value, trigger
   - Returns updated state

7. Tool: restart_from_frame
   - Restart execution from specific frame
   - Returns new execution_id

8. Tool: get_frame
   - Get specific frame by sequence number
   - Returns XML content`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-transports"}>
        <Phase name="M2-MCP-Transports">
          <Step name="create-transports">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m2")}
            >
{`Create MCP server with transports in smithers_py/mcp/server.py:

1. McpCore class:
   - handle(json_rpc_msg) -> responses/events
   - Composes resources and tools
   - Session management (persistent session IDs)

2. StdioTransport:
   - Newline-delimited JSON-RPC
   - For CLI integration

3. HttpTransport (Streamable HTTP):
   - For browser/GUI clients
   - MUST bind to localhost only
   - MUST validate Origin header
   - Auth: random bearer token printed at startup
   - Backpressure: bounded buffers, dropping policies

4. CLI entry point:
   smithers_py/cli.py or __main__.py:
   - python -m smithers_py serve --transport stdio
   - python -m smithers_py serve --transport http --port 8080
   - Print auth token on HTTP startup

Test with MCP inspector if available.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m2"}>
        <Phase name="M2-Verification">
          <Step name="test-mcp">
            <Claude
              model="sonnet"
              maxTurns={30}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={(r) => {
                if (r.output.includes("passed") || r.output.includes("OK")) {
                  setMilestone("M3");
                } else {
                  setPhase("implement-resources");
                }
              }}
            >
{`Test MCP server:

1. python -m pytest smithers_py/mcp/ -v
2. Start server: python -m smithers_py serve --transport stdio
3. Test with echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | python -m smithers_py serve

Verify:
- Resources list correctly
- Tools list correctly
- Can start execution via tool
- Can get frames via resource
- Origin validation works for HTTP
- Auth token required for HTTP

Report results.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// M3: GUI MVP (Zig-webui + Solid.js) - Use Smithers subagent for complexity
// ============================================================================

function M3_GUI() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M3-Research">
          <Step name="research-gui-stack">
            <Claude
              model="opus"
              maxTurns={20}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={() => setPhase("implement-gui")}
            >
{`Research GUI implementation for M3:

Read ${SPEC_PATH} sections on:
- Desktop GUI requirements
- Zig-webui for native shell
- Solid.js for frontend

Architecture decision needed:
A) Zig launches browser + embeds HTTP server (serves assets + proxies MCP)
B) Zig is only launcher, Python serves everything

Research:
1. zig-webui: https://github.com/webui-dev/zig-webui
2. Solid.js signals for fine-grained reactivity
3. How to connect to MCP Streamable HTTP from browser

Output implementation plan for:
- Zig host that spawns Python MCP server
- Solid.js UI with frame timeline, plan viewer, state inspector
- Auth token handoff from Python to UI`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-gui"}>
        <Phase name="M3-GUI-Implementation">
          <Step name="build-gui">
            <Smithers
              plannerModel="opus"
              executionModel="sonnet"
              timeout={3600000}
              keepScript
              context={`Building GUI for smithers-py.
                       MCP server runs on localhost.
                       Use Zig-webui for native shell.
                       Use Solid.js for frontend.
                       Spec at: ${SPEC_PATH}`}
              onFinished={() => setPhase("verify-m3")}
              onError={() => setPhase("research")}
            >
{`Build the smithers-py GUI MVP:

1. Create smithers_gui/ directory for Zig project
2. Set up Zig build with webui dependency
3. Create main.zig that:
   - Spawns Python MCP server (capture auth token from stdout)
   - Opens webview with Solid.js app
   - Pass auth token to UI via query param or localStorage

4. Create smithers_ui/ directory for Solid.js
5. Set up with: bunx degit solidjs/templates/ts smithers_ui
6. Build Solid.js components using signals:
   - ExecutionList: shows all executions
   - FrameTimeline: scrubber through frames
   - PlanViewer: renders XML frame as tree
   - StateInspector: shows state diffs
   - AgentPanel: shows agent output + streaming
   - ControlPanel: pause/resume/stop/restart

7. Connect to MCP via fetch to localhost with auth token

8. Bundle and integrate with Zig host`}
            </Smithers>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m3"}>
        <Phase name="M3-Verification">
          <Step name="test-gui">
            <Claude
              model="sonnet"
              maxTurns={20}
              allowedTools={["Read", "Bash"]}
              onFinished={(r) => {
                if (r.output.includes("OK") || r.output.includes("builds")) {
                  setMilestone("M4");
                } else {
                  setPhase("implement-gui");
                }
              }}
            >
{`Verify GUI builds:

1. cd smithers_gui && zig build (if Zig available)
2. cd smithers_ui && bun install && bun run build

If Zig not available, just verify Solid.js builds.
GUI can be completed later, move to M4.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// M4: Advanced Workflow Constructs
// ============================================================================

function M4_AdvancedConstructs() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M4-Research">
          <Step name="study-advanced">
            <Claude
              model="opus"
              maxTurns={20}
              allowedTools={["Read", "Grep"]}
              onFinished={() => setPhase("implement-identity")}
            >
{`Research advanced constructs for M4:

Study TypeScript implementations in src/components/:
- While.tsx / Ralph pattern
- Phase.tsx and Step.tsx sequencing
- Parallel.tsx concurrent execution

Read ${SPEC_PATH} on:
- Ralph/While loop semantics
- Phase/Step gating
- Effects system (first-class EffectNode)
- Node identity and reconciliation

Plan implementation for Python equivalents.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-identity"}>
        <Phase name="M4-Node-Identity">
          <Step name="create-identity-system">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-ralph")}
            >
{`Implement stable node identity system:

smithers_py/engine/identity.py:
  - compute_node_id(parent_id, key_or_index, node_type) -> str
  - Uses hash of path for stability
  - Explicit id prop takes precedence
  - For loops: require explicit keys or stable IDs

smithers_py/engine/reconciler.py:
  - diff_trees(old_tree, new_tree) -> ReconcileResult
  - Determine: newly mounted, still-running, unmounted nodes
  - Match by stable node_id
  - Cancellation semantics: send cancel signal for unmounted running nodes

smithers_py/lint/identity_lint.py:
  - Warn if runnable node lacks explicit id
  - Warn if list items lack keys
  - Error if duplicate ids in same scope

Persist for resume:
  - script_hash
  - git_commit (if in repo)
  - engine_version, schema_version
  - Warn loudly on mismatch during resume`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-ralph"}>
        <Phase name="M4-Ralph-While">
          <Step name="create-ralph">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-phases")}
            >
{`Implement Ralph/While loop in smithers_py:

smithers_py/nodes/ralph.py:
- RalphNode with condition, max_iterations, id (REQUIRED)
- Condition can be callable or state expression

smithers_py/engine/ralph_loop.py:
- Extends tick_loop with iteration support
- Tracks iteration count in state
- Evaluates condition before each iteration
- Stops on condition=False or max_iterations

smithers_py/components/while_context.py:
- WhileContext with iteration number
- signal_complete() method
- use_while_iteration() to access from children

Update tick loop to handle Ralph nodes specially.
Write tests for iteration behavior.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-phases"}>
        <Phase name="M4-Phase-Step">
          <Step name="create-phase-step">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-parallel")}
            >
{`Implement Phase/Step sequencing:

smithers_py/nodes/phase.py:
- PhaseNode with name, skipIf, onStart, onComplete
- Only active phase renders children

smithers_py/nodes/step.py:
- StepNode with name, onStart, onComplete
- Sequential within phase

smithers_py/engine/phase_registry.py:
- Tracks active phase index
- Advances when all steps complete
- Persists to DB for resume

Update tick loop:
- Before render, determine active phase
- Only render children of active phase
- Track step completion

Tests for phase advancement.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-parallel"}>
        <Phase name="M4-Parallel">
          <Step name="create-parallel">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-effects")}
            >
{`Implement Parallel execution:

smithers_py/nodes/parallel.py:
- ParallelNode: children execute concurrently
- All children are runnable simultaneously

Update tick_loop.py:
- find_runnable() returns all children of Parallel
- execute() uses asyncio.gather for concurrent execution
- All must complete before Parallel is "done"

Test concurrent execution with multiple ClaudeNodes.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-effects"}>
        <Phase name="M4-Effects">
          <Step name="create-effects">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m4")}
            >
{`Implement effects as first-class observable nodes:

smithers_py/nodes/effect.py:
- EffectNode(id, deps, run, cleanup=None, phase="post_commit")
- Visible in plan tree, diffable, auditable
- Shows "effect ran because deps changed"

smithers_py/engine/effects.py:
- EffectRegistry keyed by node_id
- Track previous deps with stable hashing (JSON canonicalization)
- Run cleanup before next effect with changed deps
- Max effect runs per frame (prevent infinite loops)
- Effect stability detector (same deps causing same writes)

smithers_py/context.py:
- ctx.use_effect(id, fn, deps, cleanup=None)
- Component identity from node path

Update tick loop:
- After commit, run registered effects
- Effects can schedule state updates for next tick
- Optionally: --strict-effects mode to double-invoke for idempotence testing

Test effect runs on dep change.
Test effect cleanup on unmount.
Test effect loop detection.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m4"}>
        <Phase name="M4-Verification">
          <Step name="final-tests">
            <Claude
              model="sonnet"
              maxTurns={30}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={(r) => {
                if (r.output.includes("passed")) {
                  setMilestone("COMPLETE");
                } else {
                  setPhase("implement-identity");
                }
              }}
            >
{`Run final verification for M4:

1. python -m pytest smithers_py/ -v --tb=short
2. Create end-to-end integration test

smithers_py/test_e2e.py:
- Build full workflow with Ralph, Phase, Step, Claude
- Mock Claude responses
- Run to completion
- Verify all frames persisted
- Verify state transitions correct
- Verify node identity stable across restarts
- Verify effect lifecycle correct

Report final test results.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// M5: Harness UI (Production-Grade)
// ============================================================================

function M5_HarnessUI() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M5-Research">
          <Step name="study-harness-spec">
            <Claude
              model="opus"
              maxTurns={20}
              allowedTools={["Read", "Grep"]}
              onFinished={() => setPhase("implement-mcp-resources")}
            >
{`Research harness UI requirements from ${SPEC_PATH}:

Read sections 9, 10, 11 covering:
- Harness UI Specification (nav, execution detail, operator actions)
- Harness API Specification (MCP resources, tools, streaming)
- Artifacts System Specification

Study existing MCP implementation in smithers_py/mcp/.

Key requirements:
- 3-pane execution detail (Plan Tree / Timeline+Frame / Inspector)
- Operator actions: pause/resume/stop/retry/rerun-from-node/fork-from-frame
- MCP streaming notifications for live updates
- Saved views for execution filtering

Output implementation plan for M5.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-mcp-resources"}>
        <Phase name="M5-MCP-Resources">
          <Step name="expand-mcp-resources">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-mcp-tools")}
            >
{`Expand MCP resources per spec section 10.3:

Update smithers_py/mcp/resources.py with full resource set:
- smithers://executions (paginated list)
- smithers://executions/{id} (ExecutionDetail)
- smithers://executions/{id}/frames (cursored FrameSummary list)
- smithers://executions/{id}/frames/{index} (FrameDetail)
- smithers://executions/{id}/events (cursored EventRecord list)
- smithers://executions/{id}/nodes/{node_id} (NodeInstanceDetail)
- smithers://executions/{id}/nodes/{node_id}/runs (AgentRunDetail list)
- smithers://executions/{id}/artifacts (ArtifactRecord list)
- smithers://executions/{id}/approvals (ApprovalRequestRecord list)
- smithers://scripts (available script definitions)
- smithers://health (provider health, rate limits)

Create Pydantic read models in smithers_py/mcp/models.py:
- ExecutionSummary, ExecutionDetail
- FrameSummary, FrameDetail
- NodeInstanceDetail, AgentRunDetail
- ArtifactRecord, ApprovalRequestRecord

Implement cursor-based pagination for large lists.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-mcp-tools"}>
        <Phase name="M5-MCP-Tools">
          <Step name="expand-mcp-tools">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-streaming")}
            >
{`Expand MCP tools per spec section 10.4:

Update smithers_py/mcp/tools.py with operator actions:

Execution control:
- execution.start(script, args, name, tags, config, idempotency_key, correlation_id)
- execution.pause(execution_id)
- execution.resume(execution_id)
- execution.stop(execution_id, reason)
- execution.terminate(execution_id, reason)
- execution.export(execution_id) -> ExportBundle

Node control:
- node.cancel(execution_id, node_id)
- node.retry(execution_id, node_id)
- node.rerun_from(execution_id, node_id, mode, overrides)
- execution.fork_from_frame(execution_id, frame_index, new_name)

State control:
- state.set(execution_id, key, value, trigger)
- state.update(execution_id, key, op, value, trigger)
- approval.respond(execution_id, approval_id, decision, comment)

Implement proper audit logging for all state modifications.
Add confirmation requirements for dangerous actions.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-streaming"}>
        <Phase name="M5-Streaming">
          <Step name="implement-mcp-streaming">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-ui-components")}
            >
{`Implement MCP streaming notifications per spec section 10.5:

Create smithers_py/mcp/notifications.py:
- SmithersNotification base class
- FrameCreatedNotification
- NodeUpdatedNotification
- TaskUpdatedNotification
- AgentStreamNotification
- ApprovalRequestedNotification
- ExecutionStatusNotification

Update smithers_py/mcp/server.py:
- SSE endpoint for GET requests
- Event ID generation for resumability
- Last-Event-ID header handling
- Bounded event buffer with drop policy

Update engine to emit notifications:
- After frame commit: smithers.frame.created
- On node status change: smithers.node.updated
- On task status change: smithers.task.updated
- On agent stream chunk: smithers.agent.stream
- On approval request: smithers.approval.requested

Test SSE stream with curl and verify event replay.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-ui-components"}>
        <Phase name="M5-UI-Components">
          <Step name="build-solid-components">
            <Smithers
              plannerModel="opus"
              executionModel="sonnet"
              timeout={3600000}
              keepScript
              context={`Building harness UI components.
                       Spec at: ${SPEC_PATH} sections 9.2-9.5.
                       MCP server provides resources/tools/streaming.
                       Use Solid.js signals for fine-grained reactivity.`}
              onFinished={() => setPhase("implement-operator-actions")}
              onError={() => setPhase("implement-streaming")}
            >
{`Build Solid.js UI components for harness (smithers_ui/):

1. Navigation Components:
   - Sidebar with: Dashboard, Executions, Run, Approvals, Artifacts, Settings
   - Top bar with execution context when viewing detail

2. Dashboard Page (smithers_ui/src/pages/Dashboard.tsx):
   - RunningNow panel (count + recent updates)
   - NeedsAttention panel (failed, blocked, repeated retries)
   - RecentExecutions panel (last 20)
   - CostOverview panel (by model, by repo)
   - ProviderHealth panel (rate limits)

3. Executions List Page:
   - Table: status, name, id, started, duration, model usage, tags
   - Filters: status, time range, tag, script
   - Search by id/name
   - SavedViews component (localStorage persistence)

4. Execution Detail Page (3-pane layout):
   - PlanTree (left): tree view with status encoding, expand/collapse
   - FrameTimeline (center top): scrubber/slider
   - FrameContent (center bottom): tabs for Plan/State/Events/Workspace
   - Inspector (right): tabs for Summary/Input/Output/Tools/Logs/JSON

5. Run Page:
   - Script selector
   - Parameter form
   - RunHistory panel with restore

6. Approvals Page:
   - Queue view with diff viewer for file edits

Connect to MCP via fetch() with auth token.
Use SSE streaming for live updates.`}
            </Smithers>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-operator-actions"}>
        <Phase name="M5-Operator-Actions">
          <Step name="build-action-ui">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-failure-views")}
            >
{`Implement operator action UI components:

1. ExecutionActions (smithers_ui/src/components/ExecutionActions.tsx):
   - Pause/Resume buttons
   - Stop button with confirmation
   - Terminate button (two-step confirmation)
   - Export button (downloads bundle)
   - More menu: Replay mode

2. NodeActions (smithers_ui/src/components/NodeActions.tsx):
   - Cancel button (for running nodes)
   - Retry button (for failed nodes)
   - "Rerun from here" with mode selector
   - Context menu on right-click

3. StateEditor (smithers_ui/src/components/StateEditor.tsx):
   - Key-value editor with JSON validation
   - Diff preview before save
   - Trigger annotation field
   - Confirmation dialog with "who/why" fields

4. ForkFromFrame (smithers_ui/src/components/ForkFromFrame.tsx):
   - Frame selector (timeline position)
   - New execution name input
   - State preview at that frame
   - Confirmation showing what will be forked

5. Safety UX:
   - ConfirmationDialog component
   - Two-step confirmation for dangerous actions
   - Audit trail display

All actions call MCP tools and handle responses.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-failure-views"}>
        <Phase name="M5-Failure-Views">
          <Step name="build-failure-views">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m5")}
            >
{`Implement failure views (Temporal-style):

1. FailureDetector (smithers_py/engine/failure_detector.py):
   - Track consecutive failures per node/execution
   - Configurable threshold (default: 5)
   - Group by error type/message
   - Calculate failure rate over time

2. FailureViews MCP resource:
   - smithers://failures (executions with repeated failures)
   - Include: execution_id, failure_count, error_types, trend

3. FailureView UI (smithers_ui/src/pages/FailureView.tsx):
   - Table: execution, failure count, error type, last failure
   - Grouped view by error message
   - Quick actions: retry all, cancel all
   - Trend chart: failure rate over time

4. Dashboard integration:
   - NeedsAttention panel queries failure detector
   - Badge count on sidebar

5. Saved Views:
   - Store filter configs in localStorage
   - URL params for sharing views
   - Preset views: "All Failed", "Blocked", "High Retry Count"`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m5"}>
        <Phase name="M5-Verification">
          <Step name="test-harness">
            <Claude
              model="sonnet"
              maxTurns={30}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={(r) => {
                if (r.output.includes("passed") || r.output.includes("OK")) {
                  setMilestone("M6");
                } else {
                  setPhase("implement-mcp-resources");
                }
              }}
            >
{`Test harness UI implementation:

1. Backend tests:
   - python -m pytest smithers_py/mcp/ -v
   - Test all new resources return correct schemas
   - Test operator actions modify state correctly
   - Test SSE streaming with mock events

2. UI build:
   - cd smithers_ui && bun install && bun run build

3. Integration test:
   - Start MCP server
   - Connect UI to server
   - Verify live frame streaming
   - Test operator actions (pause/resume)

4. Manual verification checklist:
   - Dashboard shows running executions
   - Execution list filters work
   - 3-pane detail layout renders correctly
   - Inspector shows node details
   - Actions trigger correctly

Report results.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// M6: Artifacts System
// ============================================================================

function M6_Artifacts() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  const setPhase = (p: string) => db.state.set("phase", p, `transition_to_${p}`);
  const setMilestone = (m: string) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("phase", "research", "reset_phase");
  };

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="M6-Research">
          <Step name="study-artifacts-spec">
            <Claude
              model="opus"
              maxTurns={15}
              allowedTools={["Read", "Grep"]}
              onFinished={() => setPhase("implement-artifact-types")}
            >
{`Research artifacts system from ${SPEC_PATH} section 11:

Key requirements:
- Artifact types: markdown, table, progress, link, image
- Key vs keyless semantics (versioned vs one-off)
- Progress artifacts update in-place
- Database schema with partial unique constraint
- UI rendering with live updates

Study Prefect's artifact patterns for reference.

Output implementation plan for M6.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-artifact-types"}>
        <Phase name="M6-Artifact-Types">
          <Step name="create-artifact-models">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-artifact-api")}
            >
{`Create artifact type models:

smithers_py/artifacts/__init__.py - exports
smithers_py/artifacts/types.py:
  - ArtifactType enum: markdown, table, progress, link, image
  - MarkdownArtifact(type, content: str)
  - TableArtifact(type, columns: list[str], rows: list[dict])
  - ProgressArtifact(type, current: int, total: int, label: str | None)
  - LinkArtifact(type, url: str, label: str | None)
  - ImageArtifact(type, url: str, alt: str | None)
  - Artifact union type

smithers_py/artifacts/models.py:
  - ArtifactRecord(id, execution_id, node_id, frame_id, key, name, type, content, created_at, updated_at)

Update smithers_py/db/schema.sql:
  - artifacts table with partial unique constraint
  - Indexes for execution_id and key

Run migration to add artifacts table.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-artifact-api"}>
        <Phase name="M6-Artifact-API">
          <Step name="create-artifact-system">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-artifact-mcp")}
            >
{`Create ArtifactSystem API:

smithers_py/artifacts/system.py:

class ArtifactSystem:
    def __init__(self, db: SmithersDB, execution_id: str, node_id: str | None = None):
        self.db = db
        self.execution_id = execution_id
        self.node_id = node_id
        self.frame_id = db.frames.current_frame_id()

    def markdown(self, name: str, content: str, *, key: str | None = None) -> str:
        # Create/update markdown artifact
        # Returns artifact_id

    def table(self, name: str, columns: list[str], rows: list[dict], *, key: str | None = None) -> str:
        # Create/update table artifact

    def progress(self, name: str, current: int, total: int, *, key: str | None = None, label: str | None = None) -> str:
        # Create/update progress artifact
        # Same key = in-place update

    def link(self, name: str, url: str, *, key: str | None = None, label: str | None = None) -> str:
        # Create link artifact

    def image(self, name: str, data: bytes | str, *, key: str | None = None, alt: str | None = None) -> str:
        # Create image artifact (data URL or file path)

Key semantics:
- key=None: always creates new artifact (keyless)
- key="my-key": upserts (updates if exists, creates if not)

Update Context class to include artifact system:
  ctx.artifact = ArtifactSystem(db, execution_id, node_id)

Write tests for all artifact operations.`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-artifact-mcp"}>
        <Phase name="M6-Artifact-MCP">
          <Step name="add-artifact-resources">
            <Claude
              model="sonnet"
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("implement-artifact-ui")}
            >
{`Add MCP resources for artifacts:

Update smithers_py/mcp/resources.py:
  - smithers://executions/{id}/artifacts (list)
  - smithers://artifacts/{id} (single artifact detail)
  - smithers://artifacts?key=mykey (lookup by key)

Add streaming notifications:
  - smithers.artifact.created
  - smithers.artifact.updated (for keyed artifacts)

Update smithers_py/mcp/tools.py:
  - artifact.list(execution_id, type_filter?)
  - artifact.get(artifact_id)
  - artifact.delete(artifact_id) # admin only

Global artifacts resource:
  - smithers://artifacts (all artifacts, paginated)
  - Filter by: execution_id, key, type, time_range`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "implement-artifact-ui"}>
        <Phase name="M6-Artifact-UI">
          <Step name="build-artifact-components">
            <Claude
              model="sonnet"
              maxTurns={50}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m6")}
            >
{`Build artifact UI components:

smithers_ui/src/components/artifacts/:

1. ArtifactRenderer.tsx:
   - Switch on artifact.type
   - MarkdownRenderer: syntax highlighting, code blocks
   - TableRenderer: sortable, filterable columns
   - ProgressRenderer: animated progress bar
   - LinkRenderer: clickable with icon
   - ImageRenderer: responsive with lightbox

2. ArtifactList.tsx:
   - Group by type
   - Sort by created_at
   - Live updates via SSE

3. ArtifactHistory.tsx (for keyed artifacts):
   - Version timeline
   - Diff between versions

4. Add Artifacts tab to Execution Detail:
   - List artifacts for execution
   - Click to expand/view

5. Global Artifacts Page (smithers_ui/src/pages/Artifacts.tsx):
   - Search by key, name, execution
   - Filter by type, time range
   - Paginated results

6. Progress artifact live updates:
   - Subscribe to smithers.artifact.updated
   - Animate progress bar changes`}
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "verify-m6"}>
        <Phase name="M6-Verification">
          <Step name="test-artifacts">
            <Claude
              model="sonnet"
              maxTurns={30}
              allowedTools={["Read", "Bash", "Grep"]}
              onFinished={(r) => {
                if (r.output.includes("passed") || r.output.includes("OK")) {
                  setMilestone("COMPLETE");
                } else {
                  setPhase("implement-artifact-types");
                }
              }}
            >
{`Test artifacts system:

1. Unit tests:
   - python -m pytest smithers_py/artifacts/ -v
   - Test all artifact type creation
   - Test key vs keyless semantics
   - Test progress update in-place

2. Integration test (smithers_py/test_artifacts_integration.py):
   - Create workflow that produces artifacts
   - markdown: analysis summary
   - table: metrics data
   - progress: step completion
   - Verify all persisted to DB
   - Verify MCP resources return correct data

3. UI test:
   - Build: cd smithers_ui && bun run build
   - Verify artifact components render
   - Test live progress updates

4. E2E test:
   - Run workflow with artifacts
   - Watch in UI
   - Verify progress bar animates
   - Verify markdown renders

Report results.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

// ============================================================================
// Main Workflow
// ============================================================================

function BuildSmithersPy() {
  const { db, reactiveDb } = useSmithers();

  const { data: milestoneData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'milestone'"
  );
  const milestone = milestoneData ?? "M0";

  return (
    <>
      <If condition={milestone === "M0"}>
        <M0_CoreRuntime />
      </If>

      <If condition={milestone === "M1"}>
        <M1_RunnableNodes />
      </If>

      <If condition={milestone === "M2"}>
        <M2_MCPServer />
      </If>

      <If condition={milestone === "M3"}>
        <M3_GUI />
      </If>

      <If condition={milestone === "M4"}>
        <M4_AdvancedConstructs />
      </If>

      <If condition={milestone === "M5"}>
        <M5_HarnessUI />
      </If>

      <If condition={milestone === "M6"}>
        <M6_Artifacts />
      </If>

      <If condition={milestone === "COMPLETE"}>
        <Phase name="Complete">
          <Step name="summary">
            <Claude
              model="sonnet"
              maxTurns={10}
              allowedTools={["Read", "Glob"]}
              onFinished={() => console.log("smithers-py build complete!")}
            >
{`Summarize what was built:

1. List all files in smithers_py/
2. Count lines of code
3. List key features implemented
4. Suggest next steps

Output final summary for the user.`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

function AppContent() {
  const { db, reactiveDb } = useSmithers();

  const { data: milestoneData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'milestone'"
  );
  const milestone = milestoneData ?? "M0";

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'phase'"
  );
  const phase = phaseData ?? "research";

  console.log(`\n=== Smithers-Py Builder ===`);
  console.log(`Milestone: ${milestone}`);
  console.log(`Phase: ${phase}`);
  console.log(`===========================\n`);

  return (
    <Ralph
      id="build-smithers-py"
      condition={() => {
        const m = db.state.get("milestone");
        return m !== "COMPLETE";
      }}
      maxIterations={100}
      onIteration={(i) => console.log(`\n--- Iteration ${i + 1} ---`)}
      onComplete={(iterations, reason) => {
        console.log(`\n=== Build Complete ===`);
        console.log(`Iterations: ${iterations}`);
        console.log(`Reason: ${reason}`);
        signalComplete();
      }}
    >
      <BuildSmithersPy />
    </Ralph>
  );
}

function App() {
  return (
    <SmithersProvider
      db={db}
      executionId={executionId}
      maxIterations={200}
    >
      <AppContent />
    </SmithersProvider>
  );
}

// ============================================================================
// Execute
// ============================================================================

const root = createSmithersRoot();

// Render the app (this starts the React reconciler)
await root.render(<App />);

// Wait for effects to execute (useMount in While component)
await new Promise(r => setTimeout(r, 200));

console.log("=== ORCHESTRATION PLAN ===");
console.log(root.toXML());
console.log("===========================\n");

try {
  // Wait for orchestration to complete via the external promise
  await orchestrationPromise;
  db.execution.complete(executionId, { summary: "smithers-py built successfully" });
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Build failed:", error.message);
  db.execution.fail(executionId, error.message);
  throw error;
} finally {
  root.dispose();
  db.close();
}
