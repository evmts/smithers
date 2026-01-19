# State Issue: useState in useMutation.ts

## Location
- **File:** `src/reactive-sqlite/hooks/useMutation.ts`
- **Lines:** 71-72

## Issue
Uses `useState` for `isLoading` and `error` tracking:

```typescript
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState<Error | null>(null)
```

## Context
This is a library hook in `reactive-sqlite/` - a reusable abstraction. The CLAUDE.md rule is primarily about **orchestration state** (agent status, step indices, phase progress) that needs persistence.

## Assessment
**This is acceptable but could be improved.** The mutation loading/error state is:
- Ephemeral (short-lived during mutation)
- Not meaningful to persist
- Similar to React Query's mutation pattern

## Suggested Improvement (Optional)

For consistency, could use `useRef` + forceUpdate pattern like other components:

```typescript
export function useMutation<TParams extends any[] = any[]>(...): UseMutationResult<TParams> {
  // ... arg parsing ...
  
  const isLoadingRef = useRef(false)
  const errorRef = useRef<Error | null>(null)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  const mutate = useCallback(
    (...params: TParams) => {
      isLoadingRef.current = true
      errorRef.current = null
      forceUpdate()

      try {
        db.run(sql, params)
        if (invalidateTables) db.invalidate(invalidateTables)
        onSuccess?.()
      } catch (err) {
        errorRef.current = err as Error
        onError?.(err as Error)
      } finally {
        isLoadingRef.current = false
        forceUpdate()
      }
    },
    [db, sql, invalidateTables, onSuccess, onError]
  )

  return {
    mutate,
    mutateAsync,
    isLoading: isLoadingRef.current,
    error: errorRef.current,
  }
}
```

## Severity
Low - Library hook, ephemeral state, no persistence requirement.
