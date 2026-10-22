---
title: Fix harness replay and truncation boundaries
status: done
area: sdk
owner: Codex mini/fix-packages-smithers-agent-harness-src-466637
updated: 2026-10-21
links: [../../../../packages/smithers/agent/harness/src/CellTurn.ts]
---

Uses the library catalog entry `@smthrs/harness` for the existing durable cell loop. No new library or runtime.

- Clarify that the unmoved-tree demand needs a positive claim cap and an unsupported claim.
- Read recorded call settlements before dispatch, including timeouts and legacy settlements. Empty attempt markers preserve permission parks and durable waits outside record activities.
- Check command/script payloads for known truncated output even without declared writes.
- Drain final-frame parks on replay and grant an answered question one frame to process its answer.

Validation on Node 26.5.0:

- Before fixes: the focused documentation, timeout replay, final-frame replay and command/script write regressions produced five expected failures.
- `pnpm --filter @smthrs/harness exec vitest run --maxWorkers=2`: 2,475 passed, 3 skipped; 100% statements, branches, functions and lines.
- `pnpm --filter @smthrs/harness exec tsc -p tsconfig.test.json --noEmit`: passed.
- Scoped ESLint and dprint checks: passed.
- Astra review: no findings.
- E2e: not run (mini clone).

The offline install lacked `@astrojs/check` metadata; retrying `pnpm install --frozen-lockfile` succeeded.
