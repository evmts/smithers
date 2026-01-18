# Control Flow Components Not Implemented

## Status: FEATURE GAP

## Summary
The design documents describe `If`, `While`, and `Switch` components for conditional execution, but they are not implemented. Complex conditional workflows require workarounds.

## Impact
- No declarative conditional execution
- Must use Phase `skipIf` as workaround
- Complex workflows require imperative logic

## Design Location
- `issues/control-flow-components.md`

## Current Workaround
```tsx
// Instead of <If condition={...}>
<Phase skipIf={() => !condition}>
  <Claude prompt="..." />
</Phase>
```

## Suggested Implementation
1. Implement `<If>` component with condition prop
2. Implement `<While>` for conditional loops
3. Implement `<Switch>` for multi-branch logic
4. Add scoping mechanism for re-execution (per design doc)

## Priority
**P3** - Feature enhancement (post-MVP)

## Estimated Effort
5-7 days (per design doc)
