# OnCIFailure: children render prop doesn't receive failure object

## Status
Closed

## Description
Docs show {(failure) => ...} pattern but impl only accepts ReactNode

## Resolution
The render prop pattern was already implemented. The children type is:
```typescript
children: ReactNode | ((failure: CIFailure) => ReactNode)
```

Lines 303-308 in OnCIFailure.tsx handle the render prop:
```typescript
if (typeof props.children === 'function') {
  return props.children(currentFailure)
}
```

Tests in OnCIFailure.test.tsx (lines 691-907) verify both patterns work.

## Files
- docs/components/hooks.mdx
- src/components/Hooks/OnCIFailure.tsx
- src/components/Hooks/OnCIFailure.test.tsx

## Tasks
- [x] Implement render prop or update docs
