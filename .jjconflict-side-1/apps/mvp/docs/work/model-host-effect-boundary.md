---
title: model-host runs Effects only at the boundary
status: done
area: sdk
owner: SDK defects agent (finished 22:47); lead
updated: 2026-10-19
links: [../rules.md, import-rules-and-jev-lint.md, model-step.md, sdk-cleanup.md, durable-answering.md, decisions-for-will.md]
---

## What

Remove the 7 places where `@smthrs/model-host` breaks out of Effect, so the package returns Effects and only the program's boundary runs them:
- `src/HostServer.ts`: 4 `Effect.runPromiseExit` calls (lines 397, 403, 446, 472) and 2 `Effect.runPromise` calls (492, 500), one of which updates the turn-duration metric;
- `src/ModelProbe.ts`: 1 `Effect.runPromiseExit` call (line 195).

## Why

Will: "we should never runPromise or any other way of breaking out of effect and if we do it should only be on the absolute boundary of the program where necessary". Rule `effect.boundary-only` in `rules.md` applies SDK-wide, and its Jev check flags these calls.

## State

- 21:29 on 2026-10-19: the lead found the 7 calls and queued the fix. Nothing is changed.
- It waits for W3 ([`ModelStep`](model-step.md)), which is editing `@smthrs/agent` beside `model-host`.
- 21:43: W3 is still running, so the fix hasn't started.
- About 21:45, after W3 reported: the lead started one agent on three SDK defects.
  1. `model-host`'s 7 calls: make the handler Effect-native end to end (an `effect/http` handler or an Effect the host runs); where a third-party callback needs a Promise, capture `Effect.context()` once and use `runPromiseWith`. Update every caller in `apps/` and `packages/`. Add a `forbidCalls` entry to the package's `PACKAGE.ts` banning `Effect.runPromise`, `runPromiseExit`, `runSync`, `runSyncExit`, `runFork` and `runCallback` in `src/**`, removing any `sdkRuleLibraries` exemption.
  2. W3's coverage gap: type `publicError` in `@smthrs/harness` as `(error: Exclude<E, HarnessError>)`, delete the dead branch at `StandardFlows.ts:95`, and bring `@smthrs/agent` to 100% on all four counts.
  3. W3's stale `CellFlows` snapshot: confirm the new `cellPrompt.ts` sentence is intended upstream with `jj log`, then update it, or report it.
  - Also: rerun `smthrs docs //packages/smithers/agent:docs`, which W3 saw fail on a security check naming `packages/effect-code-storage/src/CodeStorage.ts`.
- 21:54: the harness typing edit is made; the agent is rewriting `HostServer.ts`'s handler and a bounded JSON reader. No report yet.
- On disk by 22:01, uncommitted, not yet reported:
  - `model-host/src` has no `Effect.runPromise`, `runPromiseExit`, `runSync`, `runSyncExit`, `runFork` or `runCallback` call left; `HostServer.ts` changed at 21:56 and `ModelProbe.ts` at 21:59, with their tests.
  - `model-host/PACKAGE.ts` has the `forbidCalls` entry over `src/**` banning all six, citing `effect.boundary-only` and `Effect.runPromiseWith` for third-party callbacks. The README changed with it.
  - `StandardFlows.ts` has no `instanceof HarnessError` branch left, and `FlowBinding.ts` types `publicError` as `(error: Exclude<E, HarnessError>)`.
  - Not yet seen: the `CellFlows` snapshot ruling, coverage numbers, and the agent docs target rerun. The lead lists the agent as running at 22:00.
- 22:08: **Will stopped the agent**, along with W1 ([durable answering](durable-answering.md)). No reason given. Its last write was `model-host/test/HostServer.test.ts` at 22:08. Everything listed above stays on disk, uncommitted and unverified: no test, coverage, lint or docs result was reported.
- 22:09, 22:13 and 22:14: the lead asked Will whether to restart it. No answer at 22:14. **Blocked on Will.**

- 22:16: Will: "I never stopped any agents"; "If I stopped an agent it was unintentional". **The stop was accidental.** 22:17: the lead restarted it; a fresh replacement started about 22:20 and continues from the work on disk. No longer blocked on Will.
- Since the restart, on disk: `model-host/src/internal/BoundedJson.ts` (22:19), `model-host/PACKAGE.ts` (22:20) and `harness/test/FlowBinding.test.ts` (22:24). No report yet.

- 22:46: no file under `agent/model-host` or `agent/harness` changed since 22:24. `agent/test/ModelStep.test.ts` changed at 22:36; W1 also works on `ModelStep`, so the author is unclear. The lead lists the agent as running at 22:43. No report yet.

- 22:47: **done; all three fixes pass.** The lead's report to Will:
  1. No Effect escape is left in `model-host`. The `forbidCalls` entry in `model-host/PACKAGE.ts` uses receiver-agnostic patterns (`*.runPromise`, `*.runPromiseExit`, `*.runSync`, `*.runSyncExit`, `*.runFork`, `*.runCallback`), so it catches a call on any receiver ([route ban on any receiver](route-ban-any-receiver.md)); `Effect.runPromiseWith` stays allowed for third-party callbacks.
  2. The dead `instanceof HarnessError` branch in `StandardFlows.ts` is gone, with a type test in its place (`harness/test/FlowBinding.test.ts`).
  3. The `CellFlows` snapshot change was intended: it came from an upstream fix, commit `56a3eedc9b48` (#4284), so the snapshot was updated.
  - Every touched package is at 100% coverage, and every check passes.

## Next

Done. Nothing is left in this item.

Until 22:47 the next step was the restarted agent's report (until 22:16 this step waited on Will's restart answer): the `effect.boundary-only` check passing on `model-host`, the new `forbidCalls` entry, `@smthrs/agent` at 100% coverage, the snapshot ruling, and each touched package's typecheck, lint, tests, `pnpm docs:check` and the agent docs target.

## Questions for Will

- None.
- You stopped this agent at 22:08. Restart it from its on-disk work? Recommended: yes; the `model-host` rewrite is written but untested. (Answered 22:16: accidental; restarted about 22:20.)
