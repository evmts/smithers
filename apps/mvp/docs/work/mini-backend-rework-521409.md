---
title: Rework backend safety fix 0ae96a044a97
status: done
area: cli
owner: codex-mini-521409
updated: 2026-10-22
links: [../../../../packages/smithers/test/BackendSafety.test.ts]
---

Reapply the bounced backend fix on main, keeping main's Effect fault-service
HTTP harness and safety regressions. Use the existing CLI transport and the
library catalog's platform-node process service. No library is added.

Preserve concurrent assignees and flow input values, cancel artifact writes and
connecting terminals, bound captured SSH output without retaining streamed
output, and refuse credential export and unmanaged agent execution. SSH readiness
is one request; durable callers own retries. Keep main's secret and history docs.

Validation on Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

- Before the production change, the 11 added safety cases give 10 failures and
  one pass. Afterward, the combined `BackendSafety.test.ts` passes all 30 cases,
  retaining main's 19 cases and its Effect fault-service harness. The new cases
  use real HTTP, WebSocket and OpenSSH, with condition waits and no mocks.
- `pnpm exec tsc --noEmit` passes in packages/smithers and in apps/mvp; the app
  passes both before and after the change. Source ESLint passes.
- The complete CLI suite (`vitest run --coverage.enabled=false`) was attempted
  twice. Disk exhaustion prevented a successful run: test directories, compiled
  modules and the build runner's local socket fail with ENOSPC; the second full
  attempt was stopped after persistent filesystem errors. The separate
  `Backend*.test.ts test/Environment.test.ts` run also encounters ENOSPC (31
  passes, 105 failures, 26 collection failures); these are not passing receipts.
- `smithers-build test '//packages/smithers:importRules'` fails to spawn its
  runner with `listen ENOSPC`. Running the same ImportRules program directly
  passes all 10 declared rules, including the extended condition-wait rule.
- No Playwright tests, push or deployment. One commit and the requested bookmark.

No production target disappeared on this base. Removed tests exercised the
deleted credential-export and unmanaged-agent implementations; real transport
cases now prove refusal before workspace creation, lookup or SSH execution.
Main's secret-export and history-watch documentation remains intact.
