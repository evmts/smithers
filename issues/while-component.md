# While Component

<metadata>
  <priority>high</priority>
  <category>feature</category>
  <estimated-effort>2-3 days</estimated-effort>
  <status>blocked</status>
  <dependencies>
    - src/components/Phase.tsx
    - src/components/PhaseRegistry.tsx
    - src/components/SmithersProvider.tsx
    - src/reconciler/hooks.ts
  </dependencies>
  <blocked-by>
    - issues/control-flow-components.md (scoping infrastructure: ExecutionBoundary, makeScopeId, tasks.scope_id)
  </blocked-by>
  <blocks>
    - issues/github-actions-review-loop.md
  </blocks>
</metadata>

---

## Executive Summary

Implement `<While>` - a loop component that repeats children until a condition is met or max iterations reached. Core primitive for review loops, convergence loops, polling, and iterative refinement workflows.

**Key insight:** Ralph is just a specialized While loop. After implementing `<While>`, refactor Ralph to wrap it.

---

<section name="api">

## API

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

</section>

---

<section name="usage">

## Usage Examples

### Retry Until Success

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

### Review-Fix Loop

```tsx
<While
  id="review-loop"
  condition={async () => {
    const review = await db.state.get('lastReview')
    return review?.decision === 'request_changes'
  }}
  maxIterations={3}
>
  <Phase name="Review">
    <Review target={{ type: 'pr', ref: prNumber }} />
  </Phase>
  <Phase name="Fix">
    <Claude>Address review feedback</Claude>
  </Phase>
</While>
```

### Polling Loop

```tsx
<While
  id="wait-for-ci"
  condition={async () => {
    const status = await fetchCIStatus()
    return status === 'pending'
  }}
  maxIterations={30}
>
  <Step name="Wait">
    <Delay ms={10000} />
  </Step>
</While>
```

</section>

---

<section name="ralph-refactor">

## Ralph Refactor

**After implementing `<While>`, refactor Ralph to be a thin wrapper:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Ralph = While with:                                             │
│   - condition: () => db.tasks.hasPending()                      │
│   - maxIterations: props.maxIterations ?? Infinity              │
│   - id: 'ralph'                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Current Ralph Behavior

Ralph loops until no pending tasks remain. This is equivalent to:

```tsx
<While
  id="ralph"
  condition={() => db.tasks.hasPending()}
  maxIterations={Infinity}
>
  {children}
</While>
```

### Refactored Ralph

```tsx
export function Ralph(props: RalphProps): ReactNode {
  const { db } = useSmithers()
  
  return (
    <While
      id="ralph"
      condition={() => {
        const pending = db.tasks.countPending()
        return pending > 0
      }}
      maxIterations={props.maxIterations ?? Infinity}
      onIteration={props.onIteration}
      onComplete={props.onComplete}
    >
      <PhaseRegistryProvider>
        {props.children}
      </PhaseRegistryProvider>
    </While>
  )
}
```

### Benefits

1. **Single loop primitive** - All loop logic in one place
2. **Testable** - While is easier to test in isolation
3. **Composable** - Ralph becomes just configuration
4. **Less code** - Remove duplicate iteration logic from SmithersProvider

</section>

---

<section name="state-machine">

## State Machine

```
┌──────────────┐
│   PENDING    │
└──────┬───────┘
       │ executionEnabled
       ▼
┌──────────────┐
│  EVALUATE    │◄─────────────────────────┐
│  condition   │                          │
└──────┬───────┘                          │
       │                                  │
       ├─── true ──►┌──────────────┐      │
       │            │   RUNNING    │      │
       │            │   children   │──────┘
       │            └──────────────┘  iteration++
       │                              (on children complete)
       │
       └─── false ──►┌──────────────┐
                     │   COMPLETE   │
                     │   (done)     │
                     └──────────────┘

Also: COMPLETE if iteration >= maxIterations
```

</section>

---

<section name="plan-output">

## Plan Output

```xml
<while id="fix-and-retry" maxIterations="5" iteration="2" status="running">
  <phase name="Fix and Retry" status="active">
    <step name="Analyze Failure" status="complete">...</step>
    <step name="Apply Fix" status="running">...</step>
    <step name="Run Tests" status="pending">...</step>
  </phase>
</while>
```

</section>

---

<section name="scoping-requirements">

## Scoping Requirements

**Depends on infrastructure from control-flow-components.md:**

| Requirement | Description |
|-------------|-------------|
| Stable ID | `id` prop required; no random IDs |
| ExecutionBoundary | Scopes Phase/Step registries per iteration |
| makeScopeId | Canonical scope key builder |
| makeStateKey | Canonical state key builder |
| tasks.scope_id | DB column for subtree completion checks |
| Task gating | While owns task during condition eval |

### Scope ID Format

```
root.while.fix-and-retry.0   // iteration 0
root.while.fix-and-retry.1   // iteration 1
root.while.fix-and-retry.2   // iteration 2
```

### Database State

```sql
-- Persisted for crash-resume
INSERT INTO state (key, value) VALUES 
  ('root.while.fix-and-retry.iteration', '2'),
  ('root.while.fix-and-retry.status', 'running');
```

</section>

---

<section name="implementation">

## Implementation

```tsx
export function While(props: WhileProps): ReactNode {
  const { db, reactiveDb, scopeId, executionEnabled } = useSmithers()
  const whileId = props.id
  const iterationKey = makeStateKey(scopeId, 'while', whileId, 'iteration')
  const statusKey = makeStateKey(scopeId, 'while', whileId, 'status')
  const maxIterations = props.maxIterations ?? 10

  // Read iteration count from SQLite reactively
  const iteration = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as iteration FROM state WHERE key = ?`,
    [iterationKey]
  ) ?? 0

  // Read status from SQLite reactively
  const status = useQueryValue<string>(
    reactiveDb,
    `SELECT value as status FROM state WHERE key = ?`,
    [statusKey]
  ) as 'pending' | 'running' | 'complete' ?? 'pending'

  // Initialize and evaluate condition
  useEffectOnValueChange([executionEnabled, status], () => {
    if (!executionEnabled) return
    if (status !== 'pending') return

    const taskId = db.tasks.start('control_flow', `while:init:${whileId}`, { scopeId })
    ;(async () => {
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
  })

  // Called when children complete (via WhileIterationProvider)
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
  const iterationScopeId = makeScopeId(scopeId, 'while', whileId, iteration)
  const iterationEnabled = executionEnabled && status === 'running'

  return (
    <while
      id={whileId}
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

### WhileIterationProvider

Provides a way for children to signal iteration completion:

```tsx
interface WhileIterationContextValue {
  signalComplete: () => void
}

const WhileIterationContext = createContext<WhileIterationContextValue | null>(null)

export function useWhileIteration() {
  return useContext(WhileIterationContext)
}

function WhileIterationProvider({ onComplete, children }: {
  onComplete: () => void
  children: ReactNode
}) {
  const value = useMemo(() => ({ signalComplete: onComplete }), [onComplete])
  return (
    <WhileIterationContext.Provider value={value}>
      {children}
    </WhileIterationContext.Provider>
  )
}
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Prerequisites (from control-flow-components.md)

- [ ] `ExecutionBoundary` component exists
- [ ] `makeScopeId` / `makeStateKey` helpers exist  
- [ ] `tasks.scope_id` column added
- [ ] PhaseRegistry supports scoped keys
- [ ] Step lifecycle: complete on explicit signal, not unmount

### Phase 1: Core Component

- [ ] Create `src/components/While.tsx`
- [ ] Implement condition evaluation with task gating
- [ ] Implement iteration state persistence (iteration, status keys)
- [ ] Add `onIteration` and `onComplete` callbacks
- [ ] Create `WhileIterationProvider` and `useWhileIteration` hook

### Phase 2: Scoped Execution

- [ ] Integrate with `ExecutionBoundary`
- [ ] Verify Phase/Step re-execute per iteration
- [ ] Test nested While loops

### Phase 3: Ralph Refactor

- [ ] Refactor `Ralph.tsx` to wrap `<While>`
- [ ] Condition: `() => db.tasks.hasPending()`
- [ ] maxIterations: `props.maxIterations ?? Infinity`
- [ ] Verify backwards compatibility with existing Ralph usage
- [ ] Update tests

### Phase 4: Testing

- [ ] Unit tests: condition evaluation, max iterations, status transitions
- [ ] Integration tests: Phase/Step inside While
- [ ] Crash-resume test: restart mid-iteration
- [ ] Nested While loops test
- [ ] Ralph backwards compatibility tests

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

### While Component
- [ ] `id` prop is required (throws if missing)
- [ ] Condition evaluated before each iteration
- [ ] Condition result persisted to DB
- [ ] Loop stops when condition returns false
- [ ] Loop stops when maxIterations reached
- [ ] Each iteration gets isolated scope (Phase/Step can re-execute)
- [ ] `onIteration` fires at start of each iteration
- [ ] `onComplete` fires with iteration count and reason ('condition' | 'max')
- [ ] Plan output shows `<while>` with id, iteration, status, maxIterations
- [ ] Crash mid-iteration resumes correctly (reads persisted state)
- [ ] Nested While loops work correctly
- [ ] Task gating prevents race conditions during condition evaluation

### Ralph Refactor
- [ ] Ralph wraps While internally
- [ ] Ralph condition: `db.tasks.hasPending()`
- [ ] Ralph maxIterations defaults to Infinity (or props.maxIterations)
- [ ] Existing Ralph usage unchanged (backwards compatible)
- [ ] All existing Ralph tests pass

</section>

---

<section name="testing-strategy">

## Testing Strategy

### Unit Tests

```typescript
describe('While', () => {
  test('stops when condition returns false', async () => {
    let count = 0
    await render(
      <While id="test" condition={() => ++count < 3}>
        <MockChild />
      </While>
    )
    expect(count).toBe(3)
  })

  test('stops at maxIterations', async () => {
    await render(
      <While id="test" condition={() => true} maxIterations={5}>
        <MockChild />
      </While>
    )
    // Should have run exactly 5 times
  })

  test('persists iteration to DB', async () => {
    // Render, let run 2 iterations, check DB state
  })

  test('resumes from persisted state', async () => {
    // Pre-seed DB with iteration=2, status=running
    // Render, verify starts at iteration 2
  })
})
```

### Integration Tests

```typescript
describe('While + Phase', () => {
  test('Phase re-executes each iteration', async () => {
    const phaseRuns: number[] = []
    await render(
      <While id="test" condition={(ctx) => ctx.iteration < 3}>
        <Phase name="Test Phase" onStart={() => phaseRuns.push(1)}>
          <MockAgent />
        </Phase>
      </While>
    )
    expect(phaseRuns.length).toBe(3)
  })
})
```

</section>

---

## Relationship to Other Issues

```
┌─────────────────────────────────────────────────────────────────┐
│ control-flow-components.md                                      │
│   └── ExecutionBoundary, makeScopeId, tasks.scope_id            │
│         │                                                       │
│         ▼                                                       │
│ while-component.md (this issue)                                 │
│   └── <While> component                                         │
│         │                                                       │
│         ├──► Ralph refactor (Ralph wraps While)                 │
│         │                                                       │
│         └──► github-actions-review-loop.md                      │
│               └── Uses <While> for review cycle                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Blocked by**: [control-flow-components.md](./control-flow-components.md) - scoping infrastructure
- **Blocks**: [github-actions-review-loop.md](./github-actions-review-loop.md) - uses `<While>` for review cycle
- **Related**: `<If>` and `<Switch>` share same scoping infrastructure
