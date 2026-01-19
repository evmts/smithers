# usePrevious Missing Dependency Array

**File:** `src/reconciler/hooks.ts`  
**Lines:** 105-113

## Issue

The `useEffect` has no dependency array, causing it to run on every render. While functionally correct for this use case, it's inefficient and violates React best practices.

```typescript
export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  });  // ← Missing dependency array

  return ref.current;
}
```

## Suggested Fix

Add `[state]` dependency:

```typescript
export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  }, [state]);  // Only update when state changes

  return ref.current;
}
```

**Severity:** Medium (performance, lint violation)
