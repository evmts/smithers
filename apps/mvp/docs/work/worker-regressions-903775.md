---
title: Worker model and notification regressions
status: done
area: worker
owner: codex-903775
updated: 2026-10-21
links: []
---

Reproduce six reported model metering, model setting, fixture cleanup and notification defects in an isolated jj workspace. Run regressions and the app suite on the Mac mini farm. Use the catalog's existing @smthrs/model metering, @smthrs/flow invocation identity and @smthrs/notifications routing APIs.

## Reproduction

Mac mini, `pnpm exec vitest run worker/ModelEndpoint.test.ts worker/Notifications.test.ts`: stale-role replay returned `first` with only two audit rows; failed harness setup left the trigger installed or budget table renamed; quiet-only needs-you updates raised version 1 to 2; equal-time pushes retained commit `a` at version 1. One pre-existing summary test timed out. The first access-revocation setup violated `runs_check`; corrected it to include `waiting = 'input'` and reran only that regression: both revoked recipients received new states, and the launcher received a new question and attention version.

The server-local alert finding is not reproduced: this revision already starts the spend alert when the host passes its starter; both production callers do. Its existing regression passes.

## Fix validation

Mac mini, `pnpm exec vitest run worker/ModelEndpoint.test.ts worker/Notifications.test.ts --coverage.enabled=false --maxWorkers=2 --silent`: 88/88 passed, both complete affected files. The summary test passed on this run. Full-package coverage gates are checked separately without changes to their thresholds.

Worker typecheck on the Mac mini: `pnpm exec tsc -p worker/tsconfig.json --noEmit` passed. The two branch-conversation cases that failed with “The model was never asked this question” passed both with the original production files and again with the fixes restored (2/2 each); these failures are intermittent. The complete package run also reports failures elsewhere; do not describe the package suite as green.

Review tooling limitation: the installed `smthrs review` accepts committed source only; the older `smithers oneshot` command documented by the skill is not installed. No preliminary commit, bookmark movement, push, or substitute review was performed.


Full-package Mac mini result: `pnpm exec vitest run --maxWorkers=2` completed with exit 1: 27 files failed, 174 passed, 3 skipped; 75 tests failed, 2,466 passed, 9 skipped. Both affected files passed all 88 tests in this run too. Failures span existing agent, chat, repository, flow UI, startup, telemetry and other suites. The two conversation cases also passed in the isolated baseline/fixed comparison; the remaining broad failures were not individually baseline-audited or fixed in this workstream. Coverage was enabled with unchanged thresholds; no overall green or 100% coverage claim is made. The production PWA build and 132 package-policy checks passed within the package run.

Five findings are reproduced and fixed. Server-local spend alerts are already implemented and tested at the starting revision, so that finding is not reproduced. No push or bookmark movement is part of this change.
