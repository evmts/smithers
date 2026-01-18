# Control Flow Components: If, While, Switch

<metadata>
  <priority>medium</priority>
  <category>feature</category>
  <estimated-effort>2-3 days</estimated-effort>
  <dependencies>
    - src/components/Phase.tsx
    - src/components/PhaseRegistry.tsx
    - src/components/SmithersProvider.tsx
    - src/reconciler/hooks.js
  </dependencies>
</metadata>

---

## Executive Summary

Add minimal control flow components (`<If>`, `<While>`, `<Switch>`) to enable conditional and iterative execution within Smithers orchestrations. These components complement the existing `Phase` and `Step` components while maintaining the declarative, unconditional rendering pattern.

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

  /**
   * Callback when condition evaluates to true
   */
  onTrue?: () => void

  /**
   * Callback when condition evaluates to false
   */
  onFalse?: () => void
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

The `<If>` component always renders its structure, showing both branches with their status:

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
  const [evaluated, setEvaluated] = useState(false)
  const [result, setResult] = useState<boolean | null>(null)
  const { db } = useSmithers()

  useMount(() => {
    ;(async () => {
      const conditionResult = await props.condition()
      setResult(conditionResult)
      setEvaluated(true)

      if (conditionResult) {
        props.onTrue?.()
      } else {
        props.onFalse?.()
      }
    })()
  })

  // Always render structure, but only active branch's children execute
  return (
    <if status={evaluated ? 'evaluated' : 'evaluating'} result={result}>
      <branch type="then" active={result === true}>
        {result === true && props.children}
      </branch>
      {(props.else || hasElseChild(props.children)) && (
        <branch type="else" active={result === false}>
          {result === false && (props.else ?? extractElseChildren(props.children))}
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

**Iterative refinement:**

```tsx
<While
  condition={async () => {
    const quality = await db.state.get<number>('qualityScore')
    return (quality ?? 0) < 0.9
  }}
  maxIterations={3}
>
  <Phase name="Improve Quality">
    <Claude
      validate={async (result) => {
        const score = evaluateQuality(result)
        await db.state.set('qualityScore', score)
        return score >= 0.9
      }}
    >
      Improve the implementation quality
    </Claude>
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
  const [iteration, setIteration] = useState(0)
  const [status, setStatus] = useState<'pending' | 'running' | 'complete'>('pending')
  const [shouldContinue, setShouldContinue] = useState(true)
  const maxIterations = props.maxIterations ?? 10

  useMount(() => {
    ;(async () => {
      const conditionResult = await props.condition()
      setShouldContinue(conditionResult)
      if (conditionResult) {
        setStatus('running')
        props.onIteration?.(0)
      } else {
        setStatus('complete')
        props.onComplete?.(0, 'condition')
      }
    })()
  })

  // Called when children complete
  const handleIterationComplete = async () => {
    const nextIteration = iteration + 1

    if (nextIteration >= maxIterations) {
      setStatus('complete')
      props.onComplete?.(nextIteration, 'max')
      return
    }

    const conditionResult = await props.condition()
    if (!conditionResult) {
      setStatus('complete')
      props.onComplete?.(nextIteration, 'condition')
      return
    }

    setIteration(nextIteration)
    props.onIteration?.(nextIteration)
  }

  return (
    <while
      maxIterations={maxIterations}
      iteration={iteration}
      status={status}
    >
      {status === 'running' && shouldContinue && (
        <WhileIterationProvider onComplete={handleIterationComplete}>
          {props.children}
        </WhileIterationProvider>
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
    <Phase name="Review">
      <Claude model="opus">Thorough review</Claude>
    </Phase>
  </Case>

  <Case match={['test', 'validate']}>
    <Phase name="Testing Only">
      <Claude>Run comprehensive tests</Claude>
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
    <phase name="Review" status="pending">...</phase>
  </case>
  <case match="test,validate" active="false">
    <phase name="Testing Only" status="skipped">...</phase>
  </case>
  <default active="false">
    <phase name="Standard Flow" status="skipped">...</phase>
  </default>
</switch>
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

### Data-Driven Conditions

Conditions can query database state for resumable workflows:

```tsx
<While
  condition={async () => {
    const attempts = await db.state.get<number>('deployAttempts') ?? 0
    const lastResult = await db.state.get<string>('lastDeployResult')
    return attempts < 3 && lastResult !== 'success'
  }}
>
  <Phase
    name="Deploy Attempt"
    onComplete={async () => {
      const current = await db.state.get<number>('deployAttempts') ?? 0
      await db.state.set('deployAttempts', current + 1)
    }}
  >
    <Claude
      onFinished={async (result) => {
        await db.state.set('lastDeployResult', result.success ? 'success' : 'failed')
      }}
    >
      Deploy to production
    </Claude>
  </Phase>
</While>
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 1: `<If>` Component

1. Create `src/components/If.tsx`
2. Create `src/components/Else.tsx` (child marker component)
3. Add tests for condition evaluation, else branches, async conditions
4. Export from `src/components/index.ts`

### Phase 2: `<While>` Component

1. Create `src/components/While.tsx`
2. Create `WhileIterationContext` for iteration tracking
3. Add integration with Phase completion detection
4. Add tests for iteration limits, condition evaluation, early exit
5. Export from `src/components/index.ts`

### Phase 3: `<Switch>` Component

1. Create `src/components/Switch.tsx`
2. Create `src/components/Case.tsx`
3. Create `src/components/Default.tsx`
4. Add tests for value matching, array matching, default fallback
5. Export from `src/components/index.ts`

### Phase 4: Documentation

1. Update SKILL.md with control flow patterns
2. Update REFERENCE.md with API documentation
3. Add examples to EXAMPLES.md
4. Update template to show control flow usage (optional section)

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

### `<If>` Component
- [ ] Evaluates sync and async conditions
- [ ] Renders children when condition is true
- [ ] Renders else children when condition is false
- [ ] `<Else>` child component works as alternative to `else` prop
- [ ] Plan output shows both branches with active/inactive status
- [ ] Callbacks `onTrue` and `onFalse` fire correctly

### `<While>` Component
- [ ] Evaluates condition before each iteration
- [ ] Stops when condition returns false
- [ ] Stops when maxIterations reached
- [ ] `onIteration` callback fires on each iteration
- [ ] `onComplete` callback fires with iteration count and reason
- [ ] Children can signal iteration completion
- [ ] Plan output shows current iteration number

### `<Switch>` Component
- [ ] Matches single values correctly
- [ ] Matches array of values (any match)
- [ ] Falls through to `<Default>` when no match
- [ ] Only one branch executes
- [ ] Plan output shows all branches with active/inactive status
- [ ] Async value function works

### Integration
- [ ] Control flow components work inside `<Ralph>`
- [ ] Control flow components work inside `<Phase>`
- [ ] Nested control flow works correctly
- [ ] Phase auto-sequencing works around control flow components
- [ ] Database-backed conditions work for resumability

</section>

---

<section name="alternatives-considered">

## Alternatives Considered

### Alternative 1: Props-Only Conditional Rendering

Instead of `<If>` component, extend all components with `renderIf` prop:

```tsx
<Phase name="Optional" renderIf={() => condition}>...</Phase>
```

**Rejected because:**
- Duplicates logic across all components
- Can't express else branches cleanly
- Doesn't work for grouping multiple components under one condition

### Alternative 2: Higher-Order Components

```tsx
const ConditionalPhase = withCondition(Phase)
<ConditionalPhase condition={() => ...} name="Research">...</ConditionalPhase>
```

**Rejected because:**
- More complex API
- Less discoverable
- Harder to compose

### Alternative 3: Just Use `skipIf`

Extend `skipIf` to handle all conditional cases:

```tsx
<Phase name="Deploy" skipIf={() => !testsPass}>...</Phase>
<Phase name="Notify Failure" skipIf={() => testsPass}>...</Phase>
```

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

### 4. Condition Caching

Cache condition results to avoid re-evaluation:

```tsx
<If condition={() => expensiveCheck()} cacheKey="expensiveResult">
  ...
</If>
```

</section>

---

## Summary

Control flow components (`<If>`, `<While>`, `<Switch>`) provide declarative conditional and iterative execution while maintaining the unconditional rendering pattern. They:

1. **Always render their structure** in plan output for visibility
2. **Support async conditions** for database-backed decisions
3. **Compose naturally** with existing Phase/Step components
4. **Integrate with PhaseRegistry** for automatic sequencing

Key design decision: These components are **minimal and focused**. They solve the specific problem of control flow without trying to replicate React's full rendering model. Complex conditional logic should still be expressed in the orchestration design, not hidden in runtime branches.
