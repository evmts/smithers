# CLI: stats-view has potential SQL injection via table names

## Location
- **File**: [src/commands/db/stats-view.ts](file:///Users/williamcory/smithers/src/commands/db/stats-view.ts#L20-L24)
- **Lines**: 20-24

## Issue
Table names are interpolated directly into SQL query. While currently hardcoded, this is a dangerous pattern if the list ever becomes dynamic.

## Current Code
```typescript
const tables = ['executions', 'phases', 'agents', ...]

for (const table of tables) {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM ${table}` // direct interpolation
  )
}
```

## Suggested Fix
Keep tables hardcoded as constants and add a comment, or validate against a whitelist:

```typescript
const ALLOWED_TABLES = new Set([
  'executions', 'phases', 'agents', 'tool_calls',
  'memories', 'state', 'transitions', 'artifacts',
])

for (const table of tables) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`)
  }
  // ... query
}
```
