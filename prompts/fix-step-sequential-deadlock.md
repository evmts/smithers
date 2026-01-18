# Fix Step Sequential Deadlock

**Priority:** P0 Critical
**Files:** `src/components/Step.tsx`, `src/components/StepRegistryProvider.tsx`
**Review:** `reviews/step-sequential-deadlock.md`

## Problem

Sequential steps deadlock because:
1. All Step components mount simultaneously
2. Non-first steps have `isActive = false` at mount
3. `useMount(() => { if (!isActive) return })` never re-runs when isActive becomes true
4. Task completion tied to `useUnmount()` but Steps never unmount (kept for plan visibility)

**Result:** Steps 1+ NEVER START. Deadlock.

## Implementation

### 1. Fix Step Activation (Step.tsx ~lines 202-241)

Replace mount-only effect with reactive isActive detection using existing codebase pattern:

```tsx
import { useEffectOnValueChange } from '../reconciler/hooks.js'

const hasStartedRef = useRef(false)
const taskIdRef = useRef<string | null>(null)

// REMOVE: useMount(() => { if (!isActive) return ... })
// ADD: Reactive activation
useEffectOnValueChange(isActive, () => {
  if (isActive && !hasStartedRef.current) {
    hasStartedRef.current = true

    ;(async () => {
      taskIdRef.current = db.tasks.start('step', props.name)
      try {
        if (props.snapshotBefore) { /* existing snapshot logic */ }
        const id = db.steps.start(props.name)
        stepIdRef.current = id
        props.onStart?.()
      } catch (error) {
        // Handle error, complete task
      }
    })()
  }
})
```

**Pattern reference:** See `Claude.tsx:110`, `Smithers.tsx:170` for `useEffectOnValueChange` usage.

### 2. Fix Step Completion (Step.tsx ~lines 243-305)

Step completion must NOT be tied to unmount. Monitor child task completion reactively:

```tsx
import { useQueryValue } from '../reactive-sqlite/index.js'

// Monitor child tasks (similar to SmithersProvider.tsx:108 pattern)
const childTaskCount = useQueryValue<number>(
  db.db,
  `SELECT COUNT(*) as count FROM tasks WHERE component_name = ? AND status = 'running'`,
  [props.name]
) ?? 0

// Complete when started and no child tasks running
useEffect(() => {
  if (hasStartedRef.current && childTaskCount === 0 && taskIdRef.current) {
    completeStep()
    registry.advanceStep()
  }
}, [childTaskCount])

// Keep useUnmount for cleanup only (remove advanceStep call from unmount)
```

### 3. Update useUnmount (Step.tsx ~line 295)

Remove `registry?.advanceStep()` from useUnmount - advancement now happens via reactive completion detection.

## Verification

```bash
# Run step/sequential tests
bun test src/components/Step
bun test evals/02-workflow-sequential

# Verify multi-step sequential execution completes (not just starts)
```

## Report

After implementation:
1. Confirm steps 1+ now start when previous step completes
2. Confirm task completion happens via child monitoring, not unmount
3. Show test results
