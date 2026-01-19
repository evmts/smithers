# Empty Catch Block in DB Reset

## File

- [src/db/index.ts](file:///Users/williamcory/smithers/src/db/index.ts#L149)

## Issue Description

Database table drops silently swallow all errors:

```typescript
for (const table of tables) {
  try { rdb.exec(`DROP TABLE IF EXISTS ${table}`) } catch {}
}
```

While `DROP TABLE IF EXISTS` should rarely fail, this pattern hides:
- Database connection issues
- Locked tables
- Corrupted database state
- Permission issues

## Suggested Fix

Log unexpected drop failures:

```typescript
for (const table of tables) {
  try {
    rdb.exec(`DROP TABLE IF EXISTS ${table}`)
  } catch (err) {
    console.warn(`[SmithersDB] Failed to drop table ${table}:`, err)
  }
}
```

Or collect errors and report at the end:

```typescript
const dropErrors: string[] = []
for (const table of tables) {
  try {
    rdb.exec(`DROP TABLE IF EXISTS ${table}`)
  } catch (err) {
    dropErrors.push(`${table}: ${err instanceof Error ? err.message : err}`)
  }
}
if (dropErrors.length > 0) {
  console.warn(`[SmithersDB] Some tables failed to drop:`, dropErrors)
}
```
