## Objective

Earn 100% measured coverage with behavioral tests that make the number meaningful. Proceed in order: unit, integration, end-to-end, fuzz, benchmarks. Unit and integration suites must each provide confidence independently; integration tests should use real dependencies with narrowly justified exceptions.

## Acceptance

- [ ] Inventory every production surface, test entry point, coverage denominator, ignored branch, and platform-specific path. Record executed results separately from configured floors and known-red exemptions.
- [ ] Unit: meaningful assertions for valid/invalid parameter combinations, boundaries, all error classes, lifecycle/recovery/cancellation, and mutation-sensitive invariants. Complete statement/branch/function/line coverage where instrumentation supports it; explicitly account for Go statement-only reports and child-process/platform coverage.
- [ ] Integration: real adapters, storage, processes and transport; failure injection at real boundaries. Independently runnable suite with no unit-suite dependency and a reviewed explanation for each mock exception.
- [ ] E2E: terminal user surface, Playwright UI, HTTP API, and top-level authoring/installed-consumer APIs, including failure/retry/reload.
- [ ] Fuzz: research TypeScript tools, deterministic replay/shrinking, bounded CI campaigns and longer campaigns, retained counterexamples.
- [ ] Benchmarks: reproducible methods, correctness assertions, baseline review, artifacts and limitations, using existing benchmark workflow.
- [ ] Every real bug receives an Astra implementation and `claude -p --model fable` review, with a reproducing regression test and validation receipts.
- [ ] Land through the existing mythical/Cloud/owner-merged PR workflow; refresh wiki through its existing workflow and retain source/review/publication receipts.

## Initial evidence and coordination

Requested 2026-09-27. Session supports three Sol workers plus the orchestrator (four total), below the requested ceiling of sixteen workers. First wave: flow/canonical; Go admission/credits; app repository-setup lifecycle. Local work is test/bootstrap repair; local completion does not establish Cloud CI, PR merge, or wiki publication.

Checkout started at `60f00de5dc` with preexisting TUI terminal-harness edits, preserved. Repository inventory: 124 pnpm workspaces, 58 Vitest configurations, 808 backend Go production files, 1,516 backend Go test files, approximately 4,632 JS/TS/Go test files. Configured floors are not baseline results.

Related open work: #1824 model branch coverage; #1734 build-targets branch coverage; #1813 durable lifecycle state-model tests; #1648 E2E gaps; #2154/#2220 PostgreSQL tests/environment; #2255 engine-store teardown; #2257 backend Go failures; #2107/#1827 app state/unit failures; #1893 TUI CI; #1923 wiki receipts. Reconcile against actual new evidence rather than closing on code presence.
