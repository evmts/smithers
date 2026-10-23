---
title: Informative branch timeline
status: blocked
area: timeline
owner: codex-timeline-info
updated: 2026-10-23
links: []
---

Will: show the recorded object and outcome in each timeline entry, with a matching summary preferred. Catalog: @smthrs/ui ChatTimeline; @smthrs/agent ModelStep and @smthrs/model for the existing durable summary flow. @smthrs/journal Redaction for credential-safe labels (catalog: redacted event history).

Validation (2026-10-23): Latitude's final timeline suites pass 39/39, UI timeline 12/12, apps/mvp typecheck and importRules pass. Expanded chat/status validation passed 57/57 before review fixes. Parent implementation fails 11/12 informative-entry tests. Final mini-farm timeline journeys passed 2/2 after all review fixes and regenerated both GIFs, with zero media-check failures. Astra and Fable reviewed. All five findings have fixes; the navigation/order regressions failed before their fixes, and Astra verified those fixes. No production deployment or coverage claim. Receipts: `~/smithers-builders/timeline-info-evidence/`.

Bounce repair (2026-10-23): rebased onto `main@origin` (`9dd5d9d0`). The branch and terminal server-render adapters omitted `TodosProvider`, which production already supplies; the new unconditional timeline queries made `useTodos` throw and the router rendered empty/pending output. Both adapters now receive the existing runtime's real Todos service, with every assertion unchanged. Decision filename is `0078-timeline-entry-objects.md`. Latitude reproduced 8/8 failures before the fix, then passed 449/449 tests in 38 affected/timeline suites. The full coverage run passed 3,448 tests (2 expected failures, 13 skipped; 268 passed files, 4 skipped), but exited 1 because the unchanged 100% coverage gate measured 99.8% lines, 99.68% statements, 99.24% branches and 99.54% functions. Timeline measured 100% lines/statements/functions and 97.1% branches. No claim of a green coverage gate or baseline comparison. Typecheck, importRules and shared UI timeline (12/12) passed. Receipts: `bounce-*.log` in the same evidence directory.


Coverage follow-up (2026-10-23): rebased onto `bce9128d` and kept both Files and Todos providers in all four overlapping render-host edits. Decision 0078 is unchanged. Added behavioral labels for an over-80-character subject, an untitled draft, and an untitled working TODO with a recorded step. A faulty model service returns the public typed grant-store failure through the real durable engine; the summary result is `unavailable`, without private detail. No coverage exclusions or threshold changes.

Latitude final full run: 289 passed files, 6 skipped; 3,729 passed tests, 2 expected failures, 16 skipped. Every timeline file measures 100% statements, branches, functions and lines. The global gate still fails: 99.69% statements, 99.30% branches, 99.53% functions, 99.81% lines. All four app typechecks and importRules pass. Shared UI passes 2,638 tests, but Bun reports 52.65% functions / 70.58% lines overall and ChatTimeline 93.10% / 92.37%; it provides no statement/branch measurement. Docs check did not complete during its first attempt. These remaining validation gaps block a green landing claim. No baseline-only run attributes the remaining gaps. Receipts: `coverage-final-nyc01.log`, `coverage-static-nyc02.log`, `coverage-ui-full.log`, `coverage-docs.log` in the existing external evidence directory. No push or deployment.
