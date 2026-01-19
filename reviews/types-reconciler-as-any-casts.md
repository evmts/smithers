# Type Safety Issue: `as any` casts in reconciler

## Files & Lines

- `src/reconciler/root.ts:96` - `if (result && typeof (result as any).then === 'function')`
- `src/reconciler/root.ts:107` - `fiberRoot = (SmithersReconciler.createContainer as any)(...)`
- `src/reconciler/root.ts:135` - `fiberRoot = (SmithersReconciler.createContainer as any)(...)`

## Issue

### Line 96: Promise detection
Uses `as any` to check for `.then` property. This is a valid pattern for duck-typing promises but could be typed better.

### Lines 107, 135: createContainer cast
The `@types/react-reconciler` package (0.32) has 8 parameters but runtime (0.33) has 10. This is a legitimate workaround for outdated types.

## Suggested Fix

### Line 96 - Type guard for thenable:
```typescript
function isThenable(value: unknown): value is Promise<ReactNode> {
  return value !== null && 
         typeof value === 'object' && 
         typeof (value as { then?: unknown }).then === 'function'
}

// Usage:
if (isThenable(result)) {
  element = await result
} else {
  element = result as ReactNode
}
```

### Lines 107, 135 - Document the cast:
```typescript
// @types/react-reconciler 0.32 has 8 params, runtime 0.33 has 10.
// Cast is required until types are updated.
fiberRoot = (SmithersReconciler.createContainer as (
  containerInfo: SmithersNode,
  tag: number,
  hydrationCallbacks: null,
  isStrictMode: boolean,
  concurrentUpdatesByDefaultOverride: null,
  identifierPrefix: string,
  onUncaughtError: (error: unknown) => void,
  onCaughtError: (error: unknown) => void,
  onRecoverableError: (error: unknown) => void,
  transitionCallbacks: null
) => FiberRoot)(
  rootNode, 0, null, false, null, '', handleFatalError, handleFatalError, 
  (error: unknown) => console.error('Smithers recoverable error:', error), null
)
```
