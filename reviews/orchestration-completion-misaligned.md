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

## Files Requiring Updates

### Primary fixes:
1. **`src/components/Orchestration.tsx:185`** - Add ci_failure case to switch statement
2. **`templates/main.tsx.template:228`** - Add `root.dispose()` call after mount

### Documentation/example updates (also need root.dispose()):
3. `README.md:152`
4. `docs/installation.mdx:135`
5. `docs/quickstart.mdx:64` and `docs/quickstart.mdx:114`
6. `docs/examples/hello-world.mdx:42`
7. `docs/examples/multi-phase-review.mdx:110`
8. `docs/examples/structured-output.mdx:94`
9. `docs/examples/subagent-workflow.mdx:143`
10. `docs/examples/mcp-database.mdx:70`
11. `docs/components/smithers-provider.mdx:293` and `docs/components/smithers-provider.mdx:424`
12. `src/components/agents/SmithersCLI.ts:160`

### Verification:

After fixing, verify with a test that:
1. Creates an Orchestration with onComplete callback
2. Waits for mount to complete
3. Calls root.dispose()
4. Asserts onComplete was called

```tsx
let completeCalled = false
await root.mount(() => (
  <SmithersProvider db={db} executionId={id}>
    <Orchestration onComplete={() => { completeCalled = true }}>
      <Claude>Test</Claude>
    </Orchestration>
  </SmithersProvider>
))
root.dispose()
expect(completeCalled).toBe(true)
```

## Status: RELEVANT

**Re-verified on 2026-01-18 by Amp**

Both issues still exist in the codebase:

1. **Missing `ci_failure` case**: [SmithersProvider.tsx#L446-L473](file:///Users/williamcory/smithers/src/components/SmithersProvider.tsx#L446-L473) - switch handles `total_tokens`, `total_agents`, `total_time`, `report_severity`, `custom` but NOT `ci_failure` despite type definition including it at line 69
2. **No `root.dispose()` after mount**: [main.tsx.template#L228](file:///Users/williamcory/smithers/templates/main.tsx.template#L228) - calls `await root.mount(App)` but never disposes, meaning useUnmount hooks won't fire

## Debugging Plan

### Files to Investigate
```
src/components/SmithersProvider.tsx      # Lines 446-473 (switch statement)
templates/main.tsx.template              # Line 228 (mount without dispose)
src/components/Hooks/OnCIFailure.tsx     # Line 209 (sets 'last_ci_failure' state key)
```

### Grep Patterns
```bash
# Find all switch cases for stop conditions
grep -n "case 'total_" src/components/SmithersProvider.tsx

# Check if ci_failure state is read anywhere
grep -rn "ci_failure\|ci_status" src/

# Find all places that call mount() without dispose()
grep -rn "root.mount" --include="*.tsx" --include="*.ts"
```

### Test Commands
```bash
# Run existing SmithersProvider tests
bun test src/components/SmithersProvider.test.ts

# Manual reproduction: create test that uses ci_failure stop condition
# and verify it doesn't trigger (because case is missing)
```

### Proposed Fix Approach

**Fix 1: Add ci_failure case (SmithersProvider.tsx:472)**
```tsx
case 'ci_failure':
  const ciFailure = await props.db.state.get('last_ci_failure')
  shouldStop = ciFailure !== null
  message = message || `CI failure detected: ${ciFailure?.value?.message ?? 'unknown'}`
  break
```

**Fix 2: Add dispose() after mount (main.tsx.template:228)**
```tsx
await root.mount(App)
root.dispose()  // Triggers useUnmount → fires onComplete callbacks
```

**Fix 3: Add test coverage**
```tsx
test('ci_failure stop condition triggers on CI failure state', async () => {
  await db.state.set('last_ci_failure', { message: 'Build failed' })
  // Verify stop condition triggers
})

test('onComplete fires after dispose', async () => {
  let called = false
  await root.mount(() => <SmithersProvider onComplete={() => called = true}>...</SmithersProvider>)
  root.dispose()
  expect(called).toBe(true)
})
```
