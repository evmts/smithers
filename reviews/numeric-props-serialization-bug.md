# Numeric Props Serialization Bug

**⚠️ COMPLEX ISSUE - Debug in isolation before attempting fix**

## Problem

When running `bun examples/task-management-audit/index.tsx`, intrinsic JSX elements get garbage numeric props that spell out their type name:

```xml
<ralph 0="r" 1="a" 2="l" 3="p" 4="h" iteration="0" maxIterations="1">
  <phase 0="p" 1="h" 2="a" 3="s" 4="e" name="Worktree Audit" status="active">
    <phase-content 0="p" 1="h" 2="a" 3="s" 4="e" 5="-" 6="c" ...>
```

The pattern `0="r" 1="a" 2="l" 3="p" 4="h"` is the result of spreading a string:
```typescript
Object.entries("ralph") // → [["0","r"], ["1","a"], ["2","l"], ["3","p"], ["4","h"]]
```

## Reproduction

```bash
bun examples/task-management-audit/index.tsx
```

## Key Observations

1. **Works via inline execution**: `bun -e "..."` with identical JSX works perfectly
2. **Works when importing components**: Importing example components into inline test works
3. **Only fails on direct file execution**: `bun examples/.../index.tsx` shows the bug
4. **createInstance receives correct props**: Debug logging in host-config never triggered
5. **Nodes have bad props at serialize time**: Debug in serializer confirms numeric props exist

## Hypothesis

Mismatch between JSX transform configurations:
- `babel.config.json`: `importSource: "smithers-orchestrator/jsx"`
- `tsconfig.json`: `jsxImportSource: "react"`
- `examples/` is excluded from tsconfig

Bun may be using different JSX transform for files in `examples/` vs `src/`.

## Files with Debug Code

Remove debug code after fixing:
- `src/reconciler/host-config.ts` - Lines 57-61 (numeric props check)
- `src/reconciler/serialize.ts` - Lines 116-122 (numeric props check)

## Success Criteria

1. `bun examples/task-management-audit/index.tsx` runs without numeric prop garbage
2. Output XML is clean:
   ```xml
   <ralph iteration="0" maxIterations="1">
     <phase name="Worktree Audit" status="active">
   ```
3. All 4 phases render and execute in sequence
4. Example completes e2e without errors

## Testing Notes

If `reviews/`, `issues/`, or worktrees don't exist at runtime, create minimal test data:
- Add a simple issue like `issues/test-delete-comment.md` with content "Delete a comment in src/index.ts"
- Create a worktree: `bun scripts/worktree.ts --create "test cleanup task"`
- This ensures the audit has something to process

## Investigation Checklist

- [ ] Rename/remove `babel.config.json` temporarily - does bug disappear?
- [ ] Add explicit JSX config to `bunfig.toml`
- [ ] Check if Bun has module caching affecting the transform
- [ ] Trace Bun's actual JSX transform for `examples/` files
- [ ] Check if custom jsx-runtime is being loaded for example files
- [ ] Verify React reconciler is receiving correct props from JSX

## Related Files

- `examples/task-management-audit/` - The example being debugged
- `src/reconciler/host-config.ts` - React reconciler host configuration
- `src/reconciler/serialize.ts` - SmithersNode→XML serializer
- `src/reconciler/jsx-runtime.ts` - Custom JSX runtime
- `babel.config.json` - Babel JSX config (possibly conflicting)
- `tsconfig.json` - TypeScript JSX config
