---
title: Agent seat and accounting recovery regressions
status: done
area: agent
owner: codex-956161
updated: 2026-10-22
links: []
---

Library catalog: agent loop (`@smthrs/agent`) and durable workflow (`@smthrs/flow`). Reproduce six reported seat, timeout and budget recovery failures, using existing Effect services and journal boundaries. No push or bookmark movement.

Latitude baseline with new tests: 6 failed, 129 passed, proving refresh fallback, empty recovery pages, oversized final pages, conflicting dollar charges (two cases), and ledger-only eviction.

Timeout baseline: the durable restart probe failed because a second provider call happened after the original deadline. The fixed AgentAction, Agent and BudgetDurability suites pass 236 tests. Budget, BudgetUsd, BudgetDurability and Agent pass 259 tests. Package importRules and the agent test-project typecheck pass; apps/mvp typecheck passes.

Full package suite (`pnpm exec vitest run` through lat-run): 2,135 passed, 6 skipped, 5 failed; the suite is not green. A baseline comparison using original source/tests reproduces all five key-golden/identity/replay failures (CellCallIdentity, StepKeyGolden, CellCallIdentityReplay); Fault.sweep passes unchanged. These failures are outside the six findings. No new full-suite failure appeared. ESLint and dprint checks pass. No UI or persisted device schema changed.

Implemented: failed seat preparation continues down the configured chain and emits SeatFailedOver; whole-action timeout records its original clock zero as a sealed action; recovery refuses incomplete empty pages and checks the final page against its entry bound; live duplicate charges compare tokens and dollars; ledger-only accounts stay pinned because their clock and latch cannot be recovered.
