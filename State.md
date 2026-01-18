# React Runtime State Reference

Comprehensive documentation of all state management in `src/components/`

## Overview

- **Total Components:** 30+ files
- **Stateful Components:** 18
- **State Variables:** **ZERO useState calls** (eliminated Jan 2026)
- **Contexts:** 7 Context providers
- **Database-Backed State:** All durable state via SQLite + `useQuery`/`useQueryValue`

## CRITICAL: NO useState in Orchestration

**As of commit 5e3536e (Jan 18, 2026), useState is BANNED in orchestration components.**

### Exception: TUI Components (src/tui/)

**IMPORTANT:** The useState ban applies ONLY to orchestration components (`src/components/`).

```
┌──────────────────────────────────────────────────────────────┐
│  Orchestration (src/components/)  │  TUI (src/tui/)          │
├──────────────────────────────────────────────────────────────┤
│  ❌ NO useState                    │  ✅ useState OK          │
│  ✅ SQLite + useQuery              │  ✅ SQLite polling       │
│  ✅ useRef + forceUpdate           │  ✅ useRef               │
│  Purpose: Durable workflows        │  Purpose: Ephemeral UI   │
│  Survives: Process restart         │  Survives: Nothing       │
└──────────────────────────────────────────────────────────────┘
```

**Why the difference?**
- **Orchestration** runs long-running workflows (hours/days) that must survive crashes
- **TUI** is a monitoring UI that can crash/restart anytime without affecting orchestration
- TUI state (selected index, scroll position) is transient and doesn't need persistence

See `docs/tui-architecture.md` for full TUI documentation.

### State Management Patterns (Orchestration)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SQLite (durable, survives restart)  │ useQuery/useQueryValue  │
│ 2. useRef (ephemeral, non-reactive)    │ Direct mutation         │
│ 3. Derived/computed                     │ Calculate, don't store  │
└─────────────────────────────────────────────────────────────────┘
```

1. **Database-Backed Reactive State** - `useQuery`/`useQueryValue` from `reactive-sqlite`
2. **Non-Reactive Ephemeral** - `useRef` for IDs, lifecycle guards, intervals
3. **Force Update Pattern** - `useReducer` + `forceUpdate` when needed
4. **Context Providers** - Global shared state via React Context
5. **Async Task Lifecycle** - All async operations tracked in SQLite tasks table

### Conventions
- **NO useState allowed** - use SQLite or useRef
- All agent state in `db.agents` table (status, result, error, tokens)
- VCS operations in `db.vcs` table
- Task registration via `db.tasks.start()` / `db.tasks.complete()`
- Cleanup handled via `useUnmount` (not `useEffect`)
- Mount-once side effects via `useMount` (not `useEffect`)
- React to ralphCount changes via `useEffectOnValueChange`

---

## Global State (Context Providers)

### SmithersProvider (`src/components/SmithersProvider.tsx`)

**Primary global context for entire application**

#### Context Value
- **Type:** `SmithersContextValue`
- **Location:** line 170
- **Provides:**
  - `db` - SQLite database instance
  - `executionId` - Current execution UUID
  - `config` - SmithersConfig
  - `stop()` - Signal orchestration stop
  - `rebase()` - Signal orchestration rebase

#### Database-Backed State (useQuery/useQueryValue)
```typescript
// Stop signal
const stopRequested = useQueryValue(reactiveDb,
  "SELECT CASE WHEN value IS NOT NULL...", [executionId])

// Rebase signal
const rebaseRequested = useQueryValue(reactiveDb,
  "SELECT CASE WHEN value IS NOT NULL...", [executionId])

// Ralph count tracking
const dbRalphCount = useQueryValue(reactiveDb,
  "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'", [])

// Running tasks
const runningTaskCount = useQueryValue(reactiveDb,
  "SELECT COUNT(*) as count FROM tasks WHERE status IN ('running', 'starting')...", [executionId])

// Total tasks
const totalTaskCount = useQueryValue(reactiveDb,
  "SELECT COUNT(*) as count FROM tasks WHERE executionId = ?", [executionId])
```

#### Refs
- `hasCompletedRef` (line 194) - Prevents duplicate orchestration completion

#### Module-Level State
- `globalSmithersContext` - Fallback context when React Context unavailable (universal renderer)
- `_orchestrationResolve`, `_orchestrationReject` - Promise handlers for orchestration completion

---

### PhaseRegistry (`src/components/PhaseRegistry.tsx`)

**Manages multi-phase execution workflow**

#### Context Value
- **Type:** `PhaseRegistryContextValue`
- **Location:** createContext call
- **Provides:**
  - `registerPhase(name: string)`
  - `currentPhaseIndex: number`
  - `isPhaseActive(name: string): boolean`

#### Local State
```typescript
// Line 53: Registered phase names
const [phases, setPhases] = useState<string[]>([])
```

#### Database-Backed State
```typescript
// Current phase index from SQLite
const dbPhaseIndex = useQueryValue(db,
  "SELECT CAST(value AS INTEGER) as phaseIndex FROM state WHERE key = 'phaseIndex'", [])
```

---

### StepRegistry (`src/components/Step.tsx`)

**Manages sequential step execution within phases/parallel blocks**

#### Context Value (StepRegistryProvider)
- **Type:** `StepRegistryContextValue`
- **Provides:**
  - `registerStep(id: string)`
  - `currentStepIndex: number`
  - `advanceStep()`
  - `isStepActive(id: string): boolean`

#### Provider State
```typescript
// Mutable ref for synchronous step tracking
const stepsRef = useRef<string[]>([])

// Database-backed current step index
const { data: dbStepIndex } = useQueryValue<number>(reactiveDb,
  "SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?", [stateKey])
```

#### Step Component State
```typescript
// NO useState - all refs
const stepIdRef = useRef<string | null>(null)
const statusRef = useRef<'pending' | 'active' | 'completed' | 'failed'>('pending')
```

#### Step Component Refs
- `stepIdRef` - Step identifier
- `taskIdRef` - Task registration ID
- `hasStartedRef`, `hasCompletedRef` - Lifecycle guards
- `snapshotBeforeIdRef`, `snapshotAfterIdRef` - JJ snapshot IDs
- `commitHashRef` - Git commit hash

---

### RalphContext (`src/components/Ralph.tsx`)

**Deprecated wrapper around SmithersProvider**

```typescript
// Line 37: Backwards compatibility context
export const RalphContext = createContext<RalphContextType | undefined>(undefined)
```

**Note:** Wraps SmithersProvider value, exists for legacy code compatibility

---

## Orchestration & Agent Execution

### Orchestration (`src/components/Orchestration.tsx`)

**Manages overall execution lifecycle with timeout/completion logic**

#### Refs
```typescript
// Line 100-102: Timing and polling
const startTimeRef = useRef<number>(Date.now())
const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)
const checkIntervalIdRef = useRef<NodeJS.Timeout | null>(null)
```

**No useState** - relies entirely on database state queries and refs

---

### Claude (`src/components/Claude.tsx`)

**Anthropic Claude agent execution component**

#### State (NO useState - all DB + refs)
```typescript
// Line 63: Agent ID in ref (set once, persists across renders)
const agentIdRef = useRef<string | null>(null)

// Line 66-67: Tail log with forceUpdate pattern
const tailLogRef = useRef<TailLogEntry[]>([])
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

// Line 70-75: Reactive DB queries for agent state
const { data: agentRows } = useQuery<AgentRow>(
  reactiveDb,
  "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?",
  [agentIdRef.current ?? '']
)
const agentRow = agentRows[0] ?? null

// Line 79-96: Derived state from DB row (computed, not stored)
const status = agentRow?.status === 'completed' ? 'complete' :
              agentRow?.status === 'failed' ? 'error' :
              agentRow?.status === 'running' ? 'running' : 'pending'
const result = agentRow?.result ? { /* parsed from DB */ } : null
const error = agentRow?.error ? new Error(agentRow.error) : null
```

#### Refs
- `agentIdRef` - Agent identifier (persisted in db.agents)
- `taskIdRef` - Task registration
- `tailLogRef` - Live log entries (non-reactive, updated via forceUpdate)
- `messageParserRef` - MessageParser instance (capacity: maxEntries * 2)
- `isMounted` (useMountedState) - Lifecycle guard
- `lastTailLogUpdateRef`, `pendingTailLogUpdateRef` - Throttling for log updates

---

### Smithers (`src/components/Smithers.tsx`)

**Higher-level orchestrator agent with planning phase**

#### State (NO useState - DB backed)
```typescript
// Agent ID in ref
const agentIdRef = useRef<string | null>(null)

// Reactive query for agent state from db.agents
const { data: agentRows } = useQuery<AgentRow>(
  reactiveDb,
  "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?",
  [agentIdRef.current ?? '']
)

// Substatus stored in db.state (planning/executing/etc)
const { data: substatusValue } = useQueryValue<string>(
  reactiveDb,
  "SELECT value FROM state WHERE key = ?",
  [`smithers_substatus_${agentIdRef.current}`]
)

// Derived state (computed from DB)
const status = deriveStatusFromAgent(agentRow)
const result = agentRow?.result ? parseResult(agentRow.result) : null
const error = agentRow?.error ? new Error(agentRow.error) : null
```

#### Refs
- `agentIdRef` - Agent identifier
- `taskIdRef` - Task registration
- `isMounted` (useMountedState) - Lifecycle guard

---

### Phase (`src/components/Phase.tsx`)

**Individual phase component within PhaseRegistry**

#### Refs
```typescript
// Line 66: Phase tracking
const phaseIdRef = useRef<string>(id)
const hasStartedRef = useRef(false)
const hasCompletedRef = useRef(false)
const prevIsActiveRef = useRef(false)
```

**No useState** - status derived from PhaseRegistry context

---

## Version Control Operations

### Git Components (`src/components/Git/`)

#### Commit (`Git/Commit.tsx`)
```typescript
// NO useState - stored in db.state with unique key
const stateKey = `git_commit_${taskIdRef.current}`

// Status, result, error read from db.state
const status = db.state.get<string>(`${stateKey}_status`) ?? 'pending'
const result = db.state.get<CommitResult>(`${stateKey}_result`)
const error = db.state.get<string>(`${stateKey}_error`)
```

**Refs:** `taskIdRef`, `isMounted`

---

#### Notes (`Git/Notes.tsx`)
```typescript
// NO useState - stored in db.state with unique key
const stateKey = `git_notes_${taskIdRef.current}`

// Status, result, error read from db.state
const status = db.state.get<string>(`${stateKey}_status`) ?? 'pending'
const result = db.state.get<NotesResult>(`${stateKey}_result`)
const error = db.state.get<string>(`${stateKey}_error`)
```

**Refs:** `taskIdRef`, `isMounted`

---

### JJ Components (`src/components/JJ/`)

#### Describe (`JJ/Describe.tsx`)
```typescript
// NO useState - useRef + forceUpdate pattern
const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
const descriptionRef = useRef<string | null>(null)
const errorRef = useRef<Error | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
```

---

#### Status (`JJ/Status.tsx`)
```typescript
// NO useState - useRef + forceUpdate pattern
const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
const isDirtyRef = useRef<boolean | null>(null)
const fileStatusRef = useRef<{
  modified: string[]
  added: string[]
  deleted: string[]
} | null>(null)
const errorRef = useRef<Error | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
```

---

#### Rebase (`JJ/Rebase.tsx`)
```typescript
// NO useState - useRef + forceUpdate pattern
const statusRef = useRef<'pending' | 'running' | 'complete' | 'conflict' | 'error'>('pending')
const conflictsRef = useRef<string[]>([])
const errorRef = useRef<Error | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
```

---

#### Snapshot (`JJ/Snapshot.tsx`)
```typescript
// NO useState - useRef + forceUpdate pattern
const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
const changeIdRef = useRef<string | null>(null)
const errorRef = useRef<Error | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
```

---

#### Commit (`JJ/Commit.tsx`)
```typescript
// NO useState - useRef + forceUpdate pattern
const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
const commitHashRef = useRef<string | null>(null)
const changeIdRef = useRef<string | null>(null)
const errorRef = useRef<Error | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
```

---

## Code Review & Reporting

### Review (`src/components/Review/Review.tsx`)

**Generates AI-powered code review analysis**

#### State (NO useState - useRef + forceUpdate)
```typescript
// useRef + forceUpdate pattern
const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
const resultRef = useRef<ReviewResult | null>(null)
const errorRef = useRef<Error | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
```

#### Refs
- `statusRef`, `resultRef`, `errorRef` - State storage
- `taskIdRef` - Task registration
- `isMounted` (useMountedState) - Lifecycle guard

---

## Git Hooks

### PostCommit (`src/components/Hooks/PostCommit.tsx`)

**Polls for git post-commit hook triggers**

#### State (NO useState - db.state persistence)
```typescript
// Stored in db.state for persistence across restarts
const stateKey = `post_commit_${executionId}`
const triggered = db.state.get<boolean>(`${stateKey}_triggered`) ?? false
const currentTrigger = db.state.get<HookTrigger>(`${stateKey}_trigger`)
const hookInstalled = db.state.get<boolean>(`${stateKey}_installed`) ?? false
const error = db.state.get<string>(`${stateKey}_error`)
```

#### Refs
- `lastProcessedTimestampRef` - Timestamp of last processed trigger
- `pollIntervalRef` - setInterval ID for polling
- `taskIdRef` - Task registration

---

### OnCIFailure (`src/components/Hooks/OnCIFailure.tsx`)

**Polls GitHub Actions for CI failures**

#### State (NO useState - db.state persistence)
```typescript
// Stored in db.state for persistence
const stateKey = `ci_failure_${executionId}`
const ciStatus = db.state.get<string>(`${stateKey}_status`) ?? 'idle'
const currentFailure = db.state.get<CIFailure>(`${stateKey}_failure`)
const triggered = db.state.get<boolean>(`${stateKey}_triggered`) ?? false
const error = db.state.get<string>(`${stateKey}_error`)
```

#### Refs
- `processedRunIdsRef` (line 116) - `Set<number>` tracking processed CI run IDs
- `taskIdRef` - Task registration
- `pollIntervalRef` - setInterval ID

---

## Stateless Components

The following components have **NO state** (pure render/composition components):

| Component | File | Purpose |
|-----------|------|---------|
| ClaudeApi | `ClaudeApi.tsx` | Renders custom element |
| Parallel | `Parallel.tsx` | Wraps StepRegistryProvider |
| Stop | `Stop.tsx` | Pure render |
| Task | `Task.tsx` | Pure render |
| Subagent | `Subagent.tsx` | Pure render |
| Human | `Human.tsx` | Pure render |
| Persona | `Persona.tsx` | Pure render |
| Constraints | `Constraints.tsx` | Pure render |

---

## Quick Reference Tables

### State by Type

| Type | Count | Examples |
|------|-------|----------|
| `useState` | **0** | **ELIMINATED** (as of Jan 2026) |
| `useQuery`/`useQueryValue` | 20+ | DB-backed reactive queries |
| `useRef` | 80+ | State storage, task IDs, lifecycle flags, intervals |
| `useReducer` (forceUpdate) | 10+ | Force re-renders after ref updates |
| `createContext` | 7 | SmithersContext, PhaseRegistry, StepRegistry, RalphContext |
| `useMountedState` | 15+ | Lifecycle guards for async ops |

### Common State Patterns

| Pattern | Usage | Example Component |
|---------|-------|-------------------|
| **DB + useQuery** | Durable agent state | Claude, Smithers |
| **db.state key-value** | Durable component state | Git/Commit, Hooks/* |
| **useRef + forceUpdate** | Non-durable, needs updates | JJ/*, Review |
| **Ref-only** | Pure ephemeral data | Step IDs, lifecycle guards |
| **Database-backed reactive** | Global orchestration state | SmithersProvider |
| **Task registration** | Track async operations in DB | All async components |

### State Initialization Defaults

| State Variable | Default Value | Storage | Type |
|----------------|---------------|---------|------|
| `status` | `'pending'` | db.agents or useRef | Union type |
| `result` | `null` | db.agents or useRef | Object \| null |
| `error` | `null` | db.agents or useRef | Error \| null |
| `agentIdRef` | `null` | useRef | string \| null |
| `taskIdRef` | `null` | useRef | string \| null |
| `hasStartedRef` | `false` | useRef | boolean |

---

## State Lifecycle

### Typical Async Component Lifecycle

```
1. Component mounts
   └─ Initialize: status='pending', result=null, error=null

2. useMount hook fires (ONCE)
   ├─ Register task: taskIdRef.current = db.tasks.start()
   ├─ Set status='running'
   └─ Execute async operation
       ├─ SUCCESS → setStatus('complete'), setResult(data)
       └─ ERROR → setStatus('error'), setError(err)

3. Finally block
   └─ Complete task: db.tasks.complete(taskIdRef.current)

4. useUnmount hook fires
   └─ Cleanup: clear intervals, abort controllers, etc.
```

### Database State Flow

```
Component           SQLite (via useQueryValue)        Reconciler
   |                         |                            |
   |-- db.run("UPDATE...") ->|                            |
   |                         |-- trigger query watch -->  |
   |                         |                            |
   |<----- re-render --------|----- setState -------------|
```

---

## Anti-Patterns to Avoid

1. **❌ NEVER use useState in orchestration components** - Use SQLite or useRef
2. **Direct useEffect usage** - Use `useMount`, `useUnmount`, `useEffectOnValueChange` instead
3. **Skipping task registration** - All async ops must call `db.tasks.start/complete`
4. **Storing in ref without forceUpdate** - If ref changes need re-render, use forceUpdate pattern
5. **Missing cleanup** - Always clear intervals/timeouts in `useUnmount`

## Pattern Migration (Pre-2026 → Current)

### ❌ OLD (useState - BANNED)
```typescript
const [status, setStatus] = useState<'pending' | 'running' | 'complete'>('pending')
const [result, setResult] = useState<AgentResult | null>(null)

useMount(async () => {
  setStatus('running')
  const output = await execute()
  setResult(output)
  setStatus('complete')
})
```

### ✅ NEW (Option 1: DB for durable state)
```typescript
const agentIdRef = useRef<string | null>(null)

const { data: agentRows } = useQuery<AgentRow>(
  reactiveDb,
  "SELECT status, result FROM agents WHERE id = ?",
  [agentIdRef.current ?? '']
)
const agentRow = agentRows[0] ?? null
const status = agentRow?.status ?? 'pending'
const result = agentRow?.result

useMount(async () => {
  const id = db.agents.create({ status: 'running', ... })
  agentIdRef.current = id
  const output = await execute()
  db.agents.complete(id, output)
})
```

### ✅ NEW (Option 2: useRef + forceUpdate for ephemeral)
```typescript
const statusRef = useRef<'pending' | 'running' | 'complete'>('pending')
const resultRef = useRef<AgentResult | null>(null)
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

useMount(async () => {
  statusRef.current = 'running'
  forceUpdate()
  const output = await execute()
  resultRef.current = output
  statusRef.current = 'complete'
  forceUpdate()
})
```

---

## Database Schema Dependencies

Key SQLite tables used by state management:

- `state` - Key-value store for global state (phaseIndex, stepIndex, ralphCount, etc.)
- `tasks` - Task lifecycle tracking (status, executionId, parentTaskId, etc.)
- `orchestration_signals` - Stop/rebase signals
- `hook_triggers` - Git hook event queue
- `ci_failures` - GitHub Actions failure tracking

See `src/db/schema.sql` for full schema.
