# Missing isClosed Checks

## Files
- [src/db/artifacts.ts](file:///Users/williamcory/smithers/src/db/artifacts.ts#L30-L46)
- [src/db/execution.ts](file:///Users/williamcory/smithers/src/db/execution.ts#L38-L93)
- [src/db/phases.ts](file:///Users/williamcory/smithers/src/db/phases.ts#L26-L62)
- [src/db/human.ts](file:///Users/williamcory/smithers/src/db/human.ts#L50-L94)
- [src/db/memories.ts](file:///Users/williamcory/smithers/src/db/memories.ts#L29-L112)
- [src/db/render-frames.ts](file:///Users/williamcory/smithers/src/db/render-frames.ts#L67-L139)

## Issue
Other modules (agents.ts, steps.ts, tasks.ts, tools.ts, state.ts, vcs.ts) check `rdb.isClosed` before operations and return early/default values. The listed modules lack these guards.

## Impact
- Attempting DB operations after close will throw
- Inconsistent behavior across modules

## Suggested Fix
Add `if (rdb.isClosed) return ...` guards matching the pattern in agents.ts:

```typescript
// artifacts.ts - add to add() and list()
add: (...) => {
  if (rdb.isClosed) return uuid()  // or throw
  ...
}
list: (...) => {
  if (rdb.isClosed) return []
  ...
}

// Similar for execution, phases, human, memories, render-frames
```
