# Unhandled Promise Rejections in Async IIFEs

## Files Affected

- [src/components/SmithersProvider.tsx](file:///Users/williamcory/smithers/src/components/SmithersProvider.tsx#L648-L665) (useUnmount cleanup)

## Issue Description

The unmount cleanup in SmithersProvider has an async IIFE without `.catch()`:

```typescript
useUnmount(() => {
  // ...
  ;(async () => {
    try {
      const execution = await props.db.execution.current()
      // ...
    } catch (error) {
      console.error('[SmithersProvider] Cleanup error:', error)
      props.onError?.(error as Error)
    }
  })()
  // ...
})
```

While there's a try/catch inside, if the async IIFE itself throws before reaching the try block, it would be unhandled. The current code looks safe, but the pattern is fragile.

## Suggested Fix

Add `.catch()` to the async IIFE for defense in depth:

```typescript
useUnmount(() => {
  // ...
  ;(async () => {
    try {
      const execution = await props.db.execution.current()
      // ...
    } catch (error) {
      console.error('[SmithersProvider] Cleanup error:', error)
      props.onError?.(error as Error)
    }
  })().catch((err) => {
    console.error('[SmithersProvider] Unexpected cleanup error:', err)
  })
  // ...
})
```

This adds a safety net without changing behavior.
