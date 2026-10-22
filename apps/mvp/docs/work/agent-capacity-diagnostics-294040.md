---
title: Agent capacity and diagnostic regressions
status: done
area: agent
owner: codex-294040
updated: 2026-10-21
links: []
---

Use the library catalog's agent-loop entry (`@smthrs/agent`), the existing durable flow engine, Effect services and production sandbox. Reproduce the ten reported Agent.ts findings on main@origin, retain failing tests before fixes, and run only this package on Latitude. No push or bookmark movement is authorized.

Initial baseline: Agent.test.ts and LayerRequirements.test.ts passed 95 tests. New assertions produced 11 failures proving eight findings. Cross-frame cooldown and post-wake unavailable-route probes passed unchanged; neither finding is fixed without reproduction.

Eight reproduced findings are corrected: memory diagnostics omit store content; write-only memory never recalls; unused fallbacks are not refreshed or resolved; capacity waits have the existing quota ceiling by default; request resolution skips spent/cooling routes; tool exception messages contain only bounded codes; and the production layer consumes policy dependencies while preserving explicit per-run policies.

Validation receipts through lat-run from this isolated workspace:

- Original targeted baseline: 95 passed.
- New assertions against original source: 11 failures, reproducing eight findings.
- Final Agent.test.ts, LayerRequirements.test.ts and BudgetAcrossProcesses.test.ts: 104 passed, including real SQLite/process recovery and approved per-run budget enforcement.
- TypeScript test-project check, Agent.ts ESLint and dprint checks: passed.
- Original-source fault-sweep comparison: unchanged failure for unregistered `@smthrs/flow/EffectKeyUnavailable`; ModelStep and BudgetAcrossProcesses passed (51 tests passed across the comparison).
- Browser E2E: not run (mini offline).

The cooldown collision probe retained distinct frame deadlines on unchanged source. The unavailable-seat wake probe returned the typed provider refusal on unchanged source and did not reproduce an undefined failure; its asynchronous route-switch variant was not a stable regression. Neither finding is claimed fixed.

Final full package run: `lat-run packages/smithers/agent -- pnpm exec vitest run --coverage.enabled=false --maxWorkers=4` completed with 2,115 passed, 6 skipped, and 1 failed across 160 files. Its only failure is the unchanged fault-sweep registration error reproduced with original Agent.ts. All 23 real process-recovery/timeout cases in RunawayGuard passed. Coverage thresholds were not changed; this run did not measure coverage.
