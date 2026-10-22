---
title: Hold dependent TODOs and wake published runs
status: done
area: app
owner: codex-webhook-wake
updated: 2026-10-22
links: [dogfood-loop.md, todos-and-stack.md, ../decisions/0016-todos-and-the-stack.md]
---

Fix admission after a failed predecessor and replace merge polling with durable webhook waits.
Library catalog: @smthrs/flow for durable waits; @smthrs/integrations for GitHub.

Admission: `fill` stops at the first failed predecessor. A person dropping it releases the queue. Real Postgres regression failed before the fix; Latitude stack writer and pure suites pass (48 tests).

Extended admission coverage: unmerged close fails queued successors `base_closed`; missing base branches refuse main fallback. The Latitude TODO, stack and webhook suites pass 160 tests. Rebased retry recovery now uses the real stack Retry operation.


Merge wake: the real-host regression covers early/duplicate signals, replacement hosts, an open PR through an hourly fallback, and a base merge that restacks then cleanly parks on its own PR. Own and base close/reopen races remain terminal. Astra's review also found failure-reason overwrite and unconsumed base/clock wake markers; all have regressions. Final Latitude app suites: 179 passed across 10 files. SDK clock/deferred/restart suites: 43 passed across 7 files. Final apps/mvp typecheck and importRules passed. SDK typecheck passed.

Push-22 rebase: cancellation/admission/timing remain in ExecutionObject.make;
signals extend that host. Hold recovery now uses the real Retry operation.
Combined final app suites: 566 tests / 38 files, full typecheck and importRules
passed. SDK clock/deferred/restart suites: 68 tests / 7 files passed. Coverage
was disabled. Astra found no further issue after the base-history archive fix.
One final writer regression for a repeated queued retry awaits execution; farm
permits remained unavailable and diagnostic SSH was reset. Queued validation was
cancelled cleanly. No push. External receipt: ~/smithers-builders/todo-rebase22-REPORT.md.

Webhook-wake redo (2026-10-22): rebased onto main `656539c3`, after retry
`013522aa` and hold landed. The cancellation failure reproduced on Latitude.
Registration recovery scheduled a drain that cancellation stopped; the explicit
hosted drive inherited that drain's interruption instead of replacing it.
The coordinator now waits for cleanup and replaces it, preserving other failures
and caller interruption. Hosted wakes only coalesce active, non-stopping drains;
idle recovery/signal delivery cannot bypass admission, cancellation or budgets.
The signal runtime carries the persisted flow hint. The original failing test
is unchanged, with additional zero-budget and no-post-cancel-action regressions.

The TODO crash fixture also now permanently faults the dead incarnation's SQL
and terminates its named pool sessions. Previously its live pool could reconnect
and steal from its replacement under single-incarnation liveness. Replay and
tool-call assertions are unchanged. Astra reviewed both fixes without remaining
findings. Final Latitude app tests: 354/354 across 22 files, including workerd,
stack, TODOs, webhook and device schemas. Full engine-store matrix: 2218/2218 on
each of SQLite and PostgreSQL. Coverage disabled; no coverage claim.

App typecheck (all four tsconfigs) and importRules passed on Latitude; the
importRules target ran, not a cache hit. SDK source/test typecheck, changed-source
ESLint and formatting passed. The final focused SQLite/Postgres matrix passed
60 tests per backend, including the added cleanup-defect preservation case.
No push. Generated docs sync/check is left to the lander. External receipt:
`~/smithers-builders/webhook-wake-REPORT.md`.
