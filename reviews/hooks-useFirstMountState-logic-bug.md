# useFirstMountState Logic Bug

**File:** `src/reconciler/hooks.ts`  
**Lines:** 54-63

## Issue

The function has a logic error. After the first render, it returns `isFirst.current` which is always `false`. The intent is correct but the code is confusing and inefficient.

```typescript
export function useFirstMountState(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;  // First render: returns true
  }

  return isFirst.current;  // Always false - works but confusing
}
```

## Suggested Fix

Cleaner implementation:

```typescript
export function useFirstMountState(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }

  return false;  // Explicit false, not ref access
}
```

**Severity:** Low (functional but confusing)
