# Documentation Contract Alignment - Issue Tracker

Based on cross-cutting review of docs/examples/implementation.

## Status: CLOSED

All items have been verified as either already fixed or false positives.

## Status Summary

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| 1.1 Sync vs async docs | Medium | **FALSE POSITIVE** | State API IS sync, examples are correct |
| 1.2 useQueryValue signature | Low | **ALREADY CORRECT** | Returns `{ data }`, docs match impl |
| 1.3 phases.list signature | Medium | **ALREADY CORRECT** | Docs show `(executionId: string)`, matches impl |
| 1.4 Status enum drift | Medium | **FALSE POSITIVE** | Agents docs uses `"completed"`, matches impl |
| 1.5 Date vs String timestamps | Medium | **FALSE POSITIVE** | Impl returns `Date` objects (see mapExecution in execution.ts) |
| 1.6 SQL placeholder | Low | **FALSE POSITIVE** | No `$1` examples found in docs, all use `?` |
| 2.1 Execution completion error-safe | High | **ALREADY FIXED** | multi-phase-review.mdx has try/catch/finally |
| 2.2 Resume idempotency | High | **ALREADY DONE** | `/docs/concepts/resumability.mdx` exists |

## Verification Notes

### 1.3 phases.list - Already Correct

Docs at `docs/api-reference/phases.mdx` line 27:
```
| `list` | `(executionId: string) => Phase[]` | List phases for execution |
```

Matches implementation in `src/db/phases.ts`.

### 1.5 Timestamps - Implementation Returns Date Objects

The issue claimed impl returns strings, but:
- `src/db/execution.ts` lines 51-53: `new Date(row.started_at)`, `new Date(row.completed_at)`, `new Date(row.created_at)`
- `src/db/agents.ts` line 64: `created_at: new Date(row.created_at)`
- `src/db/vcs.ts` lines 136, 152, 172, 187: All use `new Date(row.created_at)`

The `mapExecution()` and similar functions DO convert to Date objects.

### 2.2 Resumability Doc - Already Exists

Full doc at `/docs/concepts/resumability.mdx` with:
- Stable operation identifiers
- What gets persisted (8 entity types)
- How step completion is determined
- What happens on restart
- Idempotency patterns for VCS operations
- Best practices

## Resolution

All action items were either:
1. Already implemented
2. False positives based on outdated analysis
3. Already documented

No further work required.
