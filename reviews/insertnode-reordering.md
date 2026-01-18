# insertNode Doesn't Support Reordering

**Severity:** Critical
**File:** `src/reconciler/methods.ts`
**Status:** Open

## Problem

React uses `insertBefore` for both **insertions and reordering**. The reconciler README explicitly states it must be able to "reposition an existing child", similar to the DOM.

Current implementation problems:

```ts
insertNode(parent, node, anchor?) {
  node.parent = parent
  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx !== -1) {
      parent.children.splice(idx, 0, node)
      return
    }
  }
  parent.children.push(node)
}
```

Issues:
1. If `node` is already in `parent.children`, this **duplicates** it instead of moving it
2. If `node.parent` is another parent, doesn't remove from old parent → node exists in **two parents**
3. `removeNode` only nulls `node.parent` when `idx >= 0`; if array mutated elsewhere, stale parent pointers remain

## Recommended Fix

Enforce DOM-like invariants:
- A node has at most one parent
- A parent's children array contains a node at most once
- `insertBefore` moves if already present

```ts
insertNode(parent: SmithersNode, node: SmithersNode, anchor?: SmithersNode): void {
  // Detach from old parent (if any)
  const oldParent = node.parent
  if (oldParent) {
    const oldIdx = oldParent.children.indexOf(node)
    if (oldIdx !== -1) oldParent.children.splice(oldIdx, 1)
  }

  node.parent = parent

  // Remove if already present in new parent (defensive)
  const existingIdx = parent.children.indexOf(node)
  if (existingIdx !== -1) parent.children.splice(existingIdx, 1)

  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx !== -1) {
      parent.children.splice(idx, 0, node)
      return
    }
  }

  parent.children.push(node)
}
```

Also update `removeNode`:

```ts
removeNode(parent: SmithersNode, node: SmithersNode): void {
  const idx = parent.children.indexOf(node)
  if (idx !== -1) parent.children.splice(idx, 1)

  // Always clear parent pointer if parent matches current
  if (node.parent === parent) node.parent = null
}
```

## References

- React Reconciler README on insertBefore: https://collected.press/github/facebook/react@453f5052569dafb52e82e875a8976cf348ed16d4/packages/react-reconciler/README.md
