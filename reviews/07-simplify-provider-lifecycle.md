# Option 7: Simplify SmithersProvider Lifecycle

**Priority: MEDIUM** | **Effort: M (2-4 hours)** | **Impact: MEDIUM**

## Problem

SmithersProvider.tsx (~700 LOC) has complex completion/stop detection:

```
┌─────────────────────────────────────────────────────────────────┐
│ COMPLEXITY AREAS                                                 │
├─────────────────────────────────────────────────────────────────┤
│ 1. Orchestration token controller Map + cleanup timers           │
│    - 1-hour cleanup timeout for stale entries                    │
│    - Token scheduling/cancellation logic                         │
│                                                                  │
│ 2. Stop condition polling (setInterval every 1 second)          │
│    - Switch statement with 6 condition types                    │
│    - Async condition evaluation                                  │
│                                                                  │
│ 3. Task completion detection                                     │
│    - Reactive query for pending tasks                            │
│    - Debounced completion with multiple timeouts                 │
│    - stableCountRef, hasStartedTasks tracking                   │
│                                                                  │
│ 4. JJ snapshot on mount (if useJJ enabled)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Specific Issues

### 1. Token Cleanup Timers

```typescript
const ORCHESTRATION_CLEANUP_TIMEOUT_MS = 3600000  // 1 hour

function scheduleOrchestrationCleanup(token: string): void {
  const timeoutId = setTimeout(() => {
    orchestrationControllers.delete(token)
    cleanupTimeouts.delete(token)
  }, ORCHESTRATION_CLEANUP_TIMEOUT_MS)
  cleanupTimeouts.set(token, timeoutId)
}
```

**Problem:** If orchestration completes normally, cleanup always happens. The 1-hour timer is defensive against crashes that never cleanup.

**Simplification:** Remove timers. Ensure `finally` block always calls cleanup.

### 2. Stop Condition Polling

```typescript
checkIntervalIdRef.current = setInterval(async () => {
  // ... 60 LOC switch statement checking conditions
}, 1000)
```

**Problem:** Polling every second for conditions that change rarely.

**Simplification:** Use reactive queries for conditions, or check only on task completion.

### 3. Completion Detection

```typescript
useEffectOnValueChange(pendingTasks, () => {
  if (completionCheckTimeoutRef.current) {
    clearTimeout(completionCheckTimeoutRef.current)
  }
  
  if (pendingTasks > 0) {
    stableCountRef.current = 0
    return
  }
  
  if (!hasStartedTasks) {
    stableCountRef.current++
    completionCheckTimeoutRef.current = setTimeout(() => {
      // debounced completion for no-work case
    }, 500)
    return
  }
  
  stableCountRef.current++
  completionCheckTimeoutRef.current = setTimeout(() => {
    // debounced completion for work-done case
  }, 100)
})
```

**Problem:** Multiple debounce paths, stable count tracking, timeout juggling.

**Simplification:** Single completion path.

## Proposed Simplifications

### A. Remove Token Cleanup Timers

```typescript
// Just rely on finally block cleanup
export function createOrchestrationPromise(): { promise: Promise<void>; token: string } {
  const token = crypto.randomUUID()
  const promise = new Promise<void>((resolve, reject) => {
    orchestrationControllers.set(token, { resolve, reject })
    // No timer scheduling
  })
  return { promise, token }
}
```

### B. Simplify Stop Conditions to Table

```typescript
const STOP_EVALUATORS: Record<GlobalStopCondition['type'], (ctx, condition) => Promise<boolean>> = {
  total_tokens: (ctx, c) => ctx.totalTokens >= (c.value as number),
  total_agents: (ctx, c) => ctx.totalAgents >= (c.value as number),
  total_time: (ctx, c) => ctx.elapsedTimeMs >= (c.value as number),
  report_severity: async (ctx, c) => (await db.vcs.getCriticalReports()).length > 0,
  ci_failure: async (ctx, c) => db.state.get('last_ci_failure') !== null,
  custom: async (ctx, c) => c.fn?.(ctx) ?? false,
}

// Check conditions in single loop
for (const condition of stopConditions) {
  if (await STOP_EVALUATORS[condition.type](ctx, condition)) {
    requestStop(condition.message)
    break
  }
}
```

### C. Single Completion Path

```typescript
useEffectOnValueChange(pendingTasks, () => {
  // Simple: complete when no pending tasks after work started
  if (pendingTasks === 0 && hasStartedTasksRef.current && !hasCompletedRef.current) {
    hasCompletedRef.current = true
    signalComplete()
    props.onComplete?.()
  }
})
```

## Benefits

1. **~150 LOC reduction** in SmithersProvider
2. **Fewer timeouts** to track and debug
3. **Clearer completion logic** - one path, not three
4. **No memory leak risk** from stale tokens

## Risks

| Risk | Mitigation |
|------|------------|
| Edge case: immediate completion | Keep small debounce (50ms) for render settling |
| Stop conditions checked less often | Check on task completion, not timer |

## Decision

- [ ] **Accept All** - Apply all simplifications
- [ ] **Accept A+C** - Remove timers and simplify completion
- [ ] **Accept B** - Just table-driven stop conditions
- [ ] **Defer** - Current code is stable
