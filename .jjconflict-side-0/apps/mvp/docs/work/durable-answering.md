---
title: Durable answering: the Cloudflare host, then the browser agent
status: in-progress
area: sdk
owner: lead; from about 05:25 on 2026-10-20 an SDK agent fixes the plan-identity defect that strands parked answer runs across a rebuild ([plan identity across deploys](plan-identity-across-deploys.md)); W1 to W4 done (W1 finished 22:58); W5 (a)+(c) done 23:39 (one agent; [model endpoint](model-endpoint.md), [Cloudflare flow host](cloudflare-flow-host.md)); W5 (b), the answer routes, written inside F5 (on disk 23:59; routed in `worker/Chat.ts` at 00:44 on 2026-10-20; F4+F5 reported done about 01:16); (d), the deletions, by the wiring agent since about 01:17 on 2026-10-20, which also closes Codex Astra review 3's finding 3; (d) on disk by 01:53, unreported; from about 03:20 under the lead's rules: a stuck answer settles as failed in the product, and the answer deadline lives in config with the model role; since 03:24 on 2026-10-20 the wiring agent's sub-agent D2 does both (the config and the deadline race on disk 03:38 to 03:42, `chat/Expire` not yet; unreported)
updated: 2026-10-20
links: [app-wiring.md, ../features/chat.md, ../observability.md, ../infrastructure.md, ../../../../AGENTS.md, model-step.md, infrastructure-as-code.md, model-host-effect-boundary.md, repo-clone-and-view.md, decisions-for-will.md, host-agnostic-flows.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, model-endpoint.md, flows-and-agent.md, cloudflare-flow-host.md, code-reviews.md, flows-root-platform-neutral.md, local-first.md, agent-root-browser-safe.md, benchmarks.md, plan-identity-across-deploys.md]
---

## What

Since decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) (22:31 on 2026-10-19), answering is the browser agent: a `@smthrs/flow` flow on the [durable browser engine](durable-browser-engine.md), whose model calls are [`ModelStep`](model-step.md)s through the server's [model endpoint](model-endpoint.md). The server keeps two jobs:
- the metered model endpoint, restored from the deleted `ModelProxy` (commit `fadb89048fc8`);
- the write path for messages.

The app's `waitUntil`, cron, sweep and `attempts` column are still deleted. W1 to W4 still matter: the engine and `@smthrs/platform-cloudflare` run remote flows, such as `repo/Clone` into Code Storage.

Until 22:31 the plan was: answering becomes the Smithers flow `chat/Answer`, keyed by answer id: Ask, LoadHistory, a sealed [`ModelStep`](model-step.md), Settle, within a 10-minute deadline. A new host, `@smthrs/platform-cloudflare`, runs it: one Durable Object per execution drives the engine from alarms, and the journal lives in the app's Postgres (schema `smithers_flows`) through Hyperdrive. The app's `waitUntil`, cron, sweep, `attempts` column and semaphore get deleted.

## Why

Will: "Answering is not a durable flow? In this case we aren't done ... we reimplemented durability rather than either 1. using smithers 2. if smithers isn't good enough making smithers good enough". Opus and Codex planned it independently and agreed.

Will, 22:25, on where answering runs: "The agent should run on frontend and the frontend itself should be durable." 22:29: "Long work isn't what decides if it's remote or not. We prefer things to be local first actaully".

## State

- W1, engine: `Action.CurrentFence` and `RunStore.owned` are in the flow and run-store changelogs. Runtime storage is injectable, with a filesystem-free host case.
  - Now fixing the connection-loss bug W4 found: storage failures classified in `EngineStore.actionExecute`, and a test that drops the engine's connection mid-transaction on Postgres and on PgBouncer.
  - Lands next: the fix in its four callers and a drive-once API.
  - On disk at 21:27, uncommitted, not yet reported: the engine-store changelog lists the connection-loss fix (the attempt stays adoptable and the next drive records the result), `EngineStore.drive` (drive once, report `Settled`, `Parked` with the next wake, or `Unfinished`), `EngineStore.nextWake`, the `flows_engine_storage_unavailable` counter and `OwnerIdentity.layerWithoutPid`. New tests: `ConnectionLoss.test.ts`, `HostedEngine.test.ts`. The lead still lists W1 as running at 21:29.
- W2, database: done. The Postgres layer no longer sets `search_path` per session, so it is safe behind Hyperdrive and PgBouncer.
- W3, agent: [`ModelStep`](model-step.md) is built; the agent is finishing its docs and test call sites. Still running at 21:29.
- W4, host: done. `@smthrs/platform-cloudflare` has 33 tests at 100% coverage against Postgres and PgBouncer. A workerd smoke test aborts a Durable Object mid-step and the run finishes about 1 s later in a new incarnation.
  - The lead registered it for release, the browser-bundle contract and the pin register, and documented its smoke pin and W2's PgBouncer skip.
  - Red: `pnpm docs:check` fails on `platform-cloudflare` (reported 21:23 by another agent).
  - 21:29: `pnpm docs:check` passes again, after the lead fixed two stale docs (decision 0002's plan step 2 and the mvp row in `docs/libraries.md`).
- 21:18: a weekly usage limit stopped W1 and other agents; Will reset the account and all resumed by 21:21.
- W5 hasn't started: `worker/ChatApi.ts` still answers inside `waitUntil` (`ImportRules` flags line 54). Nothing is committed.
- 21:43: the lead lists W1 and W3 as still running. W5 now also gates feature 2's R3: the clone flow `repo/Clone` needs this Cloudflare host ([repo clone and view](repo-clone-and-view.md)).
- 21:43: `worker/ChatApi.ts:54` (`execution.waitUntil`) is the only `importRules` failure left in `apps/mvp`.
- About 21:44: W3 done. [`ModelStep`](model-step.md) has 22 cases on real Postgres, including real-SIGKILL tests. Its coverage gap (`StandardFlows.ts:95`) and stale `CellFlows` snapshot went to the [SDK defects agent](model-host-effect-boundary.md).
- W3's four engine asks went to W1: a re-run attempt flag, span failure text, a false WARN, and Retry-After naming (`RetryPolicy.decide` reads `retryAfterMs`; `ModelError` carries `retryAfterMillis`). At 21:54 W1 is removing the two `ModelStep` shims in favor of the engine's signals. W1 has posted no report.
- About 21:45: the lead bound Electric into ChatApi (`yield* Electric.bind`) from the [IaC](infrastructure-as-code.md) diff. The `waitUntil` the lint flags moved to `worker/ChatApi.ts:56`.
- On disk by 21:54, uncommitted: three of W3's four engine asks answered in `@smthrs/flow`'s changelog.
  - `Action.CurrentRedispatch` is true while a body re-runs an attempt an earlier execution started and never settled. `ModelStep` now reads it instead of its own shim ([`ModelStep`](model-step.md)).
  - `SpanFailure` moved from `@smthrs/model` into `@smthrs/flow`: `Action.execute` and each flow's `<tag>.execute` span export only a tag and a code, so failure text never reaches a trace.
  - Breaking: `RetryPolicy.decide` reads `retryAfterMillis`, the field `ModelError` carries, so a rate-limited step waits as long as the provider asked. `@smthrs/effect-code-storage` renamed its field to match ([spend caps](code-storage-spend-caps.md)).
  - Not seen in a changelog: the false WARN fix. The engine-store changelog is unchanged since 21:27.
- About 22:00: the lead lists W1 as still running. No report. W5 hasn't started.
- 22:08: **Will stopped W1** (engine host ports, fencing, the connection-loss fix and W3's four asks), along with the [SDK defects agent](model-host-effect-boundary.md). No reason given. Its partial work is on disk, uncommitted, and unreported:
  - engine-store: last changed 21:52 (`src/internal/ActionPersistence.ts`, `test/HostedEngine.test.ts`); the changelog entries from 21:27 (connection-loss fix, `EngineStore.drive`, `nextWake`, the storage-unavailable counter, `OwnerIdentity.layerWithoutPid`).
  - flow: last changed 21:54 (`Action/make.ts`, `internal/SpanFailure.ts`, changelog): `Action.CurrentRedispatch`, `SpanFailure` and the `retryAfterMillis` rename.
  - Not seen: the false WARN fix, and a report with test and coverage results.
- 22:09, 22:13 and 22:14: the lead asked Will whether to restart W1 and the SDK defects agent. No answer at 22:14. **Blocked on Will.**
- 22:13: the real production plan passed ([infrastructure as code](infrastructure-as-code.md)). It still carries ChatApi's every-minute cron, the interim answer sweep that W5 deletes.
- 22:16: Will: "I never stopped any agents"; "If I stopped an agent it was unintentional". **The stop was accidental.** 22:17: the lead restarted W1 and the SDK defects agent; fresh replacements started about 22:20 and continue from the work on disk. No longer blocked on Will.
- 22:20: `engine-store/test/ConnectionLoss.test.ts` changed, the restarted W1's first write. No report yet.
- 22:22: Will answered design question 0003.1: the agent loop runs on Cloudflare, with Cloudflare injected by dependency injection so the native app runs the same code locally ([host-agnostic flows](host-agnostic-flows.md)). The new `ImportRules` entry applies to W5: only `worker/ChatApi.ts` and `worker/index.ts` may import Cloudflare or Alchemy.
- Waiting on W5 now: R3 of [repo clone and view](repo-clone-and-view.md), Code Storage admission ([spend caps](code-storage-spend-caps.md)), and the last mvp lint failure (`waitUntil` in `worker/ChatApi.ts`).
- 22:25: Will, answering design question 0003.2: "A syncronous change to storage is by default durable yea. In fact this kinda explains why we maybe should reconsider where the agent runs." 22:29: model calls stay proxied through the server; Smithers must run in the browser through `platform-browser`; local first.
- 22:31: **decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) accepted.** W5 no longer moves chat answering into a Cloudflare flow. The browser agent answers ([flows and the agent](flows-and-agent.md)); the server keeps the [model endpoint](model-endpoint.md) and the message write path. New item: the [durable browser engine](durable-browser-engine.md), B1, started 22:31.
- Today `worker/ChatApi.ts` still answers inside `waitUntil`, with the every-minute sweep. 0011 still deletes both.
- W1 on disk since its restart, uncommitted and unreported:
  - 22:20 `engine-store/test/ConnectionLoss.test.ts`; 22:21 `flow/src/internal/RecordedPlan.ts`; 22:24 and 22:33 `platform-cloudflare`'s `ExecutionObject.ts` and its test.
  - `@smthrs/database` changelog: `Dialect.readTransaction` reads one snapshot with no writer lock (a deferred `BEGIN` on SQLite, `REPEATABLE READ READ ONLY` on PostgreSQL). It fixes engine-store reads that failed on `PostgresDatabase` with `SET TRANSACTION ISOLATION LEVEL must be called before any query`. `ExecutionSnapshot`, `RunChangeFeed` and the run listing now read through it.
  - Breaking: `PostgresDatabase.layer` requires `driver`, the `@effect/sql-pg` module, so the adapter bundles for browsers and Workers. The changelog also lists a root export, the `flows_db_writer_lock_wait` timer and a writer-lock benchmark (`pnpm bench`).
  - 22:34: `platform-cloudflare`'s README, `docs/api.md`, `docs/concepts/execution-lifecycle.md` and `package.json` changed.
- Open for the lead: W5 was to wire the Cloudflare flow host into `worker/`. 0011 keeps that host for remote flows but doesn't say who wires it now, and [repo clone and view](repo-clone-and-view.md) R3 waits on it.
- The writer-lock benchmark "under many streaming answers" matters less now: streaming answers leave the Postgres engine.

- W1 on disk since 22:34, uncommitted and unreported:
  - 22:35 to 22:37, `@smthrs/engine`: `test/RetryPolicy.test.ts`, a new `test/RetryOriginFallback.test.ts`, and a changelog entry: the first dispatch of an action whose retry policy declares `expirationMs` no longer logs `no durable retry origin`; the record is now Debug. That is the false WARN W3 asked for, so all four of W3's asks are now in changelogs.
  - 22:36 `agent/test/ModelStep.test.ts`; 22:41 `platform-cloudflare/src/ExecutionObject.ts`, whose changelog says `alarm` drives the execution once through `EngineStore.drive`; 22:42 `engine-store/test/ConnectionLoss.test.ts` and `HostedEngine.test.ts`.
- 22:42: **the 0011 docs revision is in progress.** The lead started a docs agent that:
  - adds a dated "Revised by 0011" section to `HOST-PLAN.md`. W5 becomes **(a)** the metered [model endpoint](model-endpoint.md), restored from `ModelProxy` (`fadb89048fc8`), with roles `agent`, `renderer` and `judge` set by `admin/SetModel`, checking sign-in and budget and metering tokens; **(b)** the message write path; **(c)** wiring `@smthrs/platform-cloudflare`'s flow host into `worker/` for remote flows such as `repo/Clone` ([repo clone and view](repo-clone-and-view.md) R3); **(d)** deleting `waitUntil`, the cron sweep and the `attempts` table. W1 and W4 stay as planned;
  - adds a Consequences line to 0011 naming W5 (c) as who wires the Cloudflare flow host;
  - revises 0003's build plan and 0009's run index for the browser host, and fixes proposal lines that place the agent on Cloudflare.
  - This closes the "Open for the lead" gap above: the wiring now has an owner, W5 (c). At 22:46 none of its target files had changed yet (`HOST-PLAN.md` last changed 20:02, 0003 and 0011 at 22:30, 0009 at 21:16).
- 22:43: the lead lists W1, B1 and the model-host fixes agent as still running.

- 22:47: the model-host fixes agent finished; all three fixes pass ([model-host Effect boundary](model-host-effect-boundary.md)). It doesn't touch W1's packages.
- **The 0011 docs revision is written on disk** (22:48 to 22:49), and the lead lists its agent as still running at 22:53:
  - `HOST-PLAN.md` has "Revised by 0011 (2026-10-19)": W5 is (a) the metered [model endpoint](model-endpoint.md) restored from `ModelProxy` (`fadb89048fc8`) with roles `agent`, `renderer` and `judge` set by `admin/SetModel`, the sign-in check, the budget and token metering; (b) the message write path; (c) wiring `@smthrs/platform-cloudflare`'s flow host into `worker/` for remote flows such as `repo/Clone`; (d) deleting `waitUntil`, the cron sweep and the `attempts` table. "W1 and W4 stay as planned." Decision 7's `chat/Answer` runs in the browser.
  - 0011's Consequences name W5 (c) as who wires the Cloudflare flow host.
  - 0003's build plan, 0009's run index and `proposals/early-features.md` are revised for the browser host ([flows and the agent](flows-and-agent.md), [notifications](notifications-and-live-work.md)).
- W1: no file in `engine`, `engine-store`, `flow`, `platform-cloudflare` or `agent` changed after 22:42. No report. The lead lists W1 as running at 22:53.
- 22:54: **the 0011 docs revision is done.** The lead: 0003, 0009 and HOST-PLAN match the browser-agent decision, and `pnpm docs:check` passes. One correction: the model endpoint is restored from the commit that added `ModelProxy`, `fadb89048fc8`, not from the commit that deleted it ([model endpoint](model-endpoint.md)).

- 22:58: **W1 is done; every gate is green.** Uncommitted. Its report:
  - The predecessor's work verified: the sweep option, the unsupported layers, the fence, injectable storage, `EngineStore.drive` and `nextWake`, the connection-loss fix, the four driver callers and all four of W3's engine asks. `ModelStep`'s workarounds were already gone.
  - **Fixed a W2 regression:** engine-store's snapshot reads failed on PostgreSQL ("SET TRANSACTION ISOLATION LEVEL must be called before any query") because the new `PostgresDatabase` runs each statement on a reserved connection as its own transaction. `Dialect.readTransaction(sql, effect)` moved into `@smthrs/database`; engine-store's copy is deleted.
  - Fixed the connection-loss test's PgBouncer case, which locked and killed sessions on the wrong server.
  - **`@smthrs/platform-cloudflare`:** each alarm calls `EngineStore.drive` once, replacing its own parking logic; the unused `@smthrs/engine` dependency and a raw `new Error` are gone; a new test covers an execution waiting on an event.
  - Removed an unreachable branch in `@smthrs/flow`'s `RecordedPlan.ts` that kept it below 100%.
  - **Retry-After tests:** a generic engine error, a real 429 `ModelError` through `ModelStep` on compose Postgres, and a `CodeStorageError` through `RetryPolicy.decide`. The last added `@smthrs/flow` as a devDependency of `@smthrs/effect-code-storage`; `pnpm-lock.yaml` was edited by hand, so a `pnpm install` should confirm it.
  - Results, all at 100% coverage: engine-store 4,214 tests (SQLite and Postgres), run-store 620, flow, engine, `@smthrs/flows` 431, database 598, agent 2,066 (`ModelStep` 23 of 23), platform-cloudflare 36 with the workerd smoke, effect-code-storage 47. `memory` is at 98% branches against its own 95% gate. `pnpm docs:sync`, `pnpm docs:check` and the per-package docs targets pass; `docs:check` needed `GOCACHE` in the scratchpad because `~/Library/Caches/go-build` is damaged.
  - API for W5: `ExecutionObject.start` and `alarm` with `CloudflareRuntime.layer({ hostId, executionId }, registration)`; `EngineStore.drive(flow, { executionId, payload })` returns `Settled`, `Parked` (with `wakeAtMs`) or `Unfinished`; `RunStore.owned(sql, yield* Action.CurrentFence, { schema: "smithers_flows" })`; `Action.CurrentRedispatch`; `Runtime.layer` and `Runtime.storage` from the `@smthrs/flows` root.
- 22:59: **W5 (a) and (c) started, as one agent.** (a) is the [model endpoint](model-endpoint.md); (c) wires the flow host into the Worker and Alchemy ([Cloudflare flow host](cloudflare-flow-host.md)). Its brief says "Not now": don't delete server answering, `waitUntil`, the sweep or `attempts`; that waits until the browser agent answers (B1 plus the app's agent flow). So (b) and (d) are not started.
- 23:01: [Codex checkpoint review 2](code-reviews.md) found two P1s here:
  - the live path still answers through `waitUntil`, a cron sweep and a direct model call (`worker/ChatApi.ts:56` and `:61`, `worker/Chat.ts:315`), and `src/boot.ts:48` supplies no browser engine or agent. If the isolate dies after the provider answered but before the final write, the sweep pays for a second call. Known: W5 (d) deletes it once the browser agent answers;
  - the Cloudflare runtime can't run a child flow or a trampoline handoff ([Cloudflare flow host](cloudflare-flow-host.md)).
- 23:07: no W5 file on disk yet: `packages/smithers/agent/model`, `apps/mvp/worker`, `apps/mvp/db` and `alchemy.run.ts` are unchanged since before 22:50.
- By 23:12: the lead settled review 2's two P1s. The `waitUntil` path stays planned as W5 (b)+(d), after the browser agent answers. The child-flow routing went to a new agent in `platform-cloudflare`, and W5 was told not to edit that package ([Cloudflare flow host](cloudflare-flow-host.md)).
- 23:12 to 23:15: W5's first files are on disk, unreported: `ModelProxy.ts` restored in `@smthrs/model` with a new guide, `docs/guides/proxy-a-model.md`; `HostModel.ts` changed in `model-host`; and in `apps/mvp/worker`, `ExecutionHost.ts`, `Executions.ts`, `flows/Pause.ts` and a `ChatApi.ts` change ([model endpoint](model-endpoint.md), [Cloudflare flow host](cloudflare-flow-host.md)).
- **`pnpm docs:check` is temporarily red:** the new guide left `apps/server/src/docsRedirectMap.ts` (last generated 22:44) stale. W5 will run `pnpm docs:sync`.

- 23:15 to 23:25: W5 (a)+(c) is still writing, unreported. On disk: the `0004_model_roles` migration, the endpoint with 15 test cases, the `admin/SetModel` flow, the `Actor` seam, and the remote flow `probe/Pause` proven on workerd across `ctx.abort()` and on compose Postgres, with a feature doc, `docs/features/remote-flows.md` ([model endpoint](model-endpoint.md), [Cloudflare flow host](cloudflare-flow-host.md)). `docsRedirectMap.ts` was regenerated at 23:19, so `pnpm docs:sync` ran.

- 23:39: **W5 (a)+(c) is done, reported.**
  - (a), the [model endpoint](model-endpoint.md): `POST /api/model/<role>` behind an injected `Sessions` service (production refuses everyone with 401), a daily token budget (429), roles from `model_roles` falling back to `CHAT_MODEL`, `model_usage` metering, and Admin-only `admin/SetModel`.
  - (c), the [Cloudflare flow host](cloudflare-flow-host.md): the `FlowExecution` Durable Object is in ChatApi and the stack. The 2-step `probe/Pause` flow is proven on the Node host and in a Miniflare kill-and-resume, the latter against a stand-in Durable Object, not the real Alchemy class.
  - 152 tests pass and the production plan passes. Per its brief, W5 left server answering, `waitUntil`, the sweep and `attempts` in place for (d).
  - Open items: `db:migrate` doesn't apply the engine's own migrations, which run on the first alarm; the worker tsconfigs gained the DOM lib.
  - **An SDK defect:** the `@smthrs/flows` root re-exports Node-only jj code into Worker and browser bundles. A new agent makes the root platform-neutral ([flows root](flows-root-platform-neutral.md)).
- About 23:41: **B1 is done** ([durable browser engine](durable-browser-engine.md)), and F1 and F4+F5 started ([flows and the agent](flows-and-agent.md)). F5 builds `chat/Answer` and `chat/Respond` on the browser engine: the answering that (b) and (d) wait for. The lead: "When F5 and local-first land, I wire them into the app, delete the old server-side answering, and tell you it's ready to test."

- 23:55 to 23:59 on 2026-10-19, on disk, unreported: **F5 is writing W5 (b), the message write path.**
  - `worker/Answers.ts` serves the browser agent: it reads its turn, then `POST /api/answers/<id>` writes the answer's parts while it streams and its text or failure when it settles.
  - Only a signed-in person's browser may call it. A settle sent again after it landed is answered as landed, so a replayed step is harmless.
  - Migration `0006_answer_parts.ts` adds `parts` and the `unfinished` failure ([flows and the agent](flows-and-agent.md)).
- 00:08 on 2026-10-20: `Answers.ts` isn't wired into `ChatApi.ts` yet. ChatApi, unchanged since 23:35, still answers through `waitUntil` and the every-minute cron sweep, which (d) deletes.


- 00:16 on 2026-10-20: `ChatApi.ts` changed at 00:09 for [sign-in](sign-in.md), but `Answers.ts` still isn't routed, and ChatApi still answers "within the invocation's `waitUntil`". F5's first agent test passes; the theme case fails ([flows and the agent](flows-and-agent.md)).

- 00:21 on 2026-10-20: the Cloudflare host's child-flow fix is done, and W5's `ExecutionHost.ts` and `Executions.ts` already use its router API ([Cloudflare flow host](cloudflare-flow-host.md)).
- 00:24: F1 is done, so F5 has the `conversation` profile and `DoneText` ([flows and the agent](flows-and-agent.md)). By 00:26, F5's new `progress.ts` writes each answer's text and parts at most once a second, and `worker/Answers.ts` changed again. `ChatApi.ts` is unchanged since 00:09: it still answers within `waitUntil`, and `Answers.ts` still isn't routed.


- 00:44 on 2026-10-20, on disk, unreported: **`Answers.ts` is routed.** `worker/Chat.ts` sends `/api/answers/<id>` to `Answers.ts`, W5 (b). The old path stays beside it for (d): answers still run within `waitUntil`, and the sweep still redispatches stuck answers. L1's report at 00:44 names `db/Database.test.ts` as failing, in W5's area ([local-first](local-first.md)).
- 00:44: the lead's wiring checklist (scratchpad `final/WIRING.md`) holds (d) for after F4+F5's report: delete `waitUntil`, the cron sweep, the `attempts` table and `worker/Answer.ts`.

- As of 00:54 on 2026-10-20: (d) is in the lead's [app wiring](app-wiring.md) step. `worker/ChatApi.ts` still answers within `waitUntil`, and a plan at 00:53 still creates `ChatApi/Cron(* * * * *)` ([land and deploy](land-and-deploy-mvp.md)).

- 01:17:57 on 2026-10-20: Codex Astra review 3's finding 3 (P1) repeats review 2's finding 2, still present: `worker/ChatApi.ts:88` to `:98` still provides `Chat.Background` through `waitUntil` and registers the minute cron; `worker/Chat.ts` still dispatches `Answer.make` on a question (`:250`) and redispatches stuck answers from the sweep (`:314` to `:321`); and boot still builds the chat store without the browser agent. Codex's fix is W5 (d) as planned: wire the browser agent and delete the server dispatcher, cron and recovery in the same change, then verify closing and reopening a tab mid-answer and replay after a sealed model call ([code reviews](code-reviews.md)).

- About 01:16 on 2026-10-20: **F4+F5 is done** ([flows and the agent](flows-and-agent.md)). W5 (b) is in: `chat/Answer`, `chat/Respond` and `chat/Settle` answer on the device through `/api/answers/<id>`, with migration `0006_answer_parts`, and every model call is a sealed `ModelStep`. Killed mid-answer, it resumed with 3 model calls (one sealed, one cut off, one after) and one theme write.
- About 01:17: **(d) started, inside the wiring agent** ([app wiring](app-wiring.md)). It wires the browser agent into the chat store, then deletes `waitUntil`, the cron, the sweep, `attempts` and `worker/Answer.ts`, with a cutover migration. By 01:19 the lead counts this as the fix for review 3's finding 3 ([code reviews](code-reviews.md)).
- 01:43, on disk, mid-edit: **`worker/Answer.ts` is deleted**, and `worker/Chat.ts` no longer has `Background` or the sweep. Still there: `worker/ChatApi.ts` (00:09) provides `waitUntil`, registers the minute cron and calls `chat.sweep`; `worker/Messages.ts` still bumps `attempts`; no cutover migration yet (the newest is `0007_repositories`).

- 01:44 to 01:53 on 2026-10-20, on disk, unreported: **(d) is in the working tree.**
  - `db/migrations/0008_browser_answering.ts` (01:46) settles every leftover `streaming` row as `failed`, failure `abandoned`, not `timed_out` as planned. Its comment: such a row "has no run left to finish it, and it would hold up every later answer's turn". It drops the `messages_streaming` index and the `attempts` column, and adds `messages_streaming_position` for the turn wait.
  - `worker/ChatApi.ts` and `worker/Chat.ts` (01:53) no longer mention `waitUntil`, a cron or the sweep. `alchemy.run.ts` registers no cron, and `worker/Messages.ts` no longer bumps `attempts`.
  - About 01:26 the wiring agent's sub-agent A1 caught that the browser's `Message` schema still required `attempts`. By 01:44 the field is gone, and the messages collection persists under `schemaVersion: 2` ([app wiring](app-wiring.md)).
  - Not yet: the wiring agent's report or the real-browser proof. From 01:55 the local-first e2e can't open the app; best guess `@smthrs/agent`'s root reaching `node:dns/promises` ([agent root in the browser](agent-root-browser-safe.md)).
- 02:28 on 2026-10-20: the wiring agent applied migrations 4 to 8, `0008_browser_answering` among them, to the dev database ([app wiring](app-wiring.md)).
- 02:31: A2a's report to the wiring agent: once ChatApi takes a question, the asking tab forks `chat/Answer` with the answer id as its execution id; a 401 or 403 keeps the question unsent as `refused`; `Message` drops `attempts` and gains the failure `unfinished`. In Node tests the asking tab's own agent answers, and a resend answered 200 runs the engine once. In a real browser the engine worker still dies at load, so no browser answers yet ([agent root in the browser](agent-root-browser-safe.md)).
- 02:23: the bench is being reworked, since a question posted from Node is never answered now ([benchmarks](benchmarks.md)).

- **03:12 on 2026-10-20, scratchpad `wiring/e2e-1.log`: the browser agent answers in a real browser** ([app wiring](app-wiring.md)). Passing: the answer streams through the model endpoint, and "reload mid-answer" resumes it. Red: "killed tab" (the resumed answer never completes, so the sealed-call replay is unproven), and five cases whose answer stays "Smithers is answering" for 60 s.
- 03:07 on 2026-10-20: the read-only production `alchemy plan` has no `ChatApi/Cron`, so the sweep is gone from the deploy ([land and deploy](land-and-deploy-mvp.md)).
- 03:14:24 on 2026-10-20, on disk, unreported: **the turn bound drops from 90 to 30 s.** `worker/Answers.ts`' `TURN_LIVE_SECONDS`, the default for `ANSWER_TURN_LIVE_SECONDS`: "A live run writes within it, about once a second while its model streams ... A run silent for longer, such as a model slow to start, only lets a later answer start beside it; an answer whose device is gone holds up the conversation no longer than this." `worker/Answers.test.ts`, `docs/features/agent.md` and `docs/benchmarks.md` changed with it. Best guess the cause of the five stuck answers: an answer a test left streaming held up later answers in the shared conversation. `e2e/devices.ts` (03:14:48) also settles a test's leftover streaming answers at teardown. A rerun started about 03:16.
- **About 03:20 on 2026-10-20: the lead's rules to the wiring agent** ([app wiring](app-wiring.md)):
  - An answer stuck streaming settles as failed in the product, not only in the e2e teardown. `e2e/devices.ts`' `settleLeftovers` alone doesn't count, and neither does a longer wait or a looser assertion.
  - The 30 s answer deadline belongs in config with the model role, not as `TURN_LIVE_SECONDS` in `worker/Answers.ts`. That answers this item's open question (see Questions).
- **03:22 on 2026-10-20, scratchpad `wiring/e2e-2.log`, unreported: the rerun of the 12 reds.** "Killed tab" passes: "the answer resumes when the app opens again, replaying sealed model calls from the journal, never calling them again". Four of the five stuck answers pass (two devices in reverse order, offline mid-answer, back/forward, duplicate ask), with the 30 s bound and the teardown settling leftovers. "Electric down at boot" still stays "Smithers is answering". The deadline is still the `worker/Answers.ts` constant at 03:25.
- About 03:28 on 2026-10-20, the lead to Will: stuck answers still settle only in test cleanup, and "Electric down at boot" still fails. At 03:34 on disk, `e2e/devices.ts`' `settleLeftovers` is unchanged since 03:14:48, and `worker/Answers.ts` still sets `TURN_LIVE_SECONDS = 30`, overridable by `ANSWER_TURN_LIVE_SECONDS` (03:14:24) ([app wiring](app-wiring.md)).
- 03:24 on 2026-10-20: the wiring agent's sub-agent D2 took this: an answer never stays `streaming`. The run settles it on every way it ends, and a remote flow, `chat/Expire`, settles it when its device never comes back; no sweep, cron or `waitUntil`.
- 03:38 to 03:42 on 2026-10-20, on disk, unreported ([app wiring](app-wiring.md)):
  - **The liveness bound is in config with the model role.** `src/features/model/contract.ts`: `AGENT_LIVE_SECONDS = 30`, read through `agentLiveSeconds` (`ANSWER_TURN_LIVE_SECONDS`). Its comment cites ChatApi's dev logs, 09:57 to 10:30 UTC: the model's first event p95 2.06 s, max 2.84 s; a run's first turn request p95 4.5 s, max 16.4 s after its question was taken. `worker/Answers.ts` no longer has `TURN_LIVE_SECONDS`.
  - **The run settles when its time runs out.** `chat/Answer` races `chat/LoadTurn` then `chat/Respond` against `chat/Deadline`, a durable sleep to `ANSWER_DEADLINE` (10 minutes) from the first start; `chat/Settle` writes `failed`, `unfinished`. Node tests added in `src/features/agent/agent.test.ts`.
  - At 03:44 the first of those tests, "a run past its deadline", timed out at 30 s. `worker/flows/Expire.ts`, which the code's comments name, isn't on disk at 03:46, and `settleLeftovers` is still in the teardown.
- 03:46 to 03:54 on 2026-10-20, D2 on disk, unreported ([app wiring](app-wiring.md)):
  - **The race is gone.** The turn wait bounds itself: `ANSWER_TURN_WAIT` (10 minutes from the first start) and `ANSWER_SETTLE_WITHIN` (10 minutes) in `src/features/agent/contract.ts`. The agent tests passed 30 of 30 at 03:49.
  - **`chat/Expire` exists** (`worker/flows/Expire.ts`, 03:51): ChatApi starts one execution per answer (`chat-expire-<answerId>`) when it takes a question, without waiting. A durable timer runs to `ANSWER_EXPIRY` (default 25 minutes), then the flow settles a still-`streaming` answer `failed`, `abandoned`, and leaves a settled one alone. Its step retries Postgres failures without giving up. Counter `smithers_answer_expiries`. Wired in `worker/ExecutionHost.ts`, `worker/Executions.ts` and `worker/Chat.ts` (03:51 to 03:53).
  - At 03:54 `pnpm typecheck` is red in test files (`worker/ExecutionHost.test.ts`). `settleLeftovers` is still in the e2e teardown, and no e2e has run against `chat/Expire`.
- 03:55 to 04:04 on 2026-10-20, D2 on disk, unreported ([app wiring](app-wiring.md)): test files edited 03:55 to 03:57 after the typecheck red; `docs/features/agent.md`, `chat.md` and `remote-flows.md` document `chat/Expire`, `ANSWER_EXPIRY` and the `abandoned` failure (03:59 to 04:00). The `apps/mvp` unit run at 04:02: 489 passed, 2 failed (the telemetry contract's unemitted `browser.engine.worker`; a new `persisted write failed` log on sign-out), coverage 100%. No e2e has run against `chat/Expire`, and `settleLeftovers` still settles in the teardown.
- 04:04 to 04:15 on 2026-10-20, on disk, unreported ([app wiring](app-wiring.md)): `worker/flows/Expire.test.ts` edited 04:06; `docs/observability.md` documents `chat.answer.expire` and `smithers_answer_expiries`, and `docs/infrastructure.md` says `chat/Expire` settles an answer `abandoned` 25 minutes after it was asked (04:07). The 04:12 and 04:14 unit runs have no `chat/Expire` red. Still no e2e against `chat/Expire`, and `settleLeftovers` still settles in the teardown.
- 04:15 to 04:25 on 2026-10-20 (scratchpad `wiring/e2e-3.log`): every answering case passes in the full serial run (35 of 36; the red is the theme). Before it, the wiring agent settled by hand 7 answers stuck `streaming` for over 10 minutes, through `POST /api/answers/<id>`. `settleLeftovers` still settles in the teardown, so the product settling stuck answers itself still has no e2e proof ([app wiring](app-wiring.md)).
- About 04:26 to 04:36 on 2026-10-20 ([app wiring](app-wiring.md)): the lead didn't count that run; the product must settle stuck answers itself, on a fresh database with no manual SQL. `settleLeftovers` was deleted at 04:27:25, and a full serial run started 04:29:48 (`wiring/e2e-4.log`): 19 passed, 1 skipped, none failed by 04:36, the answering cases so far included.
- 04:43 on 2026-10-20, scratchpad `wiring/e2e-4.log` finished: 32 passed, 3 failed, 1 skipped in 13.9 minutes, unreported. Every answering case passes on the fresh database with no `settleLeftovers`, and `wiring/stale.txt` is unchanged since 04:15: ask, reload mid-answer, killed tab, tab closes mid-answer, offline mid-answer, concurrent asks, duplicate ask and "Electric down at boot". The 3 reds are `e2e/repo.spec.ts` ([repo clone and view](repo-clone-and-view.md)). Status stays in-progress: no cause for "Electric down at boot" is reported, and the wiring agent hasn't reported.
- 04:45:23 to 04:55 on 2026-10-20, scratchpad `wiring/e2e-5.log`, one worker: 35 passed, 1 skipped, 0 failed in 9.9 minutes (exit 0), unreported. Every answering case passes again on fresh state (Postgres and the dev Durable Object state wiped at 04:44:39), with no `settleLeftovers`; "Electric down at boot" 25.1 s. Status stays in-progress: no cause for "Electric down at boot" is reported, and the wiring agent hasn't reported ([app wiring](app-wiring.md)).
- **About 05:25 on 2026-10-20: an SDK defect breaks every parked answer run across a rebuild** ([plan identity across deploys](plan-identity-across-deploys.md)). The engine's plan record includes each node's `declaredAt` (bundle path and line), and the journal compares records by content, so a rebuild that shifts lines makes a waking run fail `plan_changed`.
  - Evidence: `chat/Expire` runs asleep across ChatApi rebuilds failed at wake, leaving 2 dev answers stuck `streaming` (`5a0b09e4…` and `49ad42d3…`), kept in the dev database as evidence until the fix lands. The dev server then ran `ANSWER_EXPIRY="60 seconds"`.
  - The same failure hits a browser resuming `chat/Answer` from OPFS after an app update: the answer stays "Smithers is answering".
  - An SDK agent is fixing it in `engine-store` (on disk 05:32 to 05:35, unreported).
- 05:25 to 05:38 on 2026-10-20 ([app wiring](app-wiring.md)): the dev server restarted 05:25:19 with no `ANSWER_EXPIRY` in its environment, so `chat/Expire` waits the 25-minute default again. The final full run (`wiring/e2e-final.log`, from 05:29:08) passes ask, reload mid-answer, killed tab, tab closes mid-answer and concurrent asks; "two tabs" and "Electric down at boot" fail with the answer still "Smithers is answering" (after 60 s and 5 s); "Electric down at boot" passed in `wiring/e2e-4` and `e2e-5`.

## Next

From about 05:25 on 2026-10-20: the [plan identity](plan-identity-across-deploys.md) fix lands and a `chat/Expire` parked across a ChatApi rebuild settles at wake. Until then any deploy strands the answers in flight. Also a named cause for "Electric down at boot", and the wiring agent's report; then this item is done, and the Fable review covers it ([code reviews](code-reviews.md)).

Until about 05:25 on 2026-10-20 the next step was, from 04:43 on 2026-10-20: a named cause for "Electric down at boot", then the wiring agent's report; then this item is done, and the Fable review covers it ([code reviews](code-reviews.md)).

Until 04:43 on 2026-10-20 the next step was, from about 04:26: the answering cases pass in `wiring/e2e-4` with no `settleLeftovers` (deleted 04:27:25), a fresh database and no manual SQL, and "Electric down at boot" has a named cause. Then the wiring agent's report; then this item is done, and the Fable review covers it ([code reviews](code-reviews.md)).

Until about 04:26 on 2026-10-20 the next step was, from about 03:25: the product settles an answer it can't finish as failed, and "Electric down at boot" passes for that reason, with the cause named; the four stuck-answer greens hold without the teardown doing the settling. The answer deadline moves into config with the model role. Then the wiring agent's report, with the proof below; then this item is done, and the Fable review covers it ([code reviews](code-reviews.md)).

Until about 03:25 on 2026-10-20 the next step was, from about 03:16: the rerun's result. The five stuck answers green with the 30 s turn bound, and "killed tab" green: the answer resumes when the app opens again and a sealed model call isn't paid for twice. Then the wiring agent's report, with the proof below; then this item is done, and the Fable review covers it ([code reviews](code-reviews.md)).

Until about 03:16 on 2026-10-20 the next step was: the wiring agent's report. The browser agent answers in the app, and no `waitUntil`, cron, sweep, `attempts` or `worker/Answer.ts` remains. The cutover migration drops `attempts` and the `messages_streaming` index and settles leftover `streaming` rows as failed. A real-browser e2e closes a tab mid-answer and reopens it, and a sealed model call isn't paid for twice ([app wiring](app-wiring.md)). Then this item is done, and the Fable review covers it ([code reviews](code-reviews.md)).

Until about 01:17 on 2026-10-20 the next step was: F5's report: the browser agent answering through the [model endpoint](model-endpoint.md), with its answer routes, W5 (b) ([flows and the agent](flows-and-agent.md)), and [local-first](local-first.md) landed beside it. Then the lead wires both into the app and does (d), the deletions: ChatApi's `waitUntil`, the cron and sweep, and `attempts`, with `streaming` rows migrated to `timed_out`.

Until 00:08 on 2026-10-20 the next step was: F5's report: the browser agent answering through the [model endpoint](model-endpoint.md) ([flows and the agent](flows-and-agent.md)), with [local-first](local-first.md) landed beside it. Then the lead wires both into the app and does W5 (b), the message write path, and (d), the deletions: ChatApi's `waitUntil`, the cron and sweep, and `attempts`, with `streaming` rows migrated to `timed_out`.

Until 23:39 the next step was: W5 (a)+(c)'s report: the endpoint with its tests on compose Postgres, the flow host in the Worker proven by a 2-step remote flow on workerd and Node, and a passing `pnpm plan`. Then (b) the message write path and (d) the deletions, once the browser agent answers ([flows and the agent](flows-and-agent.md)).

Until 22:58 the next step was W1's report: the connection-loss tests on Postgres and PgBouncer, the drive-once API, the read-transaction fix, the false WARN fix and its callers, with each touched package's tests, coverage and docs.

Then W5's new scope: the [model endpoint](model-endpoint.md) and the message write path. When the browser agent answers ([flows and the agent](flows-and-agent.md), on the [durable browser engine](durable-browser-engine.md)), delete ChatApi's `waitUntil`, the sweep, the cron and `attempts`, and migrate `streaming` rows to `timed_out`. Wire the Cloudflare flow host into `worker/` for remote flows such as `repo/Clone`.

From 22:42 these are W5 (a) to (d) in `HOST-PLAN.md`'s "Revised by 0011" section, written by 22:49: (a) model endpoint, (b) message writes, (c) the Cloudflare flow host in `worker/`, (d) the deletions.

Until 22:31 the step after W1 was: move ChatApi onto `chat/Answer`, keeping the flow body free of Cloudflare imports, delete the hand-built recovery code, migrate `streaming` rows to `timed_out`, then benchmark the engine's per-schema writer lock under many streaming answers.

## Questions for Will

- Open for the lead, not Will (from 03:14 on 2026-10-20): with a 30 s turn bound, a model that sends nothing for 30 s lets a later answer start beside it, so two answers can stream at once. Is 30 s long enough for the slowest model the agent uses? (Answered about 03:20 by the lead: the deadline belongs in config with the model role, so each role sets its own; not on disk at 03:25. On disk 03:38:54 in `src/features/model/contract.ts`, unreported.)

- You stopped W1 at 22:08. Restart it from its on-disk work? Recommended: yes; W5, repo cloning and the last mvp lint failure all wait on it. (Answered 22:16: accidental; restarted about 22:20.)
- No design question: a model call killed mid-flight runs again on resume (at-least-once); it is counted and documented.
