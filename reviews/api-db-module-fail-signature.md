# API Inconsistency: DB Module fail() Method Signatures

## Files Involved
- `src/db/execution.ts` - `fail: (id: string, error: string) => void`
- `src/db/phases.ts` - `fail: (id: string) => void`
- `src/db/steps.ts` - `fail: (id: string) => void`
- `src/db/agents.ts` - `fail: (id: string, error: string) => void`
- `src/db/tasks.ts` - `fail: (id: string) => void`

## Inconsistency Description

The `fail()` method has inconsistent signatures across DB modules:

### With error parameter:
```typescript
// execution.ts
fail: (id: string, error: string) => {
  rdb.run(
    `UPDATE executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
    [error, now(), id]
  )
}

// agents.ts
fail: (id: string, error: string) => {
  rdb.run(`UPDATE agents SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`, [error, now(), id])
}
```

### Without error parameter:
```typescript
// phases.ts
fail: (id: string) => {
  rdb.run(`UPDATE phases SET status = 'failed', completed_at = ? WHERE id = ?`, [now(), id])
}

// steps.ts
fail: (id: string) => {
  rdb.run(`UPDATE steps SET status = 'failed', completed_at = ? WHERE id = ?`, [now(), id])
}

// tasks.ts
fail: (id: string) => {
  rdb.run(
    `UPDATE tasks SET status = 'failed', completed_at = ?, duration_ms = ? WHERE id = ?`,
    [now(), durationMs, id]
  )
}
```

## Suggested Standardization

1. **All fail() methods should accept optional error string**:
```typescript
fail: (id: string, error?: string) => void
```

2. **Update schema** for phases, steps, tasks tables to include `error TEXT` column if not present

3. **Unified signature across all modules**:
```typescript
// All modules
fail: (id: string, error?: string) => {
  if (rdb.isClosed) return
  const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM X WHERE id = ?', [id])
  const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
  rdb.run(
    `UPDATE X SET status = 'failed', error = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
    [error ?? null, now(), durationMs, id]
  )
  if (getCurrentXId() === id) setCurrentXId(null)
}
```

This ensures:
- Consistent error tracking across all entity types
- Duration calculation on failure (currently missing in phases.ts)
- Proper cleanup of current ID references
