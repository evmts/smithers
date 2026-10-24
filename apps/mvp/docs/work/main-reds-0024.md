---
title: Repair main gates after five feature pushes
status: blocked
area: app-tests
owner: codex-main-reds-0024
updated: 2026-10-24
links: [../rules.md, ../features/todos.md]
---

Fix forward from `02232a4d`: replace the read-token test's fixed sleep, calibrate
the TODO status eval, complete the tool telemetry contract, and exercise the
uncovered TODO status paths. Keep all features and the unchanged 100% gate.

Use the existing `@smthrs/flow` durable engine and `@smthrs/integrations` GitHub
client from the library catalog, with real HTTP and Postgres services.

The new device integration tests exposed a real failure: the step's runtime
context replaced the HTTP client supplied at registration, losing the host's
authenticated transport. Both an authorized read and a Guest's refusal returned
`unavailable` before the fix. The registration now captures and supplies its
host client, matching the existing stack client's service capture. No public API
or stored schema changes.

Validation so far: baseline eval/catalog and telemetry tests failed on the two
missing contracts, and ImportRules rejected the fixed sleep. After the repairs,
82 focused tests and both device regressions passed. All 46 tests in the scoped
coverage run passed and execute all originally reported gaps; its global
threshold still fails on behavior outside the selected files. Browser and worker typechecks each report exactly
the existing 31 TS2741 `preconnect` errors (browser diagnostics identical to the
baseline); infrastructure and eval projects pass. ImportRules passes.

Astra review found no actionable issues. Fable is unavailable in this session's
review tools and model list.

Blocked on the required full-suite proof: the exact `pnpm test --maxWorkers=2`
command waited on the shared directory lock from about 00:12 to 00:45 PDT. The
active suite released it after about 55 minutes, and another full suite acquired
it before this command. The queued shell was then stopped (exit 143), before it
started any tests or acquired the lock. No other job or lock was changed. Whole
app 100% coverage and the full suite's failure set remain unproven; the two known
VibeLang bundle failures were not rerun. No push, deployment or movement of `main`.
