---
title: GitHub projection ordering and admission fixes
status: done
area: github
owner: codex
updated: 2026-10-21
links: []
---

Reproduce the supplied GitHub findings on the Mac mini farm and fix only confirmed failures.
Use the catalog's `@smthrs/integrations` GitHub client and `@smthrs/flow` durable steps.

All 13 supplied findings reproduced as failing regressions before their fixes.
The changes retain monotonic absence/freshness fences, atomic pull snapshots, current anonymous visibility checks, bounded webhook attributes, receipt-before-admission ordering, nonblocking reconciliation admission, and merge settlement independent of projection.

Astra reviewed the final code without further findings. The requested Fable review through Smithers TUI stopped when its model seat reported quota exhausted; no review result was produced.

Validation on the Mac mini farm:

- Original regression run: 16 failures for the supplied findings, with 46 existing tests passing. Further recovery and missing-row fence regressions also failed before their fixes.
- Final `pnpm exec vitest run worker/github db/Database.test.ts --maxWorkers=1 --coverage.enabled=false`: 222 passed, 19 failed, 7 skipped. All supplied-finding regressions passed. Triage had 18 timeout failures and one later assertion failure.
- Final `pnpm typecheck`: passed (browser, worker, infrastructure and evals).
- The earlier full `pnpm test --maxWorkers=2` run retained coverage and failed in unchanged agent, attention, views and home tests. It was stopped after those failures because it tested an earlier source snapshot; a green full-package/coverage result is not claimed.
- Focused commands disable global coverage collection, without changing the configured coverage thresholds. The triage-only rerun uses a larger command-line timeout to distinguish timing failures from behavioral failures; it does not change the source's test budget.

- Triage rerun: `pnpm exec vitest run worker/github/Triage.test.ts --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000 --coverage.enabled=false`: all 67 passed, including the earlier assertion failure (265.7 s). Together with the final main run, every GitHub/database file passed: 241 tests passed, 7 intentionally skipped. This is not a green full-package or coverage receipt.
