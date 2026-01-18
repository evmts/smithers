# P0 Reactive SQLite Bugs

## Priority: P0 (CRITICAL)

## Issues to Fix

### 1. useQuery Cache Invalidation Bug (`reviews/20260118_143600_reactive_sqlite.md`)
- **Problem**: Components don't rerender when DB is modified
- **Cause**: Cache prevents `useSyncExternalStore` from detecting snapshot changes
- **File**: `src/reactive-sqlite/hooks/useQuery.ts`

**Current (Broken)**:
```typescript
const subscribe = useCallback((onStoreChange: () => void) => {
  return db.subscribe(tables, () => {
    incrementVersion(); // This doesn't clear cache!
    onStoreChange();
  })
}, [db, sql, skip])

const getSnapshot = useCallback(() => {
  if (cacheRef.current.key === queryKey) {
    return cacheRef.current.data // Never invalidated!
  }
  // ...
}, [sql, params, skip])
```

**Fix Pattern**:
```typescript
const subscribe = useCallback((onStoreChange: () => void) => {
  if (skip) return () => {}
  const tables = extractReadTables(sql)
  return db.subscribe(tables, () => {
    cacheRef.current = null  // <-- CRITICAL: clear cache
    onStoreChange()
  })
}, [db, sql, skip])

const getSnapshot = useCallback(() => {
  if (skip) return null
  if (!cacheRef.current) {
    const result = db.query(sql, params)
    cacheRef.current = result
  }
  return cacheRef.current
}, [sql, params, skip])
```

### 2. REPLACE INTO Parser Support (`reviews/20260118_143600_reactive_sqlite.md`)
- **Problem**: `extractWriteTables()` doesn't recognize `REPLACE INTO`
- **File**: `src/reactive-sqlite/parser.ts`

**Fix Pattern**:
```typescript
// Add standalone REPLACE pattern
const replaceRegex = /\breplace\s+into\s+([a-z_][a-z0-9_]*)/gi
while ((match = replaceRegex.exec(normalized)) !== null) {
  tables.add(match[1]!)
}
```

### 3. Transaction Invalidation Batching (Optional P1)
- **Problem**: Invalidations fire mid-transaction before rollback
- **File**: `src/reactive-sqlite/database.ts`

## Workflow

1. Fix useQuery cache invalidation FIRST (highest impact)
2. Add REPLACE INTO parser support
3. Add tests verifying:
   - `useQuery` rerenders on `db.run()` updates
   - `REPLACE INTO` triggers invalidations
4. Run tests: `bun test src/reactive-sqlite`
5. Run typecheck: `bun run check`
6. Commit with descriptive messages
7. Push and create PR

## Verification Test

```typescript
// Should pass after fix
it('rerenders on DB change', async () => {
  const { result } = renderHook(() => useQuery(db, 'SELECT * FROM users'))
  expect(result.current.data).toHaveLength(0)

  db.run('INSERT INTO users (name) VALUES (?)', ['alice'])

  // Should rerender with new data
  expect(result.current.data).toHaveLength(1)
})
```
