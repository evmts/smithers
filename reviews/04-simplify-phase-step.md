# Option 4: Simplify Phase/Step Complexity

**Priority: MEDIUM** | **Effort: M (4-8 hours)** | **Impact: MEDIUM**

## Problem

Phase.tsx (~200 LOC) and Step.tsx (~600 LOC) implement many edge cases:

```
┌─────────────────────────────────────────────────────────────────┐
│ FEATURES THAT ADD COMPLEXITY                                     │
├─────────────────────────────────────────────────────────────────┤
│ Phase:                                                           │
│ • Sequential phase registry + skipped phases                     │
│ • skipIf evaluation with error handling                          │
│ • Phase lifecycle transitions                                    │
│                                                                  │
│ Step:                                                            │
│ • Sequential step execution                                      │
│ • Parallel mode with DB-backed completion keys                   │
│ • "Direct child tasks" fallback (no Step wrappers)               │
│ • Completion debouncing and baseline counts                      │
│ • VCS snapshots (snapshotBefore/After, commitAfter)              │
│ • Empty step detection heuristics                                │
└─────────────────────────────────────────────────────────────────┘
```

## Usage Patterns

Based on code analysis, typical usage is:

```tsx
// Common: Sequential phases with steps
<Ralph>
  <Phase name="implement">
    <Step name="code">
      <Claude>...</Claude>
    </Step>
  </Phase>
</Ralph>

// Rare: Parallel steps
<Parallel>
  <Step>...</Step>
  <Step>...</Step>
</Parallel>

// Rare: Phase without Step wrappers (triggers fallback logic)
<Phase name="quick">
  <Claude>Direct child</Claude>
</Phase>
```

## Proposed Simplifications

### A. Require Steps Inside Phase

**Remove "direct child tasks" fallback logic.**

```typescript
// BEFORE: StepRegistryProvider.tsx has 50+ LOC for detecting tasks without Steps
const shouldTrackTasks = completionEnabled && stepsRef.current.length === 0
const { data: runningTaskCount } = useQueryValue(...)
const { data: totalTaskCount } = useQueryValue(...)
// ... complex hasSeenTasksRef, taskTrackingEnabledRef logic

// AFTER: Phases must contain Steps
if (stepsRef.current.length === 0) {
  log.warn('Phase has no Steps - wrap children in <Step>')
}
```

**Impact:** ~60 LOC removed from StepRegistryProvider

### B. Simplify Parallel Step Completion

**Remove DB-backed parallel completion keys.**

```typescript
// BEFORE: Parallel steps persist completion to SQLite
const completionKeyPrefix = isParallel ? `stepComplete:${registryKey}` : null
db.state.set(completionKey, 1, 'parallel_step_complete')

// AFTER: Track completion in memory (most orchestrations don't restart mid-parallel)
const completedStepsRef = useRef<Set<number>>(new Set())
```

**Impact:** ~30 LOC removed, fewer DB writes

### C. Remove VCS Snapshot Integration from Step

**Move VCS snapshots to explicit component.**

```tsx
// BEFORE: Step has snapshotBefore, snapshotAfter, commitAfter props
<Step snapshotBefore snapshotAfter commitAfter>
  <Claude>...</Claude>
</Step>

// AFTER: Explicit VCS component
<Step>
  <JJSnapshot description="Before work" />
  <Claude>...</Claude>
  <JJCommit message="After work" />
</Step>
```

**Impact:** ~50 LOC removed from Step, clearer intent

### D. Simplify Completion Heuristics

**Remove baseline count tracking and empty-step detection.**

```typescript
// BEFORE: Complex heuristics for when step is "done"
baselineTotalTaskCountRef.current = db.db.queryOne(...)
hasSeenChildTasksRef.current = false
allowEmptyCompletionRef.current = false
observedRunningAfterStartRef.current = false
observedTotalAfterStartRef.current = false

// AFTER: Simple rule - step completes when all child tasks complete
const canComplete = runningTaskCount === 0 && totalTaskCount > 0
```

**Impact:** ~40 LOC removed

## Summary of Reductions

| Simplification | LOC Saved | Behavior Change |
|----------------|-----------|-----------------|
| Require Steps in Phase | ~60 | Warning if no Steps |
| In-memory parallel completion | ~30 | No restart-resume for parallel |
| Remove VCS from Step | ~50 | Use explicit components |
| Simple completion logic | ~40 | No empty-step edge cases |
| **Total** | **~180** | Minor behavior restrictions |

## Full Simplified Step

After all simplifications, Step becomes:

```typescript
export function Step(props: StepProps): ReactNode {
  const { db, executionEnabled } = useSmithers()
  const registry = useStepRegistry()
  const myIndex = useStepIndex(props.name)
  
  const isActive = registry?.isStepActive(myIndex) ?? true
  const taskCount = useTaskCount({ scopeId: stepScopeId, status: 'running' })
  
  // Start step when active
  useEffectOnValueChange(isActive, () => {
    if (!isActive) return
    db.steps.start(props.name)
    props.onStart?.()
  })
  
  // Complete when no running tasks
  useEffectOnValueChange(taskCount, () => {
    if (taskCount === 0) {
      db.steps.complete(stepId)
      props.onComplete?.()
      registry?.advanceStep()
    }
  })
  
  return (
    <step name={props.name} status={status}>
      {isActive && props.children}
    </step>
  )
}
```

~100 LOC vs current ~600 LOC

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaks "naked Claude in Phase" | Add migration warning, one-line fix |
| Parallel steps don't resume | Document limitation; rare use case |
| VCS snapshots harder | JJSnapshot/JJCommit are more explicit anyway |

## Decision

- [ ] **Accept All** - Implement all simplifications
- [ ] **Accept A+D** - Just require Steps and simplify completion
- [ ] **Accept B** - Just simplify parallel mode
- [ ] **Defer** - Keep current flexibility
- [ ] **Reject** - Edge cases are important
