<!-- SCOPE: easy -->

# Skipped Tests Reduction Progress - Further Work Needed

## Status: MEDIUM PRIORITY

## Summary
Progress made: 48 → 18 skipped tests (62% reduction). Most component test files now use interface/type testing instead of full JSX rendering tests. Remaining 18 skips are in eval tests and specific component edge cases requiring JSX reconciler test environment.

## Current State (Updated 2026-01-18)
```
✅ ~900+ pass (improved from 879)
⏭️  18 skip  (reduced from 48)
❌ Tests status to be verified
```

## Impact
- Reduced test coverage and confidence
- Hidden regressions may go undetected
- "Skip" becomes normalized, leading to more skips
- Contributors unsure if skipped tests are intentional or broken

## Breakdown by Root Cause

| Cause | Count | Fix |
|-------|-------|-----|
| Tests using wrong testing approach | ~7 | Use SmithersNode/XML serialization instead of DOM testing |
| "Solid JSX transform mismatch" | ~30 | Remove outdated comments, update to React |
| Integration import issues | ~10 | Fix `react-reconciler` resolution |
| SmithersCLI bun execution | 2 | Debug Bun spawn in tests |

## Files with Skipped Tests

### React Hooks (Need SmithersNode/XML Testing)
- `src/reactive-sqlite/hooks/context.test.tsx` - Use SmithersRoot.toXML() instead of DOM testing

### Component Tests (Solid Migration Artifacts)
- `src/components/Claude.test.tsx`
- `src/components/Review.test.tsx`
- `src/components/Ralph.test.tsx`
- `src/components/Git/Notes.test.tsx`
- `src/components/Git/Commit.test.tsx`
- `src/components/JJ/Commit.test.tsx`
- `src/components/JJ/Describe.test.tsx`
- `src/components/JJ/Status.test.tsx`
- `src/components/JJ/Snapshot.test.tsx`
- `src/components/JJ/Rebase.test.tsx`
- `src/components/Hooks/PostCommit.test.tsx`
- `src/components/Hooks/OnCIFailure.test.tsx`

### Eval Tests
- `evals/hello-world.test.tsx`
- `evals/renderer.test.tsx`
- `evals/execute-helpers.test.ts`
- `evals/components.test.tsx`

### Integration Tests
- `src/orchestrator/integration.test.ts`

### SmithersCLI Tests
- `src/orchestrator/components/agents/SmithersCLI.test.ts`
- `src/components/agents/SmithersCLI.test.ts`

## Suggested Approach

### Step 1: Use SmithersNode/XML Testing (NOT DOM)
This project uses a custom React reconciler that renders to SmithersNode trees, NOT DOM elements.
Do NOT add happy-dom or jsdom - they are fundamentally incompatible with this architecture.

Use SmithersRoot for testing:
```typescript
import { SmithersRoot } from '../reconciler/root'

const root = new SmithersRoot()
root.mount(<MyComponent />)
const xml = root.toXML()  // Assert on XML output
```

### Step 2: Batch Update Skip Comments
Search for "Solid JSX transform mismatch" and remove/update each occurrence. The components are React now.

### Step 3: Fix Integration Imports
Ensure `react-reconciler` is in `dependencies` (not just `devDependencies`) and check for circular imports.

### Step 4: Debug SmithersCLI Tests
These may need mock adjustments for Bun.spawn behavior in test environment.

## Priority
**P1** - Must fix before MVP. Zero skipped tests should be the goal.

## Estimated Effort
4-6 hours total across all fixes

## Success Criteria
```
✅ 900+ pass
⏭️  0 skip
❌ 0 fail
```
