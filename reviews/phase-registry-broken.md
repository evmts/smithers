# PhaseRegistry + Phase Sequential Control is Broken

**Scope:** MAJOR
**Severity:** P0 (multiple critical issues)
**Files:** `src/components/PhaseRegistry.tsx`, `src/components/Phase.tsx`, `src/components/Step.tsx`
**Status:** Open (as of 2026-01-18)

**Status Summary:**
- Issue #1 (Reset on mount): STILL PRESENT - Line 68 unconditionally sets index to 0
- Issue #2 (setState during render): FIXED - Refactored to useRef in commit 5e3536e
- Issue #3 (Skipped phases at mount): STILL PRESENT - Lines 86-99 advance on mount
- Issue #4 (Missing progression): STILL PRESENT - No completion detection mechanism

---

## P0: PhaseRegistryProvider Resets Phase Index Every Mount

### Problem

**Location:** `src/components/PhaseRegistry.tsx:67-69`

```tsx
useMount(() => {
  db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
})
```

This:
- Nukes any persisted progress
- Makes resume impossible
- Resets during remounts (StrictMode, HMR)

### Recommended Fix

Only initialize if missing (like StepRegistryProvider does at lines 66-72):

```tsx
useMount(() => {
  const existing = db.state.get<number>('currentPhaseIndex')
  if (existing === null) {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
  }
})
```

**Pattern Reference:** See `StepRegistryProvider` in `src/components/Step.tsx:66-72` for correct pattern.

---

## P0: registerPhase() Uses setState During Render (Unsafe)

### Problem

**STATUS: FIXED** in commit 5e3536e (refactor: eliminate useState in favor of SQLite-backed state)

Previously used `useState` with `setPhases()` which caused state updates during render.

### Current Implementation

**Location:** `src/components/PhaseRegistry.tsx:56,72-80`

Now correctly uses ref-based registration:

```tsx
const phasesRef = useRef<string[]>([])

const registerPhase = useCallback((name: string): number => {
  const existingIndex = phasesRef.current.indexOf(name)
  if (existingIndex >= 0) {
    return existingIndex
  }
  const index = phasesRef.current.length
  phasesRef.current.push(name)
  return index
}, [])
```

Registration is now synchronous and side-effect free. ✓

---

## P0: Skipped Phases Are Advanced at Mount Time (Wrong Timing)

### Problem

**Location:** `src/components/Phase.tsx:86-99`

```tsx
// Phase.tsx
useMount(() => {
  if (isSkipped) {
    // Log skipped phase to database
    const id = db.phases.start(props.name, ralphCount)
    db.db.run(
      `UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
      [id]
    )
    console.log(`[Phase] Skipped: ${props.name}`)

    // Advance to next phase immediately
    registry.advancePhase()
  }
})
```

**Root Cause:** Phases are "always rendered" (per design doc), so all phases mount simultaneously—including phases not yet active.

**Result:** A skipped phase at index 2 mounts immediately and calls `advancePhase()`, potentially advancing past the currently-active phase 0.

### Correct Behavior

Only skip when phase becomes active:

```tsx
useEffect(() => {
  if (registry.isPhaseActive(myIndex) && isSkipped && !hasSkippedRef.current) {
    hasSkippedRef.current = true
    const id = db.phases.start(props.name, ralphCount)
    db.phases.skip(id)
    console.log(`[Phase] Skipped: ${props.name}`)
    registry.advancePhase()
  }
}, [registry.currentPhaseIndex, isSkipped])
```

**Note:** Guard with ref to prevent double-advancement in strict mode.

---

## P0: Normal Phase Progression is Missing

### Problem

**Critical Finding:** Only ONE location calls `advancePhase()`:
- `src/components/Phase.tsx:97` - skipped phase mount path only

**No code path advances phases when work completes normally.**

**Result:** Phases never advance beyond the first unless skipped or manually advanced externally.

### Current Step Completion Flow

**Location:** `src/components/Step.tsx:85-91,295`

```tsx
// In Step component's useUnmount:
registry?.advanceStep()  // Line 295

// In StepRegistryProvider:
const advanceStep = useCallback(() => {
  if (props.isParallel) return
  const nextIndex = currentStepIndex + 1
  if (nextIndex < stepsRef.current.length) {
    db.state.set(stateKey, nextIndex, 'step_advance')
  }
  // ❌ When nextIndex >= length, nothing happens - phase doesn't advance
}, [db, stateKey, currentStepIndex, props.isParallel])
```

**Gap:** When the last step completes, `advanceStep()` does nothing because `nextIndex >= stepsRef.current.length`. There's no signal to the parent Phase that all steps are done.

### Recommended Fix

**Option A: Detection in StepRegistryProvider**

When last step advances beyond bounds, notify phase:

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

Then in Phase:

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

**Option B: Polling in Phase component**

Query step state to detect completion:

```tsx
useEffect(() => {
  if (!isActive) return

  const stepKey = `stepIndex_${props.name}`
  const stepIndex = db.state.get<number>(stepKey)
  const totalSteps = // need access to StepRegistry's stepsRef

  if (stepIndex !== null && stepIndex >= totalSteps - 1) {
    // Last step is active, wait for it to unmount then advance
  }
}, [isActive, /* step changes */])
```

**Recommended:** Option A is cleaner as it maintains the event-driven architecture.

---

## Summary

```
┌─────────────────────────────────────────────────────────┐
│ Phase Control Flow (Current - Broken)                   │
│                                                         │
│ Mount → Reset index to 0 (nukes progress)               │
│      → All phases mount simultaneously                  │
│      → Skipped phases advance index immediately         │
│      → Active phase never advances on completion        │
│      → DEADLOCK or WRONG ORDER                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Phase Control Flow (Expected)                           │
│                                                         │
│ Mount → Initialize index only if missing                │
│      → Phase 0 becomes active                           │
│      → Phase 0 work completes → advance to Phase 1      │
│      → Phase 1 evaluates skipIf → skip or execute       │
│      → Continue until all phases complete               │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Complexity

**Issue Priority:**
1. **Issue #4 (Missing progression)** - HIGHEST PRIORITY - Blocks all multi-phase workflows
2. **Issue #1 (Reset on mount)** - HIGH - Prevents resume/persistence
3. **Issue #3 (Skip timing)** - MEDIUM - Edge case but causes wrong execution order
4. **Issue #2 (setState during render)** - FIXED ✓

**Estimated Changes:**
- Issue #1: 5 lines (trivial - copy pattern from Step.tsx)
- Issue #3: 15 lines (easy - move logic to useEffect with guards)
- Issue #4: 30-40 lines (moderate - add completion callback + phase advancement)

**Files to Modify:**
- `src/components/PhaseRegistry.tsx` - Issue #1 fix
- `src/components/Phase.tsx` - Issue #3 fix, Issue #4 integration
- `src/components/Step.tsx` - Issue #4 completion callback

**Testing Requirements:**
- Verify multi-phase workflows advance automatically
- Verify phase progress persists across remounts
- Verify skipped phases only skip when active
- Run existing evals: `evals/02-workflow-sequential.test.tsx`

**Related Issues:**
- May interact with broken build orchestration pattern (reviews/20260118_132246_161937b.md)
- Completion detection relates to step-deadlock issues mentioned in original review
