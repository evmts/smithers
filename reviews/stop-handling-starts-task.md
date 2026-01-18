# Stop Handling Starts Task Even When Stopping

**Severity:** P0 - Critical
**Files:** `src/components/Claude.tsx`, `src/components/SmithersProvider.tsx`
**Status:** Open

## Problem

Components start tasks in the database before checking stop status:

```tsx
// Claude.tsx:72-78
taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')

if (isStopRequested()) {
  db.tasks.complete(taskIdRef.current)
  return
}
```

This causes SmithersProvider to treat the iteration as "started work" because `totalTaskCount > 0`, preventing the "no tasks started" completion path from ever triggering.

## Affected Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. db.tasks.start() → task inserted (status='running')    │
│  2. isStopRequested() → true                                │
│  3. db.tasks.complete() → status='completed'                │
│  4. SmithersProvider query: SELECT COUNT(*) FROM tasks      │
│     WHERE execution_id=? AND iteration=?                    │
│     └─→ Returns 1 (no status filter!)                       │
│  5. hasStartedTasks = true (totalTaskCount > 0)             │
│  6. "No tasks started" path NEVER taken                     │
│  7. Ralph loop keeps iterating until maxIterations          │
└─────────────────────────────────────────────────────────────┘
```

## Root Cause

SmithersProvider's task count query (`src/components/SmithersProvider.tsx:280-283`) counts ALL tasks regardless of status:

```tsx
const { data: totalTaskCount } = useQueryValue<number>(
  reactiveDb,
  `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?`,
  [props.executionId, ralphCount]
)
```

Combined with tasks being started before stop checks, this means even immediately-completed tasks count as "work started."

## Impact

- Stop requests don't stop immediately - loop continues until maxIterations
- Wasted iterations with no actual work being done
- Poor user experience when trying to cancel
- Resource waste (continued API calls, DB queries per iteration)

## Components With Same Pattern

| Component | File | Has Stop Check |
|-----------|------|----------------|
| Claude | src/components/Claude.tsx:72-78 | ✓ (but after start) |
| Smithers | src/components/Smithers.tsx:137 | ✗ |
| Review | src/components/Review/Review.tsx:196 | ✗ |
| Git/Commit | src/components/Git/Commit.tsx:72 | ✗ |
| Git/Notes | src/components/Git/Notes.tsx:43 | ✗ |
| JJ/* | Multiple files | ✗ |
| Step | src/components/Step.tsx:210 | ✗ |

## Recommended Fixes

### Option 1: Check Stop Before Starting Task (Preferred)

```tsx
// Check first, start second
if (isStopRequested()) {
  return
}
taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')
```

### Option 2: Filter Query by Running Status

```sql
SELECT COUNT(*) as count FROM tasks
WHERE execution_id = ? AND iteration = ? AND status = 'running'
```

This would make immediately-completed tasks invisible to the "work started" detection.

### Option 3: Provider Exits Immediately on Stop

Add stop check in SmithersProvider's effect loop:

```tsx
if (isStopRequested()) {
  signalOrchestrationComplete()
  props.onComplete?.()
  return
}
```

## Recommendation

Implement **Option 1 + Option 3**:
1. Check stop before starting tasks (prevents the issue)
2. Add stop check in provider (defense-in-depth, handles edge cases)

Option 2 changes semantics of "totalTaskCount" which may have other uses.

## Related

- SmithersProvider iteration logic: lines 359-394
- Tasks table schema: `src/db/schema.sql:399-414`
