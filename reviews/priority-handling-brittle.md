# Priority Handling Uses Brittle Magic Numbers

**Severity:** High
**File:** `src/reconciler/host-config.ts`
**Status:** Open

## Problem

Priority methods return hard-coded `16`:

```ts
getCurrentEventPriority() { return 16 },
getCurrentUpdatePriority() { return 16 },
resolveUpdatePriority() { return 16 },
```

In current react-reconciler, event priorities map to **lanes** (bit positions), not arbitrary integers. For example, `DefaultEventPriority` maps to `DefaultLane` which is `0b...0100000` (= 32) in the referenced version.

The reconciler README explicitly recommends **importing constants** from `react-reconciler/constants` rather than hard-coding numbers, as lane bit positions can change across versions.

## Impact

- Incorrect scheduling behavior
- Priority inversion risks
- Breaks with reconciler version changes

## Recommended Fix

Implement a minimal priority model using imported constants:

```ts
import {
  DefaultEventPriority,
} from 'react-reconciler/constants'

let currentUpdatePriority = DefaultEventPriority

// In host config:
getCurrentEventPriority() {
  return DefaultEventPriority
},

getCurrentUpdatePriority() {
  return currentUpdatePriority
},

setCurrentUpdatePriority(newPriority) {
  currentUpdatePriority = newPriority
},

resolveUpdatePriority() {
  return currentUpdatePriority
},
```

Even without an event system, these need to be coherent to avoid surprising scheduling behavior.

## References

- React Reconciler README on priorities: https://collected.press/github/facebook/react@453f5052569dafb52e82e875a8976cf348ed16d4/packages/react-reconciler/README.md
- ReactEventPriorities.js: https://collected.press/github/facebook/react@18eaf51bd51fed8dfed661d64c306759101d0bfd/packages/react-reconciler/src/ReactEventPriorities.js
