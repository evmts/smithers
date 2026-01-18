# Root Tag / Concurrent Features Mismatch

**Severity:** Low
**File:** `src/reconciler/root.ts`
**Status:** Open

## Problem

The code passes `tag = 0` with a comment "Enable concurrent features", but in React reconciler sources:

- `LegacyRoot = 0`
- `ConcurrentRoot = 1`

If you want concurrent scheduling semantics, you should use `1`. If you want deterministic "legacy" synchronous behavior, keep `0` but update the comment.

## Current Code

```ts
fiberRoot = SmithersReconciler.createContainer(
  rootNode,
  0,  // Enable concurrent features <-- WRONG
  // ...
)
```

## Impact

- **Using `0`:** Legacy synchronous rendering, more predictable but doesn't use concurrent features
- **Using `1`:** Concurrent rendering with time-slicing, suspense, transitions, etc.

Concurrent mode assumptions:
- Some newer React behaviors assume concurrent roots
- Need to audit concurrency interactions carefully (especially with external effects)

## Recommended Fix

### Option 1: Use LegacyRoot (Recommended for orchestrator)

```ts
fiberRoot = SmithersReconciler.createContainer(
  rootNode,
  0,  // LegacyRoot: synchronous, deterministic rendering
  // ...
)
```

**Rationale:** For an orchestrator that triggers external effects, deterministic synchronous behavior is safer unless you've specifically audited concurrent interactions.

### Option 2: Use ConcurrentRoot (If you want concurrent features)

```ts
fiberRoot = SmithersReconciler.createContainer(
  rootNode,
  1,  // ConcurrentRoot: enables concurrent features
  // ...
)
```

**Requirements:**
- Audit effect timing for race conditions
- Ensure external operations handle interruption/restart
- Test with concurrent rendering patterns (Suspense, startTransition, etc.)

## Decision Criteria

Use **LegacyRoot (0)** if:
- You want predictable, synchronous rendering
- External effects should execute in order
- You haven't tested concurrent rendering scenarios

Use **ConcurrentRoot (1)** if:
- You need Suspense, transitions, or time-slicing
- You've audited effect timing and cancellation
- You want to leverage concurrent React features

## Recommendation

**Default to LegacyRoot** unless you have a specific need for concurrent features and have tested accordingly. Update the comment to match the choice.

## References

- ReactRootTags.js: https://collected.press/github/facebook/react@18eaf51bd51fed8dfed661d64c306759101d0bfd/packages/react-reconciler/src/ReactRootTags.js
