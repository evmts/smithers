# Control Flow Components: If, While, Switch

<metadata>
  <priority>critical</priority>
  <category>feature</category>
  <estimated-effort>5-7 days</estimated-effort>
  <status>design-review</status>
  <dependencies>
    - src/components/Phase.tsx
    - src/components/PhaseRegistry.tsx
    - src/components/SmithersProvider.tsx
    - src/reconciler/hooks.js
  </dependencies>
  <blocked-by>
    - Human review and approval required
    - Codex review required
  </blocked-by>
</metadata>

---

## ⚠️ WARNING: Complex Feature - Review Required

**This design requires thorough review before implementation:**

- **Complexity**: Introduces hierarchical scoping system with deep implications for state management
- **Risk**: Changes core assumptions about Phase/Step lifecycle and database interactions
- **Testing**: Requires comprehensive test coverage for nested scenarios and edge cases
- **Reversibility**: Once implemented, removing scoping would be a breaking change

**Required Reviews:**
1. **Human review**: Validate design approach and confirm it solves the right problem
2. **Codex review**: Verify implementation approach and identify potential issues

**Do not proceed with implementation until reviews are complete.**

---

## Executive Summary

Add minimal control flow components (`<If>`, `<While>`, `<Switch>`) to enable conditional and iterative execution within Smithers orchestrations. These components complement the existing `Phase` and `Step` components while maintaining the declarative, unconditional rendering pattern.

**Critical Design Challenge:** Control flow requires a **scoping mechanism** to allow phases/steps to re-execute across iterations without state collision.

---

<section name="problem-statement">

## The Scoping Problem

Control flow components need a scoping mechanism to allow phases and steps to be re-executed within iterations. Without scoping, the database state management breaks:

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
   - PhaseRegistry's `currentPhaseIndex` state key says we're done
   - Phase thinks it's already done and skips execution
   - Steps inside are also marked completed
   - **Loop is broken**

**This is the core complexity that requires upfront design.**

</section>

---

<section name="design-philosophy">

## Design Philosophy

### Why Control Flow Components?

The current Phase component supports sequential execution with `skipIf` for simple conditional skipping. However, more complex workflows require:

1. **Conditional branching** - Execute different children based on runtime conditions
2. **Iteration** - Repeat children until a condition is met
3. **Multi-way branching** - Choose one of several paths based on a value

### Design Principles

1. **Unconditional rendering** - All control flow components render their structure in the plan output, even when branches are inactive
2. **Declarative over imperative** - Use props and children to express flow, not callbacks that mutate state
3. **Visible in plan output** - The workflow structure is always visible, making debugging easier
4. **Database-backed state** - Conditions can query SQLite state for durable, resumable workflows
5. **Minimal API surface** - Only add what's necessary; avoid replicating React's full conditional rendering
6. **Scoped execution** - Each iteration/branch gets isolated state to enable re-execution

### Anti-pattern: Conditional Phase Rendering

**Do NOT use React's conditional rendering for phases:**

```tsx
// WRONG - This hides the workflow structure
{phase === 'research' && <Phase name="Research">...</Phase>}
{phase === 'implement' && <Phase name="Implementation">...</Phase>}
```

**Use control flow components instead:**

```tsx
// CORRECT - Workflow structure is always visible
<Phase name="Research">...</Phase>
<If condition={() => needsMoreResearch}>
  <Phase name="Additional Research">...</Phase>
</If>
<Phase name="Implementation">...</Phase>
```

</section>

---

<section name="scoping-design">

## Scoping Design

### Current State Management

**Phases:**
- Identified by: `(execution_id, name, iteration)`
- `iteration` field: Currently tied to **Ralph iteration count** (outer retry loop)
- Status tracking: `phases` table with `status` column
- Sequential execution: `PhaseRegistry` uses `currentPhaseIndex` in state table

**Steps:**
- Identified by: Phase-local step index
- Status tracking: `steps` table with `status` column
- Sequential execution: `StepRegistry` uses `stepIndex_{phaseId}` in state table

**State Table:**
- Key-value store for transient state
- Used for: phase indices, step indices, control flow results
- No built-in scoping mechanism

### Design Requirements

1. **Durable Phase/Step History**: All iterations should be logged to the database
2. **Fresh Execution Per Iteration**: Each iteration needs clean state for phases/steps
3. **Resumability**: If orchestration crashes mid-iteration, it should resume correctly
4. **Visibility**: Plan output should show which iteration is active
5. **Minimal API Changes**: Existing Phase/Step components should "just work" inside control flow

### Proposed Solution: Hierarchical Scope IDs

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

#### 2. Create ScopeProvider Component

```tsx
interface ScopeProviderProps {
  scopeId: string
  children: ReactNode
}

export function ScopeProvider(props: ScopeProviderProps): ReactNode {
  const parentContext = useSmithers()

  const scopedContext = useMemo(
    () => ({
      ...parentContext,
      scopeId: props.scopeId,
    }),
    [parentContext, props.scopeId]
  )

  return (
    <SmithersContext.Provider value={scopedContext}>
      {props.children}
    </SmithersContext.Provider>
  )
}
```

#### 3. Control Flow Components Create Child Scopes

Control flow components wrap their children in ScopeProvider to isolate state:

- `<While>`: Each iteration gets scope `${scopeId}.${whileId}.${iteration}`
- `<If>`: Then branch gets `${scopeId}.${ifId}.then`, else gets `${scopeId}.${ifId}.else`
- `<Switch>`: Each case gets `${scopeId}.${switchId}.case${index}`

#### 4. Phase and Step Use Scope for Database Keys

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

**Phase metadata:**
```tsx
export function Phase(props: PhaseProps): ReactNode {
  const { db, ralphCount, scopeId } = useSmithers()

  useEffect(() => {
    if (isActive && !hasStartedRef.current) {
      // Create new phase row with scope in metadata (optional for queryability)
      const id = db.phases.start(props.name, ralphCount, { scope: scopeId })
      // ...
    }
  }, [isActive, scopeId])

  // ...
}
```

### Example: Nested Control Flow with Scoping

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

### Alternative Approaches Considered

#### Alternative 1: Add `scope` Column to Phases/Steps Tables

**Rejected because:**
- Schema migration required
- Doesn't solve state table scoping (phase indices, step indices)
- Still need scope propagation through context
- Scope is better as a context concern, not a database schema concern

#### Alternative 2: Use Iteration Number Only

**Rejected because:**
- Doesn't work for `<If>` or `<Switch>` (no iteration concept)
- Requires manual prop threading
- Breaks for nested control flow
- Not composable

#### Alternative 3: React Key-Based Scoping

**Rejected because:**
- Loses durability - database state is tied to component lifecycle
- Phases/steps get new UUIDs each iteration (hard to track history)
- Doesn't solve resumability after crash
- Confusing plan output

#### Alternative 4: Explicit Scope Props (Render Props)

**Rejected because:**
- Render-prop API is clunky
- Deviates from declarative children pattern
- User has to understand scoping concept

</section>

---

<section name="if-component">

## `<If>` Component

Conditionally renders children based on a runtime condition.

### API

```tsx
interface IfProps {
  /**
   * Condition function that returns boolean.
   * Called on each render to determine if children should execute.
   * Can be async for database queries.
   */
  condition: () => boolean | Promise<boolean>

  /**
   * Children to render when condition is true.
   */
  children: ReactNode

  /**
   * Optional children to render when condition is false.
   * Use <Else> component for cleaner syntax.
   */
  else?: ReactNode
}
```

### Usage

**Basic conditional:**

```tsx
<Phase name="Testing">
  <Claude>Run tests</Claude>
</Phase>

<If condition={() => testsPassedRef.current}>
  <Phase name="Deploy">
    <Claude>Deploy to production</Claude>
  </Phase>
</If>
```

**With else branch:**

```tsx
<If
  condition={async () => {
    const review = await db.state.get('reviewResult')
    return review?.approved === true
  }}
  else={
    <Phase name="Fix Issues">
      <Claude>Address review feedback</Claude>
    </Phase>
  }
>
  <Phase name="Merge">
    <Claude>Merge the PR</Claude>
  </Phase>
</If>
```

**Using `<Else>` component for cleaner syntax:**

```tsx
<If condition={() => hasTests}>
  <Phase name="Run Tests">
    <Claude>Execute test suite</Claude>
  </Phase>

  <Else>
    <Phase name="Write Tests">
      <Claude>Write missing tests</Claude>
    </Phase>
  </Else>
</If>
```

### Plan Output

```xml
<if condition="hasTests" status="evaluating">
  <branch type="then" active="true">
    <phase name="Run Tests" status="active">...</phase>
  </branch>
  <branch type="else" active="false">
    <phase name="Write Tests" status="skipped">...</phase>
  </branch>
</if>
```

### Implementation Sketch

```tsx
export function If(props: IfProps): ReactNode {
  const { db, reactiveDb, scopeId } = useSmithers()
  const ifId = useRef(`if_${Math.random().toString(36).slice(2)}`).current
  const stateKey = `if_result_${ifId}`

  // Read condition result from SQLite reactively
  const { data: dbResult } = useQueryValue<boolean>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as result FROM state WHERE key = ?`,
    [stateKey]
  )

  const result = dbResult ?? null
  const evaluated = result !== null

  useMount(() => {
    ;(async () => {
      const conditionResult = await props.condition()
      // Store result in database for durability
      db.state.set(stateKey, conditionResult ? 1 : 0, 'if_condition_evaluated')
    })()
  })

  // Always render structure, but only active branch's children execute
  // Wrap each branch in ScopeProvider for isolated state
  return (
    <if status={evaluated ? 'evaluated' : 'evaluating'} result={result}>
      <branch type="then" active={result === true}>
        {result === true && (
          <ScopeProvider scopeId={`${scopeId}.${ifId}.then`}>
            {props.children}
          </ScopeProvider>
        )}
      </branch>
      {(props.else || hasElseChild(props.children)) && (
        <branch type="else" active={result === false}>
          {result === false && (
            <ScopeProvider scopeId={`${scopeId}.${ifId}.else`}>
              {props.else ?? extractElseChildren(props.children)}
            </ScopeProvider>
          )}
        </branch>
      )}
    </if>
  )
}
```

</section>

---

<section name="while-component">

## `<While>` Component

Repeats children while a condition is true. Useful for retry loops and iterative refinement.

### API

```tsx
interface WhileProps {
  /**
   * Condition function. Loop continues while this returns true.
   * Evaluated before each iteration.
   */
  condition: () => boolean | Promise<boolean>

  /**
   * Maximum number of iterations to prevent infinite loops.
   * @default 10
   */
  maxIterations?: number

  /**
   * Children to execute each iteration.
   */
  children: ReactNode

  /**
   * Callback on each iteration start.
   */
  onIteration?: (iteration: number) => void

  /**
   * Callback when loop completes (condition became false or max reached).
   */
  onComplete?: (iterations: number, reason: 'condition' | 'max') => void
}
```

### Usage

**Retry until success:**

```tsx
<While
  condition={async () => {
    const result = await db.state.get('testResult')
    return result?.passed !== true
  }}
  maxIterations={5}
  onComplete={(iterations, reason) => {
    console.log(`Completed after ${iterations} iterations: ${reason}`)
  }}
>
  <Phase name="Fix and Retry">
    <Step name="Analyze Failure">
      <Claude>Analyze test failures and identify fixes</Claude>
    </Step>
    <Step name="Apply Fix">
      <Claude>Apply the fix</Claude>
    </Step>
    <Step name="Run Tests">
      <Claude
        onFinished={async (result) => {
          await db.state.set('testResult', { passed: result.includes('PASS') })
        }}
      >
        Run tests
      </Claude>
    </Step>
  </Phase>
</While>
```

### Plan Output

```xml
<while maxIterations="5" iteration="2" status="running">
  <phase name="Fix and Retry" status="active">
    ...
  </phase>
</while>
```

### Implementation Sketch

```tsx
export function While(props: WhileProps): ReactNode {
  const { db, reactiveDb, scopeId } = useSmithers()
  const whileId = useRef(`while_${Math.random().toString(36).slice(2)}`).current
  const iterationKey = `while_iteration_${whileId}`
  const statusKey = `while_status_${whileId}`
  const maxIterations = props.maxIterations ?? 10

  // Read iteration count from SQLite reactively
  const { data: dbIteration } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as iteration FROM state WHERE key = ?`,
    [iterationKey]
  )

  // Read status from SQLite reactively
  const { data: dbStatus } = useQueryValue<string>(
    reactiveDb,
    `SELECT value as status FROM state WHERE key = ?`,
    [statusKey]
  )

  const iteration = dbIteration ?? 0
  const status = (dbStatus as 'pending' | 'running' | 'complete') ?? 'pending'

  useMount(() => {
    ;(async () => {
      // Initialize state in database
      db.state.set(iterationKey, 0, 'while_init')

      const conditionResult = await props.condition()
      if (conditionResult) {
        db.state.set(statusKey, 'running', 'while_start')
        props.onIteration?.(0)
      } else {
        db.state.set(statusKey, 'complete', 'while_skip')
        props.onComplete?.(0, 'condition')
      }
    })()
  })

  // Called when children complete
  const handleIterationComplete = async () => {
    const nextIteration = iteration + 1

    if (nextIteration >= maxIterations) {
      db.state.set(statusKey, 'complete', 'while_max_reached')
      props.onComplete?.(nextIteration, 'max')
      return
    }

    const conditionResult = await props.condition()
    if (!conditionResult) {
      db.state.set(statusKey, 'complete', 'while_condition_false')
      props.onComplete?.(nextIteration, 'condition')
      return
    }

    db.state.set(iterationKey, nextIteration, 'while_advance')
    props.onIteration?.(nextIteration)
  }

  // Each iteration gets its own scope for isolated phase/step state
  const iterationScopeId = `${scopeId}.${whileId}.${iteration}`

  return (
    <while
      maxIterations={maxIterations}
      iteration={iteration}
      status={status}
    >
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

</section>

---

<section name="switch-component">

## `<Switch>` Component

Multi-way branching based on a value. Cleaner than nested `<If>` components.

### API

```tsx
interface SwitchProps<T = string> {
  /**
   * Value to match against cases.
   * Can be a function for dynamic evaluation.
   */
  value: T | (() => T | Promise<T>)

  /**
   * Children should be <Case> and optionally <Default> components.
   */
  children: ReactNode
}

interface CaseProps<T = string> {
  /**
   * Value(s) to match. Can be a single value or array.
   */
  match: T | T[]

  /**
   * Children to render when matched.
   */
  children: ReactNode
}

interface DefaultProps {
  /**
   * Children to render when no case matches.
   */
  children: ReactNode
}
```

### Usage

```tsx
<Switch value={async () => await db.state.get('workflowMode')}>
  <Case match="fast">
    <Phase name="Quick Implementation">
      <Claude model="haiku">Implement quickly</Claude>
    </Phase>
  </Case>

  <Case match="thorough">
    <Phase name="Research">
      <Claude model="opus">Deep research</Claude>
    </Phase>
    <Phase name="Implementation">
      <Claude model="sonnet">Careful implementation</Claude>
    </Phase>
  </Case>

  <Default>
    <Phase name="Standard Flow">
      <Claude>Standard implementation</Claude>
    </Phase>
  </Default>
</Switch>
```

### Plan Output

```xml
<switch value="thorough">
  <case match="fast" active="false">
    <phase name="Quick Implementation" status="skipped">...</phase>
  </case>
  <case match="thorough" active="true">
    <phase name="Research" status="completed">...</phase>
    <phase name="Implementation" status="active">...</phase>
  </case>
  <default active="false">
    <phase name="Standard Flow" status="skipped">...</phase>
  </default>
</switch>
```

### Implementation Sketch

```tsx
export function Switch<T = string>(props: SwitchProps<T>): ReactNode {
  const { db, reactiveDb, scopeId } = useSmithers()
  const switchId = useRef(`switch_${Math.random().toString(36).slice(2)}`).current
  const valueKey = `switch_value_${switchId}`

  // Read evaluated value from SQLite reactively
  const { data: dbValue } = useQueryValue<T>(
    reactiveDb,
    `SELECT value as val FROM state WHERE key = ?`,
    [valueKey]
  )

  const evaluatedValue = dbValue ?? null

  useMount(() => {
    ;(async () => {
      const value = typeof props.value === 'function'
        ? await (props.value as () => T | Promise<T>)()
        : props.value

      // Store evaluated value in database for durability
      db.state.set(valueKey, value, 'switch_value_evaluated')
    })()
  })

  // Extract Case and Default children
  const cases: Array<{ match: T | T[], children: ReactNode }> = []
  let defaultChildren: ReactNode = null

  React.Children.forEach(props.children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Case) {
        cases.push({
          match: child.props.match,
          children: child.props.children,
        })
      } else if (child.type === Default) {
        defaultChildren = child.props.children
      }
    }
  })

  // Find matching case
  let matchedIndex = -1

  if (evaluatedValue !== null) {
    for (let i = 0; i < cases.length; i++) {
      const caseMatch = cases[i].match
      const matches = Array.isArray(caseMatch)
        ? caseMatch.includes(evaluatedValue)
        : caseMatch === evaluatedValue

      if (matches) {
        matchedIndex = i
        break
      }
    }
  }

  // Always render structure, show all cases with active/inactive status
  // Wrap matched case in ScopeProvider for isolated state
  return (
    <switch value={String(evaluatedValue)}>
      {cases.map((c, i) => (
        <case
          key={i}
          match={Array.isArray(c.match) ? c.match.join(',') : String(c.match)}
          active={i === matchedIndex}
        >
          {i === matchedIndex && (
            <ScopeProvider scopeId={`${scopeId}.${switchId}.case${i}`}>
              {c.children}
            </ScopeProvider>
          )}
        </case>
      ))}
      {defaultChildren && (
        <default active={matchedIndex === -1 && evaluatedValue !== null}>
          {matchedIndex === -1 && evaluatedValue !== null && (
            <ScopeProvider scopeId={`${scopeId}.${switchId}.default`}>
              {defaultChildren}
            </ScopeProvider>
          )}
        </default>
      )}
    </switch>
  )
}

export function Case<T = string>(props: CaseProps<T>): ReactNode {
  // This is a marker component that gets processed by Switch
  return null
}

export function Default(props: DefaultProps): ReactNode {
  // This is a marker component that gets processed by Switch
  return null
}
```

</section>

---

<section name="composition-patterns">

## Composition Patterns

### Nested Control Flow

Control flow components compose naturally:

```tsx
<Phase name="Initial Analysis">
  <Claude>Analyze the task</Claude>
</Phase>

<Switch value={() => db.state.get('taskComplexity')}>
  <Case match="simple">
    <Phase name="Quick Fix">
      <Claude model="haiku">Apply simple fix</Claude>
    </Phase>
  </Case>

  <Case match="complex">
    <While
      condition={() => db.state.get('needsMoreWork')}
      maxIterations={5}
    >
      <Phase name="Iterative Implementation">
        <If condition={() => db.state.get('hasBlocker')}>
          <Phase name="Resolve Blocker">
            <Claude>Resolve the blocker first</Claude>
          </Phase>
        </If>
        <Phase name="Implement">
          <Claude>Implement next piece</Claude>
        </Phase>
      </Phase>
    </While>
  </Case>
</Switch>

<Phase name="Finalize">
  <Claude>Final cleanup and commit</Claude>
</Phase>
```

### Control Flow with Phase Auto-Sequencing

Control flow components integrate with Phase's automatic sequencing:

```tsx
<Ralph maxIterations={10}>
  {/* These phases auto-sequence */}
  <Phase name="Setup">...</Phase>

  {/* If wraps phases but doesn't break sequencing */}
  <If condition={() => needsResearch}>
    <Phase name="Research">...</Phase>
  </If>

  {/* This phase runs after Research (or after Setup if Research skipped) */}
  <Phase name="Implementation">...</Phase>
</Ralph>
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 1: Add Scope Context (2 days)

1. Add `scopeId` to `SmithersContextValue`
2. Create `ScopeProvider` component
3. Initialize root scope as `"root"` in `SmithersProvider`
4. Test: Verify scope propagates through context

### Phase 2: Update Phase/Step to Use Scope (2 days)

1. Update `PhaseRegistryProvider` to scope `currentPhaseIndex` key
2. Update `StepRegistryProvider` to scope step index keys
3. Update `Phase` component to include scope in phase metadata (optional)
4. Update `Step` component to include scope in step metadata (optional)
5. Test: Verify phases/steps work with scoped state keys
6. Test: Existing orchestrations still work with root scope

### Phase 3: Implement Control Flow Components (3 days)

1. Create `src/components/If.tsx` with scoping
2. Create `src/components/Else.tsx` (child marker component)
3. Create `src/components/While.tsx` with scoping
4. Create `WhileIterationContext` for iteration tracking
5. Create `src/components/Switch.tsx` with scoping
6. Create `src/components/Case.tsx` and `Default.tsx`
7. Export from `src/components/index.ts`

### Phase 4: Testing (2 days)

1. Test: While loop with phases executes multiple iterations correctly
2. Test: If branches execute with isolated state
3. Test: Switch cases execute with isolated state
4. Test: Nested control flow works (While inside If, etc.)
5. Test: Orchestration resumes correctly mid-iteration after crash
6. Test: Database contains complete history of all iterations
7. Test: State table keys don't collide

### Phase 5: Documentation (1 day)

1. Update SKILL.md with control flow patterns
2. Update REFERENCE.md with API documentation
3. Add examples to EXAMPLES.md
4. Document scoping behavior (for maintainers)

</section>

---

<section name="open-questions">

## Open Questions

### Q1: Should we automatically clean up old scope state?

When a While loop completes, should we delete state keys for old iterations?

**Recommendation:** Keep everything. State table is cheap storage and provides full audit trail.

### Q2: How deep should scope nesting go?

Should we limit nesting depth to prevent absurdly long scope IDs?

**Recommendation:** No hard limit. Real-world nesting unlikely to exceed 5 levels.

### Q3: Should scope be visible in the API?

Should users be able to manually create scopes or query current scope?

**Recommendation:** Keep it internal. Advanced users can access via `useSmithers()` if needed.

### Q4: How does scope interact with Ralph iterations?

Ralph is the outer retry loop. Should Ralph iterations create scopes?

**Recommendation:** Don't scope Ralph iterations. Keep `iteration` field as-is. Scope is only for control flow components. Ralph is a full workflow restart, not a sub-loop.

### Q5: What happens with resumability mid-iteration?

If orchestration crashes during While iteration 3, how does it resume?

**Analysis:** Control flow state (current iteration) is in database. On resume, While reads `while_iteration_root.while_abc` from state table and knows to create scope `root.while_abc.3` again. Phase/Step state is scoped, so picks up where it left off.

**Recommendation:** Current design handles this. Add test to verify.

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

### Scoping System
- [ ] ScopeProvider component propagates scope via context
- [ ] PhaseRegistry uses scoped state keys
- [ ] StepRegistry uses scoped state keys
- [ ] Existing orchestrations work unchanged with root scope
- [ ] State table keys are properly scoped and don't collide

### `<If>` Component
- [ ] Evaluates sync and async conditions
- [ ] Renders children when condition is true
- [ ] Renders else children when condition is false
- [ ] `<Else>` child component works as alternative to `else` prop
- [ ] Plan output shows both branches with active/inactive status
- [ ] Then and else branches have isolated scopes

### `<While>` Component
- [ ] Evaluates condition before each iteration
- [ ] Stops when condition returns false
- [ ] Stops when maxIterations reached
- [ ] `onIteration` callback fires on each iteration
- [ ] `onComplete` callback fires with iteration count and reason
- [ ] Children can signal iteration completion
- [ ] Plan output shows current iteration number
- [ ] Each iteration has isolated scope
- [ ] Phases/steps re-execute correctly across iterations

### `<Switch>` Component
- [ ] Matches single values correctly
- [ ] Matches array of values (any match)
- [ ] Falls through to `<Default>` when no match
- [ ] Only one branch executes
- [ ] Plan output shows all branches with active/inactive status
- [ ] Async value function works
- [ ] Each case has isolated scope

### Integration
- [ ] Control flow components work inside `<Ralph>`
- [ ] Control flow components work inside `<Phase>`
- [ ] Nested control flow works correctly (While in If, If in While, etc.)
- [ ] Phase auto-sequencing works around control flow components
- [ ] Database-backed conditions work for resumability
- [ ] Orchestration resumes correctly mid-iteration after crash
- [ ] Database contains complete history of all iterations

</section>

---

<section name="alternatives-considered">

## Alternatives Considered

### Alternative 1: Props-Only Conditional Rendering

**Rejected because:**
- Duplicates logic across all components
- Can't express else branches cleanly
- Doesn't work for grouping multiple components under one condition

### Alternative 2: Higher-Order Components

**Rejected because:**
- More complex API
- Less discoverable
- Harder to compose

### Alternative 3: Just Use `skipIf`

**Rejected because:**
- Requires duplicate inverse conditions
- No way to express iteration (`<While>`)
- No way to express multi-way branching (`<Switch>`)
- `skipIf` is still useful for simple cases

</section>

---

<section name="future-considerations">

## Future Considerations

### 1. `<ForEach>` Component

Iterate over a collection:

```tsx
<ForEach items={() => db.state.get('filesToProcess')}>
  {(file) => (
    <Phase name={`Process ${file}`}>
      <Claude>Process {file}</Claude>
    </Phase>
  )}
</ForEach>
```

### 2. `<Race>` Component

Execute children in parallel, complete when first finishes:

```tsx
<Race>
  <Claude timeout={30000}>Try approach A</Claude>
  <Claude timeout={30000}>Try approach B</Claude>
</Race>
```

### 3. `<Retry>` Component

Specialized retry with backoff:

```tsx
<Retry maxAttempts={3} backoff="exponential">
  <Claude>Flaky operation</Claude>
</Retry>
```

</section>

---

## Summary

Control flow components (`<If>`, `<While>`, `<Switch>`) provide declarative conditional and iterative execution while maintaining the unconditional rendering pattern. They:

1. **Always render their structure** in plan output for visibility
2. **Support async conditions** for database-backed decisions
3. **Compose naturally** with existing Phase/Step components
4. **Use hierarchical scoping** to enable re-execution across iterations
5. **Integrate with PhaseRegistry** for automatic sequencing

**Key design decision:** Scoping is the critical complexity. Hierarchical scope IDs (`root.while_abc.2.if_def.then`) isolate state across iterations/branches, enabling durable, resumable control flow without breaking Phase/Step state management.

**This feature requires thorough review before implementation.**
