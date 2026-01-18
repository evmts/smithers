# React Hook Tests Need DOM Environment

## Status: HIGH PRIORITY

## Summary
Tests for React hooks (`useQuery`, `useMutation`) fail because the test environment lacks a DOM. React hooks require a browser-like environment to function.

## Impact
- 7 test failures in `src/reactive-sqlite/hooks/context.test.tsx`
- Cannot verify reactive database behavior works correctly
- Hook-based components untested

## Evidence
Tests run without DOM environment, breaking React hook setup in component context.

## Location
- `src/reactive-sqlite/hooks/context.test.tsx`
- `src/reactive-sqlite/hooks/hooks.ts`

## Suggested Fix
1. Add `happy-dom` or `jsdom` to test dependencies
2. Configure Bun test environment in `bunfig.toml`:
   ```toml
   [test]
   preload = ["happy-dom/global"]
   ```
3. Or wrap hook tests in a test renderer

## Priority
**P1** - Required for confident MVP

## Estimated Effort
1-2 hours
