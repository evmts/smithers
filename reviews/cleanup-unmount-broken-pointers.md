# Cleanup/Unmount Leaves Broken Parent Pointers

**Severity:** Medium
**File:** `src/reconciler/root.ts`, `src/reconciler/methods.ts`
**Status:** Open

## Problem

In `mount()`, the code clears `rootNode.children` before React's unmount completes:

```ts
SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
rootNode.children = []
```

When React's unmount commit calls `removeChildFromContainer(container, child)`, your `removeNode` does `indexOf` in `container.children`. But you've already cleared it, so:
- Children won't be found in the array
- Won't detach them properly
- Old nodes left with `parent` still pointing at `ROOT`

This creates **stale parent pointers** that can cause issues if nodes are reused or inspected.

## Impact

- Memory leaks (nodes retain parent references)
- Broken tree invariants
- Potential issues if unmounted nodes are reused

## Recommended Fixes

### Option 1: Flush Unmount Before Clearing (Preferred)

Let React drive removals, then clear:

```ts
SmithersReconciler.flushSync(() => {
  SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
})
// Now rootNode.children should already be empty if removeChildFromContainer works
```

### Option 2: Improve clearContainer

Make `clearContainer` fully consistent and let React call it:

```ts
clearContainer(container: Container): void {
  for (const child of container.children) {
    child.parent = null
  }
  container.children.length = 0  // Use length=0 to preserve array reference
}
```

Note: Use `length = 0` rather than `container.children = []` to preserve references if anything else holds that array.

### Option 3: Fix removeNode to Always Clear Parent

```ts
removeNode(parent: SmithersNode, node: SmithersNode): void {
  const idx = parent.children.indexOf(node)
  if (idx !== -1) parent.children.splice(idx, 1)

  // Always clear parent pointer if parent matches current
  if (node.parent === parent) node.parent = null
}
```

## Recommendation

Implement **all three options**:
1. Use `flushSync` to ensure React completes unmount before manual cleanup
2. Improve `clearContainer` to properly detach all children
3. Make `removeNode` more defensive about clearing parent pointers

This creates defense-in-depth for proper cleanup.

## Related Issues

See also: `insertnode-reordering.md` for related parent pointer management issues.
