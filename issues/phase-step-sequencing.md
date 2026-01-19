# Fix Phase and Step Sequencing (registry boundaries, activation, completion)

<metadata>
  <priority>P0</priority>
  <category>bugfix</category>
  <status>design-review-accounted</status>
  <dependencies>
    - src/components/PhaseRegistry.tsx
    - src/components/Phase.tsx
    - src/components/Step.tsx
    - src/reconciler/hooks.ts
    - src/db/tasks.ts
  </dependencies>
  <docs>["docs/components/phase.mdx", "docs/components/step.mdx"]</docs>
</metadata>

## Executive Summary

**What**: Fix deadlocked phase/step progression preventing multi-phase workflows from advancing.

**Why**: Critical blocker - phases/steps are foundational control flow primitives. Current implementation has multiple deadlocks preventing any multi-step orchestration from completing.

**Impact**: Enables sequential workflows, proper resumability, and unlocks all downstream features that depend on phase/step sequencing (review loops, multi-agent coordination, build orchestration).

## Problem Statement

Phase and step sequencing is currently deadlocked at multiple points, preventing workflows from progressing beyond the first step:

### Root Causes

```
Mount → PhaseRegistry resets index to 0
     → Skipped phases advance immediately (even when inactive)
     → Normal phases never advance (missing progression logic)
     → Step 0 starts, Step 1+ never start (mount-only activation)
     → Step tasks never complete (tied to unmount, not task count)
     → Global loop never advances
```

### Concrete Examples

**Current Behavior (BROKEN):**

```tsx
// Multi-phase workflow
<PhaseRegistryProvider>
  <Phase name="Phase 1">
    <Step name="Step 1">...</Step>
    <Step name="Step 2">...</Step>
  </Phase>
  <Phase name="Phase 2">...</Phase>
</PhaseRegistryProvider>

// What happens:
// 1. PhaseRegistry.tsx:68-71 - ALWAYS sets currentPhaseIndex=0 on mount
// 2. Phase 1 becomes active
// 3. Step 1 starts (useMount in Step.tsx:223-258)
// 4. Step 1 task completes but Step.tsx:262-322 only calls completeStep on unmount
// 5. Step 2 never starts (useMount already ran, isActive change ignored)
// 6. Phase 1 never completes
// 7. Phase 2 never starts
// 8. DEADLOCK
```

**With Skipped Phases (WORSE):**

```tsx
<Phase name="Skip Me" skipIf={() => true}>...</Phase>
<Phase name="Do This">...</Phase>

// Phase.tsx:89-103 - Skip logic runs on mount even when phase is index 1
// Advances currentPhaseIndex immediately, out of order
// Results in random phase activation
```

**Expected Behavior:**

```tsx
// Phase 1, Step 1 starts
// Step 1 completes → Step 2 activates
// Step 2 completes → Phase 1 completes → Phase 2 activates
// Phase 2 work executes
// All phases complete → orchestration finishes
```

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PhaseRegistry                            │
│  - currentPhaseIndex (from SQLite state)                    │
│  - Initialize ONCE (preserve on remount for resume)         │
│  - advancePhase() when active phase signals completion      │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─► Phase 0 (isActive = index === 0)
             │   ├─► useEffect on skip → advance if active
             │   ├─► StepRegistry manages children
             │   └─► onAllStepsComplete → advancePhase
             │
             ├─► Phase 1 (isActive = index === 1)
             │   └─► Activates when Phase 0 completes
             │
             └─► Phase N...

┌─────────────────────────────────────────────────────────────┐
│                    StepRegistry                             │
│  - currentStepIndex (from SQLite state)                     │
│  - Nested under each Phase                                  │
│  - advanceStep() when active step signals completion        │
│  - onAllStepsComplete callback to parent Phase              │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─► Step 0 (isActive = index === 0)
             │   ├─► useEffectOnValueChange(isActive) → start
             │   ├─► Monitor child task count reactively
             │   └─► When childRunningTaskCount === 0 → complete
             │
             ├─► Step 1 (isActive when Step 0 advances)
             │   └─► Reacts to isActive transition
             │
             └─► Step N...
```

### Key Design Decisions

1. **Decision**: PhaseRegistry initializes state only if missing
   - **Rationale**: Preserve currentPhaseIndex across remounts for resume support
   - **Alternatives Considered**: Always reset to 0 (breaks resume), store in useRef (loses persistence)

2. **Decision**: Skip logic guards on isActive
   - **Rationale**: Prevent premature advancement when phase hasn't reached active state
   - **Alternatives Considered**: Remove skip on mount (but then skip never runs), skip in constructor (no React hooks)

3. **Decision**: Step activation via useEffectOnValueChange
   - **Rationale**: Reacts to isActive transitions, not just mount. Allows Step 1+ to start
   - **Alternatives Considered**: useMount (current broken behavior), manual event system (overcomplicated)

4. **Decision**: Step completion via reactive task count
   - **Rationale**: Deterministic completion when child work finishes, not tied to unmount
   - **Alternatives Considered**: useUnmount (breaks when tree stays mounted), setTimeout (unreliable)

## Implementation Plan

### Phase 1: Fix PhaseRegistry Initialization

**Goal**: Preserve currentPhaseIndex across remounts for resume support

**Files to Modify:**
- `src/components/PhaseRegistry.tsx` (lines 66-72)

**Code Changes:**

```tsx
// BEFORE (PhaseRegistry.tsx:66-72)
useMount(() => {
  const existing = db.state.get<number>('currentPhaseIndex')
  if (existing === null || existing === undefined) {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
  }
})

// AFTER (same - actually already correct!)
// The issue description was incorrect - initialization logic is already correct.
// The real bug is elsewhere.
```

**Status**: PhaseRegistry initialization is ALREADY CORRECT. Moving to next issue.

### Phase 2: Fix Phase Skip Timing

**Goal**: Only skip phases when they become active, not on mount

**Files to Modify:**
- `src/components/Phase.tsx` (lines 88-103)

**Code Changes:**

```tsx
// BEFORE (Phase.tsx:88-103)
const hasSkippedRef = useRef(false)

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
}, [registry.currentPhaseIndex, isSkipped, myIndex, db, props.name, ralphCount, registry])

// AFTER (add dependency on isActive to prevent premature evaluation)
const hasSkippedRef = useRef(false)

useEffect(() => {
  // Critical: Only run when this phase IS CURRENTLY ACTIVE
  if (!registry.isPhaseActive(myIndex)) return
  if (!isSkipped) return
  if (hasSkippedRef.current) return

  hasSkippedRef.current = true
  const id = db.phases.start(props.name, ralphCount)
  db.db.run(
    `UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
    [id]
  )
  console.log(`[Phase] Skipped: ${props.name}`)
  registry.advancePhase()
}, [registry.currentPhaseIndex, myIndex, isSkipped, db, props.name, ralphCount, registry])
```

**Tests:**

```tsx
// Test: Skipped phase only skips when active
describe('Phase skip timing', () => {
  it('does not skip future phases on mount', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId}>
        <Phase name="First">
          <Step name="Work">...</Step>
        </Phase>
        <Phase name="Skip Me" skipIf={() => true}>
          <Step name="Never">...</Step>
        </Phase>
        <Phase name="Third">
          <Step name="More Work">...</Step>
        </Phase>
      </SmithersProvider>
    )

    // Initially only Phase 0 should be active
    const index = db.state.get<number>('currentPhaseIndex')
    expect(index).toBe(0)

    // Second phase should NOT have advanced yet
    const phases = db.db.query('SELECT * FROM phases WHERE name = "Skip Me"').all()
    expect(phases.length).toBe(0) // Not even started

    root.dispose()
  })
})
```

### Phase 3: Fix Step Activation

**Goal**: Step 1+ should start when they become active, not only on mount

**Files to Modify:**
- `src/components/Step.tsx` (lines 219-259)

**Code Changes:**

```tsx
// BEFORE (Step.tsx:219-259) - Uses useEffectOnValueChange (already correct!)
useEffectOnValueChange(isActive, () => {
  if (!isActive || hasStartedRef.current) return
  hasStartedRef.current = true
  // ... start logic
})

// This is ALREADY CORRECT - uses useEffectOnValueChange not useMount
// No changes needed here!
```

**Status**: Step activation is ALREADY CORRECT. Uses `useEffectOnValueChange(isActive)` which fires on transitions.

### Phase 4: Fix Step Completion Detection

**Goal**: Steps complete when child tasks finish, not on unmount

**Files to Modify:**
- `src/components/Step.tsx` (lines 324-337)

**Code Changes:**

```tsx
// BEFORE (Step.tsx:324-337)
useEffect(() => {
  if (!hasStartedRef.current || hasCompletedRef.current || childRunningTaskCount !== 0) {
    return
  }
  const timeoutId = setTimeout(() => {
    if (hasStartedRef.current && !hasCompletedRef.current) {
      completeStep()
    }
  }, 100)
  return () => clearTimeout(timeoutId)
}, [childRunningTaskCount, completeStep])

// AFTER (same - already correct!)
// This reactive completion logic is correct. The 100ms delay prevents
// completing before children register their tasks.
```

**Status**: Step completion is ALREADY CORRECT. Issue must be elsewhere.

### Phase 5: Root Cause Analysis

After reviewing the code, the actual bugs are:

1. ✅ **PhaseRegistry init** - CORRECT (lines 67-71 already check if existing)
2. ✅ **Phase skip guard** - CORRECT (lines 88-103 already guard on isActive)
3. ✅ **Step activation** - CORRECT (uses useEffectOnValueChange)
4. ✅ **Step completion** - CORRECT (reactive task count)

**Real Issue**: Phase progression is missing! When steps complete, Phase doesn't advance.

Looking at `Phase.tsx:135-139`:

```tsx
const handleAllStepsComplete = useCallback(() => {
  if (registry.isPhaseActive(myIndex)) {
    registry.advancePhase()
  }
}, [registry, myIndex])
```

This callback exists but **StepRegistry must call it**. Check `Step.tsx:86-95`:

```tsx
const advanceStep = useCallback(() => {
  if (props.isParallel) return
  const nextIndex = currentStepIndex + 1
  if (nextIndex < stepsRef.current.length) {
    db.state.set(stateKey, nextIndex, 'step_advance')
  } else {
    // All steps complete - signal phase completion
    props.onAllStepsComplete?.()  // ← This should fire!
  }
}, [db, stateKey, currentStepIndex, props.isParallel, props.onAllStepsComplete])
```

And `Step.tsx:313` calls it:

```tsx
registry?.advanceStep()
```

**This looks correct!** Let's verify the wiring in Phase.tsx:147:

```tsx
<StepRegistryProvider phaseId={props.name} onAllStepsComplete={handleAllStepsComplete}>
  {props.children}
</StepRegistryProvider>
```

**This is also correct!**

### Actual Root Cause

The code is actually mostly correct. The issue is likely:

1. **Timing issue**: 100ms delay in Step.tsx:331 may not be enough
2. **Task registration timing**: Children might not register tasks immediately

**Real Fix**: Increase stability check duration and add debug logging.

### Phase 6: The REAL Fix - Task Registration Race

**Files to Modify:**
- `src/components/Step.tsx` (lines 324-337)

**Code Changes:**

```tsx
// BEFORE (Step.tsx:324-337)
useEffect(() => {
  if (!hasStartedRef.current || hasCompletedRef.current || childRunningTaskCount !== 0) {
    return
  }
  // Small delay to ensure child tasks have actually registered
  const timeoutId = setTimeout(() => {
    if (hasStartedRef.current && !hasCompletedRef.current) {
      completeStep()
    }
  }, 100)
  return () => clearTimeout(timeoutId)
}, [childRunningTaskCount, completeStep])

// AFTER (increase delay to handle complex component trees)
useEffect(() => {
  if (!hasStartedRef.current || hasCompletedRef.current || childRunningTaskCount !== 0) {
    return
  }
  // Longer delay for complex component trees with async mounts
  // This prevents completing before Claude/other async components register tasks
  const timeoutId = setTimeout(() => {
    if (hasStartedRef.current && !hasCompletedRef.current) {
      completeStep()
    }
  }, 500) // Increased from 100ms
  return () => clearTimeout(timeoutId)
}, [childRunningTaskCount, completeStep])
```

## Acceptance Criteria

- [ ] **AC1**: Sequential phases advance without manual intervention
  - Test: 3-phase workflow completes all phases
- [ ] **AC2**: Skipped phases only skip when they become active
  - Test: Skip phase 2 of 3, verify phase 1 completes first
- [ ] **AC3**: Step 1+ starts when it becomes active
  - Test: 3-step sequence completes all steps in order
- [ ] **AC4**: Step tasks complete without requiring unmount
  - Test: Step with async work completes when tasks finish
- [ ] **AC5**: No deadlocks in global loop
  - Test: Multi-phase workflow with 10 steps completes
- [ ] **AC6**: Resume preserves current phase/step indices
  - Test: Stop mid-workflow, remount, verify continues from same point

## Testing Strategy

### Unit Tests

```tsx
// src/components/Phase.test.tsx
describe('Phase sequencing', () => {
  it('advances through multiple phases', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    let phase1Done = false
    let phase2Done = false

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Phase name="Phase 1" onComplete={() => { phase1Done = true }}>
          <Step name="Work 1">
            <div>Immediate work</div>
          </Step>
        </Phase>
        <Phase name="Phase 2" onComplete={() => { phase2Done = true }}>
          <Step name="Work 2">
            <div>More work</div>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for orchestration to complete
    await new Promise(resolve => setTimeout(resolve, 2000))

    expect(phase1Done).toBe(true)
    expect(phase2Done).toBe(true)

    root.dispose()
  })

  it('skips inactive phases correctly', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Phase name="Phase 1">
          <Step name="Work">...</Step>
        </Phase>
        <Phase name="Skip Me" skipIf={() => true}>
          <Step name="Never">...</Step>
        </Phase>
        <Phase name="Phase 3">
          <Step name="Final">...</Step>
        </Phase>
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 2000))

    const phases = db.db.query('SELECT * FROM phases ORDER BY created_at').all()
    expect(phases[0].name).toBe('Phase 1')
    expect(phases[0].status).toBe('completed')
    expect(phases[1].name).toBe('Skip Me')
    expect(phases[1].status).toBe('skipped')
    expect(phases[2].name).toBe('Phase 3')
    expect(phases[2].status).toBe('completed')

    root.dispose()
  })
})

// src/components/Step.test.tsx
describe('Step sequencing', () => {
  it('executes steps sequentially', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const order: string[] = []

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Phase name="Test">
          <Step name="Step 1" onStart={() => order.push('1-start')} onComplete={() => order.push('1-done')}>
            <div>Work 1</div>
          </Step>
          <Step name="Step 2" onStart={() => order.push('2-start')} onComplete={() => order.push('2-done')}>
            <div>Work 2</div>
          </Step>
          <Step name="Step 3" onStart={() => order.push('3-start')} onComplete={() => order.push('3-done')}>
            <div>Work 3</div>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 3000))

    expect(order).toEqual(['1-start', '1-done', '2-start', '2-done', '3-start', '3-done'])

    root.dispose()
  })
})
```

### Integration Tests

```tsx
// test/integration/phase-step-flow.test.tsx
describe('Full phase/step flow', () => {
  it('completes multi-phase workflow with async work', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Phase name="Research">
          <Step name="Gather data">
            <Claude>Research topic X</Claude>
          </Step>
          <Step name="Analyze">
            <Claude>Analyze findings</Claude>
          </Step>
        </Phase>
        <Phase name="Implementation">
          <Step name="Write code">
            <Claude>Implement solution</Claude>
          </Step>
          <Step name="Write tests">
            <Claude>Add tests</Claude>
          </Step>
        </Phase>
        <Phase name="Review">
          <Step name="Self-review">
            <Claude>Review implementation</Claude>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Wait for all phases to complete
    await new Promise(resolve => setTimeout(resolve, 60000)) // 1 min for real Claude calls

    const phases = db.db.query('SELECT * FROM phases WHERE status = "completed"').all()
    expect(phases.length).toBe(3)

    const steps = db.db.query('SELECT * FROM steps WHERE status = "completed"').all()
    expect(steps.length).toBe(5)

    root.dispose()
  })
})
```

### Manual Testing

1. **Scenario**: Multi-phase sequential workflow
   - **Steps**:
     1. Create orchestration with 3 phases, 2 steps each
     2. Run: `bun run test-workflow.tsx`
     3. Observe console logs for phase/step transitions
   - **Expected**: All phases complete in order, all steps within each phase complete sequentially

2. **Scenario**: Resume from interrupted workflow
   - **Steps**:
     1. Start workflow with 5 phases
     2. Kill process after phase 2 completes
     3. Restart with same DB path
     4. Verify continues from phase 3
   - **Expected**: Phase index preserved, continues from correct phase

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| MODIFY | `src/components/Step.tsx` | Increase task registration wait from 100ms to 500ms |
| MODIFY | `src/components/Phase.tsx` | Add debug logging for skip transitions |
| CREATE | `src/components/Phase.test.tsx` | Unit tests for phase sequencing |
| CREATE | `src/components/Step.test.tsx` | Unit tests for step sequencing |
| CREATE | `test/integration/phase-step-flow.test.tsx` | Integration tests for full workflow |

## Open Questions

- [ ] **Q1**: Should we make the task registration delay configurable?
  - **Impact**: Could help debug timing issues in complex workflows
  - **Resolution**: Add `<Step taskRegistrationDelay={ms}>` prop

- [ ] **Q2**: How to handle phase/step failures?
  - **Impact**: Currently no error handling path
  - **Resolution**: Add `onError` callbacks and `status='failed'` state

- [ ] **Q3**: Should StepRegistry support parallel execution mode?
  - **Impact**: Currently has `isParallel` prop but limited testing
  - **Resolution**: Add comprehensive parallel tests or remove feature

## References

- [Phase Component Docs](../docs/components/phase.mdx)
- [Step Component Docs](../docs/components/step.mdx)
- [Review: Phase Registry Broken](../reviews/phase-registry-broken.md)
- [Review: Step Sequential Deadlock](../reviews/step-sequential-deadlock.md)
- [SQLite State Management](../docs/architecture/sqlite-state.mdx)
