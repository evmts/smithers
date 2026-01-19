# Swallowed Error in Root Reconciler Promise.race

## File

- [src/reconciler/root.ts](file:///Users/williamcory/smithers/src/reconciler/root.ts#L125)

## Issue Description

The `mount` function swallows errors from `completionPromise`:

```typescript
await Promise.race([completionPromise.catch(() => {}), errorPromise])
```

This pattern is intentional for flow control (racing completion vs fatal error), but the empty catch hides any errors from the completion promise that aren't fatal errors.

## Context

This appears intentional: the `errorPromise` handles fatal errors, and `completionPromise` is expected to resolve normally. However, if `completionPromise` rejects with an unexpected error, it will be silently ignored.

## Suggested Fix

If the completion promise should never reject, consider logging unexpected rejections:

```typescript
await Promise.race([
  completionPromise.catch((err) => {
    console.warn('[SmithersRoot] Unexpected completion promise rejection:', err)
  }),
  errorPromise
])
```

Or if this is truly expected behavior, add a comment explaining why:

```typescript
// completionPromise rejection is handled by signalOrchestrationError - safe to ignore here
await Promise.race([completionPromise.catch(() => {}), errorPromise])
```
