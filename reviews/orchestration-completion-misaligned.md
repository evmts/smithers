# Orchestration.tsx Completion Not Aligned with SmithersProvider

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
// Current
switch (props.stopOnGlobalCondition) {
  case 'error': ...
  case 'timeout': ...
  // Missing: case 'ci_failure'
}

// Add:
case 'ci_failure':
  // Watch CI status and trigger stop
  break
```
