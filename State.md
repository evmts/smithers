# React Runtime State Reference

Comprehensive documentation of all state management in `src/components/`

## Overview

- **Total Components:** 30+ files
- **Stateful Components:** 18
- **State Variables:** 65+ `useState` calls
- **Contexts:** 7 Context providers
- **Database-Backed State:** Heavy use of `useQueryValue` for SQLite reactive queries

## State Management Patterns

### Primary Patterns
1. **Database-Backed Reactive State** - `useQueryValue` from `reactive-sqlite`
2. **Local Component State** - `useState` for component-local UI state
3. **Context Providers** - Global shared state via React Context
4. **Refs for Side Effects** - `useRef` for task IDs, lifecycle tracking, intervals
5. **Async Task Lifecycle** - All async operations tracked in SQLite tasks table

### Conventions
- All async components start with `status: 'pending'`
- Task registration via `db.tasks.start()` / `db.tasks.complete()`
- Cleanup handled via `useUnmount` (not `useEffect`)
- Mount-once side effects via `useMount` (not `useEffect`)
- Lifecycle guards via `useMountedState()` to prevent setState on unmounted

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

#### Database-Backed State (useQueryValue)
```typescript
// Line 177: Stop signal
const stopRequested = useQueryValue(db,
  "SELECT CASE WHEN value IS NOT NULL...", [executionId])

// Line 183: Rebase signal
const rebaseRequested = useQueryValue(db,
  "SELECT CASE WHEN value IS NOT NULL...", [executionId])

// Line 189: Ralph count tracking
const dbRalphCount = useQueryValue(db,
  "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'", [])

// Line 203: Running tasks
const runningTaskCount = useQueryValue(db,
  "SELECT COUNT(*) as count FROM tasks WHERE status IN ('running', 'starting')...", [executionId])

// Line 216: Total tasks
const totalTaskCount = useQueryValue(db,
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
// Line 54: Mutable ref for synchronous step tracking
const stepsRef = useRef<string[]>([])

// Database-backed current step index
const dbStepIndex = useQueryValue(db,
  "SELECT CAST(value AS INTEGER) as stepIndex FROM state WHERE key = ?", [stateKey])
```

#### Step Component State
```typescript
// Line 188-189: Component lifecycle
const [stepId, setStepId] = useState<string | null>(null)
const [status, setStatus] = useState<'pending' | 'active' | 'completed' | 'failed'>('pending')
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

#### State
```typescript
// Line 50-54: Agent execution state
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [result, setResult] = useState<AgentResult | null>(null)
const [error, setError] = useState<Error | null>(null)
const [agentId, setAgentId] = useState<string | null>(null)
const [tailLog, setTailLog] = useState<TailLogEntry[]>([])
```

#### Refs
- `taskIdRef` - Task registration
- `messageParserRef` - MessageParser instance (capacity: maxEntries * 2)
- `isMounted` (useMountedState) - Lifecycle guard
- `lastTailLogUpdateRef`, `pendingTailLogUpdateRef` - Throttling for log updates

---

### Smithers (`src/components/Smithers.tsx`)

**Higher-level orchestrator agent with planning phase**

#### State
```typescript
// Line 124-127: Smithers execution state
const [status, setStatus] = useState<'pending' | 'planning' | 'executing' | 'complete' | 'error'>('pending')
const [result, setResult] = useState<SmithersResult | null>(null)
const [error, setError] = useState<Error | null>(null)
const [subagentId, setSubagentId] = useState<string | null>(null)
```

#### Refs
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
// Line 61-63: Git commit execution
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [result, setResult] = useState<CommitResult | null>(null)
const [error, setError] = useState<Error | null>(null)
```

**Refs:** `taskIdRef`, `isMounted`

---

#### Notes (`Git/Notes.tsx`)
```typescript
// Line 32-34: Git notes execution
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [result, setResult] = useState<NotesResult | null>(null)
const [error, setError] = useState<Error | null>(null)
```

**Refs:** `taskIdRef`, `isMounted`

---

### JJ Components (`src/components/JJ/`)

#### Describe (`JJ/Describe.tsx`)
```typescript
// Line 19-21: JJ describe operation
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [description, setDescription] = useState<string | null>(null)
const [error, setError] = useState<Error | null>(null)
```

---

#### Status (`JJ/Status.tsx`)
```typescript
// Line 20-27: JJ status check
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [isDirty, setIsDirty] = useState<boolean | null>(null)
const [fileStatus, setFileStatus] = useState<{
  modified: string[]
  added: string[]
  deleted: string[]
} | null>(null)
const [error, setError] = useState<Error | null>(null)
```

---

#### Rebase (`JJ/Rebase.tsx`)
```typescript
// Line 46-48: JJ rebase with conflict detection
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'conflict' | 'error'>('pending')
const [conflicts, setConflicts] = useState<string[]>([])
const [error, setError] = useState<Error | null>(null)
```

---

#### Snapshot (`JJ/Snapshot.tsx`)
```typescript
// Line 19-21: JJ snapshot creation
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [changeId, setChangeId] = useState<string | null>(null)
const [error, setError] = useState<Error | null>(null)
```

---

#### Commit (`JJ/Commit.tsx`)
```typescript
// Line 21-24: JJ commit operation
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [commitHash, setCommitHash] = useState<string | null>(null)
const [changeId, setChangeId] = useState<string | null>(null)
const [error, setError] = useState<Error | null>(null)
```

---

## Code Review & Reporting

### Review (`src/components/Review/Review.tsx`)

**Generates AI-powered code review analysis**

#### State
```typescript
// Line 185-187: Review execution
const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
const [result, setResult] = useState<ReviewResult | null>(null)
const [error, setError] = useState<Error | null>(null)
```

#### Refs
- `taskIdRef` - Task registration
- `isMounted` (useMountedState) - Lifecycle guard

---

## Git Hooks

### PostCommit (`src/components/Hooks/PostCommit.tsx`)

**Polls for git post-commit hook triggers**

#### State
```typescript
// Line 73-77: Hook state management
const [triggered, setTriggered] = useState(false)
const [currentTrigger, setCurrentTrigger] = useState<HookTrigger | null>(null)
const [hookInstalled, setHookInstalled] = useState(false)
const [error, setError] = useState<string | null>(null)
```

#### Refs
- `lastProcessedTimestampRef` - Timestamp of last processed trigger
- `pollIntervalRef` - setInterval ID for polling
- `taskIdRef` - Task registration

---

### OnCIFailure (`src/components/Hooks/OnCIFailure.tsx`)

**Polls GitHub Actions for CI failures**

#### State
```typescript
// Line 110-113: CI failure detection
const [ciStatus, setCiStatus] = useState<'idle' | 'polling' | 'failed' | 'error'>('idle')
const [currentFailure, setCurrentFailure] = useState<CIFailure | null>(null)
const [triggered, setTriggered] = useState(false)
const [error, setError] = useState<string | null>(null)
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
| `useState` | 65+ | status, result, error patterns |
| `useQueryValue` | 7+ | DB-backed reactive queries |
| `createContext` | 7 | SmithersContext, PhaseRegistry, StepRegistry, RalphContext |
| `useRef` | 50+ | Task IDs, lifecycle flags, intervals |
| `useMountedState` | 15+ | Lifecycle guards for async ops |

### Common State Patterns

| Pattern | Usage | Example Component |
|---------|-------|-------------------|
| Status/Result/Error triple | Async operations | Claude, Smithers, Git/Commit |
| Database-backed reactive | Global orchestration state | SmithersProvider |
| Ref-based lifecycle guards | Prevent duplicate execution | Step, Phase, Orchestration |
| Task registration | Track async operations in DB | All async components |
| Polling with Set tracking | Deduplicate events | OnCIFailure, PostCommit |

### State Initialization Defaults

| State Variable | Default Value | Type |
|----------------|---------------|------|
| `status` | `'pending'` | Union type |
| `result` | `null` | Object \| null |
| `error` | `null` | Error \| null |
| `taskIdRef` | `null` | string \| null |
| `hasStartedRef` | `false` | boolean |

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

1. **Direct useEffect usage** - Use `useMount`, `useUnmount`, `useEffectOnValueChange` instead
2. **setState on unmounted** - Always use `useMountedState()` guard for async
3. **Skipping task registration** - All async ops must call `db.tasks.start/complete`
4. **Direct ref mutations without tracking** - Use refs only for non-reactive data
5. **Missing cleanup** - Always clear intervals/timeouts in `useUnmount`

---

## Database Schema Dependencies

Key SQLite tables used by state management:

- `state` - Key-value store for global state (phaseIndex, stepIndex, ralphCount, etc.)
- `tasks` - Task lifecycle tracking (status, executionId, parentTaskId, etc.)
- `orchestration_signals` - Stop/rebase signals
- `hook_triggers` - Git hook event queue
- `ci_failures` - GitHub Actions failure tracking

See `src/db/schema.sql` for full schema.
