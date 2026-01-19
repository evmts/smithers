# DB & ReactiveDB Implementation Guide

**Date:** 2026-01-18
**Purpose:** Concrete patterns for fixing critical issues in DB layer and ReactiveDatabase

---

## Fix 1: `useQuery` Invalidation Bug (P0 - Reactive SQLite)

### Problem

Components don't rerender when DB is modified because cache prevents `useSyncExternalStore` from detecting snapshot changes.

### Current Code Pattern (Broken)

```typescript
// src/reactive-sqlite/hooks/useQuery.ts
const subscribe = useCallback((onStoreChange: () => void) => {
  if (skip) return () => {}
  const tables = extractReadTables(sql)
  // ❌ ISSUE: incrementVersion doesn't affect snapshot identity
  return db.subscribe(tables, () => { incrementVersion(); onStoreChange(); })
}, [db, sql, skip])

const getSnapshot = useCallback(() => {
  if (skip) return null
  // ❌ ISSUE: cache.key never changes if sql/params unchanged
  if (cacheRef.current.key === queryKey) {
    return cacheRef.current.data
  }
  // Recompute
  const result = db.query(sql, params)
  cacheRef.current = { key: queryKey, data: result }
  return result
}, [sql, params, skip])
```

### Fixed Pattern

```typescript
// Simplify: clear cache on invalidation, let getSnapshot recompute
const subscribe = useCallback((onStoreChange: () => void) => {
  if (skip) return () => {}
  const tables = extractReadTables(sql)
  return db.subscribe(tables, () => {
    cacheRef.current = null  // <-- CRITICAL: clear cache
    onStoreChange()          // React will call getSnapshot which recomputes
  })
}, [db, sql, skip])

const getSnapshot = useCallback(() => {
  if (skip) return null

  // If cache miss, recompute and cache
  if (!cacheRef.current) {
    const result = db.query(sql, params)
    cacheRef.current = result
  }
  return cacheRef.current
}, [sql, params, skip])
```

### Why This Works

* Invalidation handler clears cache (sets to null)
* React calls `getSnapshot()` after invalidation
* Cache is null, so query reruns and new object created
* `Object.is(oldSnapshot, newSnapshot)` is false → rerender

### Alternative: Explicit Version Tracking

If you want to keep the version approach, use it to influence cache key:

```typescript
const [version, setVersion] = useState(0)

const subscribe = useCallback((onStoreChange: () => void) => {
  if (skip) return () => {}
  const tables = extractReadTables(sql)
  return db.subscribe(tables, () => {
    setVersion(v => v + 1)
    onStoreChange()
  })
}, [db, sql, skip])

const getSnapshot = useCallback(() => {
  if (skip) return null

  const cacheKey = `${sql}|${JSON.stringify(params)}|${version}`
  if (cacheRef.current?.key !== cacheKey) {
    const result = db.query(sql, params)
    cacheRef.current = { key: cacheKey, data: result }
  }
  return cacheRef.current.data
}, [sql, params, skip, version])
```

But the first pattern (clear cache) is simpler.

---

## Fix 2: Iteration Key Mismatch (P1 - DB Layer)

### Problem

Schema seeds `iteration` state key, but code reads `ralphCount`.

### Files Affected

* `src/db/schema.sql` - Seeding logic
* `src/db/state.ts` - State module
* `src/db/tasks.ts` - `getCurrentIteration()` method
* `src/db/render-frames.ts` - Uses `ralph_count` field

### Implementation Pattern

**Step 1**: Choose canonical key (recommend `iteration` as it's more semantic):

```sql
-- src/db/schema.sql - update seed
INSERT OR IGNORE INTO state (key, value, updated_at) VALUES
  ('phase', '0', datetime('now')),
  ('iteration', '0', datetime('now')),  -- CHANGE: was 'ralphCount'
  ('data', '{}', datetime('now'));
```

**Step 2**: Update TasksModule:

```typescript
// src/db/tasks.ts
getCurrentIteration(): number {
  const value = this.db.queryValue<string>(
    "SELECT value FROM state WHERE key = 'iteration'"
  )
  // Parse as JSON in case it's stored as "0" vs 0
  return value ? JSON.parse(value) : 0
}

incrementIteration(): void {
  const current = this.getCurrentIteration()
  this.db.run(
    "UPDATE state SET value = ? WHERE key = 'iteration'",
    [JSON.stringify(current + 1)]
  )
}
```

**Step 3**: Update StateModule reset:

```typescript
// src/db/state.ts
reset(): void {
  this.db.run("DELETE FROM state WHERE key NOT IN ('iteration')")
  this.db.run(
    "INSERT OR IGNORE INTO state (key, value, updated_at) VALUES (?, ?, ?)",
    ['iteration', JSON.stringify(0), SmithersDB.now()]
  )
}
```

**Step 4**: Rename field in RenderFramesModule:

```typescript
// src/db/render-frames.ts
insert(executionId: string, phaseId: string, frame: any): string {
  const id = nanoid()
  this.db.run(
    `INSERT INTO render_frames (..., iteration, ...) VALUES (..., ?, ...)`,
    [..., SmithersDB.currentIterationId ?? 0, ...]  // Use actual iteration value
  )
  return id
}
```

---

## Fix 3: Replace INTO Parser Support (P1 - Reactive SQLite)

### Problem

`extractWriteTables()` doesn't recognize `REPLACE INTO` statements.

### Current Code

```typescript
// src/reactive-sqlite/parser.ts
const insertRegex = /INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)/gi
const deleteRegex = /DELETE\s+FROM\s+(\w+)/gi
const updateRegex = /UPDATE\s+(\w+)/gi
// ❌ ISSUE: no standalone REPLACE INTO pattern
```

### Fixed Implementation

```typescript
// src/reactive-sqlite/parser.ts

// Add separate pattern for REPLACE
const replaceRegex = /REPLACE\s+INTO\s+(\w+)/gi

export function extractWriteTables(sql: string): string[] {
  const tables = new Set<string>()

  // Handle INSERT (including INSERT OR REPLACE)
  let match
  while ((match = insertRegex.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase())
  }
  insertRegex.lastIndex = 0

  // Handle standalone REPLACE INTO
  while ((match = replaceRegex.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase())
  }
  replaceRegex.lastIndex = 0

  // Handle UPDATE
  while ((match = updateRegex.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase())
  }
  updateRegex.lastIndex = 0

  // Handle DELETE
  while ((match = deleteRegex.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase())
  }
  deleteRegex.lastIndex = 0

  return Array.from(tables)
}
```

### Test Cases to Add

```typescript
// src/reactive-sqlite/parser.test.ts
describe('extractWriteTables', () => {
  it('handles REPLACE INTO', () => {
    expect(extractWriteTables('REPLACE INTO users (id, name) VALUES (1, "john")')).toEqual(['users'])
  })

  it('handles INSERT OR REPLACE', () => {
    expect(extractWriteTables('INSERT OR REPLACE INTO users (id) VALUES (1)')).toEqual(['users'])
  })

  it('handles multiple operations', () => {
    const sql = `
      INSERT INTO logs (msg) VALUES ('test');
      REPLACE INTO users (id) VALUES (1);
    `
    expect(extractWriteTables(sql)).toContain('logs')
    expect(extractWriteTables(sql)).toContain('users')
  })
})
```

---

## Fix 4: ExecutionContext via AsyncLocalStorage (P0 - DB Layer)

### Problem

Global `currentExecutionId` etc. cause race conditions with parallel subagents.

### Implementation Pattern: AsyncLocalStorage Wrapper

```typescript
// src/db/context.ts - NEW FILE
import { AsyncLocalStorage } from 'async_hooks'

export interface ExecutionContext {
  executionId: string | null
  phaseId: string | null
  agentId: string | null
  stepId: string | null
}

const contextStorage = new AsyncLocalStorage<ExecutionContext>()

export const ExecutionContextProvider = {
  getContext(): ExecutionContext {
    return contextStorage.getStore() ?? {
      executionId: null,
      phaseId: null,
      agentId: null,
      stepId: null,
    }
  },

  async withContext<T>(
    ctx: Partial<ExecutionContext>,
    fn: () => T | Promise<T>
  ): Promise<T> {
    const current = this.getContext()
    const next = { ...current, ...ctx }
    return contextStorage.run(next, fn)
  },

  async withExecution<T>(executionId: string, fn: () => T | Promise<T>): Promise<T> {
    return this.withContext({ executionId }, fn)
  },

  async withPhase<T>(phaseId: string, fn: () => T | Promise<T>): Promise<T> {
    return this.withContext({ phaseId }, fn)
  },
}
```

### Integration into SmithersDB

```typescript
// src/db/index.ts
export async function createSmithersDB(dbPath: string): Promise<SmithersDB> {
  const reactiveDb = new ReactiveDatabase(dbPath)

  const db: SmithersDB = {
    execution: new ExecutionModule(reactiveDb, ExecutionContextProvider),
    phases: new PhasesModule(reactiveDb, ExecutionContextProvider),
    agents: new AgentsModule(reactiveDb, ExecutionContextProvider),
    // ... rest of modules

    // Legacy static access for gradual migration
    async withContext(ctx, fn) {
      return ExecutionContextProvider.withContext(ctx, fn)
    },
  }

  return db
}
```

### Updated Module Signature (Example: AgentsModule)

```typescript
// src/db/agents.ts
export class AgentsModule {
  constructor(
    private db: ReactiveDatabase,
    private contextProvider: typeof ExecutionContextProvider
  ) {}

  start(config: { name: string; status?: string }): string {
    const ctx = this.contextProvider.getContext()
    if (!ctx.executionId) throw new Error('No active execution context')

    const id = nanoid()
    this.db.run(
      `INSERT INTO agents (id, execution_id, phase_id, name, status)
       VALUES (?, ?, ?, ?, ?)`,
      [id, ctx.executionId, ctx.phaseId, config.name, config.status ?? 'running']
    )
    return id
  }

  async withAgent<T>(agentId: string, fn: () => T | Promise<T>): Promise<T> {
    return this.contextProvider.withContext({ agentId }, fn)
  }
}
```

### Usage at Orchestrator Level

```typescript
// Orchestrator code
const executionId = execution.start({ /* ... */ })

await db.withContext({ executionId }, async () => {
  const phaseId = db.phases.start({ /* ... */ })

  await db.withPhase(phaseId, async () => {
    const agentId = db.agents.start({ /* ... */ })

    // All nested calls inherit context automatically
    await runAgent(agentId)
  })
})
```

---

## Fix 5: Transaction-Aware Invalidation (P0 - Reactive SQLite)

### Problem

Invalidations fire mid-transaction before rollback occurs.

### Implementation Pattern

```typescript
// src/reactive-sqlite/database.ts
export class ReactiveDatabase {
  private inTransaction = 0
  private pendingInvalidations: {
    tables: Set<string>
    rowFilters: Map<string, any> // table -> filter value
  } | null = null

  run(sql: string, params?: any[]): Database.Statement.RunResult {
    const tables = extractWriteTables(sql)
    const result = this.db.run(sql, params)

    // If in transaction, queue invalidation; otherwise fire immediately
    if (this.inTransaction > 0) {
      if (!this.pendingInvalidations) {
        this.pendingInvalidations = {
          tables: new Set(),
          rowFilters: new Map(),
        }
      }
      tables.forEach(t => this.pendingInvalidations!.tables.add(t))

      // Optionally accumulate row filters
      const rowFilter = extractRowFilter(sql)
      if (rowFilter) {
        const key = `${rowFilter.table}:${rowFilter.column}`
        this.pendingInvalidations.rowFilters.set(key, rowFilter.value)
      }
    } else {
      // Not in transaction: invalidate immediately
      this.invalidate(tables)
    }

    return result
  }

  transaction<T>(fn: (tx: this) => T): T {
    this.inTransaction++
    try {
      const result = this.db.transaction(fn)(this)

      // Transaction succeeded: flush invalidations
      if (this.pendingInvalidations) {
        this.invalidate(Array.from(this.pendingInvalidations.tables))
        this.pendingInvalidations = null
      }

      return result
    } catch (error) {
      // Transaction rolled back: discard queued invalidations
      this.pendingInvalidations = null
      throw error
    } finally {
      this.inTransaction--
    }
  }

  private invalidate(tables: string[]): void {
    const tablesToInvalidate = new Set(tables.map(t => t.toLowerCase()))

    for (const subscription of this.subscriptions.values()) {
      const subscriptionTables = new Set(
        subscription.readTables.map(t => t.toLowerCase())
      )

      // Check if any written table matches subscription
      if (this.hasTableIntersection(subscriptionTables, tablesToInvalidate)) {
        subscription.callback()
      }
    }
  }

  private hasTableIntersection(set1: Set<string>, set2: Set<string>): boolean {
    for (const item of set1) {
      if (set2.has(item)) return true
    }
    return false
  }
}
```

### Test Pattern

```typescript
// src/reactive-sqlite/database.test.ts
it('batches invalidations within transaction', async () => {
  const callback = vi.fn()
  db.subscribe(['users'], callback)

  db.transaction(() => {
    db.run('INSERT INTO users (name) VALUES (?)', ['alice'])
    db.run('INSERT INTO users (name) VALUES (?)', ['bob'])
    // Callback should NOT be called yet
    expect(callback).not.toHaveBeenCalled()
  })

  // After transaction commits, single invalidation
  expect(callback).toHaveBeenCalledTimes(1)
})

it('discards invalidations on transaction rollback', () => {
  const callback = vi.fn()
  db.subscribe(['users'], callback)

  try {
    db.transaction(() => {
      db.run('INSERT INTO users (name) VALUES (?)', ['alice'])
      throw new Error('rollback')
    })
  } catch {
    // expected
  }

  expect(callback).not.toHaveBeenCalled()
})
```

---

## Fix 6: State Table Scoped by Execution (P1 - DB Layer)

### Current Schema

```sql
CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### New Schema

```sql
CREATE TABLE state (
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (execution_id, key)
);
```

### Module Update

```typescript
// src/db/state.ts
export class StateModule {
  constructor(private db: ReactiveDatabase, private contextProvider: typeof ExecutionContextProvider) {}

  get(key: string): any {
    const ctx = this.contextProvider.getContext()
    if (!ctx.executionId) throw new Error('No execution context')

    const value = this.db.queryValue<string>(
      "SELECT value FROM state WHERE execution_id = ? AND key = ?",
      [ctx.executionId, key]
    )
    return value ? JSON.parse(value) : null
  }

  set(key: string, value: any): void {
    const ctx = this.contextProvider.getContext()
    if (!ctx.executionId) throw new Error('No execution context')

    this.db.run(
      `INSERT INTO state (execution_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(execution_id, key) DO UPDATE SET
       value = ?, updated_at = ?`,
      [
        ctx.executionId, key, JSON.stringify(value), SmithersDB.now(),
        JSON.stringify(value), SmithersDB.now()
      ]
    )
  }

  reset(): void {
    const ctx = this.contextProvider.getContext()
    if (!ctx.executionId) throw new Error('No execution context')

    this.db.run(
      "DELETE FROM state WHERE execution_id = ?",
      [ctx.executionId]
    )

    // Reseed defaults
    this.db.run(
      `INSERT INTO state (execution_id, key, value, updated_at)
       VALUES (?, 'iteration', '0', ?)`,
      [ctx.executionId, SmithersDB.now()]
    )
  }
}
```

---

## Testing Checklist

After implementing fixes, verify:

- [ ] `useQuery` rerenders on `db.run()` updates
- [ ] Iteration key is consistent across codebase
- [ ] `REPLACE INTO` statements trigger invalidations
- [ ] Parallel subagents don't overwrite each other's context
- [ ] Transactions batch invalidations
- [ ] State changes are scoped per execution
- [ ] Resuming execution loads correct state
- [ ] Type checking passes for all Date/boolean fields
- [ ] Large tool outputs persist to files
- [ ] Composite indexes improve query performance

---

## Migration Strategy

1. **Phase 1**: Fix reactive-sqlite P0 bugs (useQuery invalidation, REPLACE INTO)
2. **Phase 2**: Add iteration key consistency, fix type mismatches
3. **Phase 3**: Implement AsyncLocalStorage context + execution-scoped state
4. **Phase 4**: Add transaction batching, tool output persistence, indexes
5. **Phase 5**: Add migration table and long-term schema versioning

---

## Status: PARTIALLY RESOLVED

**Reviewed:** 2026-01-18

### Resolved Issues
- **Fix 1 (useQuery Invalidation)**: ✅ Fixed - `invalidateCache()` called in subscribe handler at [useQuery.ts#L111](file:///Users/williamcory/smithers/src/reactive-sqlite/hooks/useQuery.ts#L111)
- **Fix 3 (REPLACE INTO Parser)**: ✅ Fixed - `replaceRegex` pattern exists at [parser.ts#L72-75](file:///Users/williamcory/smithers/src/reactive-sqlite/parser.ts#L72-L75)

### Still Relevant Issues

#### Fix 2: Iteration Key Naming (Low Priority)
- Schema uses `ralphCount`, code is consistent
- Consider renaming to `iteration` for semantics but not critical

#### Fix 5: Transaction-Aware Invalidation (P0)
**Problem**: Invalidations fire mid-transaction, can cause UI flicker during rollback

**Files to investigate:**
- [src/reactive-sqlite/database.ts](file:///Users/williamcory/smithers/src/reactive-sqlite/database.ts)

**Grep patterns:**
```bash
grep -n "transaction\|invalidate" src/reactive-sqlite/database.ts
```

**Implementation approach:**
1. Add `inTransaction` counter + `pendingInvalidations` set to ReactiveDatabase
2. Queue invalidations in `run()` when `inTransaction > 0`
3. Flush on successful commit, discard on rollback

#### Fix 6: State Table Scoped by Execution (P1)
**Problem**: Global state key means parallel executions can conflict

**Files to investigate:**
- [src/db/schema.sql](file:///Users/williamcory/smithers/src/db/schema.sql) - State table definition (L197)
- [src/db/state.ts](file:///Users/williamcory/smithers/src/db/state.ts)

**Schema change needed:**
```sql
-- Current: PRIMARY KEY (key)
-- Needed:  PRIMARY KEY (execution_id, key)
```

---

## Debugging Plan

### Priority Order
1. Fix 5 (Transaction Invalidation) - P0, causes UI bugs
2. Fix 6 (Execution-Scoped State) - P1, needed for parallel execution

### Test Commands
```bash
bun test src/reactive-sqlite/database.test.ts
bun test src/db/state.test.ts
```

### Proposed Implementation Steps

**Fix 5:**
```typescript
// database.ts additions
private inTransaction = 0
private pendingInvalidations = new Set<string>()

transaction<T>(fn: () => T): T {
  this.inTransaction++
  try {
    const result = this.db.transaction(fn)()
    // Commit succeeded - flush invalidations
    if (this.pendingInvalidations.size > 0) {
      this.invalidate(Array.from(this.pendingInvalidations))
      this.pendingInvalidations.clear()
    }
    return result
  } catch (e) {
    this.pendingInvalidations.clear() // Rollback - discard
    throw e
  } finally {
    this.inTransaction--
  }
}
```

**Fix 6:** Requires schema migration - add `execution_id` column to state table with compound PK
