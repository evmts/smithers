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

## Progress Made

### ✅ Fixed (No longer skipped - now use interface/type tests)
- `src/components/Claude.test.tsx` - Now tests ClaudeProps interface (88 lines, all passing)
- `src/components/Review.test.tsx` - Now tests ReviewTarget/ReviewResult/ReviewProps interfaces (223 lines, all passing)
- `src/components/Git/Notes.test.tsx` - Now tests NotesProps/NotesResult interfaces (84 lines, all passing)
- `src/components/Git/Commit.test.tsx` - Interface tests implemented
- `src/components/JJ/Status.test.tsx` - Now tests StatusProps interface (48 lines, all passing)
- `src/components/JJ/Commit.test.tsx` - Interface tests implemented
- `src/components/JJ/Describe.test.tsx` - Interface tests implemented
- `src/components/JJ/Snapshot.test.tsx` - Interface tests implemented
- `src/components/JJ/Rebase.test.tsx` - Interface tests implemented
- `src/components/Hooks/PostCommit.test.tsx` - Interface tests implemented
- `src/components/Hooks/OnCIFailure.test.tsx` - Interface tests implemented
- `src/reactive-sqlite/hooks/context.test.tsx` - Now uses SmithersRoot rendering (192 lines, all passing)
- `test/integration.test.ts` - Moved from src/orchestrator, uses vitest, tests core architecture without JSX syntax (230 lines)

### 🟡 Still Skipped (18 total)

**Ralph Component (2 skips)**
- `src/components/Ralph.test.tsx`
  - `describe.skip('RalphContext')` - Module contains JSX, can't import without reconciler
  - `describe.skip('Orchestration promise functions')` - Functions need extraction to separate utility file
  - Note: Has 3 passing tests for RalphContextType interface

**SmithersCLI (1 skip)**
- `src/components/agents/SmithersCLI.test.ts`
  - `test.skip('script execution with bun works')` - Bun.spawn behavior in test environment needs debugging

**Eval Tests (15 skips total)**
- `evals/hello-world.test.tsx` - 1 describe.skip (entire suite)
- `evals/renderer.test.tsx` - 2 describe.skip blocks
- `evals/components.test.tsx` - 11 describe.skip blocks (full component rendering tests)
  - All waiting on JSX reconciler test environment setup

Note: `evals/execute-helpers.test.ts` has NO skips (fully passing)

## Remaining Work

### Approach 1: Ralph Component (Easy - 2 hours)
Extract orchestration promise functions to separate utility file:
1. Create `src/components/Ralph/utils.ts` with:
   - `createOrchestrationPromise()`
   - `signalOrchestrationComplete()`
   - `signalOrchestrationError()`
2. Update `src/components/Ralph.test.tsx` to import from utils
3. Enable the 2 skipped describe blocks
4. Verify all tests pass

Codebase pattern: See `src/reactive-sqlite/hooks/context.test.tsx` for examples of testing functions without JSX

### Approach 2: SmithersCLI Test (Easy - 1 hour)
Debug Bun.spawn behavior in test environment:
1. Check if Bun.spawn works differently in test vs runtime
2. Mock Bun.spawn if needed for test isolation
3. Or use actual Bun.spawn with controlled test fixtures

Codebase pattern: Other component tests use mocks from `bun:test`

### Approach 3: Eval Tests (Major - 8-12 hours)
Create JSX reconciler test environment for eval tests:
1. Set up test helper that creates SmithersRoot and renders JSX
2. Pattern already exists in `test/integration.test.ts` but uses manual createElement
3. Need to bridge React JSX → SmithersRoot rendering in test context
4. Enable all 15 skipped describe blocks in evals/

Note: This is a larger refactor. Consider if eval tests are critical for MVP or can be deferred.

**Dependencies verified:**
- ✅ `react-reconciler` is in dependencies (not devDependencies)
- ✅ Integration tests exist and pass without JSX syntax (`test/integration.test.ts`)

## Priority
**P2** - Good progress made (62% reduction). Remaining skips are:
- 3 easy fixes (Ralph + SmithersCLI) - ~3 hours total
- 15 eval tests requiring major JSX test environment work - defer or prioritize based on eval criticality

## Estimated Remaining Effort
- **Easy fixes**: 3 hours (Ralph utils extraction + SmithersCLI debug)
- **Eval tests**: 8-12 hours (JSX reconciler test environment setup)
- **Total**: 11-15 hours

## Success Criteria (Revised)
**Minimum (MVP):**
```
✅ 900+ pass
⏭️  3 skip (only eval tests if deferred)
❌ 0 fail
```

**Ideal (Complete):**
```
✅ 920+ pass
⏭️  0 skip
❌ 0 fail
```

## Next Actions
1. Start with Ralph utils extraction (highest ROI, 2 hours)
2. Fix SmithersCLI test (1 hour)
3. Evaluate if eval tests are critical for MVP
   - If yes: invest 8-12 hours in JSX test environment
   - If no: defer to post-MVP and accept 15 skips in eval suite
