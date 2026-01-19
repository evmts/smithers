# API Inconsistency: null vs undefined for absent values

## Files Involved
- `src/db/execution.ts` - uses `| null`
- `src/db/phases.ts` - uses `| null`
- `src/db/steps.ts` - uses `| null`
- `src/db/agents.ts` - uses `| null`
- `src/reconciler/hooks.ts` - uses `| undefined` (e.g., `usePrevious<T>(): T | undefined`)
- `src/utils/vcs/git.ts` - mixes both (`getCurrentBranch(): Promise<string | null>`)
- `src/reactive-sqlite/hooks/useQueryValue.ts` - returns `T | null`

## Inconsistency Description

The codebase mixes `null` and `undefined` for absent/optional values:

**Database layer** → consistently uses `| null`:
```typescript
get: (id: string): Execution | null
current: (): Phase | null
```

**Reconciler hooks** → uses `| undefined`:
```typescript
usePrevious<T>(state: T): T | undefined
```

**Git utilities** → mixes both:
```typescript
getCurrentBranch(): Promise<string | null>  // null for error case
getGitNotes(): Promise<string | null>       // null for not found
```

**Reactive hooks** → returns `| null`:
```typescript
useQueryValue<T>(): { data: T | null }
```

## Suggested Standardization

1. **Database layer**: Keep `null` - represents SQL NULL, semantically correct
2. **React hooks returning data**: Use `null` to align with DB layer
3. **React hooks for previous values**: Use `undefined` (first render has no previous)
4. **Async operations**: Use `null` for "not found", throw for errors

Decision rule:
- `null` = explicit "no value" (from DB, not found, intentionally empty)
- `undefined` = "not yet available" (first render, uninitialized)
