# Table Name String Interpolation in DROP

## File
[src/db/index.ts](file:///Users/williamcory/smithers/src/db/index.ts#L146-L150)

## Issue
Table names are interpolated directly into SQL:

```typescript
for (const table of tables) {
  try { rdb.exec(`DROP TABLE IF EXISTS ${table}`) } catch {}
}
```

While the table names are hardcoded (not user input), this pattern is unsafe and could become a vulnerability if refactored.

## Impact
- Currently safe (internal hardcoded list)
- Establishes bad pattern that could be copy-pasted elsewhere
- Silent catch hides errors

## Suggested Fix
Use a safer pattern or at minimum validate table names:

```typescript
const VALID_TABLES = new Set(['render_frames', 'tasks', ...])

for (const table of tables) {
  if (!VALID_TABLES.has(table)) throw new Error(`Invalid table: ${table}`)
  try { 
    rdb.exec(`DROP TABLE IF EXISTS ${table}`) 
  } catch (e) {
    console.warn(`Failed to drop table ${table}:`, e)
  }
}
```

Or combine into single statement:
```typescript
rdb.exec(`
  DROP TABLE IF EXISTS render_frames;
  DROP TABLE IF EXISTS tasks;
  ...
`)
```
