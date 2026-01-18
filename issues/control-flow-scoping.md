# Control Flow Scoping Design

<metadata>
  <priority>critical</priority>
  <category>design</category>
  <status>draft</status>
  <blocks>
    - issues/control-flow-components.md
  </blocks>
</metadata>

---

## Problem Statement

Control flow components (`<While>`, `<If>`, `<Switch>`) need a scoping mechanism to allow phases and steps to be re-executed within iterations. Without scoping, the database state management breaks:

**Example: While Loop**

```tsx
<While condition={() => testsNotPassing} maxIterations={5}>
  <Phase name="Fix and Test">
    <Step name="Analyze Failures">
      <Claude>Analyze test failures</Claude>
    </Step>
    <Step name="Apply Fix">
      <Claude>Apply the fix</Claude>
    </Step>
  </Phase>
</While>
```

**What happens without scoping:**
1. **Iteration 1**: `Phase "Fix and Test"` starts → completes → marked as `completed` in DB
2. **Iteration 2**: Same `Phase "Fix and Test"` component mounts, but:
   - Database already has a row for phase "Fix and Test" with status `completed`
   - Phase thinks it's already done and skips execution
   - Steps inside are also marked completed
   - **Loop is broken**

---

## Current State Management

### Phases
- Identified by: `(execution_id, name, iteration)`
- `iteration` field: Currently tied to **Ralph iteration count** (outer retry loop)
- Status tracking: `phases` table with `status` column
- Sequential execution: `PhaseRegistry` uses `currentPhaseIndex` in state table

### Steps
- Identified by: Phase-local step index
- Status tracking: `steps` table with `status` column
- Sequential execution: `StepRegistry` uses `stepIndex_{phaseId}` in state table

### State Table
- Key-value store for transient state
- Used for: phase indices, step indices, control flow results
- No built-in scoping mechanism

---

## Design Requirements

1. **Durable Phase/Step History**: All iterations should be logged to the database
2. **Fresh Execution Per Iteration**: Each iteration needs clean state for phases/steps
3. **Resumability**: If orchestration crashes mid-iteration, it should resume correctly
4. **Visibility**: Plan output should show which iteration is active
5. **Minimal API Changes**: Existing Phase/Step components should "just work" inside control flow

---

## Proposed Solution: Scope ID

### Concept

Introduce a **scope identifier** that creates isolated execution contexts for control flow components.

A scope ID is a hierarchical string that uniquely identifies an execution context:
- Root scope: `"root"` (default)
- While loop iteration 2: `"root.while_abc123.2"`
- If branch (then): `"root.if_def456.then"`
- Nested: `"root.while_abc123.2.if_def456.else"`

### Implementation Approach

#### 1. Add Scope to SmithersProvider Context

```tsx
interface SmithersContextValue {
  db: SmithersDB
  reactiveDb: ReactiveDatabase
  executionId: string
  ralphCount: number
  scopeId: string  // NEW: current scope identifier
  // ... rest
}
```

#### 2. Control Flow Components Create Child Scopes

**While component:**
```tsx
export function While(props: WhileProps): ReactNode {
  const { scopeId } = useSmithers()
  const whileId = useRef(`while_${uuid()}`).current

  // Each iteration gets its own scope
  const iterationScopeId = `${scopeId}.${whileId}.${iteration}`

  return (
    <while iteration={iteration} status={status}>
      {status === 'running' && (
        <ScopeProvider scopeId={iterationScopeId}>
          <WhileIterationProvider onComplete={handleIterationComplete}>
            {props.children}
          </WhileIterationProvider>
        </ScopeProvider>
      )}
    </while>
  )
}
```

**If component:**
```tsx
export function If(props: IfProps): ReactNode {
  const { scopeId } = useSmithers()
  const ifId = useRef(`if_${uuid()}`).current

  return (
    <if status={evaluated ? 'evaluated' : 'evaluating'} result={result}>
      <branch type="then" active={result === true}>
        {result === true && (
          <ScopeProvider scopeId={`${scopeId}.${ifId}.then`}>
            {props.children}
          </ScopeProvider>
        )}
      </branch>
      {props.else && (
        <branch type="else" active={result === false}>
          {result === false && (
            <ScopeProvider scopeId={`${scopeId}.${ifId}.else`}>
              {props.else}
            </ScopeProvider>
          )}
        </branch>
      )}
    </if>
  )
}
```

#### 3. Phase and Step Use Scope for Database Keys

**Phase identification:**
```tsx
export function Phase(props: PhaseProps): ReactNode {
  const { db, ralphCount, scopeId } = useSmithers()

  // Scope-aware phase identifier
  const phaseKey = `${scopeId}.${props.name}`

  useEffect(() => {
    if (isActive && !hasStartedRef.current) {
      // Create new phase row with scope in metadata
      const id = db.phases.start(props.name, ralphCount, { scope: scopeId })
      // ...
    }
  }, [isActive, scopeId])

  // ...
}
```

**PhaseRegistry scoping:**
```tsx
export function PhaseRegistryProvider(props: PhaseRegistryProviderProps): ReactNode {
  const { db, reactiveDb, scopeId } = useSmithers()

  // Scope-specific phase index key
  const phaseIndexKey = `currentPhaseIndex_${scopeId}`

  const { data: dbPhaseIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [phaseIndexKey]
  )

  // ...
}
```

**StepRegistry scoping:**
```tsx
export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  const { db, reactiveDb, scopeId } = useSmithers()

  // Scope-specific step index key
  const stateKey = `stepIndex_${scopeId}_${props.phaseId ?? 'default'}`

  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey]
  )

  // ...
}
```

---

## Alternative Approaches Considered

### Alternative 1: Add `scope` Column to Phases/Steps Tables

**Pros:**
- Explicit in schema
- Easy to query phases by scope

**Cons:**
- Schema migration required
- Doesn't solve state table scoping (phase indices, step indices)
- Still need scope propagation through context

**Decision:** Reject. Scope is better as a context concern, not a database schema concern. We can store it in JSON metadata if needed for queries.

### Alternative 2: Use Iteration Number Only

```tsx
// Just pass iteration down
<While iteration={2}>
  <Phase name="Fix" iteration={2}>  {/* Manually pass down */}
```

**Pros:**
- Simple concept
- Works for While loops

**Cons:**
- Doesn't work for `<If>` or `<Switch>` (no iteration concept)
- Requires manual prop threading
- Breaks for nested control flow
- Not composable

**Decision:** Reject. Too limited, not composable.

### Alternative 3: React Key-Based Scoping

Use React's `key` prop to force unmount/remount:

```tsx
<While>
  {Array.from({ length: iteration + 1 }, (_, i) => (
    <React.Fragment key={i}>
      {i === iteration && props.children}
    </React.Fragment>
  ))}
</While>
```

**Pros:**
- Uses React's built-in mechanism
- Forces clean state on each iteration

**Cons:**
- Loses durability - database state is tied to component lifecycle
- Phases/steps get new UUIDs each iteration (hard to track history)
- Doesn't solve resumability after crash
- Confusing plan output (multiple phase instances)

**Decision:** Reject. Violates durability requirement.

### Alternative 4: Explicit Scope Props

```tsx
<While>
  {(iteration) => (
    <ScopeProvider scope={`iteration-${iteration}`}>
      {props.children}
    </ScopeProvider>
  )}
</While>
```

**Pros:**
- Explicit control
- Flexible

**Cons:**
- Render-prop API is clunky
- Deviates from declarative children pattern
- User has to understand scoping concept

**Decision:** Reject. Too complex for users, breaks declarative API.

---

## Detailed Implementation Plan

### Phase 1: Add Scope Context

1. Add `scopeId` to `SmithersContextValue`
2. Create `ScopeProvider` component
3. Initialize root scope as `"root"` in `SmithersProvider`
4. Test: Verify scope propagates through context

### Phase 2: Update Phase/Step to Use Scope

1. Update `PhaseRegistryProvider` to scope `currentPhaseIndex` key
2. Update `StepRegistryProvider` to scope step index keys
3. Update `Phase` component to include scope in phase metadata
4. Update `Step` component to include scope in step metadata
5. Test: Verify phases/steps work with scoped state keys

### Phase 3: Implement Control Flow Scoping

1. Update `<If>` to wrap branches in `ScopeProvider`
2. Update `<While>` to wrap iterations in `ScopeProvider`
3. Update `<Switch>` to wrap cases in `ScopeProvider`
4. Test: While loop with phases executes multiple iterations correctly
5. Test: If branches execute with isolated state
6. Test: Nested control flow works (While inside If, etc.)

### Phase 4: Database Schema (Optional Enhancement)

1. Add `scope` JSON field to phases/steps tables for queryability
2. Update phase/step creation to log scope
3. Create helper queries to filter by scope
4. Test: Can query all phases in a specific While iteration

### Phase 5: Plan Output Enhancement

1. Update XML output to show scope hierarchy
2. Add scope breadcrumbs to plan display
3. Test: Plan output clearly shows which iteration is active

---

## Open Questions

### Q1: Should we automatically clean up old scope state?

When a While loop completes, should we delete state keys for old iterations?

**Option A: Keep everything** (recommended)
- Pros: Full audit trail, can inspect past iterations
- Cons: State table grows

**Option B: Clean up on completion**
- Pros: Smaller state table
- Cons: Loses history, harder to debug

**Recommendation:** Keep everything. State table is cheap storage.

### Q2: How deep should scope nesting go?

Should we limit nesting depth to prevent absurdly long scope IDs?

**Recommendation:** No hard limit. Real-world nesting is unlikely to exceed 5 levels. Monitor and optimize if needed.

### Q3: Should scope be visible in the API?

Should users be able to manually create scopes or query current scope?

**Recommendation:** Keep it internal for now. Advanced users can access via `useSmithers()` if needed, but don't document it as a public API.

### Q4: How does scope interact with Ralph iterations?

Ralph is the outer retry loop. Should Ralph iterations create scopes?

**Analysis:**
- Ralph iterations already tracked via `iteration` field on phases
- Ralph is fundamentally different: it's a full workflow restart, not a sub-loop
- Phases in different Ralph iterations should be separate DB rows (already are)
- No scope needed - Ralph iteration number is sufficient

**Recommendation:** Don't scope Ralph iterations. Keep `iteration` field as-is. Scope is only for control flow components.

### Q5: What happens with resumability mid-iteration?

If orchestration crashes during While iteration 3:
- Scope ID is `root.while_abc.3`
- Phase "Fix and Test" is partially complete
- On resume, how do we know to continue iteration 3?

**Analysis:**
- Control flow state (current iteration) is in database
- On resume, While reads `while_iteration_root.while_abc` from state table
- Knows to create scope `root.while_abc.3` again
- Phase/Step state is scoped, so picks up where it left off

**Recommendation:** Current design handles this. Add test to verify.

---

## Example: Nested Control Flow with Scoping

```tsx
<Ralph maxIterations={10}>
  <Phase name="Setup">
    <Claude>Initial setup</Claude>
  </Phase>

  <While
    condition={() => !testsPass}
    maxIterations={5}
  >
    {/* Iteration 0 scope: root.while_xyz.0 */}
    {/* Iteration 1 scope: root.while_xyz.1 */}

    <Phase name="Attempt Fix">
      {/* Iteration 0: scope = root.while_xyz.0, phase = "Attempt Fix" */}
      {/* Iteration 1: scope = root.while_xyz.1, phase = "Attempt Fix" */}

      <If condition={() => hasQuickFix}>
        {/* Then branch scope: root.while_xyz.N.if_abc.then */}
        <Phase name="Quick Fix">
          <Claude>Apply quick fix</Claude>
        </Phase>

        <Else>
          {/* Else branch scope: root.while_xyz.N.if_abc.else */}
          <Phase name="Deep Investigation">
            <Claude>Investigate root cause</Claude>
          </Phase>
        </Else>
      </If>

      <Phase name="Run Tests">
        <Claude onFinished={updateTestsPass}>Run tests</Claude>
      </Phase>
    </Phase>
  </While>

  <Phase name="Deploy">
    <Claude>Deploy to production</Claude>
  </Phase>
</Ralph>
```

**Database state keys:**
- `currentPhaseIndex_root` - Top-level phase sequencing
- `currentPhaseIndex_root.while_xyz.0` - Phase sequencing for While iteration 0
- `currentPhaseIndex_root.while_xyz.1` - Phase sequencing for While iteration 1
- `currentPhaseIndex_root.while_xyz.0.if_abc.then` - Phase sequencing for If then branch in iteration 0
- `stepIndex_root.while_xyz.0_Attempt Fix` - Steps in "Attempt Fix" phase, iteration 0

---

## Success Criteria

- [ ] While loops can execute multiple iterations with fresh phase/step state each time
- [ ] If branches create isolated scopes for then/else
- [ ] Switch cases create isolated scopes per case
- [ ] Nested control flow works correctly (While in If, If in While, etc.)
- [ ] Orchestration resumes correctly mid-iteration after crash
- [ ] Database contains complete history of all iterations
- [ ] Plan output clearly shows scope hierarchy
- [ ] No API changes to Phase/Step components (they work transparently)
- [ ] State table keys are properly scoped and don't collide

---

## Next Steps

1. **Review this design** with team/user
2. **Prototype ScopeProvider** and verify context propagation
3. **Update control-flow-components.md** to include scoping in implementation sketches
4. **Implement Phase 1-3** from implementation plan
5. **Write comprehensive tests** for scoping scenarios
6. **Update documentation** with scoping behavior (for future maintainers, not end users)
