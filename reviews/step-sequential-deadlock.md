# Step + StepRegistryProvider Sequential Steps Deadlock

**Severity:** P0 - Critical (highest-impact correctness issue)
**Files:** `src/components/Step.tsx`, `src/components/StepRegistryProvider.tsx`, `src/components/Parallel.tsx`
**Status:** Open

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

Switch from mount/unmount to active-state transitions:

```tsx
// Step.tsx

const hasStartedRef = useRef(false)
const taskIdRef = useRef<string | null>(null)

// Start when becoming active
useEffect(() => {
  if (isActive && !hasStartedRef.current) {
    hasStartedRef.current = true
    taskIdRef.current = db.tasks.start('step', props.name)
    // ... start step work
  }
}, [isActive])

// Complete when work is done (NOT on unmount)
const completeStep = useCallback(() => {
  if (taskIdRef.current) {
    db.tasks.complete(taskIdRef.current)
    taskIdRef.current = null
  }
  db.steps.complete(stepId)
  registry.advanceStep()
}, [])
```

## Missing Piece: How Does Step Know Work is Done?

### Option A: Scoped Task Grouping (Preferred)

Treat completion as "all child tasks have completed" scoped to that step.

Requires new columns on tasks table:

```sql
ALTER TABLE tasks ADD COLUMN phase_id TEXT;
ALTER TABLE tasks ADD COLUMN step_id TEXT;
```

Query becomes:
```sql
SELECT COUNT(*) FROM tasks
WHERE step_id = ? AND status = 'running'
```

### Option B: Explicit Done Signal (Smaller Change)

Avoid registering "step task" entirely. Let child tasks govern iteration.

Step advancement triggered by explicit signal:
```tsx
<Claude onFinished={() => stepContext.markComplete()} />
```

Step watches for this signal to advance.

### Option C: Children Completion Detection

```tsx
// Step detects when all rendered children complete
const childTaskCount = useTaskCount({ stepId: myStepId })

useEffect(() => {
  if (hasStarted && childTaskCount === 0) {
    completeStep()
  }
}, [childTaskCount])
```

## Summary

| Problem | Impact | Fix |
|---------|--------|-----|
| Mount-only effect for non-first steps | Steps 1+ never start | Use `useEffect` keyed on `isActive` |
| Task completion on unmount | Task never completes | Complete on work done, not unmount |
| No completion detection | Can't advance steps | Add scoped task tracking or explicit signals |

## Priority

This is the **highest-impact correctness issue** - sequential workflows are completely broken.
