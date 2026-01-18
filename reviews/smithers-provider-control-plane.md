# SmithersProvider Control Plane Correctness/Perf Gaps

**Scope:** easy
**Severity:** P0-P1 (multiple issues)
**File:** `/Users/williamcory/smithers/src/components/SmithersProvider.tsx`
**Status:** Open

## Overview

Core flow is reasonable:
- Uses DB tasks to determine iteration completion
- Captures frames via `getCurrentTreeXML()` into `render_frames`
- Exposes `requestStop`/`requestRebase`

But several correctness and performance gaps exist. All four issues remain unaddressed in current code.

---

## P0: stopRequested Does Not Halt Iteration

### Problem

Database flag `stopRequested` is read (line 258-261) and exposed via `isStopRequested()` (line 418), but the Ralph iteration loop (lines 330-393) NEVER checks it before incrementing `ralphCount`.

Current behavior: "stop" means "don't do work, but keep iterating quickly until maxIterations"

### Expected Behavior

Stop should immediately complete orchestration when no tasks are running.

### Fix Location

In the interval logic at **line 360-378**, add stop check:

```tsx
// After line 366 (when stableCount >= 10)
// BEFORE incrementing ralphCount

// Check if stop was requested
if (stopRequested && !hasCompletedRef.current) {
  hasCompletedRef.current = true
  if (checkInterval) clearInterval(checkInterval)
  signalOrchestrationComplete()
  props.onComplete?.()
  return
}
```

### Implementation Notes

- `stopRequested` is already in closure from `useEffect` dependencies (line 393)
- Pattern matches existing max-iterations check (lines 369-378)
- Should come BEFORE line 380 where `incrementRalphCount()` is called

---

## P1: dbRalphCount === null Check is Suspect

### Problem

**Line 300:** Uses strict `===` null check:
```tsx
if (dbRalphCount === null) {
```

`useQueryValue` returns `undefined` when no row exists, not `null`. This means the initializer never runs and relies entirely on `ralphCount ?? 0` fallback.

### Fix Location

**Line 300** - change to loose equality:

```tsx
if (dbRalphCount == null) {  // Covers both null and undefined
```

### Implementation Notes

- Line 275 already has correct fallback: `const ralphCount = dbRalphCount ?? 0`
- But initialization should still happen to persist to DB
- Matches pattern in reactive-sqlite codebase where `useQueryValue` returns `undefined` for missing rows

---

## P1: 10ms Polling Interval is Extremely Aggressive

### Problem

**Line 387:** 10ms polling interval:
```tsx
}, 10) // Check every 10ms
```

This:
- Burns CPU under load
- Creates churn in reactive queries
- Increases race conditions with "late task registration"

### Fix Location

**Line 387** - increase to 50-100ms:

```tsx
}, 50) // Check every 50ms
```

### Implementation Notes

- Line 351: "Wait 500ms (50 checks)" comment assumes 10ms interval
  - If changing to 50ms, adjust to `stableCount > 10` (10 checks * 50ms = 500ms)
- Line 364: "Wait at least 100ms (10 checks)" comment
  - If changing to 50ms, keep `stableCount < 10` but update comment to "5 checks"
  - Or adjust to `stableCount < 2` for 100ms total

### Recommendation

Use 50ms interval and update stable counters:
- Line 351: `if (stableCount > 10)` → keeps 500ms wait
- Line 364: `if (stableCount < 2)` → 100ms wait

---

## P1: globalSmithersContext Fallback Risks Cross-Run Leakage

### Problem

**Line 20:** Module-level context never cleared:
```tsx
let globalSmithersContext: SmithersContextValue | null = null
```

**Line 431:** Set on every render but no cleanup:
```tsx
globalSmithersContext = value
```

One run can "bleed" into another if:
- Multiple roots are mounted
- Old roots linger after completion

### Fix Location

Add cleanup in SmithersProvider body using `useUnmount` hook (already imported at line 11):

```tsx
// After line 431 (where globalSmithersContext is set)
useUnmount(() => {
  if (globalSmithersContext === value) {
    globalSmithersContext = null
  }
})
```

### Implementation Notes

- `useUnmount` is already available from `/Users/williamcory/smithers/src/reconciler/hooks.ts`
- Pattern matches recommended fix: clears only if still pointing to this instance
- Prevents clearing if a newer instance has already taken over
- Import already exists (line 11) but only uses `useMount`

---

## Summary

| Issue | Severity | Lines | Complexity |
|-------|----------|-------|------------|
| stopRequested doesn't halt | P0 | 360-378 | Add 8-line check before incrementRalphCount |
| null vs undefined check | P1 | 300 | Change `===` to `==` (1 char) |
| 10ms polling | P1 | 387, 351, 364 | Change interval + update 2 counters |
| Global context leakage | P1 | After 431 | Add 5-line useUnmount cleanup |

**Estimated effort:** 1-2 hours (all trivial changes, well-scoped)
