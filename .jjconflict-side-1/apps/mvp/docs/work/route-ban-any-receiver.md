---
title: Route ban on any receiver (ImportRules forbidCalls gap)
status: done
area: process
owner: route-ban lint agent (finished); lead
updated: 2026-10-19
links: [../rules.md, ../../PACKAGE.ts, ../../../../packages/repo-targets/src/ImportRulesCheck.ts, import-rules-and-jev-lint.md, sync-service-di-test-seam.md, e2e-suite-and-gifs.md]
---

## What

`ImportRules` `forbidCalls` gains a receiver-agnostic member pattern such as `*.route`, so the e2e ban on request interception catches the call on any receiver: `tab.page.route(...)`, `device.context.route(...)` and `page.context().route(...)`, plus the `routeFromHAR` and `routeWebSocket` forms. The change lives in `packages/repo-targets`, so every package's rules can use it.

## Why

Will: "Please only do this via dependency injection." Rule `test.faults-by-injection` bans request interception in tests with no exceptions, and `test.no-mocks-in-e2e` enforces it with a `forbidCalls` entry on `e2e/**`. A ban that a different variable name slips past doesn't enforce the rule.

## State

- 2026-10-19, about 21:43: the e2e fault-rewrite agent confirmed the gap with a probe file:
  - `forbidCalls` matches the callee's dotted text exactly (`rule.callees.includes(call.callee)` in `ImportRulesCheck.ts`);
  - `tab.page.route(...)` and `device.context.route(...)` pass unflagged;
  - `page.context().route(...)` isn't recorded at all, because a callee with a call in its chain isn't a plain dotted name (`calleeText` in `ImportAnalysis.ts`).
- Today's `apps/mvp/PACKAGE.ts` entry lists 12 exact names (`page.route`, `context.route`, the `this.` forms, and the `routeFromHAR` and `routeWebSocket` variants). `rules.md` lists the same 12.
- About 21:43: the lead started one agent to add receiver-agnostic `*.route` patterns in `packages/repo-targets`. At 21:44 no file in `packages/repo-targets/src` had changed since 20:30.
- About 21:51: the agent reported the hole closed. Uncommitted.
  - `ImportAnalysis.ts` records calls with a call receiver (`page.context().route`); `page["route"]()` and `page?.route()` read as `page.route`; an `await` or computed-key receiver reads as `(…).route`; `as`, `satisfies` and `<T>` casts are stripped from callees.
  - `ImportRulesCheck.ts`: a `*.<member>` entry matches the final member name on any receiver; exact entries still match exact text; any other `*` (`*`, `page.*`, `*.a.b`) fails validation.
  - Tests written first failed (11 cases), then passed: the three bypasses, `?.`, `["route"]`, and `router.routes()`, `reroute()` and bare `route()` staying clean. 141 tests at 100% coverage; `tsc`, eslint, the package's `test` and `contractsLint` targets pass.
  - The 22 original rules gave the same violations under the old and new checkers.
  - `ForbidCallsRule` JSDoc and the README (new Callees section) updated; the package has no CHANGELOG.
  - Red, not caused here: the package's `check` target fails on `flows/flow/src/Action/make.ts:674` (`captureStackTrace`); `tsc` on the package alone passes.
- About 21:52: the lead extended the same patterns to the other two holes. `apps/mvp/PACKAGE.ts` now bans `*.route`, `*.routeFromHAR` and `*.routeWebSocket` in `e2e/**`, `setTimeout` and `*.waitForTimeout` (`test.behavioral`), and `*.waitUntil`. The mvp `importRules` target's one failure is `worker/ChatApi.ts:56` (`execution.waitUntil`), which [durable answering](durable-answering.md) W5 removes.

## Next

Done. The last mvp lint failure leaves with W5's ChatApi cutover.

## Questions for Will

None.
