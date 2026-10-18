---
title: SDK test reds from other lanes
status: done
area: sdk
owner: SDK reds agent (started about 00:24 on 2026-10-20, reported done 00:55), with items 1, 2 and 4 of the B1 follow-ups; given the harness QuickJS stack limit about 00:36; the lead fixed the flows README and formatted two `ModelProxy` files
updated: 2026-10-20
links: [b1-follow-ups.md, flows-and-agent.md, model-endpoint.md, model-step.md, cloudflare-flow-host.md, flows-root-platform-neutral.md, disk-space.md, ../../../../AGENTS.md, agent-ui-rendering.md, repo-checks-green.md]
---

## What

Fix two test reds that F1 found in packages other agents changed. Fix each at its source and keep 100% coverage.
1. `@smthrs/harness`'s `PackageConventions` test fails on `QuickJSVariant`: an `@since` tag names an unreleased version.
2. `@smthrs/agent`'s `Fault.sweep` fails on `ModelProxyRefusal`. W5 restored `ModelProxy` into `@smthrs/model` with that new error type, and the sweep, which enumerates model errors, doesn't handle it. The agent decides whether the agent retries it, against `ModelStep`'s capacity rules ([model endpoint](model-endpoint.md)).
3. Added about 00:36 on 2026-10-20: `@smthrs/harness`'s cell sandbox sets no QuickJS stack limit, so deep recursion in model-written code overflows the host's own stack, and disposing that runtime then aborts. V1+V2 found it ([agent UI rendering](agent-ui-rendering.md)).

## Why

Root `AGENTS.md`, testing quality: 100% coverage with meaningful assertions. A red in a shared package blocks every agent that runs its suite. F1 and the integrations agent both reported reds they didn't cause.

## State

- 00:02 on 2026-10-20: F1's harness run flagged the `@since` check in `QuickJSVariant.ts` and `index.ts` ([flows and the agent](flows-and-agent.md)).
- 00:23, scratchpad `agent-cov.log`: an `@smthrs/agent` coverage run is at 100% on all four measures, with 7 of 2,073 tests failing in 4 files, among them a `tweet-thread` example test. Which agent ran it isn't on record.
- 00:24: F1 reported both reds as other lanes', plus 30-second timeouts under load that pass alone.
- About 00:24: **started**, in one agent with items 1, 2 and 4 of the [B1 follow-ups](b1-follow-ups.md). Its brief: find who added each change with `jj log`, never git; don't edit the `@smthrs/flows` root or `platform-node`; check `df -h /` before `pnpm docs:check`. At 00:25 it was running the harness conventions test.
- **Seen, not in this brief:**
  - Engine-store's `CompensableSnapshotRestart`, `EffectBoundaryRecords` and `PlanSchedulerAdmission` failed in the child-flow agent's combined SQLite and Postgres run (00:20) and passed alone ([Cloudflare flow host](cloudflare-flow-host.md)). Best guess: flaky under load.
  - `repo-targets`' `CiSelection.test.ts` and 3 `sandbox` tests failed at 00:20, in runs that are best guess the flows-root agent's ([flows root](flows-root-platform-neutral.md)).

- 00:27 to 00:29 on 2026-10-20, on disk, unreported: `harness/package.json` (00:27, version `1.0.0-rc.15`) and `harness/docs/api.md` (00:28), best guess the `@since` red; `model/src/ModelError.ts` and `ModelProxy.ts` (00:28 to 00:29) and `agent/test/Fault.sweep.test.ts` (00:29), best guess the `ModelProxyRefusal` red. No test result is on record.
- 00:30 to 00:33: the same agent's B1 follow-ups edits are on disk ([B1 follow-ups](b1-follow-ups.md)).


- About 00:36 on 2026-10-20: **a third item.** V1+V2 found the harness stack-limit bug, and the lead gave it to this agent. The views realm already bounds its stack at 128 KiB and abandons a broken runtime instead of disposing it ([agent UI rendering](agent-ui-rendering.md)).
- 00:40 to 00:45 on 2026-10-20, on disk, unreported:
  - `harness/src/QuickJSSandbox.ts` (00:42) sets `setMaxStackSize` to 128 KiB, "the same bound `@smthrs/views`' presentation realm sets". If the host's stack still overflows inside the interpreter, the cell is rejected with reason `stack` and the realm is replaced: "Its realm was reset, so names from earlier cells are gone." `Cell.ts` changed at 00:40.
  - `test/ReplRealm.test.ts` (00:41) adds "the realm's stack": model-written recursion stops at QuickJS's bound as `InternalError: stack overflow`, which the cell can catch. `docs/troubleshooting.md` and `docs/api.md` changed at 00:42.
  - Scratchpad `harness-test.log` (00:42 to 00:43): 2,454 tests pass and 3 skip, but coverage is 99.96% statements and 99.89% branches, every miss in `QuickJSSandbox.ts`, below the 100% gate. A coverage rerun started at 00:45 (`harness-cov.log`).
  - No report on any of the three items.

- 00:45 to 00:49 on 2026-10-20, on disk, unreported:
  - **The harness coverage gap is closed:** the rerun (scratchpad `harness-cov.log`, 00:45 to 00:46) passes 2,455 tests, 3 skip, at 100% on all four measures.
  - `@smthrs/model` (`model-test.log`, 00:46): 1,009 pass, 9 skip, 100%. Its `CHANGELOG.md` changed at 00:46.
  - `agent/test/Fault.sweep.test.ts` changed again at 00:49, best guess the `ModelProxyRefusal` red. No `@smthrs/agent` result since 00:23.
  - No report on any of the three items.

- **About 00:55 on 2026-10-20: done**, reported with items 1, 2 and 4 of the [B1 follow-ups](b1-follow-ups.md), every touched package at 100% coverage:
  - **Red 1, `@since`:** the harness `PackageConventions` red is fixed; `QuickJSVariant`'s tag no longer names an unreleased version.
  - **Red 2, `ModelProxyRefusal`:** classified like `ModelError`, so the agent's model step retries it exactly as it retries the errors it maps to. A 429 or 402 waits; a 5xx is a dependency failure; a 401 or `out_of_credit` goes to a person; a 400 is a factory failure ([model endpoint](model-endpoint.md)).
  - **Item 3, the QuickJS stack:** the harness cell sandbox bounds QuickJS's stack at 128 KiB, the same bound as `@smthrs/views`. Deep recursion in model-written code is a catchable error; an overflow that still reaches the host becomes `limit_exceeded` with reason `"stack"`, and the broken runtime is abandoned, not disposed, so the next cell starts fresh.
  - The lead then fixed the flow runtime's README, which still said browsers can't run flows durably, and formatted two `ModelProxy` files.
  - The lead to Will: "Model-written code that recurses deeply now gets a catchable error instead of crashing the host. A runtime that does overflow is thrown away and the next cell starts fresh."
- Not in this item and not reported on: the engine-store suites that failed under load at 00:20 and passed alone.

## Next

None for this note. If the engine-store suites that failed under load at 00:20 on 2026-10-20 fail again, they get their own item.

Until about 00:55 on 2026-10-20 the next step was: the agent's report: each red's cause and its fix at the source; the stack limit with a test that recursion in a cell can't crash the host; and 100% coverage for every touched package, harness included.

Until about 00:36 on 2026-10-20 the next step was: the agent's report: each red's cause, its fix at the source, and 100% coverage for every touched package. Then decide whether the engine-store suites that fail under load need their own item.

## Questions for Will

None.
