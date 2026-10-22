---
title: Control runtime correctness regressions
status: done
area: sdk
owner: codex-amend-eb1a6428
updated: 2026-10-21
links: [../../../../packages/smithers/control/README.md, ../../../../docs/libraries.md]
---

Reproduce and repair six control findings: spawned code identity, tokenless approval filters, signal command conflicts, stranded recovery after plan read failure, partition watch ordering, and paged drift enrichment. Uses the library catalog's `@smthrs/control` entry and its existing Effect, run-store and journal services. No new library.


Confirmed all six findings with regressions against unchanged production code:
- Spawned engine rows returned no recorded identity.
- Tokenless approval waits selected both child and ancestor, although both summaries remained accepted.
- Both inbox adapters accepted conflicting command IDs silently.
- A recovered run logged the injected plan-read failure, then never launched on the next retry in that process.
- A held real journal snapshot emitted its new live event before history.
- Changed and removed flows omitted drift from pages while exact lookups reported it.

The fixes retain the existing Effect tracing and recovery warning. Signal identity uses canonical payloads and stable principal kind/id; a fresh timestamp alone is a replay, and the original admission remains intact. The page-read test now verifies bounded reads of selected runs and their ancestors, since drift enrichment requires ancestry reads.

Validation on Node 26.5.0:
- `pnpm install --frozen-lockfile --offline` reached a missing `@astrojs/check` metadata entry; `pnpm install --frozen-lockfile` then passed.
- `pnpm --filter @smthrs/control exec vitest run --coverage.enabled false --maxWorkers 2 test/CodeDrift.test.ts test/SqlControlRuntimeEdges.test.ts test/SignalInbox.test.ts test/StrandedLaunch.test.ts test/ControlLiveWatch.test.ts test/SignalInboxModel.test.ts`: 119 passed after fixes. Each finding had an observed assertion failure before its fix; fixture failures were corrected and re-run before changing production code.
- `pnpm --filter @smthrs/control exec vitest run --coverage.enabled false --maxWorkers 2`: 1,182 passed, one PostgreSQL test skipped without `SMITHERS_TEST_PG_URL` (80 files passed, one skipped). Coverage was not measured; configured thresholds are unchanged.
- `pnpm --filter @smthrs/control exec tsc -p tsconfig.test.json --noEmit`: passed.
- ESLint on the four changed source files and dprint on all changed TypeScript files: passed.
- E2e: not run (mini clone).
- Codex Astra review: no correctness findings. Fable is unavailable in the enabled review tools.

No push, deployment, or main bookmark movement. One local commit and the requested mini bookmark.

Coverage amendment: exercises a signal-command row removed by a real database trigger before admission readback, asserts the persistence failure and empty inbox, then retries successfully after removing the trigger. Uses the existing catalog entries for `@smthrs/control` and `@smthrs/database`; no fixed sleeps.

Amendment validation on Latitude:
- `pnpm test`: 1,183 passed, one PostgreSQL-only test skipped; 100% branches. SQLite-only coverage still fails the existing PostgreSQL callback at SqlControlRuntime.ts:1402 (99.96% lines/statements, 99.89% functions).
- `pnpm run coverage` via the package-owned SQLite/PostgreSQL matrix, using the farm integration service: passed, merged coverage 100% statements, branches, functions and lines. The new trigger regression passes on both backends. An initial matrix attempt without the farm service could not find initdb; the service-backed run passed.
- `pnpm test test/CodeDrift.test.ts test/ControlLiveWatch.test.ts test/SignalInbox.test.ts test/SignalInboxModel.test.ts test/SqlControlRuntime.test.ts test/SqlControlRuntimeEdges.test.ts test/StrandedLaunch.test.ts --coverage.enabled=false`: 214 passed.
- `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed, zero violations.
- `pnpm exec dprint check test/SqlControlRuntimeEdges.test.ts`: passed.
