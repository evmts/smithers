# JSX Runtime Bypasses React Reconciler

**Severity:** Critical
**File:** `src/reconciler/jsx-runtime.ts`
**Status:** Open

## Problem

The current JSX runtime implementation directly creates `SmithersNode` objects and calls function components directly, completely bypassing React's reconciler:

```ts
if (typeof type === 'function') {
  return type(props)  // Calls component directly, outside React render
}
```

This causes:
- React hooks execute outside the React render dispatcher → "Invalid hook call" errors
- Reconciler host config never gets called
- No reconciliation, diffing, or lifecycle management
- Fundamentally breaks the react-reconciler architecture

## Current Impact

If `jsxImportSource` points to this runtime, JSX compilation builds `SmithersNode` trees before React runs, making the reconciler completely ineffective.

## Recommended Fix

Delegate to React's JSX runtime:

```ts
// src/reconciler/jsx-runtime.ts
export { jsx, jsxs, Fragment } from 'react/jsx-runtime'
export { jsxDEV } from 'react/jsx-dev-runtime'
```

If you need a "static plan builder" that creates `SmithersNode` without React, create a separate module (e.g., `plan-jsx-runtime.ts`) and don't use it for the React render path.

## References

- React Reconciler README: https://collected.press/github/facebook/react@453f5052569dafb52e82e875a8976cf348ed16d4/packages/react-reconciler/README.md
