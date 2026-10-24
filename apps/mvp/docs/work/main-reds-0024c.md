---
title: Repair newest main test and branch coverage reds
status: in-progress
area: app-tests
owner: codex-main-reds-0024c
updated: 2026-10-24
links: [../rules.md, ./main-reds-0024.md]
---

Trace RemoteRuns and shared TODO status failures to their introducing commits;
repair behavior or test setup without weakening assertions. Exercise missing
issue/pull installed-receipt branches and repository About failures through
real services. Use the catalog's existing @smthrs/flow, @smthrs/effect-electric,
and @smthrs/effect-tanstack-db APIs. Keep the earlier repair jobs' files untouched.
Refresh main before the locked full app suite, then record coverage, typecheck
and ImportRules evidence. No push or deployment from this clone.

The RemoteRuns failure reproduces alone: the test added in `6b05ff32` keeps
asking Electric for the original snapshot (`offset=-1`) instead of consuming
its cursor. When that snapshot is empty, it never observes the later insert.
An explicitly empty first snapshot makes the old polling fail deterministically;
following its handle/offset and applying the actual row changes passes, retaining
the one-row and increasing-revision assertions. Receipts: focused baseline
failed at line 423; strengthened regression red, then green (1 test, 14.46 s).
No remote-run product behavior changed.

Newest main already contains the earlier shared TODO transport repair
`cfcdf6fa` for `dbbb167b`'s durable read: registration must retain the host's
authenticated HTTP transport. Its real-device missing/current-row test passes
unchanged in this clone. No earlier-job file was edited.

Coverage causes: `4944e3dd` added defensive alternatives around installed-batch
receipts and in the final detail-page fallback; `211f5ec8` added refusal
preservation on failed reconnects. The latter is reachable and now tested for
both 401 and 403 on the real pull store, including failed reconnect and recovery.
The receipt alternatives are unreachable: ElectricCollection.certify requires
the latest accepted cursor to be decoded and installed; Failed/Stopped invalidates
acceptance. Its currentApplied callback resumes synchronously in the installed
Effect runtime, and the short continuation synchronously mutates Collection.local.
There is no async gap in which a later refusal can overtake that mutation. A
held older installation cannot certify after refusal. Keep the actual refusal
handling and installed-batch wait; remove only those redundant guards.

IssueScreen passes IssuesStore's access row to pageOf; PullScreen passes it
through pullAccessOf. Both initialize unknown access with installed=false, only
install an allowed batch, retain installation on unavailable polls, and clear
it on refusal. Once pageOf passed refusal and installed/readiness checks, its
remaining unknown-status/loading alternative was unreachable and is removed.

`bcbd3822` added the About rate-limit terminal message without a durable-exhaustion
test. New tests use the real retry budget, retain loading while retries remain,
assert the terminal rate-limit/general message, and recover through Try again.
No public API, stored schema, threshold or assertion is weakened.

Astra review: no actionable findings, including an independent trace of the
receipt ordering above. Fable is unavailable in this session's tools/models.
