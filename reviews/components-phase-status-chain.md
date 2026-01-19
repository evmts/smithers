# Review: Phase.tsx - Overly Complex Status Ternary Chain

## File
[src/components/Phase.tsx](file:///Users/williamcory/smithers/src/components/Phase.tsx#L77-L84)

## Issue Description
Nested ternary chain is harder to read than alternatives:

```tsx
const status: 'pending' | 'active' | 'completed' | 'skipped' = isSkipped
  ? 'skipped'
  : isActive
    ? 'active'
    : isCompleted
      ? 'completed'
      : 'pending'
```

## Suggested Fix
Use a helper function or early returns for clearer logic:

```tsx
function getPhaseStatus(isSkipped: boolean, isActive: boolean, isCompleted: boolean): 'pending' | 'active' | 'completed' | 'skipped' {
  if (isSkipped) return 'skipped'
  if (isActive) return 'active'
  if (isCompleted) return 'completed'
  return 'pending'
}

const status = getPhaseStatus(isSkipped, isActive, isCompleted)
```
