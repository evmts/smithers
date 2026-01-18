# Component Tests Skipped

## Status: MEDIUM PRIORITY

## Summary
Many component tests are skipped with "Solid JSX transform mismatch" comments. These are outdated - components were migrated from Solid to React but tests were disabled rather than updated.

## Impact
- Individual components not verified in isolation
- Claude.tsx, Review.tsx, Git/*, JJ/* components untested
- Confidence in component behavior is low

## Affected Files
- `src/components/Claude.test.tsx`
- `src/components/Review.test.tsx`
- `src/components/Git/*.test.tsx`
- `src/components/JJ/*.test.tsx`
- Various other component tests

## Suggested Fix
1. Update skipped tests to work with React (not Solid)
2. Remove Solid-specific test patterns
3. Use SmithersNode/XML testing (NOT React Testing Library - this project uses a custom reconciler)
4. Re-enable tests one by one

**Important:** Do NOT add happy-dom, jsdom, or @testing-library - this project uses a custom React reconciler that renders to SmithersNode, not DOM. Use `SmithersRoot.mount()` and `toXML()` for testing.

## Priority
**P2** - Important for confidence but not blocking

## Estimated Effort
4-6 hours
