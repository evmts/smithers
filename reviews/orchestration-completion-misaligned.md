# Orchestration.tsx Completion Not Aligned with SmithersProvider

**Scope:** easy
**Severity:** P1 - High
**File:** `src/components/Orchestration.tsx`
**Status:** Open

## Problem

Orchestration does meaningful work in `useMount` and `useUnmount`. But orchestration completion is signaled by `SmithersProvider.signalOrchestrationComplete()`, which resolves the root's promise.

**Key issue:** `signalOrchestrationComplete()` does not inherently unmount the tree.

## Impact

```
┌─────────────────────────────────────────────────────────┐
│ SmithersProvider calls signalOrchestrationComplete()    │
│                  ↓                                      │
│ Root promise resolves                                   │
│                  ↓                                      │
│ But tree is NOT unmounted automatically                 │
│                  ↓                                      │
│ Orchestration.useUnmount() NEVER fires                  │
│                  ↓                                      │
│ • onComplete callback never called                      │
│ • cleanupOnComplete never executed                      │
└─────────────────────────────────────────────────────────┘
```

Therefore:
- `Orchestration.onComplete` may never fire unless caller explicitly disposes root
- `cleanupOnComplete` is nondeterministic

## Additional Issue

`GlobalStopCondition` enum includes `'ci_failure'`, but the switch statement doesn't implement it.

## Recommended Fixes

### Option 1: Move Completion Behavior to Provider

Provider owns completion, so it should handle callbacks:

```tsx
// SmithersProvider.tsx
const signalOrchestrationComplete = useCallback(() => {
  // Execute any registered completion callbacks
  completionCallbacks.current.forEach(cb => cb())
  // Then resolve promise
  resolveCompletion()
}, [])
```

### Option 2: Watch Provider Completion State

```tsx
// Orchestration.tsx
const { isComplete } = useSmithers()

useEffect(() => {
  if (isComplete) {
    props.onComplete?.()
    if (props.cleanupOnComplete) {
      // Run cleanup
    }
  }
}, [isComplete])
```

### Option 3: Explicit Disposal Chain

Ensure root disposal triggers unmount:

```tsx
// After signalOrchestrationComplete
SmithersReconciler.updateContainer(null, fiberRoot, null, () => {
  // Now useUnmount will fire
})
```

## Missing Switch Case

```tsx
// Current (src/components/Orchestration.tsx:158-185)
switch (condition.type) {
  case 'total_tokens': ...
  case 'total_agents': ...
  case 'total_time': ...
  case 'report_severity': ...
  case 'custom': ...
  // Missing: case 'ci_failure'
}

// Add:
case 'ci_failure':
  // Watch CI status from DB and trigger stop
  const ciStatus = await db.state.get('ci_status')
  shouldStop = ciStatus?.value?.status === 'failure'
  message = message || 'CI build failed'
  break
```

## How to Fix

### Fix 1: Call dispose() after mount completes

The simplest fix - update `templates/main.tsx.template` and all orchestration entry points:

```tsx
// templates/main.tsx.template:228
await root.mount(App)

// Add immediately after mount completes:
root.dispose()  // This triggers useUnmount in Orchestration

// Mark execution as complete
const finalState = await db.state.getAll()
await db.execution.complete(executionId, finalState)
```

This ensures:
- Promise resolves when SmithersProvider signals completion
- Tree unmounts immediately after, firing useUnmount hooks
- Orchestration.onComplete callback executes
- Orchestration.cleanupOnComplete runs if configured

### Fix 2: Add missing ci_failure case

In `src/components/Orchestration.tsx`, add the case at line 185:

```tsx
case 'ci_failure':
  const ciStatus = await db.state.get('ci_status')
  shouldStop = ciStatus?.value?.status === 'failure'
  message = message || 'CI build failed'
  break
```

This assumes CI status is tracked in state table. The `OnCIFailure` hook component should update this state.
