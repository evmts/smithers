---
title: Flows and the agent (feature 1)
status: in-progress
area: app
owner: wiring agent puts it in the app; e2e-1 finished 03:12 on 2026-10-20 (the agent answers, resumes after a reload and sets the theme; theme by button and killed tab red, spec edits on disk 03:15); the agent root reported done 03:15:18. Until 03:12: Panel A designed it (Opus lead, Sol); placement set by 0011; B1's browser engine done (about 23:41); W5 (a)'s model endpoint done (23:39); F1 done (reported 00:24 on 2026-10-20; its two additions accepted by the lead); F4+F5 done (reported about 01:16 on 2026-10-20); the wiring agent puts it in the app (since about 01:17); F6 and F7 not started
updated: 2026-10-20
links: [app-wiring.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0003-flows-and-the-agent-comparison.md, ../decisions/0002-local-first.md, ../decisions/0010-web-first-desktop-later.md, ../../../../docs/libraries.md, ../rules.md, design-questions.md, host-agnostic-flows.md, durable-answering.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, model-endpoint.md, pwa.md, agent-ui-rendering.md, flows-root-platform-neutral.md, local-first.md, model-step.md, land-and-deploy-mvp.md, sdk-test-reds.md, disk-space.md, code-reviews.md, ../features/flows.md, ../features/agent.md, agent-root-browser-safe.md]
---

## What

The agent is a `@smthrs/agent` flow that runs in the browser on the [durable browser engine](durable-browser-engine.md) (decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md)). It is one more local actor: it calls the same flows a person does, against the same TanStack DB collections, so anything a person can do, the agent can do, and a parity test enforces it.
- Every model call is a [`ModelStep`](model-step.md) through the server's [model endpoint](model-endpoint.md).
- Flows run locally first. A flow goes remote (Cloudflare, or a sandbox later) only for a key the person must not hold, a machine to run code on, or work that must happen while every device is off. How long it takes never decides (`flows.local-first-placement`).
- The first tool sets the theme, light or dark: a setter, not a toggle, so a duplicate delivery can't flip it twice. UI tools such as the theme, opening a file or highlighting lines need no round trip.

Until 22:31 on 2026-10-19 the design was: every action is one `Flow.make` declaration with a placement (the client, Cloudflare, or a sandbox later); answering switches from a direct model call to `@smthrs/agent`'s cell loop inside the durable answer flow on Cloudflare; client flows run unjournaled on an in-memory engine.

## Why

Will: "Our old app had this concept of "flows" eeverything is a flow." "switch from using model directly to using smithers agent!" "Anytng the user can do the agent should be able to do in general so architecting this very well is important."

Will, 22:25: "The agent should run on frontend and the frontend itself should be durable." 22:29: "If smithers doesn't work in browser yet that's a bug it should work in browser via platform-browser" and "Long work isn't what decides if it's remote or not. We prefer things to be local first actaully".

## State

- Decision 0003 is proposed; Opus and Sol designed it independently and Opus merged them. Nothing is built.
- The agent waits for the device to confirm the theme changed before saying so.
- 0005 adds one correction: sandboxed flows need bundling inside the guest.
- 21:21 on 2026-10-19: the lead asked Will to accept the recommended answers below in one batch ([design questions](design-questions.md)). No answer yet.
- 22:16: Will asked for the design questions one at a time, explained better. 22:17: the lead asked Q1 alone, with a diagram of the two placements.
- 22:22: **Q1 answered: the agent loop runs on Cloudflare,** on Will's condition: "make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally".
  - Decision 0003 records it under Q1: the agent loop and every flow are host-agnostic Effect programs; Cloudflare reaches them only as injected layers from `@smthrs/platform-cloudflare`, wired in the Worker entry; the native app ([0010](../decisions/0010-web-first-desktop-later.md)) runs the same code on `@smthrs/platform-bun` or `@smthrs/platform-node`.
  - New rule `sdk.host-agnostic-flows` in `rules.md`, enforced in `apps/mvp/PACKAGE.ts`; a probe file confirmed the lint catches a Cloudflare import. Today only `worker/ChatApi.ts`, an allowed entry file, imports Cloudflare. Its own note: [host-agnostic flows](host-agnostic-flows.md).
  - New test owed by F5: the agent flow runs on the Node host.
- 22:22: Q2 asked: single-write browser flows on the in-memory engine until one has to wait (recommended), or a durable browser engine first (Sol's pick, several days). No answer at 22:24. Decision 0003 stays proposed until Q2 is answered.
- 22:25: **Q2 answered differently from both options.** Will: "A syncronous change to storage is by default durable yea. In fact this kinda explains why we maybe should reconsider where the agent runs. The agent should run on frontend and the frontend itself should be durable." The lead agreed on three conditions (a durable browser engine, the model key stays on the server, long work stays remote) and named the costs: closing every tab pauses the agent, another device can't take over a running task, and Safari may clear storage after 7 days without a visit.
- 22:29: Will: "If smithers doesn't work in browser yet that's a bug it should work in browser via platform-browser"; "All model calls are proxied through server yea"; "The app should be a pwa"; "Long work isn't what decides if it's remote or not. We prefer things to be local first actaully". The last one overrode the lead's third condition. Will left the multi-tab design to the lead, who chose a leader tab's dedicated worker.
- 22:31: **decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) accepted.** It replaces Q1's Cloudflare placement and answers Q2. Both questions in 0003 carry Will's words; 0003's status line still reads "proposed", with a pointer to 0011.
- 0003's build plan still places the agent on Cloudflare: F2 is an in-memory browser engine (`BrowserFlows.ts`) and F5 is `apps/mvp/worker/agent/**` after W5. It needs revising for 0011.
- 22:30: new rule `flows.local-first-placement` (Jev) in `rules.md` and `apps/mvp/PACKAGE.ts`; `sdk.host-agnostic-flows` gained a Jev rubric too ([host-agnostic flows](host-agnostic-flows.md)).
- 22:31: B1 started on the [durable browser engine](durable-browser-engine.md). New items: the [model endpoint](model-endpoint.md) and the [PWA](pwa.md).
- 22:34: 0004 Q2: each model use is a role (`agent`, `renderer`, `judge`) whose model an admin sets with `admin/SetModel`, no deploy ([model endpoint](model-endpoint.md)).
- 22:35: decision 0004 is accepted ([agent UI](agent-ui-rendering.md)).

- 22:42: **0003's build plan revision is in progress.** The lead started a docs agent to revise it for 0011, keeping Will's Q1 and Q2 answers as written:
  - the agent flow runs on the browser host, `@smthrs/platform-browser`'s durable engine ([B1](durable-browser-engine.md));
  - model calls go through the server's metered [model endpoint](model-endpoint.md);
  - remote flows run on `@smthrs/platform-cloudflare` only under 0011's need rule;
  - device flows such as the theme run in the same browser engine.
  - At 22:46, 0003 hadn't changed since 22:30.
- 22:42: decision 0005 Q2 answered: a sandbox exposes only its machine and tools as durable steps, and the agent binds them from its own host like any other tools ([connecting it all](connect-agents-sandboxes-forge.md)).
- 22:48: **0003's build plan is revised for 0011** on disk; each revised point names what it replaced. The agent is `chat/Respond`, an `AgentAction` over `@smthrs/agent`'s cell loop on `@smthrs/platform-browser`'s durable engine ([B1](durable-browser-engine.md)); its model calls go through the server's metered endpoint (HOST-PLAN W5 (a), [model endpoint](model-endpoint.md)). The agent and the theme flow share the leader tab's engine, so `app/theme/set` is a journaled child step and its result is the receipt. Placement follows 0011's need rule. The build plan dropped `@smthrs/engine`'s bounded memory retention, `BrowserFlows` and `HostModel.seats`. The device-call design stays as the record for an agent on a remote host. 0003's status line still reads "proposed", pointing to 0011. The lead lists the docs agent as running at 22:53.
- 22:54: the docs agent finished; 0003, 0009 and HOST-PLAN match 0011, and `pnpm docs:check` passes.
- 22:56: all 14 design questions are closed ([design questions](design-questions.md)). Both of 0003's questions carry Will's answers; its file status still reads "proposed".
- With both questions answered and the build plan revised for 0011, this item moves from designing to todo. The walking skeleton waits on B1's engine ([durable browser engine](durable-browser-engine.md)) and W5 (a), the [model endpoint](model-endpoint.md). Nothing is built.
- 22:58: W1 finished the engine work at 100% coverage ([durable answering](durable-answering.md)).
- 22:59: **W5 (a) started** the [model endpoint](model-endpoint.md) the agent calls; 23:01: L1 started the persisted collections and outbox the agent writes through ([local-first](local-first.md)); V1+V2 started the views SDK it renders with ([agent UI](agent-ui-rendering.md)).
- 23:02: the lead's board: "1 Flows + agent: browser engine (B1), model endpoint + Cloudflare flow host (W5) → agent flow in the app, after B1 + model endpoint". Will tests the app once the agent flow and the repo view land; the lead tells him what to try ([land and deploy](land-and-deploy-mvp.md)).

- 23:39: **W5 (a) is done**: the [model endpoint](model-endpoint.md) serves `POST /api/model/<role>`, so the agent's model calls have their door. Production refuses every call with 401 until [sign-in](sign-in.md), which S1 started at 23:39; dev and tests get a local Admin.
- About 23:41: **B1 is done**: durable flows run in the browser, proven in real Chromium ([durable browser engine](durable-browser-engine.md)). The lead: "That unblocked the critical path, so two more agents started".
- 23:41: **F1 started**: the harness conversation profile (`cellPrompt`, `CellTurn` and `DoneText` in `@smthrs/harness`) and the profile option in `Agent` and `AgentAction`, row F1 of 0003's build plan.
- 23:41: **F4+F5 started, as one agent:**
  - F4: `src/flows/**`, the registry and dispatch with the parity law; `src/features/theme/**`, the first flow; `worker/Flows.ts`, the remote door; and a parts migration. 0003's plan named it `0004_parts.ts`, but `0004` is now W5's `0004_model_roles`, so it needs the next number.
  - F5: `src/features/agent/**`: `chat/Answer` and `chat/Respond` on the browser engine, with every model call through `ModelStep` to the endpoint's `agent` role.
  - The lead: "When F5 and local-first land, I wire them into the app, delete the old server-side answering, and tell you it's ready to test."
- 23:47, on disk: F1's first edits, `harness/src/internal/cellPrompt.ts` and `harness/src/CellTurn.ts`; no `DoneText.ts` yet. No F4 or F5 file yet: `src/flows`, `src/features/theme`, `src/features/agent` and `worker/Flows.ts` don't exist.
- The [flows root](flows-root-platform-neutral.md) fix, started 23:39, keeps Node-only code out of the browser bundle the agent runs in.

- 23:47 on 2026-10-19 to 00:06 on 2026-10-20, on disk, unreported:
  - **F1:** `harness/src/Cell.ts` (23:47), `CellTurn.ts` (23:57), and `DoneText.ts`, `internal/fence.ts` and `internal/cellPrompt.ts` (23:59), plus the profile option in `agent/src/Agent.ts` and `AgentAction.ts` (23:50) with their tests (23:58).
  - **F1's changeset**, `.changeset/agent-conversation-profile.md` (00:04): a `conversation` profile teaches the REPL and rules 1 to 6, leaving out the workspace-only rules, and `DoneText.project` shows an answer while it streams.
  - **F1's test runs:** a harness run at 00:01 and a coverage run at 00:02 (scratchpad `harness-test.log`, `harness-cov.log`) pass 2,451 tests at 100% coverage. One check fails: "claims no unreleased version in an @since tag", in `QuickJSVariant.ts` and `index.ts`, and both files changed again at 00:03.
  - **F4:** `src/flows/` exists. The leader tab's engine runs on B1's `BrowserEngine` (`engine.ts`, `engine.worker.ts`, `tabPort.ts`, 00:02), with the registry, dispatch, catalog, contract and placement (23:52 to 00:06). The theme flow is in `src/features/theme/` (23:51 to 00:04). `worker/Flows.ts`, the remote door, isn't on disk.
  - **F5:** `src/features/agent/` (23:55 to 00:04). `host.ts` gives the agent one seat, the endpoint's `agent` role, read through `ModelProxy`'s client, "so each model call is a sealed `ModelStep` and the key never reaches the device". Its catalog is the app's own flows, with no file system or shell. The agent's events become the answer's parts.
  - **F5's server side:** `worker/Answers.ts` (23:59) is the write path for those answers ([durable answering](durable-answering.md) W5 (b)). `@smthrs/model`'s `ModelProxy.ts` and its test changed at 23:57.
  - **The migration clash is settled.** The parts migration is `db/migrations/0006_answer_parts.ts` (23:55), since S1 took `0005` for sign-in. It adds `messages.parts` and a new failure, `unfinished`, for an agent that runs out of frames before answering.
  - Not yet: tests for `src/flows` or `src/features/agent`, and the feature docs the code cites (`docs/features/flows.md` and `agent.md`).


- 00:07 to 00:14 on 2026-10-20, on disk, unreported:
  - **F4+F5's first tests:** `src/features/agent/agent.test.ts` with `src/test/agent.ts` (00:12). A plain answer settles `done` (passed at 00:11). The walking-skeleton case, a theme tool call that paints `dark`, failed at 00:12: the run ended `failed`. The agent is debugging it.
  - F4+F5 added a `/// <reference>` for the wa-sqlite declaration to `platform-browser/src/BrowserSqlite.ts` (00:07) so `apps/mvp` typechecks ([B1 follow-ups](b1-follow-ups.md)).
  - **F1 is blocked on another agent's move:** at 00:13 `smthrs docs //packages/smithers/agent:docs` fails because `flows/sandbox/PACKAGE.ts` still names `flows/src/SandboxedFlow.ts`, which the [flows root](flows-root-platform-neutral.md) agent moved. That docs check is what F1's `@since` fix needs.

- 00:24 on 2026-10-20: **F1 is done, reported**, uncommitted. Harness and agent are at 100% coverage.
  - The `conversation` profile is the REPL and rules 1 to 6 byte for byte, with no bug-fix example, no rules 7 to 9 and no history fact, pinned at 3,025 characters. The `workspace` contract keeps its old length and digest (5,638 characters), and `StepKeyGolden` passes. `CellTurn.teach` takes the profile as a fifth argument, and `CellTurn.Input.profile` re-teaches it when the catalog changes.
  - `DoneText.project(reply)` returns the decoded literal prefix as an `Option`. 14 tests, including 400 seeded random cases checked against strict-mode JavaScript, show that every cut of a reply gives a prefix that only grows.
  - **Two additions beyond 0003, for the lead to confirm:** `conversation` also drops the "this host pins no trees" fact, which names `ctx.base` that it never teaches. It also defaults `repeatCap` and `narrowingCap` to 0, because both are on by default and `AgentAction` gives F5 no way to turn them off. An explicit value still wins.
  - **What F5 calls:** `AgentAction.make("chat/Respond", { payload, output: Schema.String, seat: "agent", system: [CHAT_SYSTEM], profile: "conversation", maxFrames: 8, prompt })`. Its `EventSink` appends each `text-delta` to the reply, resets it on `model-requested` and `model-retried`, and renders `DoneText.project(reply)`.
  - The reds F1 found are in other lanes' files: harness `PackageConventions` (`QuickJSVariant` `@since`) and agent `Fault.sweep` (`ModelProxyRefusal`). An agent started about 00:24 fixes both ([SDK test reds](sdk-test-reds.md)). `smthrs docs` and the Go half of `pnpm docs:check` couldn't run, because of the stale path and low disk ([disk space](disk-space.md)).
- 00:24 to 00:26 on 2026-10-20, F4+F5, on disk, unreported:
  - A throwaway `src/features/agent/debug.test.ts` drove one model call through the endpoint's `agent` role and is gone. Scratchpad `dbg.log` (00:25): `model.proxy.stream` succeeded, status 200, 12 tokens in and 34 out.
  - A new `src/features/agent/progress.ts` (00:26) folds the agent's events into the answer's text and parts with F1's `DoneText.project`, and writes each answer at most once a second. `flows.ts`, `schema.ts` and `worker/Answers.ts` changed at 00:26.
  - No result for the theme case yet.
- After 00:31 on 2026-10-20: **the lead accepted F1's two additions beyond 0003.** The `conversation` profile drops the "this host pins no trees" fact, and it defaults `repeatCap` and `narrowingCap` to 0; an explicit value still wins. F5 calls `AgentAction.make` with `profile: "conversation"` as F1 reported.
- 00:26 to 00:35 on 2026-10-20, F4+F5, on disk, unreported:
  - `progress.ts` changed again at 00:30.
  - `src/features/agent/agent.test.ts` and `src/test/agent.ts` (00:33) hold 5 cases for `chat/Answer`: a plain answer through the model endpoint; `app/theme/set` as a journaled step, answered from its receipt; the text streaming to the answer's row, then settling; resuming after the tab is killed mid-answer, without calling the model or the theme again for sealed steps; and answering a settled run again from its record, without calling the model.
  - Scratchpad `resume.log` (run from 00:34:36): the resume case fails, with the other 4 skipped. No result for the theme case since its 00:12 failure.


- 00:36 on 2026-10-20: V1+V2, the views SDK, is done. V3 to V5, the app views, evals and e2e, wait on this agent flow ([agent UI rendering](agent-ui-rendering.md)).
- 00:36 to 00:46 on 2026-10-20, F4+F5, on disk, unreported:
  - The theme feature: `actions.ts` and `theme.ts` (00:37), `store.ts` (00:41) and `components/ThemeButton.tsx`. `src/flows/registry.ts` (00:39) and `dispatch.ts` (00:41).
  - `worker/Flows.ts`, the remote door, changed at 00:39, with `worker/Flows.test.ts` at 00:45.
  - `worker/Chat.ts` routes `/api/answers/<id>` to `Answers.ts` (00:44), and `Answers.test.ts` and `Body.test.ts` changed at 00:43 to 00:44 ([durable answering](durable-answering.md)).
  - L1's report at 00:44 names `src/features/agent/agent.test.ts` as the one failing `src` test, and import rules failing on `src/flows/engine.worker.ts`'s `fetch` ([local-first](local-first.md)). No pass result for the theme or resume cases is on record.
- 00:44: the lead's wiring checklist (scratchpad `final/WIRING.md`) lists what F4+F5's report hands over: the `boot.ts` and router wiring for the flows, the theme and the agent; deleting server answering (`waitUntil`, the cron sweep, the `attempts` table and `worker/Answer.ts`); and e2e for the theme switched by a person and by the agent, and for an answer that survives a killed tab.

- 00:46 to 00:54 on 2026-10-20, F4+F5, on disk, unreported:
  - **Engine tests on the device:** `src/flows/engine.test.ts` (00:48) holds "a person's button sets the theme through the leader's engine and the tab port, and the tab paints it" and "the agent answers on the leader's engine, and its theme call paints this tab". Scratchpad `dev.log` (00:49 to 00:50): the leader starts (`browser.runtime.leader { flows: 2 }`) but the button case times out at 30 s, and the agent case is skipped. `engine.ts` and `src/test/device.ts` changed after it, at 00:52.
  - **Unit tests for the rest:** `tabPort.test.ts` (00:46, 4 cases), `registry.test.ts` (00:53: the parity law, names and placement, the agent's catalog), `dispatch.test.ts` (00:53: client and remote flows, `FlowDispatch`), `catalog.ts` (00:53), and `worker/Flows.test.ts` (00:46) for `POST /api/flows/<name>`: a start is idempotent (202, 202, then 409 for another payload), signed-out callers are refused, and a host that can't record the start answers 503.
  - No pass result for the theme or resume cases yet, and no report.
- 00:44: what F4+F5 hands over is now the [app wiring](app-wiring.md) note.

- 00:55 to 01:04 on 2026-10-20, F4+F5, on disk, unreported:
  - Tests: `src/flows/dispatch.test.ts` (00:55), `features/theme/store.ts` and `theme.test.ts` (00:58), and the agent's `answers.test.ts` (00:59), `agent.test.ts` (01:01) and `progress.test.ts` (01:02).
  - The device engine: `src/flows/engine.ts`, `engine.worker.ts` and `src/test/device.ts` (01:03), then `apps/mvp/PACKAGE.ts` (01:03) and `vitest.config.ts` (01:04). Best guess: the import-rules failure on `engine.worker.ts`'s `fetch`, which L1 reported at 00:44.
  - **An `apps/mvp` unit run at 01:04 passes** (scratchpad `full.log`, best guess this agent's): 33 files and 345 tests pass, 1 file and 3 tests skip, 100% statements, branches, functions and lines. The device-engine e2e cases (the theme by button and by the agent) have no pass result on record.
- About 00:55 and 01:00: the agents beside this one finished: the [SDK test reds](sdk-test-reds.md), [sign-in](sign-in.md) and the [edge cache](platform-cloudflare-edge-cache.md). F4+F5 is now the one report the [app wiring](app-wiring.md) step waits on.

- 01:06 to 01:16 on 2026-10-20, F4+F5, on disk, unreported:
  - **Docs:** `docs/features/flows.md` (01:06) and `docs/features/agent.md` (01:12). `agent.md` opens "Smithers answers in the browser". `chat/Answer` runs on the device's durable engine, with the answer's id as its execution id and a 10-minute deadline:
    - `chat/LoadTurn` reads the question and history from `GET /api/answers/<id>`;
    - `chat/Respond` runs the agent's cell loop with profile `conversation`, at most 8 frames, each model call a sealed `ModelStep` to `POST /api/model/agent`;
    - `chat/Settle` posts the final text or failure.
    - Closing the tab pauses an answer; the next tab or visit resumes it, and a sealed model call is never paid for twice.
  - A formatting pass at 01:13 over the agent, theme and `src/flows` files and the `Flows`, `Answers` and `Body` worker files, then `progress.ts`, `schema.ts`, `worker/Answers.ts`, `PACKAGE.ts` and `vitest.config.ts` (01:13).
  - 01:15: a targeted run of `src/features/agent`, `src/features/theme`, `src/flows` and the `Answers`, `Flows`, `Body` and `FlowTelemetry` worker tests started. No result yet.
  - Server answering is still in `worker/Chat.ts` (its sweep at line 314), as planned until the lead deletes it in the [app wiring](app-wiring.md) step.
- 01:14: a full `apps/mvp` unit run (scratchpad `full.log`, started 01:14:23) fails 3 of 349 tests; the same file passed at 01:04. The failures are `db/Database.test.ts`'s `migrateAndReport` and the `probe/Pause` cases in both `ExecutionHost` tests. Best guess they come from the R3 to R5 agent's work in progress, not this agent's ([repo clone and view](repo-clone-and-view.md)).
- 01:12: Codex Astra review 3 started. It passes lightly over `src/flows`, `features/agent`, `features/theme` and `worker/{Flows,Answers}.ts`, since they're still landing ([code reviews](code-reviews.md)).

- About 01:16 on 2026-10-20: **F4+F5 is done, reported.**
  - **`src/flows`:** the registry (the parity law, placement by need, and a scan of dispatch names), `FlowDispatch`, the agent catalog and the tab port.
  - **The theme flow `app/theme/set`,** with `ThemeButton` and a pre-paint script.
  - **The remote door** `worker/Flows.ts`, and migration `0006_answer_parts`.
  - **The agent:** `chat/Answer`, `chat/Respond` and `chat/Settle` run with the `conversation` profile and `DoneText`. Every model call is a sealed `ModelStep` through `/api/model/agent`, and the answer routes are `/api/answers/<id>`.
  - **Proof:** killed mid-answer, it resumed with 3 model calls (one sealed, one cut off, one after) and one theme write, so the sealed call wasn't paid for twice. Per `docs/features/agent.md`, `agent.test.ts` runs `chat/Answer` on the Node host over the compose Postgres, against ChatApi's real model endpoint and answer routes, with a scripted model ([host-agnostic flows](host-agnostic-flows.md)).
  - **SDK fix:** `ModelProxy.serve` refused every agent call after the first frame, because of a `null` `responseId` ([model endpoint](model-endpoint.md)).
  - **Owed:** the wiring into the app, and the real-browser e2e: the theme from both doors and an answer that survives a killed tab.
- About 01:17: **the wiring agent started** ([app wiring](app-wiring.md)). The lead to Will: "I've started the wiring step, the last one before you can test." And: "When it reports, I'll give you the URL and what to try."
- 01:18: Codex Astra review 3 had passed only lightly over this code. Its finding 3, server answering still live, went to the wiring agent ([code reviews](code-reviews.md)).
- 01:43, on disk, mid-edit: `src/boot.ts` imports `ThemeStore`, `Theme`, `FlowDispatch` and `RemoteFlows`, and its `Host` gains `theme` and `engineWorker`, the device engine's worker ([app wiring](app-wiring.md)).

- 01:50 on 2026-10-20: **the agent's first real-browser load fails in the dev server.** The engine worker imports `@smthrs/agent`, whose root reaches `@smthrs/std`'s `node:dns/promises` through `FlowEngineLike`. From 01:55 the local-first e2e can't open the app. F4+F5's tests ran on the Node host, so this is the first browser run of the agent ([agent root in the browser](agent-root-browser-safe.md), [app wiring](app-wiring.md)).
- 01:52, scratchpad `a2a-run1.log`: the wiring sub-agent A2a's run of `chat.test.ts` fails "the asking tab's own agent answers once ChatApi takes the question: the answer streams, then settles" with `not asked yet` ([app wiring](app-wiring.md)).

- About 02:05 on 2026-10-20: **two fixes for the browser blocker started.** The wiring agent keeps the agent out of the tab: only `engine.worker.ts` reaches `@smthrs/agent`, and the tab starts `chat/Answer` by a `BrowserEngine.FlowReference` (`src/features/agent/reference.ts`, on disk 02:14). An SDK agent makes the `@smthrs/agent` root itself browser-safe ([agent root in the browser](agent-root-browser-safe.md), [app wiring](app-wiring.md)).
- **02:30:57 on 2026-10-20: the agent runs in real Chromium, outside the app.** The agent-root agent's test sub-agent: `platform-browser/test/browser/Agent.test.ts` passes 2 of 2. An `AgentAction` settles on `BrowserRuntime` in a dedicated worker with a scripted model, and after a SIGKILL during the second model call the relaunched browser makes only that call again ([agent root in the browser](agent-root-browser-safe.md)).
- 02:31 to 02:33, the wiring agent's sub-agents: A2a wired dispatch, so `send` forks `chat/Answer` once ChatApi takes a question, and in Node tests the asking tab's agent answers. A3 split `engine.ts` into `tabEngine`, `TabWorker` and `tabAnswers`, and the tab now holds only a `FlowReference`. In the app, the engine worker starts at 0.6 s and dies at load with `document is not defined`, from the agent's markdown parser ([app wiring](app-wiring.md)).
- About 02:35 to 02:43 on 2026-10-20: the chain is `@smthrs/agent` → harness → `@smthrs/registry`'s `Prompt.ts` → `@mdx-js/mdx` → `decode-named-character-reference`'s `browser` build. The SDK agent keeps MDX off the agent root's path and adds a dedicated-web-worker target to the browser gate; the lead ruled out an app-side alias. On disk by 02:42: the worker gate, and `Prompt.ts` loading MDX lazily, mid-edit ([agent root in the browser](agent-root-browser-safe.md)). A second blocker, refused `SharedSqlite` statements, went back to the `platform-browser` agent about 02:36 ([one SQLite, one leader](one-sqlite-one-leader.md)).
- About 02:50 to 02:53 on 2026-10-20: the lead told the SDK agent about `Prompt.ts`' leftover eager `import "@mdx-js/mdx"` on line 14. On disk at 02:52:43 the line is gone, and the real-Chromium agent test fails 2 of 2 with it (02:52:40) and passes 2 of 2 without it (02:52:43); unreported ([agent root in the browser](agent-root-browser-safe.md)). A `SharedSqlite` fix is on disk since 02:43, also unreported. The agent hasn't answered in the app yet ([app wiring](app-wiring.md)).
- **02:56:58 to 03:06 on 2026-10-20, scratchpad `wiring/e2e-1.log`, unreported: the agent answers in the app, in a real browser.** With the agent-root fix on disk and the `SharedSqlite` fix reported (about 02:58), the engine worker loads `@smthrs/agent`. Passing: "the browser's agent answers through the model endpoint, and the answer streams into the conversation"; "reload mid-answer: the browser's agent resumes the answer after the reload"; "theme by the agent: asking Smithers to switch to dark mode runs app/theme/set, the same flow as the button". Failing: "theme by button" (no "Switch to light mode" after the click) and "killed tab" (the resumed answer never completes) ([app wiring](app-wiring.md), [agent root in the browser](agent-root-browser-safe.md)).

- **03:12 on 2026-10-20: the e2e run finished**, 24 of 36 passed (scratchpad `wiring/e2e-1.log`). The agent's three passes held: it answers through the model endpoint, resumes an answer after a reload, and sets the theme through `app/theme/set`. Its two reds are unchanged: "theme by button" (no "Switch to light mode" after the reload within 5 s) and "killed tab" (the resumed answer never completes) ([app wiring](app-wiring.md)).
- **03:15:18 on 2026-10-20: the agent-root SDK agent reported done.** The `@smthrs/agent` root loads in a browser, a dedicated web worker and a Cloudflare Worker; an `AgentAction` with a scripted model runs to completion in real Chromium. Nothing is committed ([agent root in the browser](agent-root-browser-safe.md)).
- 03:15:37 on 2026-10-20, on disk, unreported: spec-only edits to `e2e/agent.spec.ts`. "Theme by button" waits up to 30 s for the button after the reload, "once the store has restored it". "Killed tab" waits for the theme to paint dark before it closes the tab, and polls ChatApi's log for a sealed model call. A rerun started about 03:16 ([app wiring](app-wiring.md)).

## Next

From about 03:16 on 2026-10-20, first: the rerun's result for "theme by button" and "killed tab". Both fixes on disk are spec-only, so each needs its cause named: a slow store restore after a reload, or a product bug behind a longer wait. "Killed tab" proves a sealed model call isn't paid for twice. Then the wiring agent's report with GIFs, and the lead tells Will it's ready to test. F6 (chat parts) and F7 (e2e and docs) follow. The agent-root report is in (03:15:18).

Until about 03:16 on 2026-10-20 the next step was, from about 03:06, first: the "theme by button" and "killed tab" e2e reds fixed or explained, in the [app wiring](app-wiring.md) step; the agent already answers, resumes after a reload and sets the theme in a real browser. Then the SDK agent's report on the agent root, and the wiring agent's report with GIFs. Then the lead tells Will it's ready to test. F6 (chat parts) and F7 (e2e and docs) follow.

Until about 03:06 on 2026-10-20 the next step was, from 02:35, first: the app's engine worker loads `@smthrs/agent` without the DOM ([agent root in the browser](agent-root-browser-safe.md)). Then the wiring agent's report ([app wiring](app-wiring.md)): the walking skeleton in a real browser, with GIFs. "Switch to dark mode" in chat changes the theme through the agent, and a person's button sets it too; an answer survives a killed tab; server answering is gone. Then the lead tells Will it's ready to test. F6 (chat parts) and F7 (e2e and docs) follow.

Until about 01:16 on 2026-10-20 the next step was: F4+F5's report. Then the walking skeleton passes: in the e2e test, "switch to dark mode" in chat changes the theme, with the agent on the [durable browser engine](durable-browser-engine.md) and its model call through the [model endpoint](model-endpoint.md), and the same agent flow runs on the Node host ([host-agnostic flows](host-agnostic-flows.md)). Then the lead wires F5 and [local-first](local-first.md) into the app, deletes server answering ([durable answering](durable-answering.md) W5 (d)), and tells Will it's ready to test. F6 (chat parts) and F7 (e2e and docs) follow.

Until about 00:31 on 2026-10-20 the next step also had: the lead confirms or rejects F1's two additions. (Accepted.)

Until 00:24 on 2026-10-20 the next step was: F1's and F4+F5's reports. Then the walking skeleton passes: in the e2e test, "switch to dark mode" in chat changes the theme, with the agent on the [durable browser engine](durable-browser-engine.md) and its model call through the [model endpoint](model-endpoint.md), and the same agent flow runs on the Node host ([host-agnostic flows](host-agnostic-flows.md)). Then the lead wires F5 and [local-first](local-first.md) into the app, deletes server answering ([durable answering](durable-answering.md) W5 (d)), and tells Will it's ready to test. F6 (chat parts) and F7 (e2e and docs) follow.

Until 23:41 the next step was: revise 0003's build plan for 0011 (in progress since 22:42; done 22:54). Then the walking skeleton: an e2e test where "switch to dark mode" in chat changes the theme, with the agent loop on the [durable browser engine](durable-browser-engine.md) and its model call through the [model endpoint](model-endpoint.md). It needs B1's tracer bullet and the endpoint. A test runs the same agent flow on the Node host, so the native app's path is proven from the first build ([host-agnostic flows](host-agnostic-flows.md)).

Until 22:31 the next step was the same walking skeleton after durable answering W5, with the agent loop on Cloudflare.

## Questions for Will

- Client flows such as the theme run unjournaled on the in-memory engine (one local write each) until one has to wait, instead of building a durable browser engine first? Recommended: yes. Asked 22:22 as question 2 of 14. (Answered 22:25 to 22:29: a synchronous write is durable, the agent moves to the browser, and the browser engine is durable; decision 0011.)
- Confirm the agent loop runs on Cloudflare; both panels chose the server for "using our existing cloudflare based model from frontend". Recommended: yes. (Answered 22:22: yes, with Cloudflare decoupled by dependency injection. Replaced at 22:31 by decision 0011: the agent runs in the browser.)
- None open.
