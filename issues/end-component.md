# End Component

<metadata>
  <priority>high</priority>
  <category>feature</category>
  <estimated-effort>1 day</estimated-effort>
  <status>ready</status>
  <dependencies>
    - src/components/SmithersProvider.tsx
    - src/components/Ralph.tsx
  </dependencies>
  <blocks>
    - issues/github-actions-review-loop.md
  </blocks>
</metadata>

---

## Executive Summary

`<End>` component explicitly terminates orchestration before the next Ralph loop iteration. Captures structured output summarizing the entire run for notifications, PR comments, etc.

```
┌─────────────────────────────────────────────────────────────────┐
│ Ralph loop iteration N                                          │
│   └── ... work ...                                              │
│   └── <End summary={...} />  ← stops here, no iteration N+1    │
└─────────────────────────────────────────────────────────────────┘
```

---

<section name="problem">

## Problem

Currently there's no explicit way to:
1. Stop orchestration cleanly before the next Ralph iteration
2. Capture a structured summary of the entire run
3. Signal completion with output (vs just running out of tasks)

**Current behavior:** Ralph loops until no pending tasks. This is implicit and doesn't allow capturing final state.

**Desired:** Explicit `<End>` that stops the loop and captures summary for downstream use (PR comments, notifications, etc.)

</section>

---

<section name="api">

## API

```typescript
interface EndProps {
  /** Structured summary of the run (stored in DB, available for notifications) */
  summary: EndSummary | (() => EndSummary | Promise<EndSummary>)
  
  /** Exit code for process (default: 0 for success) */
  exitCode?: number
  
  /** Optional reason for ending */
  reason?: 'success' | 'failure' | 'max_iterations' | 'user_cancelled' | string
}

interface EndSummary {
  /** Overall status */
  status: 'success' | 'failure' | 'partial'
  
  /** Human-readable summary */
  message: string
  
  /** Structured data for downstream consumers */
  data?: Record<string, unknown>
  
  /** Metrics */
  metrics?: {
    duration_ms?: number
    iterations?: number
    agents_run?: number
    tokens_used?: { input: number; output: number }
  }
}
```

</section>

---

<section name="usage">

## Usage Examples

### Basic: End with Summary

```tsx
<ReviewIteration id="pr-review" target={{ type: 'pr', ref: prNumber }}>
  {(ctx) => <FallbackAgent>...</FallbackAgent>}
</ReviewIteration>

<End
  summary={{
    status: 'success',
    message: `PR #${prNumber} review completed`,
    data: { iterations: 2, approved: true },
  }}
/>
```

### Dynamic Summary

```tsx
<End
  summary={async () => {
    const review = await db.state.get('lastReview')
    const ciResults = db.db.query('SELECT * FROM commands WHERE execution_id = ?').all(executionId)
    
    return {
      status: review?.approved ? 'success' : 'failure',
      message: review?.approved 
        ? 'All checks passed and PR approved'
        : `Review failed: ${review?.summary}`,
      data: {
        review,
        ci: ciResults.map(c => ({ name: c.key, passed: c.status === 'success' })),
      },
      metrics: {
        duration_ms: Date.now() - startTime,
        iterations: await db.state.get('review-iteration.pr-review.iteration'),
      },
    }
  }}
/>
```

### Conditional End

```tsx
<If id="should-end" condition={() => allTasksComplete}>
  <End summary={{ status: 'success', message: 'All tasks completed' }} />
</If>
```

### End with Failure

```tsx
<End
  summary={{
    status: 'failure',
    message: 'Max iterations reached without approval',
    data: { lastReview },
  }}
  exitCode={1}
  reason="max_iterations"
/>
```

</section>

---

<section name="behavior">

## Behavior

### When `<End>` Renders

1. Evaluates `summary` (sync or async)
2. Stores summary in `executions` table
3. Calls `smithers.requestStop()` with reason
4. Ralph loop sees stop requested → exits after current iteration
5. Process exits with `exitCode`

### Database Schema

```sql
-- Add to executions table
ALTER TABLE executions ADD COLUMN end_summary TEXT;
ALTER TABLE executions ADD COLUMN end_reason TEXT;
ALTER TABLE executions ADD COLUMN exit_code INTEGER DEFAULT 0;
```

### Accessing Summary

```typescript
// After execution completes
const execution = db.db.query('SELECT * FROM executions WHERE id = ?').get(executionId)
const summary: EndSummary = JSON.parse(execution.end_summary)

// Use for PR comment
await postPRComment(prNumber, formatSummary(summary))
```

</section>

---

<section name="implementation">

## Implementation

```tsx
export function End(props: EndProps): ReactNode {
  const { db, executionId, requestStop } = useSmithers()
  const taskIdRef = useRef<string | null>(null)
  const hasEndedRef = useRef(false)
  
  useMount(() => {
    if (hasEndedRef.current) return
    hasEndedRef.current = true
    
    ;(async () => {
      taskIdRef.current = db.tasks.start('end', 'orchestration')
      
      // Evaluate summary
      const summary = typeof props.summary === 'function'
        ? await props.summary()
        : props.summary
      
      // Store in DB
      db.db.run(`
        UPDATE executions 
        SET end_summary = ?, end_reason = ?, exit_code = ?, status = 'completed'
        WHERE id = ?
      `, [
        JSON.stringify(summary),
        props.reason ?? (summary.status === 'success' ? 'success' : 'failure'),
        props.exitCode ?? (summary.status === 'success' ? 0 : 1),
        executionId,
      ])
      
      // Signal stop
      requestStop(`End: ${summary.message}`)
      
      db.tasks.complete(taskIdRef.current)
    })()
  })
  
  return (
    <end
      status="ending"
      reason={props.reason}
      exit-code={props.exitCode ?? 0}
    />
  )
}
```

</section>

---

<section name="pr-comment">

## PR Comment Integration

After orchestration ends, post summary as PR comment:

```typescript
// In workflow or post-execution hook
async function postExecutionSummary(executionId: string, prNumber: string) {
  const execution = db.db.query('SELECT * FROM executions WHERE id = ?').get(executionId)
  if (!execution.end_summary) return
  
  const summary: EndSummary = JSON.parse(execution.end_summary)
  
  const body = `## Smithers Review Summary

**Status:** ${summary.status === 'success' ? '✅ Approved' : '❌ Changes Requested'}

${summary.message}

${summary.metrics ? `
### Metrics
- Duration: ${Math.round(summary.metrics.duration_ms / 1000)}s
- Iterations: ${summary.metrics.iterations}
- Tokens: ${summary.metrics.tokens_used?.input ?? 0} in / ${summary.metrics.tokens_used?.output ?? 0} out
` : ''}

---
*Powered by Smithers*`

  await Bun.$`gh pr comment ${prNumber} --body ${body}`.quiet()
}
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 1: Core Component
- [ ] Create `src/components/End.tsx`
- [ ] Implement summary evaluation (sync/async)
- [ ] Call `requestStop()` to halt Ralph loop
- [ ] Store summary in executions table

### Phase 2: Database Schema
- [ ] Add `end_summary`, `end_reason`, `exit_code` to executions table
- [ ] Migration

### Phase 3: Integration
- [ ] Export from `src/components/index.ts`
- [ ] Add post-execution summary hook
- [ ] PR comment utility

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

- [ ] `<End>` stops Ralph loop after current iteration
- [ ] Summary can be sync value or async function
- [ ] Summary stored in executions table
- [ ] `exitCode` sets process exit code (default 0)
- [ ] `reason` stored for debugging/observability
- [ ] Plan output shows `<end>` element
- [ ] Summary accessible for PR comments/notifications
- [ ] Multiple `<End>` renders only execute once (idempotent)

</section>

---

<section name="plan-output">

## Plan Output

```xml
<phase name="Review" status="complete">
  <review-iteration id="pr-review" iteration="2" status="approved">
    ...
  </review-iteration>
</phase>

<end status="ending" reason="success" exit-code="0" />
```

</section>

---

## Related Issues

- **Blocks**: [github-actions-review-loop.md](./github-actions-review-loop.md) - needs `<End>` for PR comment summary
- **Related**: [Stop.tsx](../src/components/Stop.tsx) - existing stop mechanism (different purpose)
