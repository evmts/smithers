---
title: Runs and public About branch coverage
status: blocked
area: mvp
owner: Codex main-reds-0024b
updated: 2026-10-24
links: []
---

Cover the three branches introduced by 5ccd31d5 and 7aae4571 through observable service behavior, or remove unreachable alternatives with caller evidence. No coverage exclusions. Other main-red repairs remain owned by the separate job.

Caller proof: `domainOutcomeOf` is called only from `rowOf` and `headerStatusOf`, both after `hasDomainOutcome`; its only direct test call passes `flow/new`. The predicate now narrows to the two supported names, and the decoder accepts only those names. An unrelated completed run still keeps its engine status (retry.test.ts).

Producer proof: every `AboutRefused` originates in `RepoAbout.read` or `refusedBy`; the invalid-path, missing/private-repository and upstream-failure constructors all supply a stage. `cached` preserves those errors through `ImmutableCache.readThrough`; token/cache defects go through the separate defect handler. Requiring `stage` removes the impossible missing-stage arm in RepoApi. RepoApi.test.ts asserts the caller's 404/503 body, retry and cache headers, and the repository stage in its records.

The remaining store branch is exercised with a faulty injected `BrowserEngine`: a running summary has no outcome, then the faulty engine reports completion at the same journal version. The real Runs store and collections open the list without inspecting each row, retain an unknown outcome and present no success rate. No mocks, exclusions or thresholds changed. Catalog entries retained: browser flows (`@smthrs/platform-browser`), app state (`@smthrs/effect-tanstack-db`) and immutable cache (`@smthrs/artifacts`).

Validation: the pre-change focused run passed 76 tests but failed coverage, identifying todoRun.ts:46 and RepoApi.ts:424. With the fault test and real remote-run coverage, `pnpm --dir apps/mvp test --maxWorkers=2 src/features/runs/store.test.ts src/features/runs/retry.test.ts src/features/runs/remote.test.ts worker/RepoApi.test.ts --coverage.include=src/features/runs/store.ts --coverage.include=src/features/runs/todoRun.ts --coverage.include=worker/RepoApi.ts` passes 86 tests and all three files at 100% statements, branches, functions and lines (539 statements, 396 branches, 114 functions, 442 lines). Receipt: `/tmp/main-reds-0024b-coverage.log`.

`pnpm --dir apps/mvp typecheck` and the worker project each report exactly the 31 known TS2741 fetch/preconnect diagnostics, with no other diagnostics; the infra and evals projects pass. `pnpm exec smithers-build test '//apps/mvp:importRules'` reports only worker/github/ReadToken.test.ts:45's reserved setTimeout violation. Astra review found no actionable defects. No Fable reviewer is available in this session. No public SDK API changed, so package docs generation and a changeset are not applicable.


Full gate on parent `7254a1f3`: `pnpm --dir apps/mvp test --maxWorkers=2`, under `~/smithers-builders/.full-suite.lock` with an EXIT cleanup, completed in 3169.92 s. 323 files passed, four failed and four skipped; 4,121 tests passed, two failed, two expected-fail and 12 skipped. The requested three source files remain 100%. Overall coverage: 99.93% statements/lines, 99.88% branches, 99.92% functions. Receipt: `/tmp/main-reds-0024b-full.log`.

BLOCKED: beyond the permitted baseline, `worker/RemoteRuns.test.ts:423` cannot observe the run's shape row within its condition deadline (also reproduced on the locked rerun), and `src/features/todos/todos.test.ts:202` expects the card without its actual `failure: null` field. Additional untouched branch gaps: `src/features/issues/store.ts:187,199`, `src/features/issues/view.ts:172`, `src/features/pulls/store.ts:135` (introduced by `4944e3ddb9ef`), and `src/features/repo/actions.ts:200` (introduced by `bcbd38225aa9`). Those newer-main repairs are outside this job's three assigned source files; no changes were made to them or to the other job's reserved files.

The permitted reds are unchanged: ChatApi startup and ExecutionHost workerd cannot bundle `SmithersError.vibe`; remaining uncovered TODO API/steps and stack API belong to the other job. No exclusions or thresholds were added or weakened.

Locked confirmation: `pnpm --dir apps/mvp test --maxWorkers=2 worker/RemoteRuns.test.ts src/features/todos/todos.test.ts --coverage.include=worker/RemoteRuns.ts --coverage.include=src/features/todos/api.ts --coverage.include=src/features/todos/steps.ts` completed in 189.09 s: 48 tests passed and the same two tests failed. Both failures therefore remain blockers, rather than being dismissed as load. This focused selection is not a full-package coverage receipt. Receipt: `/tmp/main-reds-0024b-rerun.log`. Both locked invocations completed their EXIT cleanup. The assigned coverage work is ready; the full gate exceeds the authorized baseline-red allowance.
