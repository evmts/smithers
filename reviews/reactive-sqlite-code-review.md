# Code Review: reactive-sqlite vs Reference Implementations

**Date:** 2025-01-18
**Reviewer:** Claude
**Subject:** Comparison of smithers2/reactive-sqlite against established SQLite+React libraries

---

## Reference Implementations Analyzed

I compared your implementation against two established libraries:

1. **[reactive-sql-toolkit](https://github.com/PauloBarbeiro/reactive-sql-toolkit)** - React hooks for sql.js WASM
2. **[observable-sqlite](https://github.com/jorroll/observable-sqlite)** - RxJS-based reactive SQLite with proper AST parsing

Both were cloned to `/tmp/` for analysis.

---

## Feature Comparison Matrix

| Feature | Your Implementation | reactive-sql-toolkit | observable-sqlite |
|---------|---------------------|---------------------|-------------------|
| **SQLite Backend** | Bun native | sql.js WASM | @sqlite.org/sqlite-wasm |
| **SQL Parsing** | Regex | Regex (needs table list) | pgsql-ast-parser (proper AST) |
| **React Integration** | `useSyncExternalStore` | useState + callback | RxJS + observable-hooks |
| **Subscription Model** | Table-level | Table-level + WeakRef | Row-level granularity |
| **Memory Management** | Manual cleanup | WeakRef auto-cleanup | RxJS subscription cleanup |
| **Backpressure** | None | None | RxJS throttle |

---

## Strengths of Your Implementation

### 1. Modern React Integration (useSyncExternalStore)

Your use of `useSyncExternalStore` at `hooks/useQuery.ts:93` is excellent and superior to both references:

```typescript
const snapshot = useSyncExternalStore(
  subscribe,
  getSnapshot,
  getSnapshot // Server snapshot
)
```

- reactive-sql-toolkit uses `useState` with manual re-renders (older pattern)
- observable-sqlite requires `observable-hooks` as extra dependency

**Verdict:** Your approach is the most modern and correct for React 18+.

### 2. Clean Hook API

Your `useQuery`, `useQueryOne`, `useQueryValue`, `useMutation` pattern is more ergonomic than either reference:

```typescript
// Your API - clean and intuitive
const { data: users, isLoading, error, refetch } = useQuery(db, 'SELECT * FROM users')
const { data: user } = useQueryOne(db, 'SELECT * FROM users WHERE id = ?', [id])
const { data: count } = useQueryValue(db, 'SELECT COUNT(*) FROM users')
const { mutate } = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
```

The type inference is solid throughout.

### 3. Robust SQL Parser

Your parser at `parser.ts` handles more cases than reactive-sql-toolkit:

| Pattern | Your Parser | reactive-sql-toolkit |
|---------|-------------|---------------------|
| INSERT OR REPLACE | Yes | No |
| CREATE/DROP/ALTER TABLE | Yes | No |
| JOIN detection | Yes | Yes |
| Comment stripping | Yes | No |
| Schema detection without table list | Yes | No (requires table list upfront) |

### 4. WAL Mode by Default

```typescript
this.db.exec("PRAGMA journal_mode = WAL");  // database.ts:51
```

This is a production-ready choice that neither reference library sets. WAL provides:
- Better concurrent read/write performance
- Improved crash recovery
- No blocking between readers and writers

### 5. Transaction Support

```typescript
db.transaction(() => {
  db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
  db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
})
```

Clean transaction API that neither reference provides as elegantly.

---

## Issues and Recommendations

### 1. CRITICAL: Missing Memory Cleanup via WeakRef

**Location:** `database.ts:136-149`

reactive-sql-toolkit uses `WeakRef` to auto-cleanup stale listeners:

```typescript
// reactive-sql-toolkit/src/core/SQL/index.ts:127
recorder[table].push(new WeakRef<(t: number) => void>(updateState))
```

Your implementation stores strong references:

```typescript
// database.ts:144
this.subscriptions.set(id, subscription);
```

**Risk:** If a component unmounts without calling the unsubscribe function, the subscription leaks.

**Recommendation:** Your current pattern is fine if consumers always unsubscribe (which React's useEffect cleanup should ensure). But you could add WeakRef as a safety net:

```typescript
interface QuerySubscription {
  id: string
  tables: Set<string>
  callback: WeakRef<SubscriptionCallback>
}

invalidate(tables?: string[]): void {
  for (const subscription of this.subscriptions.values()) {
    const callback = subscription.callback.deref()
    if (!callback) {
      // Auto-cleanup dead references
      this.subscriptions.delete(subscription.id)
      continue
    }
    // ... rest of logic
  }
}
```

---

### 2. Missing Row-Level Invalidation

**Location:** `database.ts:164-181`

observable-sqlite tracks changes at the row level:

```typescript
// observable-sqlite/src/database/SqliteDatabase.ts:62-65
subscribeToRowChanges(({ changes }) => {
  if (!(table in changes) || !(id in changes[table])) return;
  onChange();
})
```

Your implementation invalidates ALL queries for a table when ANY row changes:

```typescript
// Current behavior
db.run('UPDATE users SET name = ? WHERE id = 1', ['Alice'])
// This invalidates ALL queries touching 'users', even:
// - SELECT * FROM users WHERE id = 999
// - SELECT COUNT(*) FROM users WHERE active = false
```

**Impact:** For large tables with many subscribed queries, this causes unnecessary re-renders.

**Recommendation:** Consider adding optional row-level tracking for performance-critical queries:

```typescript
// Future enhancement
interface UseQueryOptions {
  skip?: boolean
  deps?: any[]
  trackRows?: boolean  // NEW: enable row-level tracking
}

// In database.ts, track affected row IDs
run(sql: string, params: any[] = []): RunResult {
  const result = stmt.run(...params)
  const tables = extractWriteTables(sql)
  const rowIds = this.getAffectedRowIds(sql, params) // NEW
  this.invalidate(tables, rowIds)
  return result
}
```

---

### 3. SQL Parser Could Use Proper AST

**Location:** `parser.ts`

observable-sqlite uses `pgsql-ast-parser` for reliable table extraction:

```typescript
// observable-sqlite/src/database/parseTableNames.ts:3-21
import { astVisitor, parse } from 'pgsql-ast-parser';

const statements = parse(sqlQuery);
const visitor = astVisitor(() => ({
  tableRef: (t) => tables.add(t.name),
}));
```

Your regex approach works for common cases but will fail on:

| Query Pattern | Your Parser | AST Parser |
|--------------|-------------|------------|
| Subqueries in WHERE: `SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)` | Misses `orders` | Correct |
| CTEs: `WITH cte AS (SELECT * FROM users) SELECT * FROM cte` | Misses `users` | Correct |
| Schema-qualified: `main.users` | Returns `main` | Returns `users` |
| Quoted identifiers: `SELECT * FROM "user table"` | Fails | Correct |

**Recommendation:** For a more robust solution, consider `node-sql-parser` (works with Bun):

```typescript
import { Parser } from 'node-sql-parser'

const parser = new Parser()

export function extractReadTables(sql: string): string[] {
  const ast = parser.astify(sql)
  const tables = parser.tableList(sql)
  return tables
    .filter(t => t.startsWith('select::'))
    .map(t => t.split('::')[2])
}
```

For your current use cases, the regex may be sufficient. Just document the limitations.

---

### 4. No Backpressure Handling

**Location:** `database.ts:164-181`

observable-sqlite uses RxJS throttle to prevent rapid-fire re-queries:

```typescript
// observable-sqlite/src/database/SqliteDatabase.ts:220-231
throttle(() => from(query), { leading: true, trailing: true })
```

**Problem:** If multiple mutations happen in quick succession, your hooks will re-execute queries for each one:

```typescript
// This triggers 3 separate invalidations and query re-executions
db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
db.run('INSERT INTO users (name) VALUES (?)', ['Charlie'])
```

**Recommendation:** Add microtask batching to invalidation:

```typescript
// database.ts enhancement
private pendingInvalidations: Set<string> = new Set();
private flushScheduled = false;

invalidate(tables?: string[]): void {
  if (tables) {
    tables.forEach(t => this.pendingInvalidations.add(t.toLowerCase()));
  } else {
    // Invalidate all - mark with special token
    this.pendingInvalidations.add('*');
  }

  if (!this.flushScheduled) {
    this.flushScheduled = true;
    queueMicrotask(() => this.flushInvalidations());
  }
}

private flushInvalidations(): void {
  this.flushScheduled = false;
  const tables = this.pendingInvalidations.has('*')
    ? undefined
    : Array.from(this.pendingInvalidations);
  this.pendingInvalidations.clear();

  // Now notify subscribers once for all batched changes
  for (const subscription of this.subscriptions.values()) {
    if (!tables) {
      subscription.callback();
    } else {
      for (const table of tables) {
        if (subscription.tables.has(table)) {
          subscription.callback();
          break;
        }
      }
    }
  }
}
```

---

### 5. Missing Database Context Provider

**Location:** All hooks require `db` as first argument

observable-sqlite provides a React context for the database:

```typescript
// observable-sqlite/src/database/context.tsx
export const ProvideDatabaseContext = (props) => {
  const [context, setContext] = useState<SQLiteClient | null>(null);
  useEffect(() => { SQLiteClient.init().then(setContext) }, []);
  return <DatabaseContext.Provider value={context}>{props.children}</DatabaseContext.Provider>
}

export function useDatabaseContext() {
  return useContext(DatabaseContext)!;
}
```

Your hooks require passing `db` everywhere:

```typescript
// Current usage - repetitive
const { data: users } = useQuery(db, 'SELECT * FROM users')
const { data: posts } = useQuery(db, 'SELECT * FROM posts')
const { mutate } = useMutation(db, 'INSERT INTO users ...')
```

**Recommendation:** Add a context provider:

```typescript
// hooks/context.ts
import { createContext, useContext, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../database'

const DatabaseContext = createContext<ReactiveDatabase | null>(null)

export function DatabaseProvider({
  db,
  children
}: {
  db: ReactiveDatabase
  children: ReactNode
}) {
  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): ReactiveDatabase {
  const db = useContext(DatabaseContext)
  if (!db) {
    throw new Error('useDatabase must be used within a DatabaseProvider')
  }
  return db
}

// Then update hooks to optionally use context:
export function useQuery<T>(
  sqlOrDb: string | ReactiveDatabase,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  maybeOptions?: UseQueryOptions
): UseQueryResult<T> {
  // Support both: useQuery(db, sql, params) and useQuery(sql, params)
  const contextDb = useContext(DatabaseContext)
  const db = typeof sqlOrDb === 'string' ? contextDb! : sqlOrDb
  const sql = typeof sqlOrDb === 'string' ? sqlOrDb : sqlOrParams as string
  // ... etc
}
```

---

### 6. Type Safety for Query Parameters

**Location:** `database.ts:89`, `hooks/useQuery.ts:34`

Your params are `any[]`. Consider stronger typing:

```typescript
// types.ts
export type SqlParam =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | Buffer
  | bigint

// Then use throughout:
run(sql: string, params: SqlParam[] = []): RunResult
useQuery<T>(db: ReactiveDatabase, sql: string, params: SqlParam[] = [])
```

---

## Minor Issues

### 1. `isLoading` is Always False

**Location:** `hooks/useQuery.ts:115`

```typescript
return {
  data: snapshot.data,
  isLoading: false, // SQLite queries are synchronous
  error: snapshot.error,
  refetch,
}
```

The property is misleading since it's always `false`. Consider:
- Removing it entirely, or
- Renaming to `isRefetching` and tracking actual refetch state, or
- Adding a comment to the type definition explaining it's always false for sync SQLite

### 2. Double JSON.stringify in useQuery

**Location:** `hooks/useQuery.ts:47` and `:61`

```typescript
// Line 47 - in queryKey
const queryKey = useMemo(
  () => JSON.stringify({ sql, params, skip }),
  [sql, JSON.stringify(params), skip]  // <-- stringify here
)

// Line 61 - in executeQuery deps
const executeQuery = useCallback(() => {
  // ...
}, [db, sql, JSON.stringify(params), skip])  // <-- and here
```

The params are stringified in the dependency array, which means:
1. Extra computation on every render
2. The `queryKey` already contains stringified params

**Recommendation:** Stringify once and reuse:

```typescript
const paramsKey = useMemo(() => JSON.stringify(params), [params])

const queryKey = useMemo(
  () => `${sql}::${paramsKey}::${skip}`,
  [sql, paramsKey, skip]
)

const executeQuery = useCallback(() => {
  // ...
}, [db, sql, paramsKey, skip])
```

### 3. Missing REPLACE INTO in Parser

**Location:** `parser.ts:95-105`

Your `isWriteOperation` checks for `replace`:

```typescript
export function isWriteOperation(sql: string): boolean {
  const normalized = sql.trim().toLowerCase()
  return (
    // ...
    normalized.startsWith('replace')  // <-- handled here
  )
}
```

But `extractWriteTables` doesn't handle `REPLACE INTO table`:

```typescript
// Missing pattern for:
// REPLACE INTO users (id, name) VALUES (1, 'Alice')
```

**Recommendation:** Add to `extractWriteTables`:

```typescript
// REPLACE INTO table_name
const replaceRegex = /\breplace\s+into\s+([a-z_][a-z0-9_]*)/gi
while ((match = replaceRegex.exec(normalized)) !== null) {
  tables.add(match[1])
}
```

---

## Overall Assessment

### Grades

| Aspect | Grade | Notes |
|--------|-------|-------|
| API Design | A | Clean, intuitive hooks |
| React Integration | A+ | Best-in-class use of useSyncExternalStore |
| Type Safety | B+ | Could improve param typing |
| SQL Parsing | B | Works for common cases, document limitations |
| Memory Management | B+ | Works if cleanup is called, consider WeakRef |
| Performance (large datasets) | B | Consider row-level invalidation, batching |
| Documentation | A | Good JSDoc comments |

### Summary

Your implementation is **production-quality** and in many ways cleaner than the reference implementations. The main advantages over the WASM-based alternatives:

1. **Performance**: Bun's native SQLite is faster than WASM
2. **Simplicity**: No WASM loading, no separate worker threads
3. **Modern React**: Proper use of useSyncExternalStore
4. **Type Safety**: Better TypeScript integration

The main gaps are:
1. Row-level invalidation for performance
2. Proper AST parsing for complex queries
3. Built-in React context provider
4. Invalidation batching

For a Bun-native solution, this is solid work.

---

## References

- [reactive-sql-toolkit GitHub](https://github.com/PauloBarbeiro/reactive-sql-toolkit)
- [observable-sqlite GitHub](https://github.com/jorroll/observable-sqlite)
- [RxDB SQLite Storage](https://rxdb.info/rx-storage-sqlite.html)
- [useSyncExternalStore docs](https://react.dev/reference/react/useSyncExternalStore)
