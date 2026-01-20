# Documentation Contract Alignment - Issue Tracker

Based on cross-cutting review of docs/examples/implementation.

## Status Summary

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| 1.1 Sync vs async docs | Medium | **FALSE POSITIVE** | State API IS sync, examples are correct |
| 1.2 useQueryValue signature | Low | **ALREADY CORRECT** | Returns `{ data }`, docs match impl |
| 1.3 phases.list signature | Medium | **NEEDS FIX** | Impl uses `(executionId: string)`, some docs show wrong call |
| 1.4 Status enum drift | Medium | **PARTIAL** | Implementation is consistent (`completed`), Agents docs says `Date` |
| 1.5 snake_case vs camelCase | Medium | **TRUE** | Agent type in docs says `Date`, impl returns strings |
| 1.6 SQL placeholder | Low | **TRUE** | Should standardize on `?` for bun:sqlite |
| 2.1 Execution completion error-safe | High | **ALREADY FIXED** | multi-phase-review.mdx has try/catch/finally |
| 2.2 Resume idempotency | High | **NEEDS DOC** | Need "Resumability Contract" concept doc |

## Verified Correct (No Action Needed)

### 1.1 State API - Actually Synchronous ✓

The reviewer misread the docs. Looking at [state.ts](/Users/williamcory/smithers2/src/db/state.ts):

```typescript
get: <T>(key: string): T | null => {
  const row = rdb.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', [key])
  return row ? parseJson<T>(row.value, null as T) : null
}
```

The docs are correct: "All State API methods are synchronous." The `await` in the "Initialize from Database" section is for `useQueryValue` (a React hook), not `db.state.get`.

### 1.2 useQueryValue - Already Returns { data } ✓

Looking at [useQueryValue.ts](/Users/williamcory/smithers2/src/reactive-sqlite/hooks/useQueryValue.ts#L91-L94):

```typescript
return {
  ...result,
  data: value,
}
```

The docs and examples correctly use `const { data } = useQueryValue<T>(...)`. Reviewer's concern about "examples use it as if it returns the value directly" appears based on:

```tsx
const phase = useQueryValue<string>(...) ?? "implement";
```

But the actual examples in our docs use:
```tsx
const { data: phase } = useQueryValue<string>(...)
const currentPhase = phase ?? "implement";
```

This is correct. ✓

### 1.4 Status Enums - Implementation is Consistent ✓

Schema and types consistently use `'completed'` (not `'complete'`):

- `executions`: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`
- `phases`: `'pending' | 'running' | 'completed' | 'skipped' | 'failed'`
- `agents`: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`
- `tool_calls`: `'pending' | 'running' | 'completed' | 'failed'`

Agents API doc says `"complete"` - this is a doc typo.

### 2.1 Execution Completion - Already Fixed ✓

[multi-phase-review.mdx](/Users/williamcory/smithers2/docs/examples/multi-phase-review.mdx#L125-L139) already has the correct pattern:

```tsx
try {
  const root = createSmithersRoot();
  await root.mount(App);
  await db.execution.complete(executionId, {...});
} catch (err) {
  await db.execution.fail(executionId, error.message);
  throw error;
} finally {
  await db.close();
}
```

## Needs Fixing

### 1.3 phases.list Signature

Implementation in [phases.ts](/Users/williamcory/smithers2/src/db/phases.ts#L64-L67):
```typescript
list: (executionId: string): Phase[] => {
  return rdb.query('SELECT * FROM phases WHERE execution_id = ? ORDER BY created_at', [executionId])
}
```

Docs should match: `db.phases.list(executionId)` (positional arg, not options object).

### 1.5 Date vs String Timestamps

Agents API doc claims:
```typescript
started_at?: Date;
completed_at?: Date;
created_at: Date;
```

But implementation returns raw SQLite strings (ISO8601). Need to either:
1. Add transformation layer to return `Date` objects, OR
2. Fix docs to say `string` timestamps

**Recommendation:** Fix docs to say `string` (matches what users actually get).

### 1.6 SQL Placeholder Style

Standardize on `?` for bun:sqlite. Update any `$1` examples to `?`.

### 2.2 Resumability Contract Doc

Create new concept doc: `/docs/concepts/resumability.mdx`

Contents:
- Stable operation identifiers (per step/component instance)
- What gets persisted (execution/phase/step/task/agent/tool/artifact/vcs)
- How step completion is determined
- What happens on restart
- Idempotency patterns for VCS operations

## Action Items

1. [ ] Fix Agents API doc: `"complete"` → `"completed"`
2. [ ] Fix Agents API doc: `Date` → `string` for timestamps
3. [ ] Audit phases.list usage in docs (options object vs positional)
4. [ ] Replace any `$1` SQL examples with `?`
5. [ ] Create `/docs/concepts/resumability.mdx`
6. [ ] Add docs-examples typechecking to CI (extract TSX from MDX, typecheck)
