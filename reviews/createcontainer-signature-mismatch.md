# createContainer Signature Mismatch

**Severity:** Critical
**File:** `src/reconciler/root.ts`
**Status:** Fixed (4022633)

## Problem

The `createContainer` call uses an outdated signature. Current `react-reconciler` expects **10 arguments**, but the code passes only 8 with incorrect positioning:

```ts
fiberRoot = SmithersReconciler.createContainer(
  rootNode,
  0,
  null,
  false,
  null,
  '',
  (error: Error) => console.error('Smithers recoverable error:', error),
  null
)
```

This misalignment means:
- The "recoverable error" handler becomes `onUncaughtError`
- `onCaughtError` becomes `null`
- `onRecoverableError` becomes `undefined`
- Can crash when error paths try to call `onCaughtError`

## Correct Signature

From react-reconciler source:

```ts
createContainer(
  containerInfo,
  tag,
  hydrationCallbacks,
  isStrictMode,
  concurrentUpdatesByDefaultOverride,
  identifierPrefix,
  onUncaughtError,
  onCaughtError,
  onRecoverableError,
  transitionCallbacks
)
```

## Recommended Fix

Pass all required callbacks in correct slots:

```ts
fiberRoot = SmithersReconciler.createContainer(
  rootNode,
  0,      // or 1 for concurrent; see root-tag issue
  null,   // hydrationCallbacks
  false,  // isStrictMode
  null,   // concurrentUpdatesByDefaultOverride
  '',     // identifierPrefix
  (error: unknown) => console.error('Smithers uncaught error:', error),
  (error: unknown) => console.error('Smithers caught error:', error),
  (error: unknown) => console.error('Smithers recoverable error:', error),
  null    // transitionCallbacks
)
```

## References

- ReactFiberReconciler.js: https://collected.press/github/facebook/react@18eaf51bd51fed8dfed661d64c306759101d0bfd/packages/react-reconciler/src/ReactFiberReconciler.js
