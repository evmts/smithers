# Fix Phase Registry Broken

**Priority:** P0 Critical
**Files:** `src/components/PhaseRegistry.tsx`, `src/components/Phase.tsx`, `src/components/Step.tsx`
**Review:** `reviews/phase-registry-broken.md`

## Problems (3 remaining after previous fix)

### Issue #1: Reset on Mount (PhaseRegistry.tsx:67-69)
```tsx
useMount(() => {
  db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
})
```
**Problem:** Nukes any persisted progress, makes resume impossible.

### Issue #3: Skipped Phases Advanced at Mount (Phase.tsx:86-99)
**Problem:** All phases mount simultaneously. Skipped phase at index 2 calls `advancePhase()` immediately, potentially advancing past active phase 0.

### Issue #4: Missing Phase Progression
**Problem:** Only ONE location calls `advancePhase()` - the skipped phase mount path. No code path advances phases when work completes normally.

## Implementation

### Fix #1: Only Initialize if Missing (PhaseRegistry.tsx:67-69)

Replace unconditional set with conditional pattern from StepRegistryProvider:

```tsx
useMount(() => {
  const existing = db.state.get<number>('currentPhaseIndex')
  if (existing === null) {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
  }
})
```

**Pattern reference:** `StepRegistryProvider` in `src/components/Step.tsx:66-72`

### Fix #3: Only Skip When Active (Phase.tsx:86-99)

Replace mount-time skip with reactive active-state detection:

```tsx
const hasSkippedRef = useRef(false)

// REMOVE: useMount block that calls advancePhase on skip
// ADD: useEffect that only skips when phase becomes active
useEffect(() => {
  if (registry.isPhaseActive(myIndex) && isSkipped && !hasSkippedRef.current) {
    hasSkippedRef.current = true
    const id = db.phases.start(props.name, ralphCount)
    db.db.run(
      `UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
      [id]
    )
    console.log(`[Phase] Skipped: ${props.name}`)
    registry.advancePhase()
  }
}, [registry.currentPhaseIndex, isSkipped])
```

**Note:** Guard with ref prevents double-advancement in StrictMode.

### Fix #4: Add Completion Callback (Step.tsx + Phase.tsx)

**Step.tsx - StepRegistryProvider:** Add `onAllStepsComplete` callback:

```tsx
const advanceStep = useCallback(() => {
  if (props.isParallel) return
  const nextIndex = currentStepIndex + 1
  if (nextIndex < stepsRef.current.length) {
    db.state.set(stateKey, nextIndex, 'step_advance')
  } else {
    // All steps complete - signal phase completion
    props.onAllStepsComplete?.()
  }
}, [db, stateKey, currentStepIndex, props.isParallel, props.onAllStepsComplete])
```

**Phase.tsx:** Wire up completion callback:

```tsx
<StepRegistryProvider
  phaseId={props.name}
  onAllStepsComplete={() => {
    if (registry.isPhaseActive(myIndex)) {
      registry.advancePhase()
    }
  }}
>
  {props.children}
</StepRegistryProvider>
```

## Verification

```bash
# Run phase/step tests
bun test src/components/Phase
bun test src/components/Step
bun test evals/02-workflow-sequential

# Verify:
# - Multi-phase workflows advance automatically
# - Phase progress persists across remounts
# - Skipped phases only skip when active
```

## Report

After implementation:
1. Confirm phases advance when all steps complete
2. Confirm progress persists across remounts
3. Confirm skipped phases don't race ahead
4. Show test results
