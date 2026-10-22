---
title: ImportRules and Jev lint rules
status: in-progress
area: process
owner: rules agent; the lead refreshes at session end
updated: 2026-10-21 20:47 PDT
links: [review-round-4.md, repo-view-package-split.md, repo-checks-green.md, ../rules.md, ../../AGENTS.md, ../../../../docs/libraries.md, model-host-effect-boundary.md, sync-service-di-test-seam.md, route-ban-any-receiver.md, code-storage-spend-caps.md, host-agnostic-flows.md, ../decisions/0011-the-agent-runs-in-the-browser.md, no-github-actions.md]
---

## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Enforce the engineering rulings in checks and Jev.

**Why:** The catalog and executed gates must agree.

**Current state:** At 20:37 the lead reports app-wide lint at zero violations on main 41ebbdd6. New branch-page and needs-you tests independently fail the React/non-TSX rule and are being fixed. Zero violations at that revision does not close all future rule work.

**Next step:** Retain the main lint receipt; fix incoming test violations before landing and continue catalog enforcement.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:53 PDT

**What:** Enforce the current engineering rulings with deterministic checks and Jev rubrics.

**Why:** The rule catalog and executed checks must agree without leaving known violations.

**Current state:** At 16:53 the lead reports a Codex Sol job removed the nine older app-test import-rule violations; its commit is queued with the lander. A separate local-first test fix is also queued. Zero violations is an expectation after both land, not a recorded check on that combined revision. Six factory-e2e waits used only to pace video were removed; that e2e was not run because the mini is offline. Earlier catalog/ruling reconciliation remains in the history.

**Next step:** Land both lint fixes and run the import-rule check on the resulting revision. Rerun factory e2e and inspect its faster GIF when browser capacity returns; reconcile superseded catalog policy with rulings.

**Open questions for Will:** None newly identified; earlier unresolved items remain in the retained history.

Evidence: lead text replies, script-filtered from session 6253ecf2 for 14:53–16:53 PDT; tool content, automated messages, relayed agent reports and compaction summaries excluded. Rulings and queue answers take precedence over historical briefs and plans. Implementation owners and statuses retained; Codex curates this update. Product checks are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 09:11 PDT

**What:** Align the rule catalog and its enforcement with the latest dependency and GitHub rulings.

**Why:** Checks must enforce Will’s current policy before builders implement the approved CI parity work.

**Current state:** rules.md’s deps.seven-day-rule still states seven days, while SDK-15 permits dependency versions at least one day old without approval. Its github.no-actions section and described PACKAGE.test.ts/Jev checks prohibit all commit statuses; GH-10 now permits write-only smithers/<flow> statuses. GH-9 leaves npm/JSR provenance publishing on GitHub; it does not authorize a GitHub Actions product view. This tracker inspected the catalog, not the actual check implementations, so an enforcement mismatch needs verification rather than an asserted test failure. Existing implementation and validation history below remains unchanged.

**Next step:** Inspect the declared config and checks, update only the superseded policy boundaries, and retain regressions for allowed write-only Smithers statuses and still-forbidden Actions reads/views. Reconcile the catalog in the same change. Keep this within the existing rules workstream.

**Open questions for Will:** None; SDK-15, GH-9 and GH-10 settle these policy choices.

Evidence: current rulings (SDK-15, GH-9/GH-10, PROC-9 and PLUGIN-5), queue answers, requested source documents and script-filtered transcript window. Generated summaries, tool results and automated messages are excluded from human evidence. No product tests or version-control operations run; Codex is the documentation curator, and execution ownership is retained.

## Earlier tracker history (retained)


## What

Every engineering rule Will gives becomes a check. `rules.md` catalogs each rule with Will's words and an id. Deterministic rules are `ImportRules` entries in `apps/mvp/PACKAGE.ts`; judgment rules are Jev rubric items that answer one yes-or-no question per file.

## Why

Will: "For rules like don't use effect in tsx it would be great if we did a PACKAGE.ts style lint rule for all of them". And: "we have access to jev too so we can to intelligence based rules ... we can update those lint rules again at end of chat".

## State

- 53 rules mined from the session; 22 `ImportRules` checks and 24 Jev rubric rules declared.
- The lint system couldn't run Jev, so the agent added `JevLint` and `JevRules` to the SDK at 100% coverage; the build CLI now runs them.
- Measured false-positive rate 6% on build-failing rules, likely optimistic.
- Real reds left: five fixed `setTimeout` sleeps in `chat.test.ts`; 7 `Effect.runPromise` calls, deep imports and error text in two loggers in the SDK.
- 21:24 on 2026-10-19: `chat.test.ts` has no `setTimeout` left; the client package agent moved deadline tests to `TestClock`. Seven `Effect.runPromise` and `runPromiseExit` calls remain in `model-host` (`HostServer.ts`, `ModelProbe.ts`), and `worker/ChatApi.ts:54` still uses `waitUntil` until W5.
- 21:29: the lead queued the `model-host` fix until W3 lands, because W3 is editing the next package over. Its own note: [model-host Effect boundary](model-host-effect-boundary.md).
- 21:33: a `forbidCalls` entry bans `page.route`, `context.route` and their variants in `e2e/**` (the e2e fault-rewrite agent, uncommitted). Its message still allows a mock "with Will's written acceptance"; Will's ruling says no exceptions ([sync service seam](sync-service-di-test-seam.md)).

- About 21:43: the e2e agent finished. The `e2e/**` entry now bans 12 names (the four `this.page` and `this.context` forms of `routeFromHAR` and `routeWebSocket` added) and its message reads "No exceptions"; `rules.md` lists all 12. `importRules` passes on `e2e/**`. Its one remaining failure in `apps/mvp` is `worker/ChatApi.ts:54` (`execution.waitUntil`), which W5 removes.
- About 21:43: the lead aligned `test.no-mocks-in-e2e`, `test.no-mocks-of-our-code` and the Jev rubric with Will's words: faults come from test implementations of Effect services, not "injected at the network"; request interception never stays, and any other mock stays only with Will's acceptance of a written justification.
- Gap: `forbidCalls` matches the exact callee text, so the ban misses `tab.page.route(...)` and `page.context().route(...)`. An agent is adding receiver-agnostic patterns: [route ban on any receiver](route-ban-any-receiver.md).
- About 21:51: the gap is closed ([route ban on any receiver](route-ban-any-receiver.md), done). `apps/mvp/PACKAGE.ts` uses `*.route`, `*.routeFromHAR`, `*.routeWebSocket`, `*.waitForTimeout` and `*.waitUntil`. The mvp lint's only failure is `worker/ChatApi.ts:56` (`execution.waitUntil`), which W5 removes.
- 21:52: Will: "make sure you don't use code storage apis without first wrapping it in effect". Added to `effect.wrap-every-library` in `rules.md` with his words; `ImportRules` now forbids `@pierre/storage` and `@pierre/storage/**`, so the app reaches Code Storage only through `@smthrs/effect-code-storage`. Also saved to memory.
- About 21:45: the [SDK defects agent](model-host-effect-boundary.md) is fixing `model-host`'s 7 calls and adding a `forbidCalls` ban on `Effect.run*` in that package's `PACKAGE.ts`.
- 22:22: Will, answering design question 0003.1: "make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally". New rule `sdk.host-agnostic-flows` in `rules.md` with his words and a Jev question; `ImportRules` in `apps/mvp/PACKAGE.ts` forbids `alchemy`, `alchemy/**`, `cloudflare:*`, `@cloudflare/**` and `@smthrs/platform-cloudflare` outside `worker/ChatApi.ts`, `worker/index.ts`, `alchemy.run.ts` and `infra/`. A probe file confirmed it catches an import ([host-agnostic flows](host-agnostic-flows.md)).
- 22:30: two rules from the decision 0011 exchange are Jev rubrics in `apps/mvp/PACKAGE.ts` and entries in `rules.md`: `flows.local-first-placement` (a flow runs locally unless it needs a key the person must not hold, a machine, or work while every device is off) and `sdk.host-agnostic-flows` (a rubric beside its `ImportRules` forbid).

- 02:32 to 02:43 on 2026-10-20: `//apps/mvp:importRules` has one violation in 218 files, `src/features/repo/components/RepoPage.tsx:4` importing `@smthrs/ui/adapters/repo-view` (`rootImportsOnly`). It stays red until Will answers A (one exception) or B (its own package, recommended) ([repo-view package split](repo-view-package-split.md)). From 02:24 to 02:40 no `smithers-build` target evaluated, because `std/PACKAGE.ts` named a moved file; fixed on disk 02:40:41 ([repo checks](repo-checks-green.md)).

- **11:04:02 on 2026-10-20: [review round 4](review-round-4.md)'s R4-20 (P2, Claude Opus P2-9; the glob checked by a fork with `matchesGlob`): the app's import rules never read `worker/` subdirectories.** `apps/mvp/PACKAGE.ts:27-34` (`appSources`) and `:324` (`workerSources`) use `worker/!(*.test).ts`, which matches top-level files only. So the durability and boundary rules (`Effect.run*`, `setTimeout`, `Effect.retry`, `Schedule.*`, `*.waitUntil`, every `workerSources` rule) skip `worker/github/**`, `worker/branch/**` and `worker/flows/**`: the GitHub write path, the terminals and every server flow. "A gate that can't fail there." Fix: `worker/**/!(*.test).ts`, excluding `worker/test/**`. Unrouted by 11:07.
- Round 4's P3s on the gates: Opus P3-9: the gate is red on `state.waitUntil` in `worker/BranchSandboxes.ts:128` (a fork ran `packages/repo-targets/scripts/import-rules.mjs`); Opus P3-11: `SdkRules`' platform-neutral globs miss `node:fs/promises` and bare built-ins (`packages/repo-targets/src/SdkRules.ts:93`); Fable S-P2-2: the same line forbids `crypto` only as a module import, so no gate sees ambient `crypto.subtle`; Opus P3-13: `RunInspection.ts:25-29` deep-imports three packages, and `@smthrs/jj`'s `retryGitIndexLock` is a hand-rolled recursive sleep loop of up to 1,200 tries in library code. Fable verified the SDK import rules pass on `effect-tanstack-db`, `effect-electric` and `effect-code-storage`.
- Opus's assessment: platform code stays in host packages and the app imports from roots, "so the rule holds by habit rather than by gate."
- **13:38:27 on 2026-10-20: R4-20 fixed** (round 4's SDK fix agent): the bug was in `apps/mvp/PACKAGE.ts`, not `@smthrs/repo-targets` (`*` stops at `/`, as documented). The new `apps/mvp/PACKAGE.test.ts` checks the globs against the files on disk. `importRules` found nothing new in `worker/github`, `worker/branch` or `worker/flows`; one violation remains, `worker/ExecutionHost.test.ts:6` importing `@smthrs/platform-cloudflare`.
- 13:29 to 13:31: rule `github.no-actions`: a Jev rule in `PACKAGE.ts` plus a string scan in `PACKAGE.test.ts`, since ImportRules reads imports and calls, not strings. Jev doesn't run yet: the build CLI lacks `JevReviewLive` ([no GitHub Actions](no-github-actions.md)).
- 13:42:00: the branch workspace builder gave `rootImportsOnly` an `allow` list (tested, README updated) and allowed `@smthrs/ui/adapters/*` in the app. Will's 13:31 answer removes that app exception ([repo-view package split](repo-view-package-split.md)).

## Next

From 13:42 on 2026-10-20: fix `worker/ExecutionHost.test.ts:6` in the [P3 cleanup](review-round-4-p3-cleanup.md); remove the app's adapters exception with the [repo-view package](repo-view-package-split.md); run Jev once the build CLI has `JevReviewLive`.

Until 13:46 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: the lead routes round 4's R4-20: widen the worker globs, then fix what the gate finds in `worker/github`, `worker/branch` and `worker/flows`; and the gate P3s above ([review round 4](review-round-4.md)).

Until 11:07 on 2026-10-20 the next steps were:

- The [model-host Effect boundary](model-host-effect-boundary.md) report (started about 21:45; the agent stopped by accident at 22:08 and restarted about 22:20).
- The rules agent's follow-ups: per-package `ImportRules` for the SDK, the target index, `docs:sync`, and a script that keeps `AGENTS.md` and `rules.md` in step.
- Refresh `rules.md` from this session's later messages (sync DI seam, queueing, LRU) at the end of the chat.

## Questions for Will

- None. `effect.boundary-only` is decided by SDK-7 ("only where necessary"): `apps/mvp/AGENTS.md` already says a listener whose events could be a `Stream` is a `Stream`, and `rules.md` keeps the narrow reading (lead, 2026-10-21 09:20).
