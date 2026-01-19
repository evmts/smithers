# useEffectOnValueChange Stale Closure Risk

**File:** `src/reconciler/hooks.ts`  
**Lines:** 132-147

## Issue

The `effect` callback is not included in the dependency array, creating a stale closure. If the caller passes a new effect function on re-render, the old one will still be called.

```typescript
export function useEffectOnValueChange<T>(
  value: T,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  const lastValueRef = useRef<T | typeof UNSET>(UNSET);

  useEffect(() => {
    if (lastValueRef.current !== UNSET && Object.is(lastValueRef.current, value)) {
      return;
    }
    lastValueRef.current = value;
    return effect();  // ← May be stale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ...deps]);  // ← effect not included
}
```

## Suggested Fix

Use a ref to always call the latest effect:

```typescript
export function useEffectOnValueChange<T>(
  value: T,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  const lastValueRef = useRef<T | typeof UNSET>(UNSET);
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    if (lastValueRef.current !== UNSET && Object.is(lastValueRef.current, value)) {
      return;
    }
    lastValueRef.current = value;
    return effectRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ...deps]);
}
```

**Severity:** High (stale closure bug)
