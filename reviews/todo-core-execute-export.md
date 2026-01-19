# TODO: Core Execute Export Broken

## Location
- File: `src/core/index.ts`
- Line: 5-6

## TODO Comment
```typescript
// TODO: execute.ts was removed/moved - this export needs to be updated
// export { executePlan } from './execute.js'
```

## Context

The core module previously exported an `executePlan` function that has been removed or relocated. The commented-out export suggests:
- `execute.ts` was deleted during a refactor
- `executePlan` may have been moved to reconciler or another module
- The export is commented out rather than removed, indicating uncertainty

## Current Exports
```typescript
export { serialize } from '../reconciler/serialize.js'
export type { SmithersNode, ExecutionState, ExecuteOptions, ... }
```

## Recommended Actions

1. **Determine if `executePlan` is needed** - Check if any code imports it from `@smithers/core`
2. **Either restore or remove**:
   - If needed: locate the implementation and restore the export
   - If obsolete: remove the TODO and commented code

## Priority
**High** - Stale exports and dead code in the core module entry point. May cause import errors for consumers expecting `executePlan`.
