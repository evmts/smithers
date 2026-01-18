# Missing Host Config Fields

**Scope:** trivial
**Severity:** Medium
**File:** `/Users/williamcory/smithers/src/reconciler/host-config.ts`
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

## Current State

The host config already has most capability flags:
- ✅ `supportsMutation: true` (line 29)
- ✅ `supportsPersistence: false` (line 30)
- ✅ `supportsHydration: false` (line 31)
- ✅ `supportsMicrotasks: true` (line 236)
- ✅ Has React 19 resource methods (`resetFormInstance`, `requestPostPaintCallback`, etc. - lines 260-284)

Still missing:
- `warnsIfNotActing` - optional boolean flag (controls test warnings)
- `supportsResources` - capability flag for React 19 resources
- `supportsSingletons` - capability flag for React 19 singletons

Note: `resolveEventType`, `resolveEventTimeStamp`, `HostTransitionContext`, `bindToConsole` are likely internal/undocumented fields not in `@types/react-reconciler@0.28.9` and may not be needed for React 19.0.0 / react-reconciler@0.32.0.

## Recommended Fix

Add missing capability flags to host config object (after line 32):

```ts
const hostConfig = {
  // Core configuration
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  // Optional capability flags
  warnsIfNotActing: false,  // Don't warn about missing act() - we're not DOM
  supportsResources: false, // No resource loading/preloading
  supportsSingletons: false, // No singleton instances

  // ... rest of config
}
```

This makes capabilities explicit rather than relying on `undefined` checks.

## Implementation Steps

1. Add three missing capability flags to host config object (after line 32):
   - `warnsIfNotActing: false`
   - `supportsResources: false`
   - `supportsSingletons: false`

2. Run `bun run typecheck` to verify no type errors

3. Run `bun test src/reconciler` to verify tests still pass

This is a trivial change - just adding three boolean properties. No logic changes needed.

## References

- ReactFiberConfig.custom.js: https://collected.press/github/facebook/react@3ed64f8232d0709f93f096c6fb9f7a16865b0ff5/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js
- ReactFiberConfigWithNoResources.js: https://collected.press/github/facebook/react@18eaf51bd51fed8dfed661d64c306759101d0bfd/packages/react-reconciler/src/ReactFiberConfigWithNoResources.js
