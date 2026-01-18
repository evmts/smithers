# SmithersProvider Control Plane Correctness/Perf Gaps

**Severity:** P0-P1 (multiple issues)
**File:** `src/components/SmithersProvider.tsx`
**Status:** Open

## Overview

Core flow is reasonable:
- Uses DB tasks to determine iteration completion
- Captures frames via `getCurrentTreeXML()` into `render_frames`
- Exposes `requestStop`/`requestRebase`

But several correctness and performance gaps exist.

---

## P0: stopRequested Does Not Halt Iteration

### Problem

Local `stopRequested` flag is set, and Claude checks it. But the provider loop still increments `ralphCount` once tasks are stable.

Current behavior: "stop" means "don't do work, but keep iterating quickly until maxIterations"

### Expected Behavior

Stop should immediately complete orchestration.

### Recommended Fix

In the interval logic, when stop is requested and `pendingTasks === 0`:

```tsx
if (stopRequested && pendingTasks === 0) {
  signalOrchestrationComplete()  // or signal "stopped"
  return  // Do NOT increment ralphCount
}
```

---

## P1: dbRalphCount === null Check is Suspect

### Problem

```tsx
if (dbRalphCount === null) {
  reactiveDb.run("INSERT OR IGNORE INTO state ...")
}
```

Depending on `useQueryValue` semantics, "no row" is typically `undefined`, not `null`. If it's `undefined`, the initializer never runs and you rely entirely on `localRalphCount`.

### Recommended Fix

```tsx
if (dbRalphCount == null) {  // Covers both null and undefined
  reactiveDb.run("INSERT OR IGNORE INTO state ...")
}
```

---

## P1: 10ms Polling Interval is Extremely Aggressive

### Problem

```tsx
const checkInterval = setInterval(() => { ... }, 10)
```

This:
- Burns CPU under load
- Creates churn in reactive queries
- Increases race conditions with "late task registration"

### Recommended Fix

Move toward event-driven or coarser polling:

```tsx
const checkInterval = setInterval(() => { ... }, 50)  // or 100-250ms
```

Unless hard requirement for <10ms iteration turnover latency.

---

## P1: globalSmithersContext Fallback Risks Cross-Run Leakage

### Problem

Module-level context is never cleared:

```tsx
let globalSmithersContext: SmithersContextValue | null = null
```

One run can "bleed" into another if:
- Multiple roots are mounted
- Old roots linger after completion

### Recommended Fixes

1. Clear on unmount:
```tsx
useUnmount(() => {
  if (globalSmithersContext === contextValue) {
    globalSmithersContext = null
  }
})
```

2. Or namespace per root/executionId:
```tsx
const globalContexts = new Map<string, SmithersContextValue>()
```

---

## Summary

| Issue | Severity | Impact |
|-------|----------|--------|
| stopRequested doesn't halt | P0 | Stop is ineffective, burns iterations |
| null vs undefined check | P1 | State initialization may fail |
| 10ms polling | P1 | CPU burn, race conditions |
| Global context leakage | P1 | Cross-run state corruption |
