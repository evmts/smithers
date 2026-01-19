# State Issue: Missing Reactivity in Smithers.tsx Query

## Location
- **File:** `src/components/Smithers.tsx`
- **Lines:** 139-151

## Issue
Uses `db.db` (raw database) instead of `reactiveDb` for queries:

```typescript
// Query reactive state from DB
const { data: agentRow } = useQueryOne<...>(
  db.db,  // ⚠️ Should be reactiveDb
  "SELECT status, result, result_structured, error FROM agents WHERE id = ?",
  [subagentIdRef.current]
)

const { data: substatus } = useQueryValue<string>(
  db.db,  // ⚠️ Should be reactiveDb
  "SELECT value FROM state WHERE key = ?",
  [substatusKey]
)
```

## Problem
- `db.db` is a plain Database, not a ReactiveDatabase
- Queries won't auto-update when underlying data changes
- Component won't re-render when agent status changes in DB

## Compare With
[Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L30) correctly uses `reactiveDb`:
```typescript
const { db, reactiveDb, executionId, isStopRequested } = useSmithers()
// ...
const { data: agentRows } = useQuery<AgentRow>(
  reactiveDb,  // ✅ Correct
  "SELECT status, result, ... FROM agents WHERE id = ?",
  [agentIdRef.current ?? '']
)
```

## Suggested Fix

```typescript
export function Smithers(props: SmithersProps): ReactNode {
  const { db, reactiveDb, executionId } = useSmithers()  // Add reactiveDb
  // ...

  const { data: agentRow } = useQueryOne<...>(
    reactiveDb,  // ✅ Fix
    "SELECT status, result, result_structured, error FROM agents WHERE id = ?",
    [subagentIdRef.current]
  )

  const { data: substatus } = useQueryValue<string>(
    reactiveDb,  // ✅ Fix
    "SELECT value FROM state WHERE key = ?",
    [substatusKey]
  )
```

## Severity
High - Component status won't update reactively, breaking the UI.
