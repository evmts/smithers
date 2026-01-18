## Scope: trivial

# Component Tests Skipped - PARTIALLY RESOLVED

## Status: LOW PRIORITY

## Summary
Component tests were migrated from Solid to React using a two-tier testing approach:
1. **Interface tests** (`src/components/*.test.tsx`) - Test TypeScript interfaces, props, and types
2. **Rendering tests** (`evals/01-basic-rendering.test.tsx`) - Test actual XML output via SmithersRoot

Legacy skipped tests remain in `evals/components.test.tsx` and `evals/renderer.test.tsx` but are redundant.

## Current Status

### RESOLVED - Component Interface Tests
All component interface tests are working and passing:
- `src/components/Claude.test.tsx` - 9 tests passing
- `src/components/Review.test.tsx` - 24 tests passing
- `src/components/Git/Commit.test.tsx` - 12 tests passing
- `src/components/Git/Notes.test.tsx` - tests passing
- `src/components/JJ/*.test.tsx` - all tests passing

These test TypeScript interfaces, prop validation, and callback behavior without JSX rendering.

### RESOLVED - Component Rendering Tests
Component rendering is tested in `evals/01-basic-rendering.test.tsx` which tests:
- Phase, Step, Claude, Stop, Human, Task, Persona, Constraints, Subagent components
- XML serialization and prop rendering
- Uses SmithersRoot.render() and toXML() approach

### REMAINING - Legacy Skipped Tests
Legacy test files with skipped tests (can be deleted or migrated):
- `evals/components.test.tsx` - 23 skipped tests (redundant - covered by 01-basic-rendering)
- `evals/renderer.test.tsx` - 13 skipped tests for renderPlan()
- `evals/hello-world.test.tsx` - 1 skipped test
- `src/components/Ralph.test.tsx` - 2 skipped tests (JSX import issue)

## Fix Strategy

### Option 1: Delete Redundant Tests (RECOMMENDED)
Delete `evals/components.test.tsx` and `evals/hello-world.test.tsx` since their coverage exists in `evals/01-basic-rendering.test.tsx` and other numbered eval tests.

### Option 2: Migrate Remaining Tests
1. Move any unique test cases from `evals/renderer.test.tsx` to appropriate eval files
2. Extract non-JSX functions from `Ralph.tsx` to enable testing (as noted in TODO comment)
3. Delete empty test shells

## Impact
- **Low** - Core component behavior is already tested via interface tests + rendering evals
- Missing tests are redundant or edge cases
- Ralph.test.tsx issue is architectural (JSX in module prevents import)

## Suggested Fix
1. Delete `evals/components.test.tsx` (redundant)
2. Delete `evals/hello-world.test.tsx` (redundant)
3. Review `evals/renderer.test.tsx` for unique edge cases, migrate or delete
4. Refactor Ralph.tsx to extract testable utilities (separate issue)

**Important:** This project uses SmithersRoot.render() and toXML() for testing. DO NOT add happy-dom, jsdom, or @testing-library.

## Priority
**P3** - Cleanup task, no functional gaps

## Estimated Effort
1-2 hours to cleanup redundant tests
