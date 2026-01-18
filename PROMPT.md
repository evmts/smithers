# Issue: UIMessage Format

See: `../../../issues/uimessage-format.md`

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

1. Make commits as you implement
2. When ready, push and create PR:
   ```bash
   git push -u origin issue/uimessage-format
   gh pr create --title "Feat: UIMessage Format" --body "Implements uimessage-format. See issues/uimessage-format.md"
   ```
