# Missing Host Config Fields

**Severity:** Medium
**File:** `src/reconciler/host-config.ts`
**Status:** Open

## Problem

The `react-reconciler` npm bundle uses a shim (`ReactFiberConfig.custom.js`) that expects a large set of exports from the host config. Several are missing:

- `warnsIfNotActing`
- `resolveEventType`
- `resolveEventTimeStamp`
- `HostTransitionContext`
- `bindToConsole`
- Optional capability blocks (resources, singletons, etc.)

Depending on which `react-reconciler` build is used, this can range from "fine" to "fails when a codepath assumes they exist".

## Impact

- Potential runtime errors when reconciler tries to access missing exports
- Ambiguous capability detection (undefined vs explicitly false)
- Compatibility issues across reconciler versions

## Recommended Fix

Audit host config against the pinned `react-reconciler` version:

1. **Start from the shim's export list** and stub everything not supported with safe defaults
2. **Explicitly set optional capability flags** to `false` rather than relying on `undefined`:

```ts
export const supportsResources = false
export const supportsSingletons = false
export const supportsMutation = true
export const supportsPersistence = false
export const supportsHydration = false
```

3. **Use React's internal stubs as guidance** on what should throw vs no-op (e.g., "WithNoResources/WithNoX" patterns)

## Workflow

1. Check `node_modules/react-reconciler/src/forks/ReactFiberConfig.custom.js`
2. List all expected exports
3. Add stubs for any missing exports with appropriate defaults
4. Test that reconciler doesn't crash on code paths that check these fields

## References

- ReactFiberConfig.custom.js: https://collected.press/github/facebook/react@3ed64f8232d0709f93f096c6fb9f7a16865b0ff5/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js
- ReactFiberConfigWithNoResources.js: https://collected.press/github/facebook/react@18eaf51bd51fed8dfed661d64c306759101d0bfd/packages/react-reconciler/src/ReactFiberConfigWithNoResources.js
