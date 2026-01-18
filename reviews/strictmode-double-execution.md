# StrictMode Double-Effect Can Duplicate Agent Execution

**Severity:** Medium
**File:** `src/reconciler/hooks/index.ts`
**Status:** Open

## Problem

`useMount` and `useEffectOnce` are convenience wrappers around `useEffect(fn, [])`. However, in React StrictMode (development), mount effects are **intentionally double-invoked** (mount → cleanup → mount) to surface non-idempotent effects.

The current documentation implies `useMount` "runs exactly once", which is **not true under StrictMode**.

For orchestration that triggers real external work (Claude API calls, VCS operations, DB writes), this can cause:
- Duplicate API calls
- Double execution of agent tasks
- Unexpected side effects in development

## Impact

Development builds may execute critical operations twice:
- Claude tool calls
- Database writes
- External API requests
- File system operations

## Recommended Fixes

### 1. Use value-driven effects

For orchestration, prefer `useEffectOnValueChange` with explicit dependencies:

```ts
useEffectOnValueChange(iterationId, () => {
  // Only runs when iterationId changes
  executeAgent()
})
```

### 2. Add explicit idempotency guards

Record task IDs in database or use other mechanisms:

```ts
useMount(async () => {
  const taskId = generateTaskId()
  const alreadyExecuted = await checkTaskExecuted(taskId)
  if (!alreadyExecuted) {
    await executeAgent()
    await markTaskExecuted(taskId)
  }
})
```

### 3. Update documentation

Clarify that `useMount` follows React's StrictMode behavior and is not guaranteed to run exactly once in development:

```ts
/**
 * Runs an effect on component mount.
 *
 * Note: In React StrictMode (development), this will be called twice
 * (mount → cleanup → remount) to help detect non-idempotent effects.
 *
 * For orchestration that triggers external work, consider:
 * - useEffectOnValueChange with explicit dependencies
 * - Explicit idempotency guards (task IDs, etc.)
 */
export function useMount(effect: () => void | (() => void)): void
```

## Recommendation

For critical external operations:
1. Prefer **value-driven effects** over mount effects
2. Add **idempotency guards** at the application level
3. **Document StrictMode behavior** clearly in hook APIs

## References

- React StrictMode docs: https://react.dev/reference/react/StrictMode
