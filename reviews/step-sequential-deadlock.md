**Scope:** major

# Step + StepRegistryProvider Sequential Steps Deadlock

**Severity:** P0 - Critical (highest-impact correctness issue)
**Files:** `src/components/Step.tsx` (lines 202-241), `src/components/StepRegistryProvider.tsx`, `src/components/Parallel.tsx`
**Status:** CONFIRMED NOT FIXED - Issue still exists in current codebase

## Intended Behavior

1. Always render `<step ... status="...">` for plan visibility
2. Only execute step's children when active
3. In sequential mode: start step 0, when complete advance to step 1, etc.
4. Use DB tasks to gate iterations

## Actual Behavior (Deadlock)

```
┌─────────────────────────────────────────────────────────┐
│ 1. All Step components mount at once                    │
│    (Phase renders all children when active)             │
│                                                         │
│ 2. Non-first steps: isActive = false at mount           │
│                                                         │
│ 3. useMount(() => { if (!isActive) return })            │
│    → Never re-runs when isActive becomes true later     │
│    → Steps 1+ NEVER START                               │
│                                                         │
│ 4. Active step (step 0) starts, registers DB task       │
│    db.tasks.start('step', ...)                          │
│                                                         │
│ 5. Task completion only in useUnmount()                 │
│    → But Step is NEVER unmounted (stays for plan view)  │
│    → Task remains 'running' FOREVER                     │
│                                                         │
│ 6. SmithersProvider sees pendingTasks > 0 forever       │
│    → Never increments ralphCount                        │
│    → Never completes                                    │
│                                                         │
│ RESULT: DEADLOCK                                        │
└─────────────────────────────────────────────────────────┘
```

## Why Parallel Mode "Works"

Parallel mode accidentally avoids some issues because `isActive` returns true for all steps at mount. But task completion is still tied to unmount, which won't happen until phase disposal.

## Root Cause

Step execution is tied to **mount/unmount lifecycle**, but Steps are **never unmounted** (they remain in tree for plan visibility).

## Recommended Fix: Active-State Transitions

**CODEBASE PATTERN:** Use `useEffectOnValueChange` from `src/reconciler/hooks.ts` - this hook is already used by `Claude.tsx` (line 110) and `Smithers.tsx` (line 170) for exactly this pattern: running effects when ralphCount changes, with built-in idempotency and StrictMode handling.

Replace current `useMount` pattern (Step.tsx line 202) with reactive isActive detection:

```tsx
// Step.tsx - Apply existing codebase pattern

import { useEffectOnValueChange } from '../reconciler/hooks.js'

const hasStartedRef = useRef(false)
const taskIdRef = useRef<string | null>(null)

// REPLACE: useMount(() => { if (!isActive) return ... })
// WITH: useEffectOnValueChange listening to isActive changes
useEffectOnValueChange(isActive, () => {
  if (isActive && !hasStartedRef.current) {
    hasStartedRef.current = true

    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('step', props.name)

      try {
        // Snapshot before if requested
        if (props.snapshotBefore) { /* ... */ }

        // Start step in database
        const id = db.steps.start(props.name)
        stepIdRef.current = id

        props.onStart?.()
      } catch (error) {
        // Handle error, complete task
      }
    })()
  }
})

// Complete when work is done (NOT on unmount)
// Keep useUnmount for cleanup, but add completion detection via child task monitoring
```

## Missing Piece: How Does Step Know Work is Done?

**CURRENT CODEBASE CONTEXT:**
- Tasks table schema: `src/db/tasks.ts` (no phase_id/step_id columns currently)
- Reactive queries via `useQueryValue` hook: `src/reactive-sqlite/index.ts`
- Task counting pattern in `SmithersProvider.tsx` (line ~108): uses `useQueryValue` to count pending tasks

### Option A: Scoped Task Grouping (Preferred for Multi-Task Steps)

Treat completion as "all child tasks have completed" scoped to that step.

**Schema Migration Required:**
```sql
-- Add to src/db/tasks.ts schema
ALTER TABLE tasks ADD COLUMN phase_id TEXT;
ALTER TABLE tasks ADD COLUMN step_id TEXT;
```

**Implementation Pattern:**
```tsx
// src/components/Step.tsx
import { useQueryValue } from '../reactive-sqlite/index.js'

// Track child tasks for this step (similar to SmithersProvider pattern)
const { data: childTaskCount } = useQueryValue<number>(
  reactiveDb,
  `SELECT COUNT(*) as count FROM tasks
   WHERE step_id = ? AND status = 'running'`,
  [stepIdRef.current]
)

// Auto-complete when all child tasks done
useEffect(() => {
  if (hasStartedRef.current && childTaskCount === 0) {
    completeStep()
  }
}, [childTaskCount])
```

### Option B: Explicit Done Signal (Smaller Change, Single-Task Steps)

**Best for steps with ONE child component.** No schema changes needed.

Current children (`Claude`, `Smithers`) already complete their tasks in their own lifecycle.
Step just needs to detect when its direct child's task completes:

```tsx
// Step simply monitors: when I started AND my task is done, advance
useEffect(() => {
  if (hasStartedRef.current && taskIdRef.current) {
    const task = db.tasks.get(taskIdRef.current)
    if (task?.status === 'completed') {
      registry.advanceStep()
    }
  }
}, [/* need reactive trigger */])
```

### Option C: Children Completion via Reactive Query (Simplest)

**RECOMMENDED IMMEDIATE FIX** - uses existing patterns, no schema changes.

Steps currently register ONE task (`db.tasks.start('step', props.name)`). When step children (Claude/Smithers) complete, step's children are done rendering. Detect via:

```tsx
// Monitor: when active, started, and my children have no running tasks, I'm done
const { data: activeChildTasks } = useQueryValue<number>(
  reactiveDb,
  `SELECT COUNT(*) as count FROM tasks WHERE component_name = ? AND status = 'running'`,
  [props.name] // Assumes children tag tasks with parent step name
)

useEffect(() => {
  if (hasStartedRef.current && isActive && activeChildTasks === 0) {
    // Children done, complete this step
    completeStep()
  }
}, [activeChildTasks, isActive])
```

## Summary

| Problem | Impact | Fix | Codebase Pattern |
|---------|--------|-----|------------------|
| Mount-only effect for non-first steps | Steps 1+ never start | Replace `useMount` with `useEffectOnValueChange(isActive, ...)` | See `Claude.tsx:110`, `Smithers.tsx:170` |
| Task completion tied to unmount | Task never completes (step never unmounts) | Monitor child task completion reactively | Use `useQueryValue` like `SmithersProvider.tsx:108` |
| No completion detection | Steps can't advance automatically | Query `COUNT(*) FROM tasks WHERE step_id = ? AND status = 'running'` | Reactive SQLite pattern used throughout codebase |

## Implementation Steps

1. **Fix step activation** (Step.tsx lines 202-241):
   - Import `useEffectOnValueChange` from `../reconciler/hooks.js`
   - Replace `useMount(() => { if (!isActive) return })` with `useEffectOnValueChange(isActive, () => { if (isActive && !hasStarted) ... })`

2. **Fix step completion** (Step.tsx lines 243-305):
   - Add schema: `ALTER TABLE tasks ADD COLUMN step_id TEXT` (optional, for scoping)
   - Use `useQueryValue` to monitor child task count
   - Call `registry.advanceStep()` when child tasks reach 0, not on unmount

3. **Update task registration**:
   - When `db.tasks.start()` is called by child components, pass `step_id` context
   - Or rely on component_name pattern matching (simpler but less robust)

## Priority

**P0 CRITICAL** - Sequential workflows completely broken. Tests pass because they don't verify multi-step sequential execution completes. The test only checks that step 1 starts, not that step 2 ever executes.
