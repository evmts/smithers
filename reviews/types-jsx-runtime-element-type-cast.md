# Type Safety Issue: Type assertions in jsx-runtime

## Files & Lines

- `src/reconciler/jsx-runtime.ts:28` - `return reactJsx(type as React.ElementType, ...)`
- `src/reconciler/jsx-runtime.ts:36` - `return reactJsxs(type as React.ElementType, ...)`
- `src/reconciler/jsx-runtime.ts:47` - `return reactJsxDEV(type as React.ElementType, ...)`

## Issue

The JSX runtime casts `ReactJSX.ElementType` to `React.ElementType`. These are compatible types, but the cast could hide issues if the types diverge.

## Suggested Fix

This is a low-risk cast between equivalent types. However, it could be made safer:

```typescript
import type { ElementType } from 'react'
import type { JSX as ReactJSX } from 'react'

// Type assertion function with runtime check (optional)
function asElementType(type: ReactJSX.ElementType): ElementType {
  return type as ElementType
}

export function jsx(
  type: ReactJSX.ElementType,
  props: Props,
  key?: React.Key
) {
  return reactJsx(asElementType(type), withSmithersKey(props, key), key)
}
```

Or simply add a comment explaining the cast is safe because `ReactJSX.ElementType` is assignable to `React.ElementType`.
