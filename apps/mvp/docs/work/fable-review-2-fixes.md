---
title: Fable review 2 fixes
status: done
area: app
owner: done: the client Fable fix agent reported at 11:54:51 on 2026-10-20; all 12 findings are fixed. Landing is [land to main](land-to-main.md)'s. Until 11:55: client Fable fix agent, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); P1-1, P2-3, P3-2, P3-5, P3-6 and the `plan_changed` close; unreported by 10:44. Until 10:42: client Fable fix agent: P1-1, P2-3, P3-2, P3-5, P3-6 and the `plan_changed` close; unreported by 08:07 on 2026-10-20; its fixes stay out of landing round 2. Until 08:07: client Fable fix agent: P1-1, P2-3, P3-2, P3-5 and P3-6, plus from 07:27:56 closing answers whose run ends `plan_changed`; unreported by 07:37 on 2026-10-20. Until 07:27: client Fable fix agent: P1-1, P2-3, P3-2, P3-5 and P3-6, unreported by 07:20 on 2026-10-20. The worker agent reported done at 07:01:52 and the engine and hosts agent at 07:07:38. Until 07:01: three Fable fix agents, started 06:09:02 to 06:09:22 on 2026-10-20 by the lead, split by area. Client (`src/features/chat`, the outbox): P1-1, P2-3, P3-2, P3-5 and P3-6. Worker (`worker/**`, `db`): P2-1, P2-2, P3-3, P3-4 and P3-8. Engine and hosts (`platform-cloudflare`, `worker/Flows.ts`, `Executions.ts`, `ExecutionHost.ts`): P3-1 and P3-7
updated: 2026-10-20
links: [review-round-4.md, code-reviews.md, durable-answering.md, local-first.md, model-endpoint.md, sign-in.md, repo-clone-and-view.md, cloudflare-flow-host.md, observability.md, roles-and-labels.md, plan-identity-minified-builds.md, slash-commands.md, navigate-flow.md, web-page-flow.md, decisions-for-will.md, land-and-deploy-mvp.md, ../decisions/0002-local-first.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0007-roles-and-tags.md, ../decisions/0008-auth.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/agent.md, ../features/sign-in.md, ../features/model-endpoint.md, ../features/flows.md, ../features/remote-flows.md, ../rules.md, agent-status.md, chat-message-controls.md, land-to-main.md, docs-check-flow-outcome.md, flows-and-agent.md]
---

## What

Fix the 12 findings of Fable review 2 (scratchpad `final/fable-review-2.md`, written 06:08:31 on 2026-10-20): 0 P0, 1 P1, 3 P2 and 8 P3. Each fix starts with a test that fails on the old code. The review also verified that all five Codex Astra fixes are correct and complete ([code reviews](code-reviews.md)).

The table's last column is as of 06:15; State has the 06:26 evidence.

| # | Finding | Where | Owner | State at 06:15 |
|---|---|---|---|---|
| P1-1 | The outbox lets an ask go before `chat/Answer`'s start is recorded, so a question can sit on the server with no run to answer it; `chat/Expire` settles it `abandoned` 25 minutes later | `src/features/chat/store.ts:229-258`, `src/flows/dispatch.ts:63-64` | client | running; no `src/features/chat` file changed |
| P2-1 | Answer writes are bound to a role, not to the asker: Member B settled Member A's answer with "forged by B" (200), and A's own settle got 409 `settled` (**reproduced**) | `worker/Answers.ts:165-171`, `worker/Messages.ts:31-42` | worker | failing test on disk, unreported (below) |
| P2-2 | The daily token budget is read, then the call runs: 8 concurrent calls against a 46-token budget all returned 200 and spent 368 (**reproduced**); input is unbounded below 1 MiB | `worker/ModelEndpoint.ts:84-138`, `ModelProxy.ts:76` | worker | `ModelProxy` changes on disk, unreported (below) |
| P2-3 | A tab that doesn't lead the outbox can't ask: every ask shows "Not sent" until the leading tab closes, against Will's 0002 answer "The composer always sends" | `store.ts:266`, `effect-tanstack-db/src/Outbox.ts:385-388`, `e2e/local-first.spec.ts:105` | client | running |
| P3-1 | Settled Durable Objects keep their intent forever: one object per answer, role check, sign-out and clone attempt | `platform-cloudflare/src/ExecutionObject.ts:505-507` | engine and hosts | running; `ExecutionObject.ts` unchanged |
| P3-2 | The sign-out wipe races other tabs, and the tab then boots on the previous person's data | `src/main.tsx:67-166` | client | running |
| P3-3 | Cloning needs sign-in but no role: any GitHub account can fill the 100-repository cap | `worker/RepoApi.ts:127-130` | worker | running; `RepoApi.ts` unchanged since 05:07 |
| P3-4 | The shape and telemetry relays are open and unthrottled | `worker/Chat.ts:104-109,179-180` | worker | running |
| P3-5 | Every `not_your_turn` poll `touch`es the waiting row, and Electric fans each write out to every device | `worker/Answers.ts:64-68,121-124` | client | running |
| P3-6 | A burst of asks settles its tail `unfinished` at the 10-minute turn wait, without calling a model | `src/features/agent/contract.ts:21`, `host.ts:129-143` | client | running |
| P3-7 | The remote flow door is live with nothing to start: every name answers 404 | `src/flows/declarations.ts:45`, `worker/Flows.ts` | engine and hosts | door removal on disk, unreported (below) |
| P3-8 | Five doc lines contradict the code: `features/sign-in.md:156`, decision `0006:7` ("no sign-in"), decision `0002:82` ("the focused tab leads"), `features/flows.md:108` and `features/agent.md:3` | docs | worker | running |

As of 11:55 on 2026-10-20 (client report 11:54:51): **all 12 fixed.**

| # | State at 11:55 |
|---|---|
| P1-1 | **fixed**, reported 11:54:51: the send waits until the engine has recorded the answer's run; a failed start falls through to a resend, logged `answer not started`; e2e "closed before its run started" fails on the old code |
| P2-1, P2-2, P3-1, P3-3, P3-4, P3-7, P3-8 | **fixed**, as at 07:20 |
| P2-3 | **fixed**, reported 11:54:51: window `focus`, any `focusin` or an ask in a follower takes the outbox lead (steal, not forwarding); 0002 records it |
| P3-2 | **fixed**, reported 11:54:51: sign-out takes a cross-tab lock, waits for every page and the engine, then deletes; a failed delete boots on memory stores |
| P3-5 | **fixed**, reported 11:54:51: `touch` writes at most once per a third of the liveness bound |
| P3-6 | **fixed**, reported 11:54:51: the turn wait counts from the earlier answer settling, measured in Postgres |
| `plan_changed` close | **fixed**, reported 11:54:51: a refused run starts `chat/Close`, which settles the answer failed |

As of 07:20 on 2026-10-20. The agents number some findings their own way: the worker's "P3-5 docs" is P3-8 here, and the engine's "P3-2 remote door" is P3-7.

| # | State at 07:20 |
|---|---|
| P1-1 | client: on disk since 06:22, unreported |
| P2-1 | **fixed**, reported 07:01:52: migration `0011_question_askers` |
| P2-2 | **fixed**, reported 07:01:52: migration `0012_model_reservations` and a 192 KiB request cap |
| P2-3 | client: the focused tab takes the outbox's lead (changeset 06:40, decision 0002 at 06:55); `Outbox.ts` still changing at 07:13; unreported |
| P3-1 | **fixed**, reported 07:07:38: one final alarm a day after a run settles |
| P3-2 | client: the cross-tab wipe e2e passes 3 of 3 (06:43); unreported |
| P3-3 | **fixed**, reported 07:01:52: Member or above to clone |
| P3-4 | **fixed** as the minimum safe version, reported 07:01:52: per-network limits |
| P3-5 | client: unreported |
| P3-6 | client: unreported |
| P3-7 | **fixed**, reported 07:07:38: the remote door removed |
| P3-8 | **fixed**, reported 07:01:52 |

**Status rule for the affected notes:** a P1 or P2 finding reopens a done note; a P3 finding adds a line and leaves its status. So [model endpoint](model-endpoint.md) moved from done to in-progress (P2-2). [Durable answering](durable-answering.md) and [local-first](local-first.md) were already in progress. [Sign-in](sign-in.md), [repo clone and view](repo-clone-and-view.md) and the [Cloudflare flow host](cloudflare-flow-host.md) stay done with a line each.

## Why

Will's review order (01:12 on 2026-10-20): "remember to have /codex astra review code and then once responding to it's reviews have fable review". Astra, its fixes and Fable are done; these fixes finish the loop before Will's own review and the landing.

Fable's summary: "The two hand-offs that were wired last are where the holes are: the outbox's durability stops one step short of the engine's (P1-1), and the server's write path authenticates a role but not the session that asked (P2-1). Both are seams, not redesigns ... The budget is the third seam and the only one with a reproduced money consequence (P2-2)."

## State

- **06:08:31 on 2026-10-20: Fable review 2 written.** Two findings were reproduced against the real handlers on the compose Postgres (scratchpad `repro-run.txt`, 06:04:13); the throwaway test was deleted. Everything else is source-verified.
- **06:09:02 to 06:09:22 on 2026-10-20: the lead started three fix agents.** The lead accepted all 12 findings; none is rejected on record.
  - **Client** (report in at most 8 lines): a failing test first for each finding, unit tests at 100% coverage, real-browser e2e for P1-1, P2-3 and P3-2, then the full unit suite and the full e2e suite on a fresh database; for P2-3, pick the simpler of "the focused tab steals the lead" and "followers forward asks to the leader", and write it into decision 0002.
  - **Worker** (at most 8 lines): the asker recorded on the question through a new migration, required on both answer routes; an atomic budget reservation reconciled under the server-minted `invocationId`, plus `maxBodyBytes` and a prompt-token cap; Member or above to clone; relay rate and size limits, or the minimum safe version if 0008 phases them; the five doc lines. Proof includes `pnpm plan` for the infra.
  - **Engine and hosts** (at most 6 lines): settled objects delete their intent once retention allows, tested in workerd, with no sweep or loop; the remote door either gets a startable flow or goes, decided from 0003 and 0011 and written into `features/remote-flows.md`.
  - Coordination: each re-reads shared files before an edit. The slash-command, navigate and web page agents edit `src/flows/registry.ts` and the composer, and the [minified-builds](plan-identity-minified-builds.md) agent owns `@smthrs/flow` and `engine-store` plan identity.
- **06:09:26 on 2026-10-20, the lead to Will:** "The Fable review confirmed that all five Astra fixes are correct and complete. It found 12 new issues, with no P0s, and reproduced two of them against the real database." And: "Three agents are fixing them, split by area (browser, server, flow hosts), each writing a failing test first."
- 06:14 to 06:15 on 2026-10-20, on disk, unreported:
  - **P2-1:** `worker/Answers.test.ts:272-284`, "another Member ... is refused 403 forbidden on both routes, and the asker's own settle still lands". It repeats Fable's forgery: a streaming write, then "forged by B", then the asker's settle.
  - **P2-2:** `ModelProxy.ts` (06:14:58) documents an admission "a host that bounds spend reserves ... keyed by `invocationId`" (`:257`, `:312`), and `ModelProxy.test.ts` adds `maxBodyBytes` cases (`:546-582`). `worker/ModelEndpoint.ts` is unchanged since 01:47.
  - **P3-7:** `worker/Flows.ts` (06:14:43) now reads: "No route starts a flow by its name alone: every remote flow today is admitted by the route that starts it (docs/features/remote-flows.md#no-remote-door)". So the door goes rather than gaining a flow.
  - `worker/Chat.ts`, `ChatApi.ts`, `Chat.test.ts` and `worker/test/harness.ts` changed at 06:14:53 to 06:15:09. The web page agent's views routes are in `Chat.ts` too, so these edits aren't attributed.
  - No `src/features/chat/**`, `src/main.tsx` or `ExecutionObject.ts` change yet.
- Migration numbers: `0010_views.ts` is the [web page flow](web-page-flow.md)'s (06:09:21), so the asker migration takes `0011` or later.
- 06:15 to 06:26 on 2026-10-20, on disk, unreported:
  - **P1-1** (client): `src/features/chat/store.ts` (06:22:29) and `src/flows/dispatch.ts` (06:22:12). The outbox now waits until the engine has recorded `chat/Answer`'s run (`admitted`) before a question counts as sent: "the outbox keeps the question until a run exists to answer it". A start that fails is sent again. `dispatch.test.ts` (06:23:21) adds "completes once the engine recorded the run, while the run goes on" and "fails interrupted when the dispatch is interrupted before the engine recorded the run".
  - **P2-1** (worker): migration `0011_question_askers.ts` (06:15:31) adds `asked_by`, "the asking actor's person id, which ChatApi takes from the session, never from the request body". An old `streaming` answer with no asker settles `failed`, `abandoned`. `worker/Answers.ts` (06:16:39) refuses everyone else `403 forbidden`, logged `not_asker`. `worker/Chat.ts` syncs every `messages` column but `asked_by`, through `ShapeProxy`'s `columns` option (`packages/effect-electric`, 06:17:36). A run at 06:24:46 (scratchpad `shape-debug.txt`): `worker/ShapeProxy.test.ts` 6 passed, 1 failed, "syncs every column of a message but who asked it", which timed out at 16 s.
  - **P2-2** (worker): migration `0012_model_reservations.ts` (06:21:27), `worker/ModelUsage.ts` (06:22:35) and `worker/ModelEndpoint.ts` (06:23:04). Each call reserves its worst case before the model runs, and the request body is capped at 192 KiB. Test: "concurrent calls can't overshoot: against a budget of 46, eight at once admit exactly one". No run on record ([model endpoint](model-endpoint.md)).
  - **P3-1** (engine and hosts): `platform-cloudflare/src/ExecutionObject.ts` (06:16:05). "A settled object keeps its intent for `settledRetentionMs`, then forgets it and empties its storage", a new `Forgotten` state. Its workerd tests changed from 06:16 to 06:18.
  - **P3-7:** `docs/features/remote-flows.md` is unchanged since 03:59, so the "no remote door" section `worker/Flows.ts` cites isn't written yet.
  - **No change evidenced** for P2-3 (`effect-tanstack-db/src/Outbox.ts` unchanged since 23:46 on 2026-10-19; `store.ts` still takes the outbox leader lock), P3-3 (`worker/RepoApi.ts` unchanged since 05:07), P3-4 (no rate or size limit in `worker/Chat.ts`), P3-5 or P3-6. For P3-2, `src/main.tsx` changed at 06:12:20, which isn't attributed. For P3-8, `docs/features/flows.md` and `agent.md` changed at 06:20 to 06:21, but the navigate agent edits them too; decisions 0002 and 0006 and `features/sign-in.md` are unchanged.
- 06:26 to 06:34 on 2026-10-20, on disk, unreported:
  - **P3-3** (worker): `worker/RepoApi.ts` (06:26:53) now says cloning needs sign-in "and the Member role or above (decision 0007), because a clone spends the deployment's Code Storage budget".
  - **P3-4** (worker): `worker/Throttle.ts` (06:30:30) throttles every Electric shape and the telemetry relay per network (the IPv4 /24 or IPv6 /48 of `CF-Connecting-IP`) through Cloudflare's Rate Limiting binding, `429` with a 60-second retry, metric `smithers_throttle_decisions`. Binding limits to a session or visitor cookie is left to decision 0008's phase P1, the minimum safe version the brief allowed. `Throttle.test.ts`: 16 passed (06:30:45, scratchpad `throttle-cov.txt`); `docs/features/chat.md#throttling` (06:33:33).
  - **P3-7** (engine and hosts): `docs/features/remote-flows.md` (06:31:09) gains its "No remote door" section, which `worker/Flows.ts` cites.
  - **P3-1** (engine and hosts): `platform-cloudflare`'s README, API docs and `execution-lifecycle.md` (06:30:22 to 06:30:45).
  - **P3-8** (worker): decision 0006, `features/sign-in.md` and `features/repo.md` (06:32:27 to 06:32:36). `sign-in.md` still has a "Not built yet" section, now listing later phases.
  - **P3-5** (client): `src/features/agent/agent.test.ts` adds "a burst's tail: each answer's turn wait counts from when the queue before it last moved"; it failed ("condition never held") in the run below.
  - A full app unit run from 06:25:04 to 06:29:21 (scratchpad `nav-unit.json`): 521 passed, 30 failed and 4 skipped, in 12 failing files, among them `chat.test.ts` (10), `Answers.test.ts` (5, `409 not_your_turn`), `ExecutionHost.test.ts` (2) and the workerd test (1). A run at 06:34 (scratchpad `full-1.txt`) also fails the workerd case, "runs probe/Pause from real alarms" (`Retrying, Settled` against `Parked, Settled`). Five agents edit the app at once, so none is attributed.
- **07:01:52 on 2026-10-20: the worker agent reported done.** "All five server findings are fixed, each with a failing test written first and now passing."
  - **P2-1:** migration `0011_question_askers` records `asked_by`, the session's person id, on each question, and both answer routes require it, checked inside the write itself. Another Member, or an Admin who didn't ask, gets 403 even after the answer settles; the asker's own settle still lands. The client sends nothing new. `ShapeProxy` in `@smthrs/effect-electric` gained a `columns` option, so `asked_by` never syncs.
  - **New shared rule:** "Any new `messages` column now syncs only once it is added to `SYNCED_MESSAGE_COLUMNS` in `worker/Chat.ts`."
  - **P2-2:** each call reserves its worst case in one atomic statement before the model runs and settles to actual usage in `onEnd`, keyed by `invocationId` (migration `0012_model_reservations`). `ModelProxy.serve` gives `prepare` a second argument, `Admission`. 8 concurrent calls against a 46-token budget admit exactly one. The request cap is 192 KiB, not Fable's 64 KiB, "because the agent's long requests reach about 128 KiB" ([model endpoint](model-endpoint.md)).
  - **P3-3:** cloning needs Member or above (`canClone`); a Guest or a person with no role gets 403 `forbidden`.
  - **P3-4, the minimum safe version:** every shape and the telemetry relay are limited per network (IPv4 /24, IPv6 /48) through Cloudflare Rate Limiting at 3,000 requests a minute; if the limiter breaks, requests go through. Per-session or per-visitor limits stay decision 0008's phase P1. "The limits are not from a load test."
  - **P3-8 (its "P3-5"):** `sign-in.md`, `todo.md`, 0006, `chat.md`, `agent.md`, `repo.md` and `observability.md`; the other three lines were already corrected by the agents fixing that code.
  - **Checks:** 185 tests on the touched worker and db files pass, at 100% coverage; `pnpm plan` shows the two new rate-limit bindings; `docs:sync`, `docs:check` and the `effect-electric` tests (100%) pass. The full mvp suite is red, 14 of 599, none from these changes: `registry.test.ts`, telemetry tests (`app/web/open`), `boot.test.ts`, the outbox and burst-tail tests, `importRules` (`RepoPage.tsx`'s deep import, `ExecutionHost.test.ts` importing `@smthrs/platform-cloudflare`), untested refs lines in `RepoApi.ts`, and `ExecutionHost.test.ts` failing only under full-suite load.
- **07:02:06 on 2026-10-20, the lead to Will:** "The server-side Fable fixes are done, each with a failing test written first." And: "New shared rule: the browser now syncs only an allowlisted set of message columns, so the asker's identity never leaves the server. I told the agents that add columns."
- **07:07:38 on 2026-10-20: the engine and hosts agent reported done.** "Both findings are fixed and nothing is committed."
  - **P3-1:** `ExecutionObject.ts` records when a run settles and arms one final alarm a day later. That alarm deletes the intent, failure count, settled marker and alarm, and answers a new outcome, `Forgotten`. No sweep; `engine-store` untouched; run history stays in Postgres. In workerd, `storage.list()` is `{}` with no alarm after the window, a late `wake` answers false, and a late duplicate `start` settles from the stored run without re-running a step. `platform-cloudflare` passes 63 of 63 at 100% coverage. Two `probe/Pause` timers were lengthened because the first alarm, which migrates the engine schema, sometimes overran them under load ([Cloudflare flow host](cloudflare-flow-host.md)).
  - **P3-7 (its "P3-2"):** the door is removed: its route and client, the remote dispatch branch and `Started`, the registry's `needs`, `src/flows/placement.ts`, the constant `placement` telemetry field and `worker/Flows.test.ts`. `worker/Flows.ts` holds only `FlowStarter`. The decision is in `docs/features/remote-flows.md#no-remote-door`, with a revision note in 0003 ([flows and the agent](flows-and-agent.md)). For other agents: registry entries no longer accept `needs: []`.
  - **Checks:** `smthrs docs //packages/smithers/flows/platform-cloudflare:docs` passes; `pnpm docs:sync` and `docs:check` returned `Accepted`, whose outcome needs a browser sign-in to read ([docs check outcome](docs-check-flow-outcome.md)). The full mvp suite has 9 failures in files other agents are editing, and line 106 of `dispatch.ts`, the P1-1 start path, is uncovered.
  - It reports one stray no-op `git -C /dev/null`, and its fork ran `git --version`, which the repo's guard blocked.
- **07:07:47 on 2026-10-20, the lead to Will:** "The last Fable fixes, in the flow hosts, are done." The lead also told the [repo view extras](repo-view-branches-raw-clone.md) agent that `/clone` becomes a local flow calling the checked `POST /api/repos` route.
- By 07:20 on 2026-10-20, the client agent's work on disk, unreported ([local-first](local-first.md)):
  - **P2-3:** `.changeset/outbox-lock-leader-take.md` (06:40:06): `Outbox.lockLeader` returns `take`, which steals the lock so "the tab a person is using admits their writes instead of refusing them as a follower's". Decision 0002 (06:55:32) §4: "The focused tab leads the outbox", with new e2e rows E3b and E9b. `packages/effect-tanstack-db/src/Outbox.ts` changed again at 07:13:20.
  - **P3-2:** `src/main.tsx` (06:39:58); `e2e/sign-in.spec.ts` "sign out wipes the device for every tab: a tab still holding the data holds the wipe off, and no tab opens on the session's data" passed with the other two sign-in cases, 3 of 3, at 06:43:35 (scratchpad `wipe-e2e-spec.log`).
  - **P3-5, best guess:** `worker/Answers.ts` (06:48:29) touches a waiting answer "at most once a third of the bound".
  - `src/features/chat/store.ts` (06:52:11), `src/features/agent/host.ts` (07:14:42) and `src/flows/dispatch.ts` (07:14:44) are still changing.
  - A full app unit run at 07:00:35 (scratchpad `p1p2-unit-1.log`): 610 passed, 15 failed, 4 skipped, in 9 of 62 files (`boot`, `telemetry`, `agent`, `web`, `engine`, `e2e`, `ExecutionHost`, `FlowTelemetry`, `Expire`). Several agents edit the app at once, so none is attributed.
  - 07:06:02: its `pnpm docs:check` failed with "All fibers interrupted without error" after 12 package `PASS` lines (scratchpad `p2-docs-check.log`).
- [Model endpoint](model-endpoint.md) moved back to done at 07:01:52 (P2-2 fixed).
- **07:27:56 on 2026-10-20: the lead gave the client agent one more change.** The [minified builds](plan-identity-minified-builds.md) fix is done, and a run the engine refuses now records `plan_changed`; "I sent that change to the chat agent; it will also close answers already stuck." On disk from 07:32:06: `src/features/agent/close.ts` (`chat/Close`), `src/flows/dispatch.ts` (07:33:17) and a `chat.test.ts` case (07:35:24) ([durable answering](durable-answering.md)).
- By 07:37 on 2026-10-20 the client agent hasn't reported.
- 07:29:40 on 2026-10-20, scratchpad `p1p2-unit-2.log`: a full app unit run, 656 passed, 28 failed, 4 skipped, in 10 of 63 files.
- 07:49:00, `p1p2-e2e-1.log`: a full e2e run, 44 passed, 6 failed, 1 skipped, in 22.6 minutes. The failures: `navigate` (by the agent), `repo` (browse; refusals), `sign-in` (signed out) and `web-page` (embed; tab). Several agents edit the app at once, so none is attributed.
- **07:53:57:** the lead kept "the chat-store client fixes (`src/features/chat/**`, `dispatch.ts`, `chat/Close`)" out of landing round 2. The worker and engine fixes land in it ([land to main](land-to-main.md)).
- 07:57:12 to 07:59:56, on disk: `src/features/chat/` `queries.ts`, `schema.ts`, `actions.ts`, `chat.ts`, `store.ts` and `components/Conversation.tsx` changed again. Best guess the client agent's; the branch workspace also touches conversations.
- **About 08:15 on 2026-10-20: the Claude usage limit stopped the client agent** ("Fable fixes: client side (P1, P2, P3s)", 15:13:28Z) with every other Claude agent, unreported. No `src/features/chat/`, `src/flows/dispatch.ts` or `effect-tanstack-db` file changed after 07:59:56. The limit reset at 10:40.
- 08:10:29: the lander's typecheck of round 2's set failed on `LeaderElection.take` in `chat/store.ts`, this agent's P2-3 change ([land to main](land-to-main.md)).
- **10:42: the lead resumed it** from where it stopped ("the chat fixes"). 10:43:40: it took the shared `heavy.lock` for its third full app unit run (scratchpad `p1p2-unit-3.log`). No report by 10:44.

- **11:01 to 11:04 on 2026-10-20: [review round 4](review-round-4.md)'s Fable and Opus both see the client fixes in source**, without the client agent's report: P1-1 (`src/features/chat/store.ts:283-307` waits for `admitted` before `delivered`; `src/flows/dispatch.ts:154-166` completes it on the start's exit), P2-3 (`leader.take` on focus and on ask: `store.ts:553`, `actions.ts:61-81`, `connectivity.ts:21-27`), P3-2 (`src/wipe.ts:113-126` takes `smithers-data` and the engine lock exclusively before deleting), P3-5 and P3-6 (`worker/Answers.ts:85-91`, `:69-74`). Every worker and engine fix here still holds. Opus: the worker suites for those seams pass, 81/81 (`ModelEndpoint`, `Answers`, `RecheckRole`, `Expire`), "which is the point: none covers these cases."
- Residuals round 4 found on these fixes, now its findings: R4-11, an outbox tab that regains the lead re-sends delivered writes, constant now that P2-3 takes the lead on every focus; Fable P3-7, the P3-2 wipe waits forever on a frozen tab; Opus P3-1, P3-6's burst-tail problem moved to `chat/Expire`; Opus P3-2, a tab whose engine is unavailable keeps every ask queued ([local-first](local-first.md), [durable answering](durable-answering.md)).
- Status stays in-progress: the client agent hasn't reported (resumed 10:42).
- **11:54:51 on 2026-10-20: the client agent reported done** (lead relayed 11:55:05). All five client findings, the `plan_changed` close and round 4's R4-11 (Opus P2-5) are fixed, each with a test that fails on the old code. Nothing is committed.
  - The steal option makes `Outbox.Lock.hold` take a steal flag and return `lost`, a breaking change; changeset `outbox-lock-leader-take`.
  - A queued write another tab already sent settles without a second send, counted `sent_elsewhere`; its test sent 3 copies before the fix and 2 after ([review round 4](review-round-4.md), R4-11).
  - `chat/Close` adds a `refusal` field to `DispatchFailed`.
  - The review's burst numbers were off: the tail crosses 10 minutes around the 23rd to 27th question, not the 20th. `chat/Expire` still counts 25 minutes from the ask, so a long burst's tail now ends `abandoned`; the lead sent that to the worker agent ([durable answering](durable-answering.md)).
  - Outside its scope: fixed a `main.tsx` worker option order that stopped the app compiling, and made a device's tabs take turns at the test SQLite file (removes a `database is locked` flake in two-tab tests).
  - **Checks:** 137/137 unit tests for chat, agent and flows; typecheck clean in its files; no new `importRules` violations from it (it sees others': `RepoPage`, `BranchSandboxes.ts`); `docs:sync`, `docs:check` and `smthrs docs //packages/effect-tanstack-db:docs` pass; the package is at 100% coverage. Last full unit run: 28 failures, in other agents' files or load timeouts. Fresh-database e2e: 44 of 50; the 6 came from other agents' mid-run migrations (503s) and the compile break and pass on rerun, except repo "browse", whose copy-permalink comes back empty ([P3 cleanup](review-round-4-p3-cleanup.md)). Later two-tab reruns failed on dev-server worker restarts (502/503) and once on a 61 s answer against a 60 s limit.
- **Status moved to done:** all 12 findings fixed and reported.

## Next

From 11:55 on 2026-10-20: none here. The client fixes land in round 3 of [land to main](land-to-main.md); the `chat/Expire` follow-up is the worker agent's ([durable answering](durable-answering.md)).

Until 11:55 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: as before, the client agent's report; round 4's reviewers already see its five fixes in source. Their residuals go with [review round 4](review-round-4.md).

Until 11:07 on 2026-10-20 the next step was, from 07:53 on 2026-10-20: the client agent's report on P1-1, P2-3, P3-2, P3-5, P3-6 and the `plan_changed` close, each with a test that fails on the old code, real-browser e2e for P1-1, P2-3 and P3-2, and full unit and e2e runs on a fresh database. Then this item is done, [local-first](local-first.md) and [durable answering](durable-answering.md) can close, [message controls](chat-message-controls.md) can start, and the client fixes land in round 3 ([land to main](land-to-main.md)).

Until 07:53 on 2026-10-20 the next step was, from 07:28 on 2026-10-20: the client agent's report on P1-1, P2-3, P3-2, P3-5 and P3-6 and the `plan_changed` close, each with a test that fails on the old code, real-browser e2e for P1-1, P2-3 and P3-2, and full unit and e2e runs on a fresh database. Then this item is done, [local-first](local-first.md) and [durable answering](durable-answering.md) can close, [message controls](chat-message-controls.md) can start, and the fixes land in round 2 ([land to main](land-to-main.md)).

Until 07:28 on 2026-10-20 the next step was, from 07:07 on 2026-10-20: the client agent's report on P1-1, P2-3, P3-2, P3-5 and P3-6, each with a test that fails on the old code, real-browser e2e for P1-1, P2-3 and P3-2, and full unit and e2e runs on a fresh database. Then this item is done, [local-first](local-first.md) and [durable answering](durable-answering.md) can close, and [message controls](chat-message-controls.md) can start. Will's own review follows the landing ([decisions for Will](decisions-for-will.md), row 7; [land to main](land-to-main.md)).

Until 07:07 on 2026-10-20 the next step was, from 06:26 on 2026-10-20: the three reports, each with a test that fails on the old code. Then the affected notes move back to done, and Will's own review follows ([decisions for Will](decisions-for-will.md), row 6 since 06:26), then the landing ([land and deploy](land-and-deploy-mvp.md)).

Until 06:26 on 2026-10-20 the next step was, from 06:09 on 2026-10-20: the three reports, each with a test that fails on the old code. Then the affected notes move back to done, and Will's own review follows ([decisions for Will](decisions-for-will.md), row 5), then the landing ([land and deploy](land-and-deploy-mvp.md)).

## Questions for Will

None. On P2-3, Fable notes that if the one-leader-tab behavior were deliberate, Will's 0002 answer would need revising. The lead keeps the answer ("The composer always sends") and fixes the code instead.
