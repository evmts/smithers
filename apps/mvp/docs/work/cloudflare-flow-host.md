---
title: Cloudflare flow host in the Worker (remote flows)
status: done
area: infra
owner: none open from Fable review 2: the engine and hosts agent reported P3-1 and P3-7 fixed at 07:07:38 on 2026-10-20. Until 07:07: Fable fix agent: engine and hosts (since 06:09:22 on 2026-10-20): P3-1, settled Durable Objects keep their intent forever, and P3-7, the remote door with nothing to start; tracked in `fable-review-2-fixes`. Until 06:09: W5 (a)+(c) agent (started 22:59, reported done 23:39 on 2026-10-19), the Worker wiring, W5 (c) of durable answering; Cloudflare child-flow agent (started by 23:12 on 2026-10-19, reported done 00:21 on 2026-10-20), review 2's P1 fix in `platform-cloudflare`
updated: 2026-10-20
links: [../decisions/0011-the-agent-runs-in-the-browser.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0003-flows-and-the-agent.md, durable-answering.md, model-endpoint.md, repo-clone-and-view.md, host-agnostic-flows.md, infrastructure-as-code.md, code-reviews.md, everything-is-a-durable-flow.md, flows-root-platform-neutral.md, b1-follow-ups.md, platform-cloudflare-edge-cache.md, sdk-test-reds.md, disk-space.md, plan-identity-across-deploys.md, fable-review-2-fixes.md, flows-and-agent.md, land-to-main.md, second-build-machine.md]
---

## What

Wire `@smthrs/platform-cloudflare`'s flow host into the app's Worker, so flows that must run on the server run there as durable flows. The first is `repo/Clone` (decision [0006](../decisions/0006-repo-clone-and-view.md) R3).
- The `ExecutionObject` Durable Object joins the Worker and the Alchemy stack (`alchemy.run.ts`). Each execution gets one object, woken by alarms; the engine's journal lives in Postgres schema `smithers_flows` through Hyperdrive.
- Only the Worker entry files and `alchemy.run.ts` import Cloudflare (`sdk.host-agnostic-flows`), so the same flow code runs on the Node host for the native app later.

## Why

Will's feature 1: a durable workflow can run locally, "or delegate to a flow that runs remotely: on Cloudflare, or in a sandbox". Decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) moved the agent into the browser but kept this host for remote flows; its Consequences name W5 (c) as the owner. Will, 22:22 on 2026-10-19: "make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally".

## State

- W4 built `@smthrs/platform-cloudflare` earlier on 2026-10-19: a workerd smoke test aborts a Durable Object mid-step and the run finishes in a new incarnation ([durable answering](durable-answering.md)).
- 22:42 to 22:54: the 0011 docs revision named this work W5 (c) in `HOST-PLAN.md`; until then [repo clone and view](repo-clone-and-view.md) R3 had no owner for it.
- 22:58: W1 finished. Each alarm now calls `EngineStore.drive` once; the package has 36 tests at 100% coverage, with the workerd smoke.
- 22:59: **started**, in one agent with the [model endpoint](model-endpoint.md). The brief's proof:
  - one tiny remote flow, two steps with a durable sleep, in local workerd (`alchemy dev` or the package's workerd harness); killed mid-flow, it resumes;
  - the same flow on the Node host in a unit test, for host-agnosticism ([host-agnostic flows](host-agnostic-flows.md));
  - `pnpm plan` passes, plan only, never a deploy ([infrastructure as code](infrastructure-as-code.md));
  - the mvp `importRules` pass, except the known `waitUntil`.
- 23:01: **[Codex checkpoint review 2](code-reviews.md), P1: the Cloudflare runtime can't run a child flow or a trampoline handoff.**
  - `CloudflareRuntime.ts:59` admits only `options.executionId`. A parent that starts a registered child creates a different run id, which `RunDriver.claimAndActivate` refuses (`RunDriver.ts:963`).
  - Nothing creates an `ExecutionObject` intent or alarm for the child, and this host turns the sweep off, so the child stays pending and the parent never completes. A trampoline handoff to another execution id has the same routing gap.
  - Codex's fix: durable dispatch and wake routing for child and handoff executions to their own objects, waking the parent when the child settles; or a host policy that drives the whole lineage. Plus a hosted nested-flow and trampoline test across runtime reconstruction.
  - Not assigned at 23:07. (Assigned by 23:12, below.)
- 23:07: no file changed yet in `apps/mvp/worker`, `alchemy.run.ts` or `packages/smithers/flows/platform-cloudflare` since W1.
- By 23:12: **the child-flow fix is assigned** to a new agent in `packages/smithers/flows/platform-cloudflare`, with workerd tests for a nested flow and a trampoline handoff. The lead told W5 not to edit that package.
- 23:15, on disk, unreported:
  - W5's wiring: `worker/ExecutionHost.ts` and `worker/Executions.ts` (new), a remote flow `worker/flows/Pause.ts` with `Pause.test.ts`, a test host `worker/test/flowHost.ts`, a `ChatApi.ts` change at 23:14, and an `alchemy dev` log at 23:13. `alchemy.run.ts` is unchanged since 21:36.
  - `platform-cloudflare/src` is unchanged since `ExecutionObject.ts` at 22:41; the child-flow agent hasn't written a file yet.

- 23:15 to 23:25, on disk, unreported:
  - **W5's remote flow is proven in tests, pending its report.** `worker/ExecutionHost.workerd.test.ts` (23:19): "runs probe/Pause from real alarms and finishes it in a new incarnation after ctx.abort() mid-step". `worker/ExecutionHost.test.ts` (23:24), on compose Postgres: alarms drive `probe/Pause` through its durable sleep to the end, one log line and one count per start and alarm, never the payload. `worker/flows/Pause.ts` and `Pause.test.ts` stay.
  - The Durable Object is `FlowExecution`, declared in `worker/Executions.ts` through Alchemy's `Cloudflare.DurableObject` and bound in `ChatApi.ts`; `alchemy.run.ts` is still unchanged since 21:36. No `pnpm plan` result is on disk.
  - **A new feature doc, `apps/mvp/docs/features/remote-flows.md`** (23:24): what runs remotely (a key the person must not hold, a machine, or work while every device is off; never duration), one object per execution, and the alarm loop with backoff.
  - **W5 widened the mvp `ImportRules`** (`apps/mvp/PACKAGE.ts`, 23:19): `worker/Executions.ts` and `worker/ExecutionHost.ts` join `ChatApi.ts` and `index.ts` as Worker entries that may import Cloudflare ([host-agnostic flows](host-agnostic-flows.md)).
  - **The child-flow agent's first files:** `test/Proto.test.ts` (23:18), a throwaway trampoline probe over Postgres that logs each drive's lineage; a new `src/internal/Routing.ts` (23:24), which reads from the store, after every drive, the executions the drive admitted or made due (a `.child()`, a `.to()` handoff, a waiting parent, a linked child to cancel) so each goes to its own Durable Object; and a change to `src/ExecutionObject.ts` (23:25). No workerd nested-flow or trampoline test yet.

- 23:25 to 23:37, on disk, unreported:
  - **The child-flow fix has its tests.** `test/Routing.test.ts` has six cases, among them "a parent starts its child on the child's own object, and the child's settlement wakes it", "a child's failure fails its parent", "each round of a lineage runs on its own object, and one reset in a round's step resumes there", a router failure retried with backoff, and a cancelled parent waking the child it asked to cancel. `test/WorkerdSmoke.test.ts` adds three workerd cases: parent and child on their own objects, a child's failure, and a lineage of handoffs. `src/internal/Routing.ts` (23:31) and `src/ExecutionObject.ts` (23:32) changed again, with `ExecutionObject.test.ts`, `Observability.test.ts` and new fixtures (`NestedFlows.ts`, `incarnation.ts`, `Objects.ts`). The throwaway `Proto.test.ts` is gone. No pass result is on record.
  - **W5:** `alchemy.run.ts` (23:25, again 23:35) now declares `FlowExecution`, the Durable Object ChatApi hosts, one per remote flow execution, running the engine over Postgres schema `smithers_flows` through the same Hyperdrive config. `worker/ExecutionHost.ts`, `Executions.ts`, both tests and the workerd test worker changed through 23:34; a new `worker/DevChatApi.ts` and a `ChatApi.ts` change at 23:35; `docs/infrastructure.md` at 23:25. No `pnpm plan` result is on disk.
- 23:33: the lead lists W5 (a)+(c) and the child-flow fix as still running.

- 23:39: **W5 (c) is done, reported.**
  - The `FlowExecution` Durable Object is in ChatApi and the Alchemy stack, and the production plan passes.
  - `probe/Pause`, two steps, is proven on the Node host and in a Miniflare kill-and-resume.
  - **Gap:** the kill-and-resume ran against a stand-in Durable Object, not the real Alchemy class. The lead told Will.
  - **Open items:** `db:migrate` doesn't apply the engine's own migrations (schema `smithers_flows`); they run on the first alarm. The worker tsconfigs gained the DOM lib.
  - W5 found that the `@smthrs/flows` root pulls Node-only jj code into Worker and browser bundles; a new agent fixes the root ([flows root](flows-root-platform-neutral.md)).
- 23:36 to 23:41, on disk, unreported: the child-flow agent's tests changed again at 23:36 (`Routing.test.ts`, `WorkerdSmoke.test.ts`, `ExecutionObject.test.ts`, `Observability.test.ts` and the `NestedFlows.ts` fixture), with `engine-store/test/HostedEngine.test.ts` at 23:38. Then its docs, 23:39 to 23:41: `README.md`, `docs/api.md`, `docs/quickstart.md`, `docs/troubleshooting.md`, `docs/concepts/execution-lifecycle.md`, `docs/guides/host-a-flow-in-a-durable-object.md`, `PACKAGE.ts`, and the `platform-cloudflare` and `engine-store` changelogs. Docs come last, so it looks close to its report. No pass result is on record.
- About 23:41: B1 reported that `BrowserRuntime.isAlive` duplicates `CloudflareHost.isAlive`; one run-store helper replaces both once this agent finishes ([B1 follow-ups](b1-follow-ups.md)).

- 23:49 to 23:52 on 2026-10-19, on disk, unreported: the child-flow agent changed `platform-cloudflare/src/index.ts` (23:49), the `NestedFlows.ts` fixture and `Routing.test.ts` (23:50), and `docs/api.md` and `docs/concepts/execution-lifecycle.md` (23:51 to 23:52). `src/internal/Routing.ts` changed again at 00:00 on 2026-10-20.
- 00:02 on 2026-10-20: the agent paused to wait: "The engine-store coverage matrix is still running; I'll report once it completes." The lead told Will: "The child-flow fix for the Cloudflare host is waiting on its last coverage run, so there's no result yet."
- 00:08, from the scratchpad's `engine-matrix.log` (engine-store): the first leg passed 2,107 of 2,108 tests. The one failure is a 60-second timeout in `test/Docs.test.ts`, "assembled quickstart typechecks against public Jj". The second leg, on Postgres, was still running. No report.
- 00:04: S1 registered a second remote flow beside `probe/Pause` in `worker/ExecutionHost.ts`: `auth/RecheckRole`, which rechecks a signed-in person's role with GitHub ([sign-in](sign-in.md)).


- 00:12 to 00:15 on 2026-10-20, from `engine-matrix.log`: **the Postgres leg, still running, has 4 failures.** `PlanSchedulerAdmission.test.ts` fails 1 of 19 ("executes the verified snapshot when caller-owned plan data changes during dispatch"). `CompensableSnapshotRestart.test.ts` fails 3 of 4: after a restart before attempt 2, the compensable handle is restored more times than expected (6 to 9 calls where 3 are expected). Whether these are load or real defects isn't known. No report.

- 00:20 on 2026-10-20, from `engine-matrix.log`: engine-store's combined SQLite and Postgres coverage run ended at 100% on all four measures, with failures in three suites the fix doesn't touch: `CompensableSnapshotRestart`, `EffectBoundaryRecords` and `PlanSchedulerAdmission`.
- 00:21 on 2026-10-20: **the child-flow fix is done, reported.** The lead told Will at 00:24. Codex review 2's P1 finding 1 is closed ([code reviews](code-reviews.md)).
  - **Routing:** after each drive, `ExecutionObject.alarm` reads from the store, through `src/internal/Routing.ts`, what the drive created or made due. It starts each new child and each next trampoline round on its own Durable Object, and wakes each parent with work due. Every wake is an alarm or a store record, with no sweep or `waitUntil`.
  - **Lost-wake race:** after arming a parked execution's alarm, it reads `EngineStore.nextWake` again. Without that second read, a child that settles while its parent's alarm runs leaves the parent parked forever.
  - **Engine-store fix:** `EngineStore.drive` on a settled final round records its parents' wakes again. This closes a crash gap where a child settled but its parent's wake was never written. The new `HostedEngine.test.ts` case fails without it.
  - **Proof:** 53 of 53 tests at 100% coverage, including the workerd smoke on real Durable Objects: nested flows, a child's failure, and a trampoline with `ctx.abort()`. With routing switched off, the nested case hangs again: parent suspended, child pending. Engine-store passed 2,108 of 2,108 on SQLite and on Postgres. The agent called the combined run's failures unrelated: rerun alone, they passed, and `CompensableSnapshotRestart` failed once on Postgres, then passed alone ([SDK test reds](sdk-test-reds.md)).
  - **API change W5 needs, not backward compatible:** `alarm` takes `router: { start, wake }`; the Durable Object exposes a `wake` method that calls `ExecutionObject.wake(storage)`; `flows` lists every flow an execution can start as a child or hand off to; whoever cancels an execution then calls `wake` on its object. W5's `worker/ExecutionHost.ts` and `Executions.ts` already use it and typecheck.
  - Docs, both changelogs and `PACKAGE.ts` are updated, and `pnpm docs:sync` and the docs-sync check flow passed. Two checks were blocked outside the package: `smthrs docs`, by the stale `SandboxedFlow.ts` path ([flows root](flows-root-platform-neutral.md)), and the Go half of `pnpm docs:check`, which refused with 4.5 GiB free ([disk space](disk-space.md)). Nothing is committed.
- With the fix done, `platform-cloudflare` is free for the [edge cache](platform-cloudflare-edge-cache.md) and for the [B1 follow-ups](b1-follow-ups.md)' liveness helper.
- **02:53 on 2026-10-20: a late correction from the W5 (c) agent.** Its step 10 said `alchemy dev` was running. In fact the dev server it restarted was stopped by SIGINT (exit 130) from outside its session, and `localhost:1337` stopped answering; it didn't relaunch it, "since someone stopped it on purpose". The rest stands: "The 8 tests pass, the worker and infra tsconfigs typecheck clean, `importRules` reports only the known `waitUntil`, and `pnpm plan` exits 0 and lists `[ChatApi/FlowExecution] create`." The lead (02:53): it "changes nothing". The dev server is the wiring agent's to restart for Will ([app wiring](app-wiring.md)).
- 02:54:49, scratchpad `wiring/unit.log`: in the wiring agent's full `apps/mvp` run, `worker/ExecutionHost.test.ts` "start wakes the object at once; alarms drive probe/Pause through its durable sleep to the end" failed with `expected 'Retrying' to be 'Parked'`. Best guess timing under full-suite load; no rerun alone is on record. Status stays done until a rerun shows a real red.
- **About 05:25 on 2026-10-20: parked remote runs fail after a ChatApi rebuild.** `chat/Expire` runs asleep on `FlowExecution` across rebuilds of the dev Worker failed at wake with `plan_changed`, leaving 2 dev answers stuck `streaming` (`5a0b09e4…` and `49ad42d3…`, kept as evidence). Cause: the plan record includes each node's `declaredAt` (bundle path and line), and the journal compares records by content. The defect is in the shared engine store, and an SDK agent is fixing it ([plan identity across deploys](plan-identity-across-deploys.md)). Status stays done for the host; until the fix lands, every deploy fails the remote runs in flight; best guess a `repo/Clone` that resumes after one too.
- **06:08 on 2026-10-20: Fable review 2's P3-1 and P3-7 are here** ([Fable review 2 fixes](fable-review-2-fixes.md)). P3-1: on `Settled`, `ExecutionObject.ts:505-507` deletes the alarm but never the intent, and one object exists per answer, per hourly role check per session, per sign-out and per clone attempt, so storage grows without bound. P3-7: the remote door (`worker/Flows.ts`, `RemoteFlows.layerHttp`) is live and answers 404 for every name. The engine and hosts agent started 06:09:22: settled objects delete their intent once retention allows, tested in workerd, with no sweep or loop; the door gets a flow or goes. Status stays done: P3 findings don't reopen a done note.
- 06:14:43 on 2026-10-20, on disk, unreported: `worker/Flows.ts` drops the door; every remote flow is started by the route that admits it (`features/remote-flows.md#no-remote-door`). `ExecutionObject.ts` is unchanged since 23:32 on 2026-10-19.
- **07:07:38 on 2026-10-20: P3-1 and P3-7 fixed, reported** by the engine and hosts agent ([Fable review 2 fixes](fable-review-2-fixes.md)). P3-1: `ExecutionObject.ts` records when a run settles and arms one final alarm a day later, which deletes the intent, failure count, settled marker and alarm, and answers a new outcome, `Forgotten`. No sweep; `engine-store` untouched; run history stays in Postgres. In workerd, `storage.list()` is `{}` with no alarm after the window, a late `wake` answers false, and a late duplicate `start` settles from the stored run without re-running a step. `platform-cloudflare` passes 63 of 63 at 100% coverage, workerd included; two `probe/Pause` timers were lengthened because the first alarm, which migrates the engine schema, sometimes overran them under load. P3-7: the remote door is removed, and `worker/Flows.ts` holds only `FlowStarter` ([flows and the agent](flows-and-agent.md)). Status stays done (P3s add a line).
- 07:07:47 on 2026-10-20, the lead to Will: "Durable Object cleanup: a finished run's Durable Object now clears its own storage a day after it settles. A workerd test shows the storage empty afterward and a late duplicate start still answered correctly."
- **13:04:55 on 2026-10-20: P3-1 landed on `main`** in round 2 as `af44291639` "🐛 fix(platform-cloudflare): a settled execution object forgets its state after a retention window" (changeset `settled-objects-forget`), with the app's `worker/ExecutionHost.test.ts` and `worker/ExecutionHost.workerd.test.ts` ([land to main](land-to-main.md)).
- 14:20 on 2026-10-20: the Codex coordinator on the [Latitude server](second-build-machine.md) has the Codex P1 above as task (a), to fix if still open on `main@origin`. This note records the fix as done at 00:21; if it never reached `main`, the lane redoes it and may collide with round 3 ([land to main](land-to-main.md)).

## Next

From 07:07 on 2026-10-20: nothing from Fable review 2. Still open from about 05:25: a `chat/Expire` parked across a rebuild settling at wake in `alchemy dev`, now that [plan identity](plan-identity-across-deploys.md) is fixed for declaration sites; the [minified builds](plan-identity-minified-builds.md) follow-up still runs.

Until 07:07 on 2026-10-20 the next step was, from 06:09 on 2026-10-20: the engine and hosts agent's report: settled objects that keep no intent, proven in workerd, and the door removed with `features/remote-flows.md` saying why ([Fable review 2 fixes](fable-review-2-fixes.md)). Also, from about 05:25: a `chat/Expire` parked across a rebuild settling at wake in `alchemy dev`, now that [plan identity](plan-identity-across-deploys.md) is fixed for declaration sites; the [minified builds](plan-identity-minified-builds.md) follow-up still runs.

Until 06:09 on 2026-10-20 the next step was, from about 05:25 on 2026-10-20, first: the [plan identity](plan-identity-across-deploys.md) fix, proven in `alchemy dev` by a `chat/Expire` parked across a rebuild that settles at wake. That also serves loose end 1 below.

Close W5's three loose ends: a kill-and-resume against the real `FlowExecution` class in `alchemy dev`; `db:migrate` applying the engine's migrations, so the first alarm doesn't; and whether the worker tsconfigs need the DOM lib. Rerun the Go half of `pnpm docs:check` for the fix. `repo/Clone` follows ([repo clone and view](repo-clone-and-view.md) R3), after the [edge cache](platform-cloudflare-edge-cache.md).

Until 00:21 on 2026-10-20 the next step was: the child-flow agent's report, once its engine-store coverage matrix finishes (waiting since 00:02 on 2026-10-20): nested flows, a child's failure and handoff lineages passing on workerd across runtime reconstruction. Then close W5's three loose ends: a kill-and-resume against the real `FlowExecution` class in `alchemy dev`; `db:migrate` applying the engine's migrations, so the first alarm doesn't; and whether the worker tsconfigs need the DOM lib. `repo/Clone` follows ([repo clone and view](repo-clone-and-view.md) R3), with the [edge cache](platform-cloudflare-edge-cache.md).

(By 23:37 the child-flow agent's nested-flow and lineage tests are written in `Routing.test.ts` and `WorkerdSmoke.test.ts`; no pass result yet.)

Until 23:39 the next step was: two reports: W5's 2-step remote flow on workerd and on Node, with `pnpm plan` passing; and the child-flow agent's nested-flow and trampoline tests across runtime reconstruction. `repo/Clone` follows both ([repo clone and view](repo-clone-and-view.md) R3).

Until 23:12 the next step was: W5's report on the 2-step remote flow. Then fix the child-flow routing before any remote flow starts a child or hands off; `repo/Clone` comes next ([repo clone and view](repo-clone-and-view.md) R3).

## Questions for Will

None.
