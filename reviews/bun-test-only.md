# Use bun:test only (remove vitest usage)
Priority: HIGH

## Evidence
- `test/cli.test.ts` and `test/integration.test.ts` import `vitest`.
- `test/setup.ts` imports `vitest`.
- `package.json` has no `vitest` dependency and `bun run test` only runs `src/`.

## Problem
- Tests under `test/` are either not executed locally or will fail in CI due to missing `vitest`, contradicting the "bun test only" policy.
- Coverage is silently reduced because CLI/integration tests live outside `src/`.

## Impact
- Regressions in CLI/integration behavior can slip through because the tests are not reliably executed.

## Recommendation
- Migrate all `test/` suites to `bun:test` (`import { describe, test, expect } from 'bun:test'`).
- Ensure root `bun test` runs them (avoid `cd src` in `package.json`).
- Remove any `vitest`-specific helpers/usages in `test/setup.ts`.

## References
- `test/cli.test.ts`
- `test/integration.test.ts`
- `test/setup.ts`
- `package.json`
