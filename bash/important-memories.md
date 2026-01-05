# Important Memories

This file contains important learnings, decisions, and context from previous Ralph sessions.

## Architectural Decisions

### React 19 Async Rendering (2026-01-05)
- React 19 reconciler requires async handling - `renderPlan()` and `executePlan()` must be async
- **RenderFrame wrapper pattern**: To get React to re-evaluate on state changes, use a wrapper component that clones children on each render. Without this, useState updates don't trigger re-renders properly.
- See `src/core/execute.ts` for the implementation

### Execution State Keying Issue (Known Bug)
- `saveExecutionState`/`restoreExecutionState` currently use `contentHash` as the map key
- This causes identical `claude`/`subagent` nodes to collide - later restores mark all matching nodes as already executed
- **Fix needed**: Use stable per-node identity (path index or assigned id) as key, store `contentHash` inside the state
- Affected files: `src/core/execute.ts:328`, `src/core/execute.ts:347`

### Content Hashing Fragility (Known Bug)
- `computeContentHash` uses `JSON.stringify` on arbitrary prop values
- This throws for `BigInt`/circular refs and silently drops symbols/functions
- **Fix needed**: Use safe/stable serializer with try/catch and fall back to string tags for unsupported types
- Affected file: `src/core/execute.ts:401`

### Mock Executor JSON Detection (2026-01-05 - FIXED)
- **Problem**: Mock executor's regex for extracting JSON from prompts couldn't handle nested structures (arrays, nested objects)
- The regex `/\{[^}]*\}/` would stop at the first `}` character, even if it was inside a nested array like `{"issues":[]}`
- **Solution**: Implemented `extractJsonFromText()` helper that properly handles brace matching, string escaping, and validates JSON
- Affected file: `src/core/execute.ts:590-640`
- All 17/17 tests now pass

## Project History

- Originally named "Plue", renamed to "Smithers" on 2026-01-05
- Uses React reconciler with mutation mode for JSX → XML rendering
- Ralph Wiggum Loop: Agent runs repeatedly until all tasks complete

## What Works

- 17/17 tests passing
- Core reconciler renders JSX to XML correctly
- Async rendering with React 19
- State management with Zustand patterns documented

## What's Next (Priority Order)

1. Runtime Integration - Replace mock executor with real Claude SDK
2. Execution Semantics - Implement `<Task>` and `<Stop>` components
3. CLI UX + MDX support
4. Examples + Documentation refresh
5. Release readiness (changesets, npm publish)
