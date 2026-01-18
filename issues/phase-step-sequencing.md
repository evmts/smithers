# Fix Phase and Step Sequencing (registry boundaries, activation, completion)

<metadata>
  <priority>critical</priority>
  <category>bugfix</category>
  <status>design-review-accounted</status>
  <dependencies>
    - src/components/PhaseRegistry.tsx
    - src/components/Phase.tsx
    - src/components/Step.tsx
    - src/reconciler/hooks.ts
    - src/db/tasks.ts
  </dependencies>
</metadata>

---

<section name="design-review-addendum">

## Review Addendum (accounted)

Sources:
- `reviews/phase-registry-broken.md`
- `reviews/step-sequential-deadlock.md`

P0 blockers to address before any control flow features depend on phases/steps:
- PhaseRegistry resets `currentPhaseIndex` on mount.
- Skipped phases advance on mount (not when active).
- Normal phase progression missing (only skipped phases advance).
- Steps 1+ never start because activation is mount-only.
- Step tasks never complete because completion is tied to unmount.

</section>

---

## Problem Statement

Current phase/step sequencing is deadlocked or out-of-order:

```
Mount all phases/steps
  -> PhaseRegistry resets index to 0
  -> Skipped phases advance immediately (even when inactive)
  -> Step 0 starts, Step 1+ never start
  -> Step tasks never complete (no unmount)
  -> Global loop never advances
```

Impact: multi-phase workflows do not progress, resumability breaks, and any control-flow work built on phases/steps cannot be correct.

---

## Requirements

1. PhaseRegistry initializes only if state missing; no reset on mount.
2. Phase skip logic runs only when the phase is active.
3. Phase progression happens when work completes (not only on skip).
4. Step activation must react to isActive transitions (not mount-only).
5. Step completion must be explicit (not useUnmount).
6. StepRegistry must signal phase completion when last step completes.
7. Plan visibility preserved (always render), execution gated via `executionEnabled`.
8. Task lifecycle completes for steps to avoid global loop deadlock.

---

## Implementation Notes

### PhaseRegistry init (resume-safe)
- Replace unconditional set with "initialize if missing".

### Phase skip timing
- Use effect keyed on `registry.currentPhaseIndex` and `isSkipped`.
- Guard with ref to avoid double-advance in StrictMode.

### Step activation (no mount-only gating)
- Replace `useMount` pattern with `useEffectOnValueChange(isActive, ...)`.
- Start once per activation using a ref guard.

### Step completion (not unmount)
Pick one:
- Option A: add step_id to tasks; complete when child task count hits 0.
- Option B: StepRegistry provides onAllStepsComplete callback to Phase.

### Phase completion trigger
- StepRegistry calls `onAllStepsComplete` when sequential steps finish.
- Phase checks `registry.isPhaseActive(myIndex)` before advancing.

---

## Acceptance Criteria

- Sequential phases advance without manual intervention.
- Skipped phases only skip when active; no premature advancement.
- Step 1+ starts when it becomes active.
- Step tasks complete without unmount.
- No deadlocks in global loop.
- Resume preserves current phase/step indices.

---

## Tests

Minimum:
- Sequential workflow advances across multiple phases.
- SkipIf does not advance when phase inactive.
- Steps 1+ start after step 0 completes.
- Global loop completes with no pending tasks.

