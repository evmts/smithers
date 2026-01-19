# Test Coverage Gap: Reconciler Hooks

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/reconciler/hooks.ts` | 147 | Medium |
| `src/reconciler/host-config.ts` | 304 | High |

## What Should Be Tested

### hooks.ts
- `useEffectOnce` - runs exactly once on mount
- `useMount` - callback invoked on mount
- `useUnmount` - callback invoked on unmount with latest ref
- `useFirstMountState` - returns true only first render
- `useMountedState` - returns function that tracks mount state
- `usePrevious` - returns previous value, undefined on first render
- `useEffectOnValueChange` - runs when value changes, idempotent

### host-config.ts
- `createInstance` - creates node with props
- `createTextInstance` - creates text node
- `appendChild/removeChild` - tree manipulation
- `prepareUpdate` - detects prop changes
- `commitUpdate` - applies prop updates
- `commitTextUpdate` - updates text content
- `clearContainer` - detaches all children

## Priority

**HIGH** - These are foundational primitives. The hooks are used throughout the codebase, and host-config is the React reconciler bridge.

## Test Approach

```typescript
// hooks.ts - use @testing-library/react-hooks or custom harness
import { renderHook } from './test-utils'

test('useEffectOnValueChange runs once per value', () => {
  const effect = mock()
  const { rerender } = renderHook(({ val }) => useEffectOnValueChange(val, effect), {
    initialProps: { val: 1 }
  })
  expect(effect).toHaveBeenCalledTimes(1)
  rerender({ val: 1 }) // same value
  expect(effect).toHaveBeenCalledTimes(1) // idempotent
  rerender({ val: 2 }) // new value
  expect(effect).toHaveBeenCalledTimes(2)
})

// host-config.ts - test node manipulation
test('appendChild adds child to parent', () => {
  const parent = rendererMethods.createElement('div')
  const child = rendererMethods.createElement('span')
  hostConfig.appendChild(parent, child)
  expect(parent.children).toContain(child)
  expect(child.parent).toBe(parent)
})
```

## Edge Cases Not Covered

- `useEffectOnValueChange` with object values (reference equality)
- `clearContainer` preserves array reference assertion
- Strict mode double-mount behavior
- Update priority handling in host-config
