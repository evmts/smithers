---
title: Sync service as an injectable test seam
status: done
area: sdk
owner: Electric and TanStack DB package agent and e2e fault-rewrite agent (both finished); the lead commits
updated: 2026-10-19
links: [../rules.md, ../state.md, e2e-suite-and-gifs.md, effect-tanstack-db-and-effect-electric.md, import-rules-and-jev-lint.md, route-ban-any-receiver.md]
---

## What

The sync service and the ChatApi client become Effect services, each with a test implementation that fails on purpose. Happy-path tests use the real services. Unhappy-path e2e tests compose the app with the failing service through a test-only entry point, so no test code ships in production. The three e2e tests that abort requests get rewritten.

## Why

Will: "Please only do this via dependency injection. So the sync service itself should be a service and we should be able to make a test service. It is ok in this case because our happy path tests use a real service and we are testing unhappy paths and we can note that in the rule".

## State

- Rule `test.faults-by-injection` is in `rules.md`, with a Jev rubric. Request interception is banned with no exceptions.
- Built, uncommitted (reported 21:23 on 2026-10-19):
  - `ShapeSource` in `@smthrs/effect-electric`, with a faulty layer whose switches are `down`, `refuse`, `stall`, `corrupt` and `heal`;
  - `ChatClient` as a service, with its faulty version in `src/test/faults.ts`;
  - the e2e entry: under the dev server, `/app?faults` (or `?faults=down`, `refuse`, `refuse-<status>`, `stall`, `corrupt`) starts the app through `src/test/e2e.ts` and puts the switches on `window.faults`; a production build drops it;
  - `state.md` rule 9 describes it. Unit tests have no fixed sleeps; deadline tests use `TestClock`.
- Not done at 21:23: three e2e specs still called `context.route`:
  - `e2e/devices.ts:104`
  - `e2e/observability.spec.ts:169`
  - `e2e/start-app.spec.ts:23`
- About 21:29: the lead started an agent to rewrite those three specs on `/app?faults` and `window.faults`, and to ban `route` in `e2e/**` through `ImportRules`. It is running.
- On disk at 21:33, uncommitted, not yet reported:
  - a new helper `e2e/faults.ts` (`faultyApp()` and `faults(page)`); `devices.ts`, `observability.spec.ts`, `start-app.spec.ts` and `local-first.spec.ts` use it, and no `.route(` call is left in `e2e/`;
  - `e2e/fixtures.ts` re-exports `CHAT_FAILED`, `PAGE_SIZE` and `SYNC_LOST` from `src/features/chat/contract`;
  - `apps/mvp/PACKAGE.ts` has a `forbidCalls` entry on `e2e/**` for `page.route`, `context.route`, their `routeFromHAR` and `routeWebSocket` forms, and the `this.` variants;
  - at 21:34 the suite was running (`local-first` sync-down test).
- Mismatch: the new entry's message and the first line of `test.no-mocks-in-e2e` in `rules.md` still say a mock "stays only with Will's written acceptance". Will's ruling, and the same rule's "Enforced" line, say no exceptions.
- About 21:43: the rewrite agent reported done. Nothing is committed.
  - No `route(` call is left in `e2e/`. `e2e/faults.ts` provides `faultyApp()` and `faults(page)` over `window.faults`.
  - `devices.openFaulty()` opens a device on the faulty services; `syncDown()` and `syncUp()` call `shapes.down()` and `heal()`. The dead `shapeFailures` counter is deleted.
  - `start-app.spec.ts` opens `/app?faults=down`, then heals; the redaction test in `observability.spec.ts` uses `questions.failNext("unreachable")`; `local-first.spec.ts` opens device A with `openFaulty`.
  - New switch `window.faults.questions.asked()` (`QuestionFaults.asked`): an injected "unreachable" ask sends no request, so the redaction test reads the lost answer id from it. Its unit test in `src/test/e2e.test.ts` fails with the record removed. `ShapeSource` is unchanged; `tsc` is clean and 59 unit tests pass.
  - The full suite, 2 workers and no retries, passed 18 of 19. `correlation`, a happy-path test it didn't touch, failed during a dev-server reload and passed on rerun. Each rewritten test passed 4 times.
- Mismatch resolved (about 21:43): the lead aligned `test.no-mocks-in-e2e`, `test.no-mocks-of-our-code` and the Jev rubric in `apps/mvp/PACKAGE.ts`. Faults come from test implementations of Effect services, not "injected at the network". Request interception never stays; any other mock stays only if Will accepts a written justification, as Will's own words say. The `forbidCalls` message now reads "No exceptions", and `rules.md` lists all 12 banned names.
- The lead fixed the stale `main.e2e.tsx` name in `src/boot.ts`; its comment now points to `src/test/e2e.ts`. The agent fixed the same name in `src/test/faults.ts`.
- Gap found: `forbidCalls` matches the exact callee text, so `tab.page.route(...)` and `page.context().route(...)` pass unflagged. An agent is closing it: [route ban on any receiver](route-ban-any-receiver.md).

## Next

Done. The lead reviews and commits the services, the e2e entry and the rewritten specs. The lint gap is [its own item](route-ban-any-receiver.md).

## Questions for Will

None.
