---
title: ImportRules and Jev lint rules
status: in-progress
area: process
owner: rules agent; the lead refreshes at session end
updated: 2026-10-20
links: [repo-view-package-split.md, repo-checks-green.md, ../rules.md, ../../AGENTS.md, ../../../../docs/libraries.md, model-host-effect-boundary.md, sync-service-di-test-seam.md, route-ban-any-receiver.md, code-storage-spend-caps.md, host-agnostic-flows.md, ../decisions/0011-the-agent-runs-in-the-browser.md]
---

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

## Next

- The [model-host Effect boundary](model-host-effect-boundary.md) report (started about 21:45; the agent stopped by accident at 22:08 and restarted about 22:20).
- The rules agent's follow-ups: per-package `ImportRules` for the SDK, the target index, `docs:sync`, and a script that keeps `AGENTS.md` and `rules.md` in step.
- Refresh `rules.md` from this session's later messages (sync DI seam, queueing, LRU) at the end of the chat.

## Questions for Will

- `effect.boundary-only`: `apps/mvp/AGENTS.md` lets any callback a layer registers bridge with `Effect.runSyncWith` or `runPromiseWith`. Your "where necessary" is narrower: a listener whose events could be a `Stream` doesn't need one. `rules.md` follows your words until you rule. Keep the narrow reading? Recommended: yes.
