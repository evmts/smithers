# React key Not Accessible via Props

**Severity:** Medium
**File:** `src/reconciler/host-config.ts`, `src/reconciler/serialize.ts`
**Status:** Open

## Problem

The code assumes `key` can be stored via `setProperty(node, 'key', value)` and serialized, but **React does not pass `key` through as a prop**.

Therefore:
- `createInstance` won't see it in `props`
- `prepareUpdate`/`commitUpdate` won't see it
- `node.key` will remain `undefined` unless explicitly passed as a different prop

React's `key` is special and only used for reconciliation, never passed to components or host instances as props.

## Options

### Option 1: Read from fiber handle (not recommended)

Read from `internalHandle` (fiber) in `createInstance(type, props, root, hostContext, internalHandle)`:

```ts
createInstance(type, props, root, hostContext, internalHandle) {
  const node = createNode(type, props)
  if (internalHandle?.key != null) {
    node.key = String(internalHandle.key)
  }
  return node
}
```

⚠️ The reconciler README warns this is "bending the rules" and may change between React versions.

### Option 2: Use explicit prop (recommended)

Use an explicit prop for plan semantics (e.g., `planKey`, `iteration`, `id`) and serialize that:

```tsx
<Step planKey="validate-input">
  ...
</Step>
```

Keep React's `key` purely for reconciliation. This is more stable long-term.

## Recommendation

Use **Option 2** with an explicit prop. React's `key` is for React's internal use; plan semantics should use a separate, explicit property.

## References

- React Reconciler README on fiber handle: https://collected.press/github/facebook/react@453f5052569dafb52e82e875a8976cf348ed16d4/packages/react-reconciler/README.md
