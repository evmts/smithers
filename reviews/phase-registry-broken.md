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

```
usePhaseIndex()
  → registry.registerPhase(name)     // Called in useState initializer (during render)
    → setPhases(...)                 // State update in different component during render
```

In standard React this causes:
- Warnings/errors in development
- Unstable behavior
- Potential infinite render loops

### Recommended Fix

Use ref-based registration (like StepRegistryProvider):

```tsx
const phasesRef = useRef<string[]>([])

const registerPhase = useCallback((name: string) => {
  if (!phasesRef.current.includes(name)) {
    phasesRef.current.push(name)
  }
  return phasesRef.current.indexOf(name)
}, [])
```

Registration becomes synchronous and side-effect free.

---

## P0: Skipped Phases Are Advanced at Mount Time (Wrong Timing)

### Problem

```tsx
// Phase.tsx
useMount(() => {
  if (isSkipped) {
    registry.advancePhase()
  }
})
```

Phases are "always rendered" in the plan, so all phases mount immediately—including phases not yet active.

Result: A skipped phase later in the sequence advances `currentPhaseIndex` immediately, potentially skipping currently-active work.

### Correct Behavior

Only skip a phase when it would become active:

```tsx
useEffect(() => {
  if (registry.isPhaseActive(myIndex) && shouldSkip) {
    markSkipped()
    registry.advancePhase()
  }
}, [registry.currentPhaseIndex])
```

---

## P0: Normal Phase Progression is Missing

### Problem

No code path advances phases when a phase's work completes. Only the skipped-phase mount path calls `advancePhase()`.

Result: Phases never advance beyond the first (unless something external calls `advancePhase()`).

### Expected Flow

```
Phase 0 active → work completes → advancePhase() → Phase 1 active → ...
```

### Recommended Fix

Add completion detection:

```tsx
// When phase's child tasks complete
useEffect(() => {
  if (isActive && allChildTasksComplete) {
    registry.advancePhase()
  }
}, [isActive, allChildTasksComplete])
```

This requires scoped task tracking (see step-deadlock review).

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
