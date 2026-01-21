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
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/db";

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
  
  const phase = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"
  ) ?? "research";
  
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
  - tasks: id, name, status, started_at, completed_at
  - agents: id, execution_id, node_path, model, status, prompt, output
  - tool_calls: id, agent_id, tool_name, input, output, timestamp

smithers_py/db/database.py:
  - SmithersDB class wrapping sqlite3/aiosqlite
  - db.execution.start(), .complete(), .findIncomplete()
  - db.state (SqliteStore instance)
  - db.tasks.start(), .complete()
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

The loop implements: Snapshot → Render → Persist → Execute → Commit → Effects

1. TickLoop class:
   - __init__(db, volatile_state, app_component)
   - async run() - main loop
   
2. Each tick:
   a. snapshot(): freeze both volatile and sqlite state
   b. render(): evaluate app component with frozen state -> Node tree
   c. persist(): serialize to XML, save to render_frames
   d. find_runnable(): traverse tree for runnable nodes (skip for M0)
   e. execute(): run runnable nodes (no-op for M0)
   f. commit(): apply queued state writes
   g. Check stop condition (no runnable nodes + no pending writes)

3. Context object (ctx):
   - ctx.v: VolatileStore
   - ctx.state: SqliteStore (snapshot view)
   - ctx.db: SmithersDB handle

4. For M0, the loop just renders and exits since no runnable nodes.

Write integration test that:
- Creates app with IfNode + PhaseNode
- Runs tick loop
- Verifies XML frame saved to DB`}
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
  
  const phase = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"
  ) ?? "research";
  
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

Also read ${SPEC_PATH} sections on:
- FR5: Runnable nodes & agent execution
- Executors using PydanticAI
- Event enforcement + onFinished state transitions

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

Update tick_loop.py:
  - find_runnable() returns ClaudeNode instances
  - execute() calls ClaudeExecutor for each
  - Store results in DB

Write test with mocked Claude responses.`}
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

2. Enforce events only on observable nodes:
   - ClaudeNode, SmithersNode, ReviewNode can have events
   - IfNode, PhaseNode, StepNode cannot
   - Validation in jsx_runtime.py

3. Update commit phase:
   - All queued state writes from event handlers applied here
   - This triggers re-render on next tick if state changed

4. Test: 
   - ClaudeNode with onFinished that sets state
   - Verify state updated after tick
   - Verify re-render with new state`}
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
  
  const phase = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"
  ) ?? "research";
  
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

Read ${SPEC_PATH} section on FR8:
- MCP resources: executions, frames, state
- MCP tools: start/run/tick/stop, set_state
- Both transports required

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
   - Get agent details + output
   - URI: smithers://agents/{id}

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

5. Tool: set_state
   - Set a state key
   - Params: key, value, trigger
   - Returns updated state

6. Tool: get_frame
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

1. SmithersMCPServer class:
   - Composes resources and tools
   - Configurable transport

2. stdio transport:
   - Newline-delimited JSON-RPC
   - For CLI integration

3. Streamable HTTP transport:
   - For browser/GUI clients
   - Bind to localhost only
   - Validate Origin header (security)

4. CLI entry point:
   smithers_py/cli.py or __main__.py:
   - python -m smithers_py serve --transport stdio
   - python -m smithers_py serve --transport http --port 8080

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
  
  const phase = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"
  ) ?? "research";
  
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
- FR9: Desktop GUI
- Zig-webui for native shell
- Solid.js for frontend

Research:
1. zig-webui: https://github.com/nicbarker/zig-webui
2. Solid.js basics
3. How to connect to MCP Streamable HTTP from browser

Output implementation plan for:
- Zig host that spawns Python MCP server
- Solid.js UI with frame timeline, plan viewer, state inspector`}
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
   - Spawns Python MCP server
   - Opens webview with Solid.js app

4. Create smithers_ui/ directory for Solid.js
5. Set up with: bunx degit solidjs/templates/ts smithers_ui
6. Build Solid.js components:
   - ExecutionList: shows all executions
   - FrameTimeline: scrubber through frames
   - PlanViewer: renders XML frame as tree
   - StateInspector: shows state diffs

7. Connect to MCP via fetch to localhost

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
  
  const phase = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"
  ) ?? "research";
  
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
              onFinished={() => setPhase("implement-ralph")}
            >
{`Research advanced constructs for M4:

Study TypeScript implementations in src/components/:
- While.tsx / Ralph pattern
- Phase.tsx and Step.tsx sequencing
- Parallel.tsx concurrent execution

Read ${SPEC_PATH} on:
- Ralph/While loop semantics
- Phase/Step gating
- Effects system

Plan implementation for Python equivalents.`}
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
- RalphNode with condition, max_iterations, id
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
              maxTurns={40}
              permissionMode="acceptEdits"
              onFinished={() => setPhase("verify-m4")}
            >
{`Implement effects system:

smithers_py/engine/effects.py:
- EffectRegistry keyed by component path
- use_effect(fn, deps) registration
- Track previous deps for comparison
- Run effects post-commit if deps changed

Update tick loop:
- After commit, run registered effects
- Effects can schedule state updates for next tick

smithers_py/context.py:
- ctx.use_effect(fn, deps)
- Component identity from node path

Test effect runs on dep change.`}
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
                  setPhase("implement-ralph");
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

Report final test results.`}
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
  
  const milestone = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'milestone'"
  ) ?? "M0";

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
  
  const milestone = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'milestone'"
  ) ?? "M0";

  const phase = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"  
  ) ?? "research";

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
      }}
    >
      <BuildSmithersPy />
    </Ralph>
  );
}

function App() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={200}>
      <AppContent />
    </SmithersProvider>
  );
}

// ============================================================================
// Execute
// ============================================================================

const root = createSmithersRoot();

console.log("=== ORCHESTRATION PLAN ===");
console.log(root.toXML());
console.log("===========================\n");

try {
  await root.mount(App);
  db.execution.complete(executionId, { summary: "smithers-py built successfully" });
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Build failed:", error.message);
  db.execution.fail(executionId, error.message);
  throw error;
} finally {
  db.close();
}
