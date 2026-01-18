# Fix SmithersProvider Control Plane

**Priority:** P0-P1
**File:** `src/components/SmithersProvider.tsx`
**Review:** `reviews/smithers-provider-control-plane.md`

## Problems (4 issues)

### P0: stopRequested Does Not Halt Iteration (lines 360-378)
Database flag `stopRequested` is read but Ralph iteration loop NEVER checks it before incrementing. "Stop" means "keep iterating quickly until maxIterations."

### P1: dbRalphCount === null Check is Suspect (line 300)
`useQueryValue` returns `undefined` for missing rows, not `null`. Strict `===` never matches.

### P1: 10ms Polling Interval (line 387)
Extremely aggressive - burns CPU, creates churn, increases race conditions.

### P1: globalSmithersContext Leakage (lines 20, 431)
Module-level context never cleared. Cross-run contamination possible.

## Implementation

### Fix P0: Stop Check Before Increment (after line 366)

Add stop check before `incrementRalphCount()`:

```tsx
// After line 366 (when stableCount >= 10)
// BEFORE incrementing ralphCount

if (stopRequested && !hasCompletedRef.current) {
  hasCompletedRef.current = true
  if (checkInterval) clearInterval(checkInterval)
  signalOrchestrationComplete()
  props.onComplete?.()
  return
}

// Then existing incrementRalphCount() call
```

### Fix P1: Null Check (line 300)

Change strict to loose equality:

```tsx
// Line 300: Change
if (dbRalphCount === null) {
// To:
if (dbRalphCount == null) {  // Covers both null and undefined
```

### Fix P1: Polling Interval (line 387)

Change 10ms to 50ms and update stable counters:

```tsx
// Line 387: Change
}, 10)
// To:
}, 50)

// Line 351: Keep stableCount > 10 (now 500ms with 50ms interval)
// Line 364: Change to stableCount < 2 (now 100ms with 50ms interval)
```

Update comments to reflect new timing.

### Fix P1: Global Context Cleanup (after line 431)

Add cleanup using existing useUnmount:

```tsx
// After line 431 where globalSmithersContext = value
useUnmount(() => {
  if (globalSmithersContext === value) {
    globalSmithersContext = null
  }
})
```

## Verification

```bash
# Run SmithersProvider tests
bun test src/components/SmithersProvider

# Verify:
# - Stop button actually stops orchestration
# - Initialization works for first run
# - No CPU burn from tight polling
# - Multiple runs don't contaminate each other
```

## Report

After implementation:
1. Confirm stop request halts iteration
2. Confirm initialization works correctly
3. Confirm polling is 50ms
4. Confirm global context is cleaned up
5. Show test results
