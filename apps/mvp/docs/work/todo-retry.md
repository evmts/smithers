---
title: Retry failed TODOs in place
status: blocked
area: todos
owner: codex-todo-rebase22
updated: 2026-10-22
links: []
---

Implement durable todo/Retry, preserving stack position and attempt history.
Library catalog: durable workflow and retry use @smthrs/flow; UI uses @smthrs/ui.
Validation runs on Latitude; never push from this clone.

Implemented todo/Retry through the durable browser engine, outbox and stack writer.
Members retry their own TODOs; Maintainers retry anyone's. Failed or verified
cancelled attempts restart in place, preserving identity and immutable history.

Latitude: 416 tests across 27 TODO/stack/runs/registry/device/eval-case files passed;
86 follow-up assertions/tests across three files passed after strengthening the
Maintainer and run-page regressions. Full apps/mvp typecheck and importRules passed;
the final frontend typecheck and importRules rerun passed too. Coverage disabled.

The model-free mini farm cannot run a real TODO; no Playwright or live-model eval
claim. Integration note: todo-stack-hold owns the failed-predecessor barrier; retry
uses its ordinary queued admission and publication path. No push or deployment.

Push-22 rebase: shared TodoRuns adapter retains durable Drop/admission and accepts
stopped retries only after engine cancellation. Retry archives the old branch/PR
once so published dependents survive projection replacement. Astra review found
and verified the archive fix. Combined stack passed 566 tests in 38 app suites,
full app typecheck/importRules, schema regeneration and 68 SDK tests on Latitude.
The final added repeated-queued-retry writer regression remains unexecuted:
Latitude app permits stayed busy and diagnostic SSH was reset. Queued validation
was cancelled cleanly; no push. See todo-stack-hold.md and the external
~/smithers-builders/todo-rebase22-REPORT.md for exact revisions and receipts.
