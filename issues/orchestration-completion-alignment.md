# Align Orchestration Completion with Provider (onComplete + ci_failure)

<metadata>
  <priority>P1</priority>
  <category>bugfix</category>
  <status>design-review-accounted</status>
  <dependencies>
    - src/components/Orchestration.tsx
    - src/components/SmithersProvider.tsx
    - templates/main.tsx.template
    - src/components/agents/SmithersCLI.ts
    - docs/examples/*.mdx
    - docs/components/smithers-provider.mdx
  </dependencies>
  <docs>["docs/components/orchestration.mdx", "docs/architecture/lifecycle.mdx"]</docs>
</metadata>

## Executive Summary

**What**: Fix orchestration completion lifecycle - onComplete/cleanup callbacks never fire because tree remains mounted after SmithersProvider signals completion.

**Why**: Critical for resource cleanup, CI integration, and deterministic orchestration termination. Also missing `ci_failure` stop condition implementation.

**Impact**: Enables proper cleanup (DB close, file handles), reliable CI/CD integration, and complete stop condition coverage.

## Problem Statement

SmithersProvider signals orchestration complete via promise resolution, but the React tree remains mounted. Orchestration.onComplete and cleanupOnComplete are tied to useUnmount, which never runs:

### Current Flow (BROKEN)

```
SmithersProvider.tsx:336-409
  → Ralph loop detects all tasks complete
  → signalOrchestrationComplete() called (line 360)
  → Root promise resolves
  → Tree REMAINS MOUNTED (reconciler doesn't unmount)
  → Orchestration.useUnmount never runs (line 205-236)
  → onComplete callback never fires
  → cleanupOnComplete never runs
  → Database stays open, resources leak
```

### Concrete Examples

**Current Behavior:**

```tsx
// src/components/Orchestration.tsx:77-96
export function Orchestration(props: OrchestrationProps): ReactNode {
  useUnmount(() => {
    ;(async () => {
      // ... generate result
      props.onComplete?.(result)  // ❌ Never called!

      if (props.cleanupOnComplete) {
        await db.close()  // ❌ Never runs!
      }
    })()
  })

  return <orchestration>{props.children}</orchestration>
}

// Usage in main.tsx
const root = createSmithersRoot()
await root.mount(() => (  // ← await resolves when signalOrchestrationComplete fires
  <SmithersProvider ...>
    <Orchestration onComplete={handleDone} cleanupOnComplete>
      ...
    </Orchestration>
  </SmithersProvider>
))
// Tree still mounted here! onComplete never ran.
// Must manually call root.dispose() to trigger useUnmount
```

**Missing ci_failure:**

```tsx
// src/components/Orchestration.tsx:154-185
switch (condition.type) {
  case 'total_tokens': ...
  case 'total_agents': ...
  case 'total_time': ...
  case 'report_severity': ...
  // case 'ci_failure': ❌ MISSING!
  case 'custom': ...
}
```

**Expected Behavior:**

```tsx
// onComplete fires automatically when orchestration finishes
await root.mount(...)  // Resolves
// onComplete already ran, DB already closed
// Tree unmounted automatically
```

## Proposed Solution

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   SmithersProvider                         │
│  Ralph loop → all tasks done → signal completion          │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│              Orchestration (Option A)                      │
│  useEffect on stopRequested/completed state                │
│    → Run onComplete callback                               │
│    → Run cleanup                                           │
│    → Request root disposal                                 │
└────────────────────────────────────────────────────────────┘

              OR

┌────────────────────────────────────────────────────────────┐
│              SmithersProvider (Option B)                   │
│  Before signalOrchestrationComplete():                     │
│    → Call registered completion callbacks                  │
│    → Wait for cleanup                                      │
│    → Then signal completion                                │
└────────────────────────────────────────────────────────────┘

              OR

┌────────────────────────────────────────────────────────────┐
│              Root/Template (Option C)                      │
│  After await root.mount() resolves:                        │
│    → Explicitly call root.dispose()                        │
│    → useUnmount triggers                                   │
│    → Cleanup runs                                          │
└────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Decision**: Option C - Explicit disposal in templates/CLI
   - **Rationale**: Minimal code changes, clear ownership, matches React reconciler semantics
   - **Alternatives Considered**:
     - Option A (reactive callbacks): Complex state synchronization, race conditions
     - Option B (provider-owned): Breaks separation of concerns, provider becomes orchestration-aware

2. **Decision**: Add ci_failure stop condition
   - **Rationale**: Already defined in type, just missing switch case
   - **Implementation**: Query state table for `ci_failure` key

3. **Decision**: Document disposal pattern in all examples
   - **Rationale**: Prevent future confusion, establish convention
   - **Alternatives Considered**: Auto-dispose (breaks reusability), keep mounted (leaks resources)

## Implementation Plan

### Phase 1: Add ci_failure Stop Condition

**Goal**: Complete the stop condition implementation

**Files to Modify:**
- `src/components/Orchestration.tsx` (lines 154-185)

**Code Changes:**

```tsx
// BEFORE (Orchestration.tsx:154-185)
switch (condition.type) {
  case 'total_tokens':
    shouldStop = context.totalTokens >= (condition.value as number)
    message = message || `Token limit ${condition.value} exceeded`
    break

  case 'total_agents':
    shouldStop = context.totalAgents >= (condition.value as number)
    message = message || `Agent limit ${condition.value} exceeded`
    break

  case 'total_time':
    shouldStop = context.elapsedTimeMs >= (condition.value as number)
    message = message || `Time limit ${condition.value}ms exceeded`
    break

  case 'report_severity':
    const criticalReports = await db.vcs.getCriticalReports()
    shouldStop = criticalReports.length > 0
    message = message || `Critical report(s) found: ${criticalReports.length}`
    break

  case 'custom':
    if (condition.fn) {
      shouldStop = await condition.fn(context)
    }
    break
}

// AFTER (add ci_failure case)
switch (condition.type) {
  case 'total_tokens':
    shouldStop = context.totalTokens >= (condition.value as number)
    message = message || `Token limit ${condition.value} exceeded`
    break

  case 'total_agents':
    shouldStop = context.totalAgents >= (condition.value as number)
    message = message || `Agent limit ${condition.value} exceeded`
    break

  case 'total_time':
    shouldStop = context.elapsedTimeMs >= (condition.value as number)
    message = message || `Time limit ${condition.value}ms exceeded`
    break

  case 'report_severity':
    const criticalReports = await db.vcs.getCriticalReports()
    shouldStop = criticalReports.length > 0
    message = message || `Critical report(s) found: ${criticalReports.length}`
    break

  case 'ci_failure':
    // Check state table for CI failure signal
    const ciFailure = db.state.get<{ reason: string }>('ci_failure')
    shouldStop = ciFailure !== null
    message = message || `CI failure: ${ciFailure?.reason ?? 'unknown'}`
    break

  case 'custom':
    if (condition.fn) {
      shouldStop = await condition.fn(context)
    }
    break
}
```

**Tests:**

```tsx
// src/components/Orchestration.test.tsx
describe('Orchestration stop conditions', () => {
  it('stops on ci_failure signal', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    let stopRequested = false

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId}>
        <Orchestration
          stopConditions={[{ type: 'ci_failure' }]}
          onStopRequested={(reason) => { stopRequested = true }}
        >
          <Claude>Long running work...</Claude>
        </Orchestration>
      </SmithersProvider>
    )

    // Simulate CI failure
    db.state.set('ci_failure', { reason: 'Tests failed' })

    // Wait for stop condition check (runs every 1s)
    await new Promise(resolve => setTimeout(resolve, 1500))

    expect(stopRequested).toBe(true)

    root.dispose()
  })
})
```

### Phase 2: Document Explicit Disposal Pattern

**Goal**: Ensure all templates and examples properly dispose roots

**Files to Modify:**
- `templates/main.tsx.template`
- `docs/examples/*.mdx`
- `src/components/agents/SmithersCLI.ts`

**Code Changes:**

```tsx
// BEFORE (templates/main.tsx.template)
export async function main() {
  const db = await createSmithersDB({ path: '.smithers/data' })
  const executionId = await db.execution.start('MyOrchestration', './main.tsx')

  const root = createSmithersRoot()
  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId}>
      <Orchestration onComplete={handleComplete}>
        ...
      </Orchestration>
    </SmithersProvider>
  ))
}

// AFTER (add explicit disposal)
export async function main() {
  const db = await createSmithersDB({ path: '.smithers/data' })
  const executionId = await db.execution.start('MyOrchestration', './main.tsx')

  const root = createSmithersRoot()

  try {
    await root.mount(() => (
      <SmithersProvider db={db} executionId={executionId}>
        <Orchestration onComplete={handleComplete} cleanupOnComplete>
          ...
        </Orchestration>
      </SmithersProvider>
    ))

    // Orchestration complete - dispose to trigger useUnmount hooks
    root.dispose()
  } catch (error) {
    console.error('Orchestration failed:', error)
    root.dispose()
    await db.close()
    throw error
  }
}
```

**SmithersCLI pattern:**

```tsx
// src/components/agents/SmithersCLI.ts:150-200
async run() {
  const root = createSmithersRoot()

  try {
    await root.mount(() => this.renderOrchestration())
    root.dispose()  // ✅ Add this
  } catch (error) {
    root.dispose()  // ✅ Add this
    throw error
  }
}
```

### Phase 3: Alternative - Auto-dispose on Completion

**Goal**: Optionally auto-dispose when SmithersProvider completes

**Files to Create:**
- `src/reconciler/auto-dispose.ts`

**Code:**

```tsx
// src/reconciler/auto-dispose.ts
import { useEffect } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'

/**
 * Hook to automatically dispose the root when orchestration completes.
 *
 * EXPERIMENTAL: This breaks if you want to inspect the final tree state.
 * Prefer explicit root.dispose() in your main function.
 */
export function useAutoDisposeOnComplete(root: SmithersRoot) {
  const { db, executionId } = useSmithers()

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const execution = db.db.query(
        'SELECT status FROM executions WHERE id = ?',
        [executionId]
      ).get()

      if (execution?.status === 'completed') {
        clearInterval(checkInterval)
        // Small delay to allow final renders
        setTimeout(() => root.dispose(), 100)
      }
    }, 100)

    return () => clearInterval(checkInterval)
  }, [root, db, executionId])
}

// Usage (opt-in)
<SmithersProvider ...>
  <AutoDispose root={root} />  {/* New component */}
  <Orchestration>...</Orchestration>
</SmithersProvider>
```

**Decision**: Keep as optional utility, don't make default. Explicit disposal is clearer.

## Acceptance Criteria

- [ ] **AC1**: onComplete fires when orchestration finishes
  - Test: Callback invoked with correct result
- [ ] **AC2**: cleanupOnComplete closes database
  - Test: DB handle released, no open connections
- [ ] **AC3**: ci_failure stop condition works
  - Test: Setting state.ci_failure stops orchestration
- [ ] **AC4**: All templates include root.dispose()
  - Test: Grep templates for dispose pattern
- [ ] **AC5**: Documentation explains lifecycle
  - Test: Docs have lifecycle diagram + code examples

## Testing Strategy

### Unit Tests

```tsx
describe('Orchestration completion', () => {
  it('calls onComplete when disposed', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    let completed = false
    let result: OrchestrationResult | null = null

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Orchestration onComplete={(r) => { completed = true; result = r }}>
          <div>Work</div>
        </Orchestration>
      </SmithersProvider>
    )

    expect(completed).toBe(false)

    root.dispose()  // Trigger useUnmount

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(completed).toBe(true)
    expect(result?.status).toBe('completed')
  })

  it('closes DB when cleanupOnComplete=true', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Orchestration cleanupOnComplete>
          <div>Work</div>
        </Orchestration>
      </SmithersProvider>
    )

    root.dispose()
    await new Promise(resolve => setTimeout(resolve, 100))

    // DB should be closed
    expect(() => db.db.query('SELECT 1')).toThrow()
  })
})
```

### Integration Tests

```tsx
describe('Full lifecycle', () => {
  it('completes workflow and cleans up', async () => {
    const dbPath = `/tmp/test-${Date.now()}.db`
    const db = await createSmithersDB({ path: dbPath })
    const execId = await db.execution.start('test', 'test.tsx')

    let finalStatus: string = ''

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Orchestration
          onComplete={(r) => { finalStatus = r.status }}
          cleanupOnComplete
        >
          <Phase name="Work">
            <Step name="Do it">
              <div>Done</div>
            </Step>
          </Phase>
        </Orchestration>
      </SmithersProvider>
    )

    root.dispose()
    await new Promise(resolve => setTimeout(resolve, 500))

    expect(finalStatus).toBe('completed')

    // DB file should be cleanly closed
    const newDb = await createSmithersDB({ path: dbPath })
    const exec = await newDb.execution.get(execId)
    expect(exec).toBeTruthy()
    await newDb.close()
  })
})
```

### Manual Testing

1. **Scenario**: Template with cleanup
   - **Steps**:
     1. Copy templates/main.tsx.template
     2. Add console.log in onComplete
     3. Run orchestration
     4. Verify log appears
   - **Expected**: onComplete fires, logs appear, process exits cleanly

2. **Scenario**: CI failure signal
   - **Steps**:
     1. Create orchestration with ci_failure stop condition
     2. In Claude component, set db.state.set('ci_failure', {reason: 'Test'})
     3. Observe orchestration stops
   - **Expected**: Orchestration halts within 1 second

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| MODIFY | `src/components/Orchestration.tsx` | Add ci_failure case |
| MODIFY | `templates/main.tsx.template` | Add root.dispose() pattern |
| MODIFY | `src/components/agents/SmithersCLI.ts` | Add root.dispose() after mount |
| MODIFY | `docs/examples/*.mdx` | Update all examples with disposal |
| CREATE | `src/components/Orchestration.test.tsx` | Lifecycle tests |
| CREATE | `docs/architecture/lifecycle.mdx` | Document mount/dispose flow |

## Open Questions

- [ ] **Q1**: Should we auto-dispose by default?
  - **Impact**: Simplifies usage but hides control
  - **Resolution**: Keep explicit for now, revisit after v1.0

- [ ] **Q2**: How to handle partial cleanup on error?
  - **Impact**: DB might be half-closed
  - **Resolution**: Add try/finally in useUnmount

- [ ] **Q3**: Should onComplete be async?
  - **Impact**: Currently fire-and-forget
  - **Resolution**: Make async, await in useUnmount

## References

- [SmithersProvider Source](../src/components/SmithersProvider.tsx)
- [Orchestration Source](../src/components/Orchestration.tsx)
- [Review: Orchestration Completion Misaligned](../reviews/orchestration-completion-misaligned.md)
- [React Reconciler Docs](https://react.dev/reference/react-dom/client/createRoot#root-unmount)
