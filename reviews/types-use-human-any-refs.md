# Type Safety Issue: `any` in useHuman hook

## Files & Lines

- `src/hooks/useHuman.ts:50` - `const resolveRef = useRef<((value: any) => void) | null>(null)`
- `src/hooks/useHuman.ts:81` - `resolveRef.current = resolve as (value: any) => void`

## Issue

The `resolveRef` uses `any` for the value type, losing type safety for the promise resolution.

## Suggested Fix

Use `unknown` and let consumers narrow the type:

```typescript
// Line 50
const resolveRef = useRef<((value: unknown) => void) | null>(null)

// Line 81 - the cast is needed because Promise<T> expects T, but we're storing a generic resolver
resolveRef.current = resolve as (value: unknown) => void
```

The `ask<T>` generic on line 78 already provides type safety for callers - the internal implementation just needs to handle the generic resolution.
