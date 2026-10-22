---
title: CLI internal correctness regressions
status: done
area: cli
owner: codex-mini-051271
updated: 2026-10-22
links: []
---

All seven supplied findings reproduced with failing tests and fixed:

- Projection follows the root, durable descendants and trampoline members until terminal.
- Terminal ordering bounds its diagnostic gap write as well as its settlement wait.
- Designed sentences, fields and names are redacted and terminal-safe, including ANSI-split credentials and cyclic metadata.
- Snapshot marking rejects non-object live JSON state before sweeping; legacy objects remain valid.
- Health discovery consumes every page of every active status.
- Discovery scans and recovery run in `@smthrs/flow`'s durable poll, sharing the existing native runtime. One stable lineage resumes after restart; monitors stop with their watcher.
- Listing guards accept null and undefined.

Catalog entries used: “Make a durable workflow” (`@smthrs/flow`, using
`Poll.make`) and “Run flows in a Node or Bun program” (the existing host
runtime), plus existing journal/run-store/control services. Discovery receipts
record admitted counts, or -1 for a failed read; existing health gauges,
counters and warning logs remain in use.

Validation on Node 26.5.0:

- `pnpm install --frozen-lockfile --offline`: passed.
- Before/after Vitest runs proved all seven failures. Regression assertions include root/child ordering, blocked gap recording, malformed JSON, redaction and null guards, page 501, and the actual discovery FlowInstance during fault recovery.
- In `packages/smithers`: `pnpm exec vitest run --coverage.enabled=false test/EngineJournalProjection.test.ts test/EngineJournalSupervisor.test.ts test/EngineJournalSupervisorNodeEvents.test.ts test/TerminalStatusOrdering.test.ts test/Failure.test.ts test/FeaturedFlows.test.ts test/Gc.test.ts test/HealthHost.test.ts test/NativeControlPlanningFailures.test.ts`: **150 passed in nine files**. No whole-package coverage claim.
- Health tests also pass against independent SQLite journal instances and reopen a real SQLite EngineStore timer, asserting one discovery root. They use real stores, filesystem, Jj and Effect TestClock; no mocks or fixed sleeps.
- Adding `test/NativeHealth.test.ts test/ModuleSnapshotAuthority.test.ts`: 151 passed, five failures due to missing `smithers-jj-export`; the same five failed on unchanged sources.
- `pnpm exec tsc --noEmit` in both `packages/smithers` and `apps/mvp`: passed.
- `pnpm exec tsc -p tsconfig.test.json --noEmit`: only `NativeControlInitialization.test.ts:19`'s existing string/literal error; reproduced with all changed production sources restored to their parent versions.
- `pnpm exec smithers-build test '//packages/smithers:importRules'`: target absent (`unknown_label`). Ran the same ImportRules checker directly on all six changed test files: zero fixed-sleep or mock violations.
- Changed TypeScript formatted with package dprint. Astra review completed; its findings were corrected and retained as regressions. Fable was unavailable in this session.
- E2e: **not run (mini clone)**. No device schemas changed. No push or main/bookmark movement.
