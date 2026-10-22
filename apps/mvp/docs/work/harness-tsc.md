---
title: Fix harness cause test JSON narrowing
status: done
area: sdk
owner: Codex mini/harness-tsc
updated: 2026-10-22
links: [../../../../../packages/smithers/agent/harness/test/HarnessErrorCause.test.ts]
---

Uses the library catalog entry `@smthrs/harness` and its existing Effect Schema codec.
Decode the encoded JSON's object shape before reading its cause. Every existing assertion is retained; no production code or public API changed.

Validation on Node 26.5.0:

- Before: `pnpm --filter @smthrs/harness run check` failed with TS18047 and TS2339 at `HarnessErrorCause.test.ts:86`.
- After: the same full source/test typecheck passed (`tsc -b tsconfig.json && tsc -p tsconfig.test.json --noEmit`).
- `pnpm --filter @smthrs/harness exec vitest run --maxWorkers=2`: 67 files passed, 2 skipped; 2,478 tests passed, 3 skipped. Statements, branches, functions and lines each reached 100% coverage.
- `pnpm --filter @smthrs/harness exec dprint check test/HarnessErrorCause.test.ts`: passed after formatting.
- Codex Astra review: no findings; every assertion remains intact. Fable review was unavailable in this session.
- No docs sync or changeset needed: no public API changes. Separate workerd smoke, live evals and deployment were not run for this test-only fix.
