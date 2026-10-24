---
title: Repair newest main test and branch coverage reds
status: done
area: app-tests
owner: codex-main-reds-0024c
updated: 2026-10-24
links: [../rules.md, ./main-reds-0024.md]
---

Trace RemoteRuns and TODO card failures to their introducing commits;
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

Focused validation: 255/256 behavioral tests pass, including both real About
retry-budget exhaustion/recovery cases. The one failure is an unrelated manifest
test's 30 s timeout while another job runs the full suite; it must be rerun under
the full-suite lock and is not treated as a product result. The executed V8 JSON
report gives 100% statements, branches, functions and lines for issues/store.ts,
issues/view.ts, pulls/store.ts and repo/actions.ts. The restricted selection's
remaining coverage gap is issues/writes.ts, whose other consumers are outside
that selection. Thresholds remain 100%. Receipts: /tmp/main-reds-0024c-focused.log
and /tmp/main-reds-0024c-focused-coverage/coverage-final.json.

Final-source typechecks: browser, infrastructure and eval projects pass; worker
has exactly the 31 existing TS2741 fetch.preconnect diagnostics. ImportRules
passes. The locked full suite is queued; its shell fetches main again before
starting and refuses to run if new commits need integration.

Refresh while queued: main advanced to `52a5e776` (branch creation). Rebased all
repairs, retaining its RemoteRuns step-entry synchronization and exact-row
assertion together with the empty-snapshot/cursor regression. Astra approved
the integration. The complete RemoteRuns and new browser branch-creation files
pass 60/60 on the refreshed tree.

The first locked full run reproduced the original TODO commit-card failure
(110 s) while both shared status-read regressions passed. Its cause is distinct
from the upstream transport repair: `3fa4e20f` correctly projected `failure`
onto cards for the failed-run timeline but left the queued-card integration
assertion expecting the old object. The pure view regression already expects
failure=null for a queued TODO. Keep that product field and explicitly assert
failure=null in the real-device integration test; retain every existing field
and the exact toEqual check. The run also reported two Checks test timeouts.
It was stopped after this discovery and is not accepted as full-suite evidence
(`/tmp/main-reds-0024c-full-interrupted.log`). Restart the complete gate after
the corrected assertion's isolated run, under the same suite lock.

The corrected queued-card test passes alone under the suite lock (12.42 s).
Main was fetched again and all repairs rebased onto `1471d335`, incorporating
`52a5e776` and the earlier repair job. A short restarted full run was stopped
before completion to address the newly recorded FileTabs regression; neither
interrupted run is a full-gate receipt.

The FileTabs navigation test from `bce9128d` reproducibly failed under the lock
before SQLite entered its deliberately held write. The implicit one-second
vi.waitFor poll expired during real durable admission. Wait for a bounded actual
write-entry receipt instead, then retain all focus, persisted-row, navigation,
DOM identity and error assertions. The unchanged assertions pass with the receipt
(28.46 s). Astra reviewed this change without findings. Receipts:
/tmp/main-reds-0024c-filetabs-red.log and /tmp/main-reds-0024c-filetabs-green.log.
This is synchronization for the persistence/navigation contract, not a latency
budget change in production.

On the final tree at `1471d335`, browser, infrastructure and eval typechecks pass;
worker reports exactly 31 TS2741 diagnostics, all existing fetch.preconnect sites.
ImportRules passes. The next full gate must acquire the shared lock and fetch
main again before running. Another active job owns the flows-ui/device repairs;
this change leaves those files and all explicitly reserved earlier-job files alone.


Resumed after the disk-full interruption: restored dependencies with
`pnpm install --frozen-lockfile`, fetched main and rebased the six repairs onto
`37472935`. Fetching again immediately before the complete gate found no newer
main. No finished repair was reimplemented and no reserved file was changed.
The first resumed run was interrupted following shared Postgres crash recovery:
its setup queries spent over a minute on catalog disk reads (928 schemas,
155,538 relations). That interrupted run is not validation evidence. Created a
fresh instance of the repository's real compose Postgres/Electric/PgBouncer
stack on the supported isolated test ports (55321/31001/55322), leaving the shared
stack and its data intact; removed only this job's fresh fixture after validation.

Final full gate, held under the Mac mini's full-suite lock throughout:
`DATABASE_URL=<local fixture> TEST_DATABASE_PORT=55321 ELECTRIC_URL=http://localhost:31001 TEST_ELECTRIC_PORT=31001 pnpm --dir apps/mvp test --maxWorkers=2 --coverage.reporter=text --coverage.reporter=json --coverage.reportsDirectory=/tmp/main-reds-0024c-resume-coverage`.
Completed in 1725.94 s: 335 files passed, two failed, four skipped; 4,359 tests
passed, two expected failures and 12 skipped. The only failed suites are the
allowed ChatApi startup Rolldown parse error on SmithersError.vibe and
ExecutionHost workerd's missing .vibe loader. No behavioral failure or unhandled
error remains. Overall coverage is exactly 100%: 23,830 statements, 13,351
branches, 7,117 functions and 20,586 lines; no source file has a coverage gap.
Thresholds and exclusions are unchanged. The lock was released on exit.
Receipts: `/tmp/main-reds-0024c-resume-full.log` and
`/tmp/main-reds-0024c-resume-coverage/coverage-final.json`.

Final-source static checks on the rebased tree: browser, infrastructure and
eval VibeLang projects pass; worker has exactly the 31 permitted TS2741
fetch.preconnect diagnostics and no others. ImportRules passes (one target ran).
Receipts: `/tmp/main-reds-0024c-resume-type-*.log` and
`/tmp/main-reds-0024c-resume-importRules.log`. No public API changed, so docs sync
and a changeset do not apply. No live/e2e deployment test, push or landing was
performed; this task's proof is the requested local full app gate. The existing
Astra reviews remain applicable; Fable was unavailable as recorded above.
