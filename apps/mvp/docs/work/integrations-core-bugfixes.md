---
title: Integration core safety and durability fixes
status: done
area: integrations
owner: codex-mini-integrations-core
updated: 2026-10-22
links: []
---

Reproduce and fix the six supplied core findings: decoder log privacy, authorization endpoint transport, notification coalescing, PKCE Effect boundaries, durable polling, and transitive version ordering.

Library catalog entries: `@smthrs/integrations` for provider boundaries and `@smthrs/flow` for durable actions and timers. Validation stays in this clone; no Playwright, pushes, or main movement.


All six findings reproduced and fixed. Before fixes, the focused core regressions
had 11 failing cases, and the additional total-order property test also failed.
The schema-error logging case was already safe with the tested logger; the raw
exception case demonstrated the leak, and both logging paths now omit errors.

Changes: remote authorization requires HTTPS (loopback HTTP remains supported);
uncorrelated notifications omit coalescing keys; PKCE helpers are lazy Effects
with recoverable validation errors and all callers migrated; decimal versions
sort before opaque versions; polling journals each phase and uses durable timers.
The polling API now takes intervalMs/maxTurns and IntegrationError callbacks;
its old local schedule implementation is deleted. This is recorded as a major
package change. No device-persisted app schema changed.

Validation on Node 26.5.0 after frozen offline installation:

- `pnpm --filter @smthrs/integrations exec vitest run --maxWorkers=2`: 857 passed,
  4 skipped (credential-gated live tests). Coverage thresholds passed: branches
  100%, statements and lines 99.95%, functions 99.85%. The existing uncovered
  SourceStore PostgreSQL search arm remains outside this SQLite run.
- The SQLite restart test stops after handling and before committing the cursor;
  a reopened engine reuses the poll and handler receipts. TestClock checks the
  durable default interval without sleeping.
- `pnpm --filter @smthrs/integrations exec tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm --dir apps/mvp exec tsc --noEmit`: baseline and final passed.
- `pnpm --dir apps/mvp exec vitest run worker/SignIn.test.ts`: baseline 38 passed,
  5 failed; final 42 passed, 1 failed. The remaining return-path timeout also
  failed before; zero newly failing cases. Baseline failures were timeouts and
  a Postgres connection timeout.
- Both `//packages/smithers/agent/integrations:importRules` and
  `//apps/mvp:importRules` passed. API projection and target index regenerated.
- E2E: not run (mini clone).

Astra review: no findings. Fable review unavailable in this session's review models.
No push or main movement; one local commit and the requested mini bookmark only.
