#!/usr/bin/env bun
/** @jsxImportSource smithers-orchestrator */
/**
 * Build Smithers-Py E2E
 *
 * Architecture:
 * - Each implementation phase: Ralph(3x){Implement} → Ralph(until LGTM){Review} → Commit
 * - All agents have PRD context
 * - Implementation and review use opus, commits use sonnet
 * - Verification phases run tests and fix issues
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
  createOrchestrationPromise,
  signalOrchestrationCompleteByToken,
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/db";

const { promise: orchestrationPromise, token: orchestrationToken } = createOrchestrationPromise();

function signalComplete() {
  signalOrchestrationCompleteByToken(orchestrationToken);
}

const db = createSmithersDB({ path: ".smithers/build-smithers-py.db" });

let executionId: string;
const incomplete = db.execution.findIncomplete();
if (incomplete) {
  executionId = incomplete.id;
  console.log("Resuming execution:", executionId);
} else {
  executionId = db.execution.start("Build Smithers-Py", "build-smithers-py.tsx");
  db.state.set("milestone", "M0", "init");
  db.state.set("currentPhaseIndex", 0, "init");
}

const SPEC_PATH = "issues/smithers-py.md";

// ============================================================================
// Shared Context - ALL agents get this
// ============================================================================

const SPEC_CONTEXT = `
## PROJECT CONTEXT
You are building smithers-py, a Python orchestration library.
Full PRD and engineering spec: ${SPEC_PATH}

Key sections:
- 1) Product Requirements Document
- 2) Detailed requirements (state model, components, agents)
- 3) Engineering Design (architecture, data model, nodes)
- 7) Hardening Specifications (frame phases, node identity, task lifecycle)
- 9) Harness UI Specification
- 10) Harness API Specification
- 11) Artifacts System Specification

ALWAYS read the relevant spec sections before implementing.
`;

const PRODUCTION_REQUIREMENTS = `
## PRODUCTION REQUIREMENTS (MANDATORY)
1. **Complete Test Coverage**: ALL code paths including edge cases, errors, None values
2. **Error Handling**: Catch exceptions, meaningful messages, fail gracefully
3. **Validation**: Pydantic types, range checks, required fields
4. **If work appears complete**: Review thoroughly, add missing tests, fix edge cases
5. **Quality Checklist**:
   - [ ] All tests pass (python3 -m pytest -v)
   - [ ] No unhandled exceptions
   - [ ] Edge cases covered
   - [ ] Handles None/empty gracefully
`;

// ============================================================================
// P0 BLOCKERS FROM CODE REVIEW - MUST FIX
// ============================================================================

const P0_BLOCKERS = `
## P0 BLOCKERS (CRITICAL - FIX THESE FIRST)

### P0.1 Import Paths Must Be Package-Relative
ALL imports in smithers_py/ MUST use package-relative imports:
- WRONG: \`from db.database import SmithersDB\`
- RIGHT: \`from ..db.database import SmithersDB\`
- RIGHT: \`from smithers_py.db.database import SmithersDB\`

### P0.2 Execution ID Lifecycle
ExecutionModule.start() must allow caller to specify execution_id:
\`\`\`python
async def start(self, name: str, source_file: str, config: dict|None=None, execution_id: str|None=None) -> str:
    execution_id = execution_id or os.getenv('SMITHERS_EXECUTION_ID') or str(uuid.uuid4())
\`\`\`
All tests/scripts MUST use the returned execution_id, not pre-generated ones.

### P0.3 TasksModule.start() Schema Mismatch
Schema requires \`component_type TEXT NOT NULL\` but TasksModule.start() doesn't provide it.
FIX: Add component_type parameter to start() and all INSERT statements.

### P0.4 Duplicate SqliteStore - DO NOT Open Second Connection
There are two SqliteStore classes conflicting. The state/sqlite.py version opens its own connection.
FIX:
- ExecutionStateStore should accept a connection parameter, NOT a db_path
- Never open a second connection - share the SmithersDB connection
- For :memory: DBs, a second connection creates a SEPARATE database!

### P0.5 DB API Missing Methods
EventSystem and ClaudeExecutor call methods that don't exist:
- db.record_event(), db.current_execution_id
- db.get_agent_history(), db.save_agent_result(), db.save_tool_call(), db.update_agent_status()
FIX: Implement these in SmithersDB or appropriate modules.

### P0.6 ClaudeExecutor Bugs
1. Import bug: \`from typing import type\` is INVALID. Use \`Type\` or builtin \`type[...]\`
2. Persistence bug: Using run_id as execution_id is WRONG. Pass execution_id to execute().

### P0.7 TickLoop Must Loop Until Quiescence
Current run() calls _run_single_frame() ONCE and exits. Tasks never complete!
FIX: Loop while tasks are running OR state writes pending OR effects requested rerender.
\`\`\`python
while True:
    await self._run_single_frame()
    if self._is_quiescent():
        break
    await asyncio.sleep(self._next_tick_delay())
\`\`\`

### P0.8 Event Handler Write Routing
WriteOp with "v:" prefix goes to sqlite_state, never touches VolatileStore.
FIX: Add StoreTarget enum to WriteOp and route in Phase 7:
\`\`\`python
class StoreTarget(Enum): VOLATILE, SQLITE
@dataclass
class WriteOp: target: StoreTarget, key: str, value: Any, trigger: str
\`\`\`

## ARCHITECTURAL DECISION REQUIRED
State must be EXECUTION-SCOPED (not global) to support multiple concurrent executions.
- Use execution_state table keyed by (execution_id, key)
- Query state for specific execution in harness UI
`;

// ============================================================================
// Type definitions
// ============================================================================

type Milestone = "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "COMPLETE";

// ============================================================================
// Hooks
// ============================================================================

function useMilestone(): Milestone {
  const { reactiveDb } = useSmithers();
  const { data } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'milestone'"
  );
  return (data as Milestone) ?? "M0";
}

function useSetMilestone(): (m: Milestone) => void {
  const { db } = useSmithers();
  return (m) => {
    db.state.set("milestone", m, `transition_to_${m}`);
    db.state.set("currentPhaseIndex", 0, "reset_phase_for_milestone");
  };
}

function useReviewState(reviewId: string): { isApproved: boolean; setApproved: () => void } {
  const { db, reactiveDb } = useSmithers();
  const key = `review.${reviewId}.approved`;
  const { data } = useQueryValue<boolean>(
    reactiveDb,
    `SELECT json_extract(value, '$') as v FROM state WHERE key = '${key}'`
  );
  return {
    isApproved: data === true,
    setApproved: () => db.state.set(key, true, `review_approved_${reviewId}`),
  };
}

// ============================================================================
// Reusable Components
// ============================================================================

interface GitCommitProps {
  id: string;
  message: string;
}

/**
 * Commits changes with sonnet (cheap but capable).
 */
function GitCommit({ id, message }: GitCommitProps) {
  return (
    <Step name={`commit-${id}`}>
      <Claude
        model="sonnet"
        maxTurns={10}
        allowedTools={["Bash", "Read"]}
      >
        {`## GIT COMMIT: ${message}

Commit the current changes to git.

1. Run: git status
2. If there are changes to commit:
   - git add smithers_py/
   - git commit -m "${message}"
3. If no changes, just say "No changes to commit"

Keep it simple. Just commit the changes.`}
      </Claude>
    </Step>
  );
}

interface ImplementPhaseProps {
  id: string;
  name: string;
  prompt: string;
  children?: any;
}

/**
 * Standard implementation phase:
 * 1. Ralph (3x) around implementation only
 * 2. Ralph (until LGTM) around review only
 * 3. Commit with sonnet
 */
function ImplementPhase({ id, name, prompt }: ImplementPhaseProps) {
  const { db } = useSmithers();
  const implDoneKey = `impl.${id}.done`;
  const approvedKey = `impl.${id}.approved`;

  const reviewPrompt = `
## CODE REVIEW: ${name}

Review the implementation for ${name} thoroughly.

**Review Checklist:**
1. Does the implementation match the spec in ${SPEC_PATH}?
2. Are ALL code paths tested (happy path, edge cases, errors)?
3. Is error handling robust (no silent failures)?
4. Are inputs validated (types, ranges, required fields)?
5. Does code handle None/empty values gracefully?
6. Are there any unhandled exceptions possible?

**Your task:**
1. Run tests: python3 -m pytest smithers_py/ -v --tb=short
2. If tests fail or coverage is incomplete:
   - FIX the issues
   - ADD missing tests
   - Re-run tests until they pass
3. If ALL tests pass and code is production-ready, output "LGTM"

DO NOT say LGTM unless ALL tests pass. Fix issues first.`;

  return (
    <>
      {/* Phase 1: Implementation (3x Ralph) */}
      <Phase name={name}>
        <Ralph
          id={`impl-${id}`}
          condition={() => db.state.get(implDoneKey) !== true}
          maxIterations={3}
          onComplete={() => db.state.set(implDoneKey, true, `impl_done_${id}`)}
        >
          <Step name={`implement-${id}`}>
            <Claude model="opus" maxTurns={100} permissionMode="acceptEdits">
              {`${SPEC_CONTEXT}
${prompt}
${PRODUCTION_REQUIREMENTS}`}
            </Claude>
          </Step>
        </Ralph>
      </Phase>

      {/* Phase 2: Review (Ralph until LGTM) */}
      <Phase name={`${name}-Review`}>
        <Ralph
          id={`review-${id}`}
          condition={() => db.state.get(approvedKey) !== true}
          maxIterations={10}
          onComplete={() => db.state.set(approvedKey, true, `review_complete_${id}`)}
        >
          <Step name={`review-${id}`}>
            <Claude
              model="opus"
              maxTurns={60}
              permissionMode="acceptEdits"
              onFinished={(r) => {
                if (r.output.includes("LGTM") || r.output.includes("lgtm") || r.output.includes("looks good")) {
                  db.state.set(approvedKey, true, `review_passed_${id}`);
                }
              }}
            >
              {`${SPEC_CONTEXT}
${reviewPrompt}`}
            </Claude>
          </Step>
        </Ralph>
      </Phase>

      {/* Phase 3: Commit with sonnet */}
      <Phase name={`${name}-Commit`}>
        <GitCommit id={id} message={`feat(${id}): ${name}`} />
      </Phase>
    </>
  );
}

interface ResearchPhaseProps {
  id: string;
  name: string;
  prompt: string;
}

/**
 * Research phase - no review needed, just read and plan
 */
function ResearchPhase({ id, name, prompt }: ResearchPhaseProps) {
  return (
    <Phase name={name}>
      <Step name={`research-${id}`}>
        <Claude model="opus" maxTurns={40} allowedTools={["Read", "Glob", "Grep"]}>
          {`${SPEC_CONTEXT}
${prompt}`}
        </Claude>
      </Step>
    </Phase>
  );
}

interface VerifyPhaseProps {
  id: string;
  name: string;
  nextMilestone: Milestone;
  testPath?: string;
}

/**
 * Verification phase - run tests, fix issues, advance milestone
 */
function VerifyPhase({ id, name, nextMilestone, testPath = "smithers_py/" }: VerifyPhaseProps) {
  const setMilestone = useSetMilestone();

  return (
    <Phase name={name}>
      <Step name={`verify-${id}`}>
        <Claude
          model="opus"
          maxTurns={80}
          permissionMode="acceptEdits"
          onFinished={(r) => {
            if (r.output.includes("passed") || r.output.includes("PASSED")) {
              setMilestone(nextMilestone);
            }
          }}
        >
          {`${SPEC_CONTEXT}

## VERIFICATION: ${name}

Run ALL tests and ensure everything passes.

1. Run: python3 -m pytest ${testPath} -v --tb=short
2. If ANY tests fail:
   - Read the failing test and relevant code
   - FIX the issue
   - Re-run tests
3. If tests pass but coverage seems incomplete:
   - ADD missing tests for edge cases
   - Re-run tests
4. Keep fixing until ALL tests pass

The output MUST contain "passed" for the milestone to advance.
DO NOT proceed until all tests pass.`}
        </Claude>
      </Step>
    </Phase>
  );
}

// ============================================================================
// M0: Core Runtime Skeleton
// ============================================================================

function M0_CoreRuntime() {
  return (
    <>
      <ResearchPhase
        id="m0-research"
        name="M0-Research"
        prompt={`
## M0 RESEARCH

Read the full spec at ${SPEC_PATH} focusing on M0 requirements:
- Plan IR (Pydantic models for nodes) - section 3.3
- JSX runtime (jsx() function) - section 4
- XML serializer - section 3.1.2
- Volatile + SQLite state with snapshot/write-queue/commit - section 2.2, 7.4
- Simple tick loop with no runnable nodes - section 7.1

Also study the TypeScript implementation patterns in:
- src/reconciler/ (React reconciler patterns)
- src/db/ (SQLite schema and state management)
- src/components/ (component structure)

Output a structured implementation plan for M0.`}
      />

      <ImplementPhase
        id="m0-package"
        name="M0-Package-Structure"
        prompt={`
## M0: Package Structure

Create or COMPLETE smithers_py package (${SPEC_PATH} section 3.1):
1. Create smithers_py/ with pyproject.toml (python >=3.11, pydantic, pydantic-ai, aiosqlite)
2. Create __init__.py, py.typed
3. If package exists, review and ensure it's complete

Run: cd smithers_py && python3 -c "import smithers_py" to verify.`}
      />

      <ImplementPhase
        id="m0-nodes"
        name="M0-Plan-IR"
        prompt={`
## M0: Pydantic Node Models

Create or COMPLETE Pydantic node models (${SPEC_PATH} section 3.3, 4):
- smithers_py/nodes/base.py: NodeBase(BaseModel), Node type alias
- smithers_py/nodes/text.py: TextNode
- smithers_py/nodes/structural.py: IfNode, PhaseNode, StepNode, RalphNode
- smithers_py/nodes/runnable.py: ClaudeNode with event callbacks

If code exists, REVIEW it thoroughly:
- Ensure all node types are complete
- Add missing tests
- Fix any edge cases
- Verify Pydantic v2 patterns are correct

Write comprehensive tests in smithers_py/nodes/test_nodes.py`}
      />

      <ImplementPhase
        id="m0-jsx"
        name="M0-JSX-Runtime"
        prompt={`
## M0: JSX Runtime

Create or COMPLETE JSX runtime (${SPEC_PATH} section 4, 7.10):
- smithers_py/jsx_runtime.py: jsx(type_, props, *children), Fragment, INTRINSICS registry
- Validate event props only on observable nodes (section 8.3)

If code exists, REVIEW and COMPLETE:
- Test all intrinsic types
- Test children normalization edge cases
- Test error handling for invalid inputs

Write comprehensive tests in smithers_py/test_jsx_runtime.py`}
      />

      <ImplementPhase
        id="m0-xml"
        name="M0-XML-Serializer"
        prompt={`
## M0: XML Serializer

Create or COMPLETE XML serializer (${SPEC_PATH} section 3.1.2):
- smithers_py/serialize/xml.py: serialize_to_xml(node) -> XML string
- Tags are node types, props become attributes, children become nested elements

If code exists, REVIEW and COMPLETE:
- Test special character escaping (& < > " ')
- Test deeply nested structures
- Test empty nodes, None values
- Test all node types serialize correctly

Write tests in smithers_py/serialize/test_xml.py`}
      />

      <ImplementPhase
        id="m0-state"
        name="M0-State-Stores"
        prompt={`
## M0: State Stores

Create or COMPLETE state stores (${SPEC_PATH} section 2.2, 7.4):
- smithers_py/state/base.py: StateStore Protocol
- smithers_py/state/volatile.py: VolatileStore (in-memory)
- smithers_py/state/sqlite.py: ExecutionStateStore (persistent, EXECUTION-SCOPED)

Both must implement: get, set, snapshot, enqueue, commit

${P0_BLOCKERS}

**CRITICAL P0.4 FIX:**
- Rename SqliteStore to ExecutionStateStore
- Accept a CONNECTION parameter, NOT a db_path
- NEVER open a second connection (:memory: creates separate DB!)
- Use execution_state table keyed by (execution_id, key)

**CRITICAL P0.8 FIX:**
- Add StoreTarget enum (VOLATILE, SQLITE) to WriteOp
- WriteOp must include target store for routing in Phase 7

If code exists, REVIEW and FIX P0 issues first, then:
- Test concurrent access patterns
- Test transaction rollback on error
- Test snapshot isolation
- Test queue ordering

Write comprehensive tests in smithers_py/state/test_*.py`}
      />

      <ImplementPhase
        id="m0-db"
        name="M0-Database-Schema"
        prompt={`
## M0: Database Layer

Create or COMPLETE database layer (${SPEC_PATH} section 3.2, 7.11):
- smithers_py/db/schema.sql: executions, state, transitions, render_frames, tasks, agents, tool_calls
- smithers_py/db/database.py: SmithersDB class
- smithers_py/db/migrations.py: run_migrations()

Reference src/db/schema.ts for TS patterns

${P0_BLOCKERS}

**CRITICAL P0.2 FIX - ExecutionModule.start():**
\`\`\`python
async def start(self, name: str, source_file: str, config: dict|None=None, execution_id: str|None=None) -> str:
    execution_id = execution_id or os.getenv('SMITHERS_EXECUTION_ID') or str(uuid.uuid4())
    # ... insert with this execution_id
    return execution_id
\`\`\`

**CRITICAL P0.3 FIX - TasksModule.start():**
Schema requires component_type NOT NULL. Add it:
\`\`\`python
async def start(self, task_id: str, execution_id: str, component_type: str, component_name: str|None=None, ...):
    # INSERT INTO tasks (id, execution_id, component_type, ...)
\`\`\`

**CRITICAL P0.5 FIX - Add Missing DB Methods:**
SmithersDB must implement:
- record_event(execution_id, event_type, data)
- current_execution_id property
- agents.get_history(agent_id), agents.save_result(), agents.update_status()
- tool_calls.save()

If code exists, REVIEW and FIX P0 issues first, then:
- Test all CRUD operations
- Test foreign key constraints
- Test migration idempotency
- Test connection handling

Write tests in smithers_py/db/test_*.py`}
      />

      <ImplementPhase
        id="m0-tick"
        name="M0-Tick-Loop"
        prompt={`
## M0: Tick Loop Engine

Create or COMPLETE tick loop engine (${SPEC_PATH} section 7.1):
- smithers_py/engine/tick_loop.py: 7 phases (Snapshot -> Render -> Reconcile -> Commit -> Execute -> Effects -> Flush)
- class TickLoop with async run(), Context object (ctx.v, ctx.state, ctx.db, ctx.now(), ctx.frame_id)

${P0_BLOCKERS}

**CRITICAL P0.1 FIX - Import Paths:**
ALL imports MUST be package-relative:
\`\`\`python
# WRONG
from db.database import SmithersDB
# RIGHT
from ..db.database import SmithersDB
from smithers_py.db.database import SmithersDB
\`\`\`

**CRITICAL P0.7 FIX - Loop Until Quiescence:**
run() must NOT exit after one frame! Loop until:
- No running tasks AND
- No pending state writes AND
- No effects requested rerender
\`\`\`python
async def run(self) -> None:
    while True:
        await self._run_single_frame()
        if self._is_quiescent():
            break
        await asyncio.sleep(self._next_tick_delay())
\`\`\`

**CRITICAL P0.4 FIX - State Store Connection:**
DO NOT open second connection. Accept connection from SmithersDB:
\`\`\`python
self.sqlite_state = ExecutionStateStore(db.connection, execution_id)
\`\`\`

If code exists, REVIEW and FIX P0 issues first, then:
- Test each phase independently
- Test phase ordering
- Test error handling in each phase
- Test frame persistence
- Test loop continues until quiescence

Write integration test verifying XML frame saved and state snapshot isolation.`}
      />

      <VerifyPhase
        id="m0-verify"
        name="M0-Verification"
        nextMilestone="M1"
      />
    </>
  );
}

// ============================================================================
// M1: Runnable Nodes + Event Handlers
// ============================================================================

function M1_RunnableNodes() {
  return (
    <>
      <ResearchPhase
        id="m1-research"
        name="M1-Research"
        prompt={`
## M1 RESEARCH

Research PydanticAI for M1 (${SPEC_PATH} section 2.4, 3.7, 7.3):
- pydantic-ai docs, Agent class, structured output, tool/function calling, retry
- Agent runtime requirements, executors, event enforcement, task leases

Output implementation plan for ClaudeNode executor.`}
      />

      <ImplementPhase
        id="m1-executor"
        name="M1-Claude-Executor"
        prompt={`
## M1: Claude Executor

Create or COMPLETE Claude executor (${SPEC_PATH} section 3.7, 7.3, 7.6):
- smithers_py/executors/base.py: Executor Protocol, AgentResult
- smithers_py/executors/claude.py: ClaudeExecutor with model selection, streaming, db persistence
- smithers_py/executors/retry.py: rate-limit coordinator, error classification (section 7.6)
- Update tick_loop.py: find_runnable(), execute()

${P0_BLOCKERS}

**CRITICAL P0.6 FIX - ClaudeExecutor Bugs:**
1. IMPORT BUG: \`from typing import type\` is INVALID!
   - Use \`from typing import Type\` or just builtin \`type[...]\`
2. PERSISTENCE BUG: Using run_id as execution_id is WRONG!
   - Add execution_id parameter to execute()
   - Pass correct execution_id to all DB methods:
\`\`\`python
async def execute(self, node: ClaudeNode, execution_id: str, ...) -> AgentResult:
    await self.db.agents.save_result(execution_id=execution_id, ...)
\`\`\`

**CRITICAL P0.1 FIX - Import Paths:**
ALL imports must be package-relative (from ..db.database import ...)

If code exists, REVIEW and FIX P0 issues first, then:
- Test all error types (rate limit, timeout, auth failure)
- Test retry logic with backoff
- Test streaming works correctly
- Test DB persistence of results WITH CORRECT execution_id

Write tests with mocked Claude responses using PydanticAI TestModel.`}
      />

      <ImplementPhase
        id="m1-events"
        name="M1-Event-Handlers"
        prompt={`
## M1: Event Handler System

Create or COMPLETE event handler system (${SPEC_PATH} section 2.1.3, 7.2.4, 8.5):
1. tick_loop execute phase: call onFinished/onError, handle stale results
2. Enforce events only on observable nodes (not If/Phase/Step)
3. State actions model: deterministic flush order (section 7.4)
4. Commit phase: atomic writes, record transitions
5. Test event -> state -> re-render flow

${P0_BLOCKERS}

**CRITICAL P0.5 FIX - DB API Missing:**
EventSystem calls methods that don't exist:
- db.record_event() - IMPLEMENT THIS
- db.current_execution_id - ADD THIS PROPERTY
Implement these in SmithersDB or create EventsModule.

**CRITICAL P0.8 FIX - Write Routing:**
WriteOp with "v:" prefix goes to sqlite, never touches VolatileStore!
FIX: Add StoreTarget enum and route correctly:
\`\`\`python
class StoreTarget(Enum):
    VOLATILE = "volatile"
    SQLITE = "sqlite"

@dataclass
class WriteOp:
    target: StoreTarget
    key: str
    value: Any
    trigger: str

# In Phase 7 flush:
for op in state_changes:
    if op.target == StoreTarget.VOLATILE:
        self.volatile_store.enqueue(op)
    else:
        self.sqlite_state.enqueue(op)
\`\`\`

If code exists, REVIEW and FIX P0 issues first, then:
- Test handler error handling
- Test stale result detection
- Test deterministic ordering
- Test atomic commit/rollback
- Test volatile vs sqlite routing`}
      />

      <VerifyPhase
        id="m1-verify"
        name="M1-Verification"
        nextMilestone="M2"
      />
    </>
  );
}

// ============================================================================
// M2: MCP Server MVP
// ============================================================================

function M2_MCPServer() {
  return (
    <>
      <ResearchPhase
        id="m2-research"
        name="M2-Research"
        prompt={`
## M2 RESEARCH

Research Python MCP SDK (${SPEC_PATH} section 7.8, 10):
- MCP SDK docs, resources/tools patterns, stdio + HTTP transports
- Security: Origin validation, localhost binding, DNS rebinding, sessions (section 7.8.2)

Output implementation plan for MCP server.`}
      />

      <ImplementPhase
        id="m2-resources"
        name="M2-MCP-Resources"
        prompt={`
## M2: MCP Resources

Create or COMPLETE MCP resources (${SPEC_PATH} section 10.3):
- smithers_py/mcp/resources.py: executions, frames, state, agents, stream
- URIs: smithers://executions/{id}, smithers://executions/{id}/frames/{seq}, etc.

If code exists, REVIEW and COMPLETE:
- Test all resource types
- Test pagination
- Test error responses
- Test invalid URIs`}
      />

      <ImplementPhase
        id="m2-tools"
        name="M2-MCP-Tools"
        prompt={`
## M2: MCP Tools

Create or COMPLETE MCP tools (${SPEC_PATH} section 10.4):
- smithers_py/mcp/tools.py: start_execution, tick, run_until_idle, stop
- pause/resume, set_state, restart_from_frame, get_frame

If code exists, REVIEW and COMPLETE:
- Test each tool independently
- Test invalid parameters
- Test authorization
- Test concurrent calls`}
      />

      <ImplementPhase
        id="m2-transports"
        name="M2-MCP-Transports"
        prompt={`
## M2: MCP Server & Transports

Create or COMPLETE MCP server (${SPEC_PATH} section 7.8):
- smithers_py/mcp/server.py: McpCore, session management
- StdioTransport: newline-delimited JSON-RPC
- HttpTransport: localhost only, Origin validation, auth token (section 7.8.2)
- CLI: python -m smithers_py serve --transport stdio|http

If code exists, REVIEW and COMPLETE:
- Test Origin validation
- Test auth token generation/validation
- Test session lifecycle
- Test malformed requests`}
      />

      <VerifyPhase
        id="m2-verify"
        name="M2-Verification"
        nextMilestone="M3"
        testPath="smithers_py/mcp/"
      />
    </>
  );
}

// ============================================================================
// M3: GUI MVP
// ============================================================================

function M3_GUI() {
  return (
    <>
      <ResearchPhase
        id="m3-research"
        name="M3-Research"
        prompt={`
## M3 RESEARCH

Research GUI implementation (${SPEC_PATH} section 2.6, 7.12):
- Zig-webui for native shell, Solid.js for frontend
- Architecture: Zig spawns Python MCP, passes auth token to UI (section 7.12)

Output implementation plan.`}
      />

      <ImplementPhase
        id="m3-gui"
        name="M3-GUI-Implementation"
        prompt={`
## M3: GUI MVP

Build or COMPLETE smithers-py GUI MVP (${SPEC_PATH} section 7.12, milestone 7):
1. smithers_gui/: Zig project with webui, spawns Python MCP, opens webview
2. smithers_ui/: Solid.js with signals
   - ExecutionList, FrameTimeline, PlanViewer, StateInspector, AgentPanel, ControlPanel
3. Connect to MCP via fetch with auth token

If code exists, REVIEW and COMPLETE:
- Ensure all components render correctly
- Test error states
- Test loading states
- Test connection failure handling`}
      />

      <VerifyPhase
        id="m3-verify"
        name="M3-Verification"
        nextMilestone="M4"
        testPath="smithers_ui/"
      />
    </>
  );
}

// ============================================================================
// M4: Advanced Workflow Constructs
// ============================================================================

function M4_AdvancedConstructs() {
  return (
    <>
      <ResearchPhase
        id="m4-research"
        name="M4-Research"
        prompt={`
## M4 RESEARCH

Research advanced constructs (${SPEC_PATH} section 2.3, 7.2, 7.5):
- Study src/components/: While.tsx, Phase.tsx, Step.tsx, Parallel.tsx
- Ralph/While loop semantics, Phase/Step gating, Effects, Node identity (section 7.2)

Plan Python equivalents.`}
      />

      <ImplementPhase
        id="m4-identity"
        name="M4-Node-Identity"
        prompt={`
## M4: Stable Node Identity

Create or COMPLETE stable node identity (${SPEC_PATH} section 7.2, 8.2):
- smithers_py/engine/identity.py: compute_node_id (SHA256, NOT Python hash!)
- smithers_py/engine/reconciler.py: diff_trees, mount/unmount detection
- smithers_py/lint/identity_lint.py: warn missing ids (section 7.9.3)
- Persist script_hash, git_commit, engine_version for resume (section 7.2.5)

If code exists, REVIEW and COMPLETE:
- Test deterministic ID generation
- Test resume with same/different script
- Test mount/unmount detection`}
      />

      <ImplementPhase
        id="m4-ralph"
        name="M4-Ralph-While"
        prompt={`
## M4: Ralph/While Loop

Create or COMPLETE Ralph/While loop (${SPEC_PATH} section 2.3.2, milestone 4):
- smithers_py/nodes/ralph.py: RalphNode with condition, max_iterations, required id
- smithers_py/engine/ralph_loop.py: iteration tracking
- smithers_py/components/while_context.py: WhileContext, signal_complete

If code exists, REVIEW and COMPLETE:
- Test max iterations enforcement
- Test condition evaluation
- Test resume from iteration N
- Test signal_complete works`}
      />

      <ImplementPhase
        id="m4-phase"
        name="M4-Phase-Step"
        prompt={`
## M4: Phase/Step Sequencing

Create or COMPLETE Phase/Step sequencing (${SPEC_PATH} section 2.3.2, milestone 4):
- smithers_py/nodes/phase.py: PhaseNode (only active renders children)
- smithers_py/nodes/step.py: StepNode (sequential within phase)
- smithers_py/engine/phase_registry.py: track/advance/persist phase index

If code exists, REVIEW and COMPLETE:
- Test phase activation logic
- Test step sequencing
- Test persistence and resume
- Test skipped phases`}
      />

      <ImplementPhase
        id="m4-parallel"
        name="M4-Parallel"
        prompt={`
## M4: Parallel Execution

Create or COMPLETE Parallel execution (${SPEC_PATH} section 2.3.2):
- smithers_py/nodes/parallel.py: ParallelNode
- tick_loop: find_runnable returns all Parallel children, asyncio.gather

If code exists, REVIEW and COMPLETE:
- Test concurrent execution
- Test one child failing
- Test all children failing
- Test cancellation`}
      />

      <ImplementPhase
        id="m4-effects"
        name="M4-Effects"
        prompt={`
## M4: Effects as First-Class Nodes

Create or COMPLETE effects as first-class nodes (${SPEC_PATH} section 3.4.3, 7.5):
- smithers_py/nodes/effect.py: EffectNode(id, deps, run, cleanup) - visible in plan tree!
- smithers_py/engine/effects.py: EffectRegistry, dep tracking, cleanup, loop detection (section 7.5.3)
- ctx.use_effect() in smithers_py/context.py

If code exists, REVIEW and COMPLETE:
- Test effect runs on dep change
- Test cleanup called
- Test loop detection
- Test effect errors handled`}
      />

      <VerifyPhase
        id="m4-verify"
        name="M4-Verification"
        nextMilestone="M5"
      />
    </>
  );
}

// ============================================================================
// M5: Harness UI (Production-Grade)
// ============================================================================

function M5_HarnessUI() {
  return (
    <>
      <ResearchPhase
        id="m5-research"
        name="M5-Research"
        prompt={`
## M5 RESEARCH

Research harness UI requirements (${SPEC_PATH} sections 9, 10, 11):
- 3-pane execution detail (section 9.3)
- Operator actions (section 9.4)
- MCP streaming (section 10.5)

Output implementation plan.`}
      />

      <ImplementPhase
        id="m5-mcp-resources"
        name="M5-MCP-Resources"
        prompt={`
## M5: Expanded MCP Resources

Create or COMPLETE expanded MCP resources (${SPEC_PATH} section 10.3):
- Full resource set: executions, frames, events, nodes, artifacts, approvals, scripts, health
- Pydantic models in smithers_py/mcp/models.py (section 10.2)
- Cursor-based pagination

If code exists, REVIEW and COMPLETE all resources with full test coverage.`}
      />

      <ImplementPhase
        id="m5-mcp-tools"
        name="M5-MCP-Tools"
        prompt={`
## M5: Expanded MCP Tools

Create or COMPLETE expanded MCP tools (${SPEC_PATH} section 10.4):
- Execution control: start, pause, resume, stop, terminate, export
- Node control: cancel, retry, rerun_from, fork_from_frame
- State control: set, update, approval.respond
- Audit logging, confirmation for dangerous actions (section 9.4.4)

If code exists, REVIEW and COMPLETE all tools with full test coverage.`}
      />

      <ImplementPhase
        id="m5-streaming"
        name="M5-Streaming"
        prompt={`
## M5: MCP Streaming

Create or COMPLETE MCP streaming (${SPEC_PATH} section 10.5):
- smithers_py/mcp/notifications.py: notification classes
- SSE endpoint, event IDs, Last-Event-ID, bounded buffer (section 7.8.4)
- Emit: frame.created, node.updated, task.updated, agent.stream, approval.requested

If code exists, REVIEW and COMPLETE with tests for reconnection, backpressure.`}
      />

      <ImplementPhase
        id="m5-ui"
        name="M5-UI-Components"
        prompt={`
## M5: Harness UI Components

Build or COMPLETE Solid.js harness UI (${SPEC_PATH} section 9):
- smithers_ui/: Navigation (section 9.2), Dashboard (9.2.1), Executions (9.2.2)
- Execution Detail 3-pane (section 9.3): Plan Tree, Timeline+Frame, Inspector
- Connect to MCP, SSE streaming for live updates

If code exists, REVIEW and COMPLETE all components with error handling.`}
      />

      <ImplementPhase
        id="m5-actions"
        name="M5-Operator-Actions"
        prompt={`
## M5: Operator Actions UI

Create or COMPLETE operator action UI (${SPEC_PATH} section 9.4):
- ExecutionActions (9.4.1), NodeActions (9.4.2), StateEditor (9.4.3)
- ForkFromFrame, ConfirmationDialog, two-step confirmation
- Audit trail (section 9.4.4)

If code exists, REVIEW and COMPLETE all actions with confirmation dialogs.`}
      />

      <ImplementPhase
        id="m5-failures"
        name="M5-Failure-Views"
        prompt={`
## M5: Failure Views

Create or COMPLETE failure views (${SPEC_PATH} section 9.5):
- FailureDetector in smithers_py/engine/failure_detector.py
- smithers://failures resource
- FailureView UI page, dashboard integration, saved views

If code exists, REVIEW and COMPLETE with tests for failure detection.`}
      />

      <VerifyPhase
        id="m5-verify"
        name="M5-Verification"
        nextMilestone="M6"
        testPath="smithers_py/mcp/"
      />
    </>
  );
}

// ============================================================================
// M6: Artifacts System
// ============================================================================

function M6_Artifacts() {
  return (
    <>
      <ResearchPhase
        id="m6-research"
        name="M6-Research"
        prompt={`
## M6 RESEARCH

Research artifacts system (${SPEC_PATH} section 11, 8.15):
- Types: markdown, table, progress, link, image (section 11.1)
- Key vs keyless semantics (section 11.3), progress update in-place
- DB schema with partial unique constraint (section 11.4)

Output implementation plan.`}
      />

      <ImplementPhase
        id="m6-types"
        name="M6-Artifact-Types"
        prompt={`
## M6: Artifact Types

Create or COMPLETE artifact types (${SPEC_PATH} section 11.1, 11.4):
- smithers_py/artifacts/types.py: ArtifactType enum, type classes
- smithers_py/artifacts/models.py: ArtifactRecord
- Update DB schema with artifacts table (UNIQUE constraint WHERE key IS NOT NULL)

If code exists, REVIEW and COMPLETE with tests for all artifact types.`}
      />

      <ImplementPhase
        id="m6-api"
        name="M6-Artifact-API"
        prompt={`
## M6: ArtifactSystem API

Create or COMPLETE ArtifactSystem API (${SPEC_PATH} section 11.2, 8.15):
- smithers_py/artifacts/system.py: ArtifactSystem class
- Methods: markdown, table, progress, link, image
- Key semantics: None=keyless (history), string=upsert (section 11.3)
- Add ctx.artifact to Context

If code exists, REVIEW and COMPLETE with tests for key vs keyless semantics.`}
      />

      <ImplementPhase
        id="m6-mcp"
        name="M6-Artifact-MCP"
        prompt={`
## M6: MCP Artifact Resources

Create or COMPLETE MCP artifact resources (${SPEC_PATH} section 10.3):
- smithers://executions/{id}/artifacts, smithers://artifacts/{id}
- Streaming: artifact.created, artifact.updated (section 10.5)
- Tools: artifact.list, artifact.get, artifact.delete

If code exists, REVIEW and COMPLETE with full test coverage.`}
      />

      <ImplementPhase
        id="m6-ui"
        name="M6-Artifact-UI"
        prompt={`
## M6: Artifact UI

Build or COMPLETE artifact UI (${SPEC_PATH} section 11.5):
- smithers_ui/src/components/artifacts/: ArtifactRenderer, ArtifactList, ArtifactHistory
- Global Artifacts page, Execution Detail tab
- Progress artifact live updates via SSE

If code exists, REVIEW and COMPLETE all components.`}
      />

      <VerifyPhase
        id="m6-verify"
        name="M6-Verification"
        nextMilestone="COMPLETE"
        testPath="smithers_py/artifacts/"
      />
    </>
  );
}

// ============================================================================
// Main Workflow
// ============================================================================

function BuildSmithersPy() {
  const milestone = useMilestone();

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
              maxTurns={20}
              allowedTools={["Read", "Glob", "Bash"]}
              onFinished={() => console.log("smithers-py build complete!")}
            >
              {`${SPEC_CONTEXT}

## BUILD COMPLETE

Summarize the completed smithers-py build:
1. List all files in smithers_py/ with: find smithers_py -name "*.py" | head -50
2. Count total lines of code: find smithers_py -name "*.py" | xargs wc -l | tail -1
3. Run final test suite: python3 -m pytest smithers_py/ -v --tb=short | tail -30
4. List key features implemented
5. Suggest next steps for production deployment`}
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

function AppContent() {
  const { db } = useSmithers();
  const milestone = useMilestone();

  console.log(`\n=== Smithers-Py Builder [${milestone}] ===\n`);

  return (
    <Ralph
      id="build-smithers-py"
      condition={() => {
        const m = db.state.get("milestone");
        return m !== "COMPLETE";
      }}
      maxIterations={300}
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
      maxIterations={600}
    >
      <AppContent />
    </SmithersProvider>
  );
}

// ============================================================================
// Execute
// ============================================================================

const root = createSmithersRoot();

await root.render(<App />);
await new Promise(r => setTimeout(r, 200));

console.log("=== ORCHESTRATION PLAN ===");
console.log(root.toXML());
console.log("===========================\n");

try {
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
