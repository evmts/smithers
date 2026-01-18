# Control Flow Components: If, While, Switch

<metadata>
  <priority>critical</priority>
  <category>feature</category>
  <estimated-effort>5-7 days</estimated-effort>
  <status>design-review-accounted</status>
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

<section name="design-review-addendum">

## Design Review Addendum (accounted)

This issue has been updated to incorporate the review. **P0 blockers now treated as requirements:**

- **Stable IDs**: control-flow nodes must have stable identity across restarts (v1 requires explicit `id` prop; no randomness).
- **Scoped registries**: scope boundaries must create new Phase/Step registry instances; scoping keys alone is insufficient.
- **Plan vs execution**: branch subtrees always render in plan; execution is gated via `executionEnabled` context (plan-only mode for inactive branches).
- **Task gating**: control-flow nodes must own a task while evaluating/transitioning to prevent global `ralphCount` races.
- **Step/Phase lifecycle**: completion must be explicit (not unmount-based); re-execution must be per-scope (likely keyed remount at boundary).
- **Context propagation**: fallback context must support nested providers or be removed for scoped execution.
- **Canonical state keys**: central `makeStateKey(...)` and scope encoder; no ad-hoc string templates.
- **Schema**: add `tasks.scope_id` (and optionally `agents/tool_calls` later) to enable subtree completion checks.

</section>

---

## Executive Summary

Add minimal control flow components (`<If>`, `<While>`, `<Switch>`) to enable conditional and iterative execution within Smithers orchestrations. These components complement the existing `Phase` and `Step` components while maintaining the declarative, unconditional rendering pattern.

**Critical Design Challenge:** Control flow requires a **scoping mechanism** to allow phases/steps to re-execute across iterations without state collision.

**New requirement from review:** scoping alone is insufficient; **stable IDs**, **scoped registries**, **execution gating**, and **task gating** are required for resumability and correctness.

---

<section name="problem-statement">

## The Scoping Problem

Control flow components need a scoping mechanism to allow phases and steps to be re-executed within iterations. Without scoping, the database state management breaks:

**Example: While Loop**

```tsx
<While id="fix-tests" condition={() => testsNotPassing} maxIterations={5}>
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

1. **Unconditional rendering** - All control flow components render their structure in the plan output; execution is gated separately
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
<If id="needs-more-research" condition={() => needsMoreResearch}>
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

1. **Stable identity**: Control-flow nodes must have stable IDs across restarts (explicit `id` v1).
2. **Scoped execution**: Each branch/iteration has an isolated scope **and** isolated registries.
3. **Execution gating**: Branches always render plan structure; only the active branch executes side effects.
4. **Task gating**: Control-flow evaluation/transition must block global ticks until durable state is written.
5. **Resumability**: Crash mid-iteration resumes in the same scope with persisted decisions.
6. **Visibility**: Plan output always shows full structure with active/inactive status.
7. **Minimal API changes**: Phases/steps still compose; explicit IDs are required for control flow.

### Proposed Solution: Hierarchical Scope IDs

Introduce a **scope identifier** that creates isolated execution contexts for control flow components.

A scope ID is a hierarchical string that uniquely identifies an execution context:
- Root scope: `"root"` (default)
- While loop iteration 2: `"root.while.fix-tests.2"`
- If branch (then): `"root.if.needs-review.then"`
- Nested: `"root.while.fix-tests.2.if.needs-review.else"`

**Stable identity requirement:** All IDs used in scope paths must be stable across process restarts. V1 requires an explicit `id` prop on control-flow components. Random IDs are forbidden.

**Canonical encoder:** Define a single helper to build scoped state keys and scope paths:

```ts
makeScopeId(parentScopeId, type, id, suffix?)
makeStateKey(scopeId, domain, localId, suffix?)
```

No ad-hoc string templates across components.

### Implementation Approach

#### 1. Add Scope + Execution Gate to SmithersProvider Context

```tsx
interface SmithersContextValue {
  db: SmithersDB
  reactiveDb: ReactiveDatabase
  executionId: string
  ralphCount: number
  scopeId: string
  executionEnabled: boolean
  boundaryKey?: string
  // ... rest
}
```

Root scope defaults to `scopeId="root"` and `executionEnabled=true`.

#### 2. Create ExecutionBoundary Component (replaces ScopeProvider)

```tsx
interface ExecutionBoundaryProps {
  scopeId: string
  enabled: boolean
  boundaryKey?: string
  children: ReactNode
}

export function ExecutionBoundary(props: ExecutionBoundaryProps): ReactNode {
  const parent = useSmithers()
  const scopedContext = useMemo(
    () => ({
      ...parent,
      scopeId: props.scopeId,
      executionEnabled: parent.executionEnabled && props.enabled,
      boundaryKey: props.boundaryKey ?? props.scopeId,
    }),
    [parent, props.scopeId, props.enabled, props.boundaryKey]
  )

  return (
    <SmithersContext.Provider value={scopedContext}>
      <PhaseRegistryProvider key={scopedContext.boundaryKey}>
        {props.children}
      </PhaseRegistryProvider>
    </SmithersContext.Provider>
  )
}
```

`PhaseRegistryProvider` (and any Step registry provider) must be instantiated per boundary to avoid cross-scope index collision.

#### 3. Control Flow Components Create Child Boundaries

Control flow components wrap their branches/iterations in ExecutionBoundary to isolate state **and** registries:

- `<While>`: Each iteration gets scope `${scopeId}.while.${whileId}.${iteration}`
- `<If>`: Then branch gets `${scopeId}.if.${ifId}.then`, else gets `${scopeId}.if.${ifId}.else`
- `<Switch>`: Each case gets `${scopeId}.switch.${switchId}.case${index}`

#### 4. Phase and Step Use Scope for Database Keys + Execution Gate

**PhaseRegistry scoping:**
```tsx
export function PhaseRegistryProvider(props: PhaseRegistryProviderProps): ReactNode {
  const { db, reactiveDb, scopeId } = useSmithers()

  // Scope-specific phase index key
  const phaseIndexKey = makeStateKey(scopeId, 'phaseIndex', 'current')

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
  const stateKey = makeStateKey(scopeId, 'stepIndex', props.phaseId ?? 'default')

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
  const { db, ralphCount, scopeId, executionEnabled } = useSmithers()

  useMount(() => {
    if (isActive && executionEnabled && !hasStartedRef.current) {
      // Create new phase row with scope in metadata (optional for queryability)
      const id = db.phases.start(props.name, ralphCount, { scope: scopeId })
      // ...
    }
  })

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
    id="fix-tests"
    condition={() => !testsPass}
    maxIterations={5}
  >
    {/* Iteration 0 scope: root.while.fix-tests.0 */}
    {/* Iteration 1 scope: root.while.fix-tests.1 */}

    <Phase name="Attempt Fix">
      {/* Iteration 0: scope = root.while.fix-tests.0, phase = "Attempt Fix" */}
      {/* Iteration 1: scope = root.while.fix-tests.1, phase = "Attempt Fix" */}

      <If id="fix-path" condition={() => hasQuickFix}>
        {/* Then branch scope: root.while.fix-tests.N.if.fix-path.then */}
        <Phase name="Quick Fix">
          <Claude>Apply quick fix</Claude>
        </Phase>

        <Else>
          {/* Else branch scope: root.while.fix-tests.N.if.fix-path.else */}
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
- `currentPhaseIndex_root.while.fix-tests.0` - Phase sequencing for While iteration 0
- `currentPhaseIndex_root.while.fix-tests.1` - Phase sequencing for While iteration 1
- `currentPhaseIndex_root.while.fix-tests.0.if.fix-path.then` - Phase sequencing for If then branch in iteration 0
- `stepIndex_root.while.fix-tests.0_Attempt Fix` - Steps in "Attempt Fix" phase, iteration 0

### Alternative Approaches Considered

#### Alternative 1: Add `scope` Column to Phases/Steps Tables

**Partially adopted:**
- Phases/steps can remain unscoped initially (metadata only), but **tasks must gain `scope_id`** to support subtree completion checks.
- State table still needs scoped keys; schema alone does not solve sequencing.
- Scope still propagates through context for plan/execution gating.

#### Alternative 2: Use Iteration Number Only

**Rejected because:**
- Doesn't work for `<If>` or `<Switch>` (no iteration concept)
- Requires manual prop threading
- Breaks for nested control flow
- Not composable

#### Alternative 3: React Key-Based Scoping

**Modified (required as a reset mechanism):**
- **Use keyed remount at scope boundaries** to reset ephemeral refs and lifecycle guards.
- **Not a replacement** for DB-backed scope state; durability still comes from SQLite.
- Compatible with resumability when paired with stable IDs + persisted scope state.

#### Alternative 4: Explicit Scope Props (Render Props)

**Rejected because:**
- Render-prop API is clunky
- Deviates from declarative children pattern
- User has to understand scoping concept

</section>

---

<section name="if-component">

## `<If>` Component

Conditionally enables execution based on a runtime condition while always rendering plan structure.

### API

```tsx
interface IfProps {
  /**
   * Stable identifier for resumability. Required.
   */
  id: string

  /**
   * Condition function that returns boolean.
   * Evaluated once per scope when the If becomes active.
   * Can be async for database queries.
   */
  condition: () => boolean | Promise<boolean>

  /**
   * Optional key to force re-evaluation within the same scope.
   * Changing this value invalidates the stored decision.
   */
  recomputeKey?: string

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

<If id="deploy-if-tests-pass" condition={() => testsPassedRef.current}>
  <Phase name="Deploy">
    <Claude>Deploy to production</Claude>
  </Phase>
</If>
```

**With else branch:**

```tsx
<If
  id="merge-if-approved"
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
<If id="tests-branch" condition={() => hasTests}>
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

**Semantics:** Evaluate once per scope when `executionEnabled` is true; persist decision and recomputeKey. Hold a control-flow task until the decision is written. Inactive branches still render but execute in plan-only mode.

### Implementation Sketch

```tsx
export function If(props: IfProps): ReactNode {
  const { db, reactiveDb, scopeId, executionEnabled } = useSmithers()
  const ifId = props.id
  const decisionKey = makeStateKey(scopeId, 'if', ifId, 'decision')
  const recomputeKey = makeStateKey(scopeId, 'if', ifId, 'recomputeKey')

  const { data: dbDecision } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as result FROM state WHERE key = ?`,
    [decisionKey]
  )
  const { data: dbRecompute } = useQueryValue<string>(
    reactiveDb,
    `SELECT value as val FROM state WHERE key = ?`,
    [recomputeKey]
  )

  const recomputeTag = props.recomputeKey ?? ''
  const evaluated = dbDecision !== null && dbDecision !== undefined && dbRecompute === recomputeTag
  const result = evaluated ? dbDecision === 1 : null

  useEffect(() => {
    if (!executionEnabled) return
    if (evaluated) return

    const taskId = db.tasks.start('control_flow', `if:${ifId}`, { scopeId })
    ;(async () => {
      const conditionResult = await props.condition()
      db.state.set(decisionKey, conditionResult ? 1 : 0, 'if_condition_evaluated')
      db.state.set(recomputeKey, recomputeTag, 'if_recompute_key')
      db.tasks.complete(taskId)
    })()
  }, [executionEnabled, evaluated, recomputeTag, decisionKey, recomputeKey, ifId, scopeId])

  const thenEnabled = executionEnabled && result === true
  const elseEnabled = executionEnabled && result === false

  // Always render structure; execution is gated by ExecutionBoundary
  return (
    <if status={evaluated ? 'evaluated' : 'evaluating'} result={result}>
      <branch type="then" active={result === true}>
        <ExecutionBoundary
          scopeId={`${scopeId}.if.${ifId}.then`}
          enabled={thenEnabled}
          boundaryKey={`${scopeId}.if.${ifId}.then`}
        >
          {props.children}
        </ExecutionBoundary>
      </branch>
      {(props.else || hasElseChild(props.children)) && (
        <branch type="else" active={result === false}>
          <ExecutionBoundary
            scopeId={`${scopeId}.if.${ifId}.else`}
            enabled={elseEnabled}
            boundaryKey={`${scopeId}.if.${ifId}.else`}
          >
            {props.else ?? extractElseChildren(props.children)}
          </ExecutionBoundary>
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

Repeats children while a condition is true, persisting iteration state and gating execution per scope.

### API

```tsx
interface WhileProps {
  /**
   * Stable identifier for resumability. Required.
   */
  id: string

  /**
   * Condition function. Loop continues while this returns true.
   * Evaluated at the start of each iteration and persisted.
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
  id="fix-and-retry"
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

**Semantics:** Evaluate condition at the start of each iteration, persist iteration + status, and gate iteration transitions with a control-flow task. Children run under an ExecutionBoundary keyed by `scopeId.while.{id}.{iteration}`.

### Implementation Sketch

```tsx
export function While(props: WhileProps): ReactNode {
  const { db, reactiveDb, scopeId, executionEnabled } = useSmithers()
  const whileId = props.id
  const iterationKey = makeStateKey(scopeId, 'while', whileId, 'iteration')
  const statusKey = makeStateKey(scopeId, 'while', whileId, 'status')
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

  useEffect(() => {
    if (!executionEnabled) return
    if (status !== 'pending') return

    const taskId = db.tasks.start('control_flow', `while:init:${whileId}`, { scopeId })
    ;(async () => {
      if (dbIteration === null || dbIteration === undefined) {
        db.state.set(iterationKey, 0, 'while_init')
      }

      const conditionResult = await props.condition()
      if (conditionResult && iteration < maxIterations) {
        db.state.set(statusKey, 'running', 'while_start')
        props.onIteration?.(iteration)
      } else {
        const reason = conditionResult ? 'max' : 'condition'
        db.state.set(statusKey, 'complete', `while_${reason}`)
        props.onComplete?.(iteration, reason)
      }
      db.tasks.complete(taskId)
    })()
  }, [executionEnabled, status, dbIteration, iteration, maxIterations, iterationKey, statusKey, whileId, scopeId])

  // Called when children complete
  const handleIterationComplete = async () => {
    if (!executionEnabled) return
    const taskId = db.tasks.start('control_flow', `while:iter:${whileId}:${iteration}`, { scopeId })
    const nextIteration = iteration + 1

    if (nextIteration >= maxIterations) {
      db.state.set(statusKey, 'complete', 'while_max_reached')
      props.onComplete?.(nextIteration, 'max')
      db.tasks.complete(taskId)
      return
    }

    const conditionResult = await props.condition()
    if (!conditionResult) {
      db.state.set(statusKey, 'complete', 'while_condition_false')
      props.onComplete?.(nextIteration, 'condition')
      db.tasks.complete(taskId)
      return
    }

    db.state.set(iterationKey, nextIteration, 'while_advance')
    props.onIteration?.(nextIteration)
    db.tasks.complete(taskId)
  }

  // Each iteration gets its own scope for isolated phase/step state
  const iterationScopeId = `${scopeId}.while.${whileId}.${iteration}`
  const iterationEnabled = executionEnabled && status === 'running'

  return (
    <while
      maxIterations={maxIterations}
      iteration={iteration}
      status={status}
    >
      <ExecutionBoundary
        scopeId={iterationScopeId}
        enabled={iterationEnabled}
        boundaryKey={iterationScopeId}
      >
        <WhileIterationProvider onComplete={handleIterationComplete}>
          {props.children}
        </WhileIterationProvider>
      </ExecutionBoundary>
    </while>
  )
}
```

</section>

---

<section name="switch-component">

## `<Switch>` Component

Multi-way branching based on a value with persisted decision and gated execution.

### API

```tsx
interface SwitchProps<T = string> {
  /**
   * Stable identifier for resumability. Required.
   */
  id: string

  /**
   * Value to match against cases.
   * Can be a function for dynamic evaluation.
   */
  value: T | (() => T | Promise<T>)

  /**
   * Optional serializer for non-primitive values.
   */
  serialize?: (value: T) => string

  /**
   * Optional deserializer for persisted values.
   */
  deserialize?: (raw: string) => T

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
<Switch id="workflow-mode" value={async () => await db.state.get('workflowMode')}>
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

**Semantics:** Evaluate once per scope, persist the value, and gate execution until the value is known. Use serializer/deserializer for non-primitive values.

### Implementation Sketch

```tsx
export function Switch<T = string>(props: SwitchProps<T>): ReactNode {
  const { db, reactiveDb, scopeId, executionEnabled } = useSmithers()
  const switchId = props.id
  const valueKey = makeStateKey(scopeId, 'switch', switchId, 'value')
  const serialize = props.serialize ?? ((value: T) => String(value))
  const deserialize = props.deserialize ?? ((raw: string) => raw as unknown as T)

  const { data: dbValue } = useQueryValue<string>(
    reactiveDb,
    `SELECT value as val FROM state WHERE key = ?`,
    [valueKey]
  )

  const evaluated = dbValue !== null && dbValue !== undefined
  const evaluatedValue = evaluated ? deserialize(dbValue) : null

  useEffect(() => {
    if (!executionEnabled) return
    if (evaluated) return

    const taskId = db.tasks.start('control_flow', `switch:${switchId}`, { scopeId })
    ;(async () => {
      const value = typeof props.value === 'function'
        ? await (props.value as () => T | Promise<T>)()
        : props.value

      db.state.set(valueKey, serialize(value), 'switch_value_evaluated')
      db.tasks.complete(taskId)
    })()
  }, [executionEnabled, evaluated, valueKey, switchId, scopeId])

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

  const canExecute = executionEnabled && evaluated

  // Always render structure; execution is gated by ExecutionBoundary
  return (
    <switch value={String(evaluatedValue)} status={evaluated ? 'evaluated' : 'evaluating'}>
      {cases.map((c, i) => (
        <case
          key={i}
          match={Array.isArray(c.match) ? c.match.join(',') : String(c.match)}
          active={i === matchedIndex}
        >
          <ExecutionBoundary
            scopeId={`${scopeId}.switch.${switchId}.case${i}`}
            enabled={canExecute && i === matchedIndex}
            boundaryKey={`${scopeId}.switch.${switchId}.case${i}`}
          >
            {c.children}
          </ExecutionBoundary>
        </case>
      ))}
      {defaultChildren && (
        <default active={matchedIndex === -1 && evaluated}>
          <ExecutionBoundary
            scopeId={`${scopeId}.switch.${switchId}.default`}
            enabled={canExecute && matchedIndex === -1}
            boundaryKey={`${scopeId}.switch.${switchId}.default`}
          >
            {defaultChildren}
          </ExecutionBoundary>
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

<Switch id="task-complexity" value={() => db.state.get('taskComplexity')}>
  <Case match="simple">
    <Phase name="Quick Fix">
      <Claude model="haiku">Apply simple fix</Claude>
    </Phase>
  </Case>

  <Case match="complex">
    <While
      id="iterative-implementation"
      condition={() => db.state.get('needsMoreWork')}
      maxIterations={5}
    >
      <Phase name="Iterative Implementation">
        <If id="blocker-check" condition={() => db.state.get('hasBlocker')}>
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
  <If id="needs-research" condition={() => needsResearch}>
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

### Phase 0: Runtime prerequisites (required before control flow)

1. Fix Step lifecycle: complete tasks on explicit completion, not unmount.
2. Fix PhaseRegistry: no setState during render, no reset on mount, correct index advancement.
3. Add `executionEnabled` gating to Phase/Step so plan-only rendering has no side effects.
4. Establish control-flow task gating pattern in SmithersProvider loop.

### Phase 1: Stable scope + boundary mechanics

1. Add `scopeId`, `executionEnabled`, `boundaryKey` to `SmithersContextValue`.
2. Implement `ExecutionBoundary` (scoped context + registry boundary + remount key).
3. Fix context fallback to support nested providers or remove it.

### Phase 2: Scoped registries + state key helper + schema

1. Add `makeScopeId` / `makeStateKey` helpers.
2. Update PhaseRegistry/StepRegistry to use scoped keys and be instantiated per boundary.
3. Add `tasks.scope_id` column and update queries/migrations.

### Phase 3: Implement control flow components

1. `If`/`While`/`Switch` require explicit `id`.
2. Persist decisions/iterations in SQLite (scoped by scopeId).
3. Task gating for evaluation/transition boundaries.
4. Plan always renders; execution gated via `executionEnabled`.

### Phase 4: Testing

1. Crash/resume with stable IDs (process restart simulation).
2. Nested control flow with distinct registry indices per scope.
3. Async condition evaluation does not cause premature global tick.
4. Inactive branches still appear in plan output.

### Phase 5: Documentation

1. Update SKILL.md with control flow patterns.
2. Update REFERENCE.md with API documentation.
3. Add examples to EXAMPLES.md.
4. Document scoping and gating behavior (maintainers).

</section>

---

<section name="open-questions">

## Open Questions

### Q1: Stable ID strategy beyond v1?

**V1:** Explicit `id` prop is required.  
**V2:** Consider compiler-generated IDs or reconciler-derived path hashes to remove manual burden.

### Q2: ExecutionBoundary remount policy

Use `boundaryKey=scopeId` for remount on scope change. Confirm this does not break plan diffing or host node identity in the reconciler.

### Q3: Context fallback behavior

Nested scopes require reliable context propagation. Either remove the global fallback or make it scope-stack aware.

### Q4: Scope columns beyond tasks

`tasks.scope_id` is required. Decide whether `agents` and `tool_calls` also gain `scope_id` for traceability.

### Q5: Scope data retention

Keep scope state by default for auditability; add cleanup tooling only if DB growth becomes a proven issue.

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

### Scoping System
- [ ] ExecutionBoundary propagates scope and executionEnabled via context
- [ ] ExecutionBoundary creates a registry boundary per scope (Phase/Step)
- [ ] PhaseRegistry uses scoped state keys via makeStateKey
- [ ] StepRegistry uses scoped state keys via makeStateKey
- [ ] tasks table includes scope_id for subtree completion checks
- [ ] Existing orchestrations work unchanged with root scope
- [ ] State table keys are properly scoped and don't collide

### `<If>` Component
- [ ] Requires stable id prop
- [ ] Evaluates sync and async conditions once per scope (unless recomputeKey changes)
- [ ] Task gating prevents premature global tick
- [ ] Enables execution for then branch when condition is true
- [ ] Enables execution for else branch when condition is false
- [ ] `<Else>` child component works as alternative to `else` prop
- [ ] Plan output shows both branches with active/inactive status
- [ ] Then and else branches have isolated scopes

### `<While>` Component
- [ ] Requires stable id prop
- [ ] Evaluates condition before each iteration and persists result
- [ ] Task gating wraps iteration transitions
- [ ] Stops when condition returns false
- [ ] Stops when maxIterations reached
- [ ] `onIteration` callback fires on each iteration
- [ ] `onComplete` callback fires with iteration count and reason
- [ ] Children can signal iteration completion
- [ ] Plan output shows current iteration number
- [ ] Each iteration has isolated scope
- [ ] Phases/steps re-execute correctly across iterations

### `<Switch>` Component
- [ ] Requires stable id prop
- [ ] Matches single values correctly
- [ ] Matches array of values (any match)
- [ ] Falls through to `<Default>` when no match
- [ ] Only one branch executes
- [ ] Plan output shows all branches with active/inactive status
- [ ] Async value function works and persists value
- [ ] Serializer/deserializer handles non-primitive values
- [ ] Each case has isolated scope

### Integration
- [ ] Control flow components work inside `<Ralph>`
- [ ] Control flow components work inside `<Phase>`
- [ ] Nested control flow works correctly (While in If, If in While, etc.)
- [ ] Phase auto-sequencing works around control flow components
- [ ] Database-backed conditions work for resumability
- [ ] Orchestration resumes correctly mid-iteration after crash
- [ ] Database contains complete history of all iterations
- [ ] Context fallback supports nested scopes or is removed

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
2. **Gate execution** via `executionEnabled` while plan structure remains visible
3. **Require stable IDs** for resumability across restarts
4. **Use hierarchical scoping + scoped registries** to enable re-execution across iterations
5. **Use task gating** to prevent global tick races during evaluation/transition
6. **Compose naturally** with existing Phase/Step components

**Key design decision:** Scoping is necessary but not sufficient. Correctness depends on stable IDs, registry boundaries, execution gating, and task gating in addition to hierarchical scope IDs.

**This feature requires thorough review before implementation.**
