# State Issue: Complex useEffect for Phase Lifecycle

## Location
- **File:** `src/components/Phase.tsx`
- **Lines:** 89-132

## Issue
Uses two separate `useEffect` hooks with complex conditional logic for phase lifecycle:

```typescript
// Effect 1: Handle skipped phases
useEffect(() => {
  if (registry.isPhaseActive(myIndex) && isSkipped && !hasSkippedRef.current) {
    hasSkippedRef.current = true
    // ... skip logic
  }
}, [registry.currentPhaseIndex, isSkipped, myIndex, db, props.name, ralphCount, registry])

// Effect 2: Handle activation/completion
useEffect(() => {
  if (isSkipped) return
  if (!prevIsActiveRef.current && isActive && !hasStartedRef.current) {
    // activation logic
  }
  if (prevIsActiveRef.current && !isActive) {
    // completion logic
  }
  prevIsActiveRef.current = isActive
}, [isActive, isSkipped, ...])
```

## Problem
- Multiple refs tracking overlapping concerns (`hasStartedRef`, `hasCompletedRef`, `prevIsActiveRef`, `hasSkippedRef`)
- Easy to introduce bugs when modifying
- `prevIsActiveRef` pattern is fragile - depends on effect ordering

## Suggested Fix

Per CLAUDE.md, prefer vendored hooks over raw `useEffect`:

```typescript
import { useEffectOnValueChange } from '../reconciler/hooks.js'

// Replace dual useEffect with cleaner pattern
useEffectOnValueChange(isActive, () => {
  if (isSkipped) {
    // Handle skip on first activation attempt
    if (!hasSkippedRef.current) {
      hasSkippedRef.current = true
      const id = db.phases.start(props.name, ralphCount)
      db.db.run(`UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`, [id])
      registry.advancePhase()
    }
    return
  }

  if (isActive && !hasStartedRef.current) {
    // Start phase
    hasStartedRef.current = true
    phaseIdRef.current = db.phases.start(props.name, ralphCount)
    props.onStart?.()
  } else if (!isActive && hasStartedRef.current && !hasCompletedRef.current) {
    // Complete phase
    hasCompletedRef.current = true
    if (phaseIdRef.current) {
      db.phases.complete(phaseIdRef.current)
      props.onComplete?.()
    }
  }
})
```

## Severity
Low - Code works but is harder to maintain than it needs to be.
