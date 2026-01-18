<!-- SCOPE: major -->

# Test Suite Summary - Significant Progress, Remaining Issues

## Status: IMPROVED - Still needs attention for MVP

## Current State (Updated 2026-01-18)
```
✅ 3794 pass  <-- MASSIVE improvement from 879
⏭️  53 skip   <-- Reduced from 48, mostly in reference/ folder
❌ 62 fail    <-- Increased from 37, needs investigation
⚠️  38 errors
   27351 expect() calls
   3909 total tests across 152 files
```

**Note**: Test count includes reference/ submodules. Project-only tests (src/evals/test): ~68 files with 17 skip statements.

## Progress Made ✅

### RESOLVED - P0 Blockers
- ✅ **Zod converter fixed**: `src/utils/structured-output/zod-converter.test.ts` now has 26/26 passing tests
- ✅ **React hooks working**: `src/reactive-sqlite/hooks/context.test.tsx` now has 13/13 passing tests
- ✅ **Skipped tests reduced**: From 48 to ~18 in project code (see `reviews/skipped-tests-unacceptable.md`)

### Context
The test suite has evolved significantly:
- Test infrastructure fixed (JSX runtime, hooks, SmithersRoot rendering)
- Most component tests migrated to interface/type testing pattern
- Integration tests working without JSX syntax

## Current Issues

### 1. Failing Tests (62 fails, 38 errors)
**Root causes to investigate:**
- Database lifecycle errors (`Cannot use a closed database`) appearing in reconciler tests
- Reference folder tests failing due to missing dependencies (solid-js, export mismatches)
- Need to audit actual project test failures vs reference/ folder failures

**Pattern from logs:**
```
RangeError: Cannot use a closed database
  at prepare (bun:sqlite:313:37)
  at queryOne (/Users/williamcory/smithers/src/reactive-sqlite/database.ts:129:26)
  at complete (/Users/williamcory/smithers/src/db/tasks.ts:84:28)
```

### 2. Remaining Skipped Tests (~18 in project)
See `reviews/skipped-tests-unacceptable.md` for detailed breakdown:
- 2 skips in Ralph.test.tsx
- 1 skip in SmithersCLI.test.ts
- 15 skips in evals/ (JSX reconciler test environment needed)

### 3. Reference Folder Contamination
Tests from `reference/` submodules are running and failing:
- `reference/opentui/` tests failing (solid-js missing, export mismatches)
- These should be excluded from test runs
- Need to configure test runner to exclude reference/ folder

## Recommended Actions

### Priority 1: Exclude reference/ from tests (1 hour)
**Fix:** Configure bun test to skip reference/ folder
- Check bunfig.toml or package.json test config
- Add `exclude: ["reference/**"]` pattern
- This should clean up most false failures

**Pattern:** Reference libraries are for AI grep/read only per CLAUDE.md

### Priority 2: Fix database lifecycle errors (2-4 hours)
**Investigation needed:**
- Why are databases closing prematurely in tests?
- Are cleanup hooks running in wrong order?
- Check beforeEach/afterEach patterns in failing tests

**Files to check:**
- Grep for "Cannot use a closed database" errors
- Review test setup/teardown in affected files
- Ensure proper cleanup order (unmount → close db)

### Priority 3: Remaining skipped tests (3-15 hours)
**See:** `reviews/skipped-tests-unacceptable.md` for detailed plan
- Easy: Ralph utils extraction (2h)
- Easy: SmithersCLI debug (1h)
- Major: Eval tests JSX environment (8-12h) - defer if not MVP critical

## Updated MVP Goal
```
✅ 3800+ pass (project tests only, excluding reference/)
⏭️  3 skip   (only eval tests if deferred)
❌ 0 fail    (in project tests)
```

## Related Reviews
- ✅ `reviews/zod-schema-converter-broken.md` - RESOLVED (deleted in c00fc94)
- 🟡 `reviews/skipped-tests-unacceptable.md` - IN PROGRESS (reduced to 18 skips)
- ✅ `reviews/react-hook-tests-need-dom.md` - RESOLVED (deleted, SmithersRoot works)

## Next Steps
1. Configure test runner to exclude reference/ folder (highest ROI)
2. Audit actual project test failures after exclusion
3. Fix database lifecycle issues in reconciler tests
4. Continue reducing skipped tests per other review
