---
title: Shipped suite discovery regression
status: blocked
area: cli
owner: Codex
updated: 2026-10-22
links: []
---
595b6abc moved executable evaluation suites beside their owners without updating EvaluationCli's repository-root assumption. 82b5490d later retired the old backend recommender. Discovery's documented consumer evals/ boundary is correct; changing its glob to scan all repository TypeScript would broaden executable selection. Copy the two surviving real suite modules into an isolated consumer's evals/ and assert the entire discovered records, including paths. This also exercises Latitude's private TMPDIR without depending on it. No product or library change; existing @smthrs/evals contract retained.

Latitude validation: EvaluationCli 13/13 passes both focused and in the full suite. Full CLI suite: 253 files passed, 46 failed, 8 skipped; 5,447 tests passed, 95 failed, 1 expected fail, 41 skipped. The requested regression is green; the package gate is not. Logs: /tmp/main-reds-2-evaluation.log.

`pnpm check` exits 2 on unchanged BackendSafetyClient, NativeControlInitialization and burndown fault fixtures. `pnpm lint` exits 1 on unchanged EngineJournalSupervisor (no-parameter catchCause) and HealthHost (type-only import); this prevents the chained package format check. The package ESLint config has no matching test-file configuration; test formatting is checked separately with dprint. Logs: /tmp/main-reds-2-checks.log and /tmp/main-reds-2-format.log.
