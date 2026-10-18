# 0003: Flows, and the agent that uses them

Status: proposed (2026-10-19; design panel: Opus as lead, and Sol). Where the agent runs is decided by [0011](0011-the-agent-runs-in-the-browser.md), which replaces this record's server loop. Its placement text and implementation plan were revised for 0011 the same day, and each revised point names what it replaced. Nothing here is built. It builds on [0002](0002-local-first.md) and the lead's durable-answering plan ([HOST-PLAN]), whose workstreams W1 to W6 keep their ownership. The agent's UI, codemode and evals are in [0004](0004-agent-ui-codemode-and-rendering.md). The per-point comparison of the two designs is in [0003-flows-and-the-agent-comparison.md](0003-flows-and-the-agent-comparison.md).

## Decision

1. **Every action is one declared flow with a placement.** `src/flows/registry.ts` lists the app's flows. Each is a `Flow.make` declaration in its feature folder, annotated with `Flow.Placement`:
   - `client`: run on `@smthrs/platform-browser`'s durable engine in the leader tab (B1), which writes shared rows through 0002's outbox as a person's action does;
   - `remote`: run on `@smthrs/platform-cloudflare` (W4) only by 0011's need rule: a key the person must not hold, a machine to run code on, or work that must happen while every device is off;
   - `sandbox`: later, with feature 5.

   Revised by [0011](0011-the-agent-runs-in-the-browser.md). Until then `client` ran in the tab on an in-memory engine, and every flow on shared state was `remote`.
2. **The UI and the agent dispatch the same declaration.** A button calls `FlowDispatch.dispatch`, and an agent's cell calls `ctx.call`. Effects land in TanStack DB collections: directly for a client flow, through Postgres and Electric for a remote one.
3. **A remote flow starts through 0002's outbox,** at one door, `POST /api/flows/:name`.
4. **The agent runs in the browser,** on `@smthrs/platform-browser`'s durable engine (B1): `chat/Respond`, an `AgentAction` over `@smthrs/agent`'s cell loop. Its model calls go through the server's metered model endpoint, restored from `ModelProxy` (HOST-PLAN W5 (a)). Revised by [0011](0011-the-agent-runs-in-the-browser.md); until then it ran on Cloudflare as the model step of HOST-PLAN's `chat/Answer`, and ModelProxy stayed deleted.
5. **The agent calls a client flow in its own engine.** The agent and the theme flow share the leader tab's engine, so `app/theme/set` is a journaled child step on the device that asked, and its result is the receipt. The agent never reports a change before that result. Revised by [0011](0011-the-agent-runs-in-the-browser.md); until then a client flow called by the agent was a device call with a receipt (§3).
6. **Client flows are setters.** The first is `app/theme/set { mode: "light" | "dark" }`. The theme button reads the current theme and calls the setter, so a duplicate delivery can't flip it twice.
7. **Every model call is a `ModelStep`** (W3), through `FlowEngineLike.sealStep`, for the main agent and the renderer alike. Each calls the server's model endpoint with its role, `agent` or `renderer` ([0004](0004-agent-ui-codemode-and-rendering.md) question 2).
8. **One question, one answer, in turn,** as Will settled in 0002. Steering mid-answer comes later.
9. **What streams:** each call as a step, and the answer text, projected from the `ctx.done(...)` literal while the final cell streams.
10. **Anything a person can do, the agent can do.** A parity test over the registry enforces it.

## Why

The first two points argued for the Cloudflare loop, and [0011](0011-the-agent-runs-in-the-browser.md)'s Why replaces them: the browser engine is durable (B1), and the model key, the sign-in check and the budget stay on the server's model endpoint.

- **The server already owns answering.** 0002 decision 3 says only the server writes answer rows, and 0001 moved answering there because a closed tab left answers stuck. A loop in the tab would reverse both. It would also need:
  - a model relay open to signed-out visitors, while the todo's admission limits can only hold where the prompt and tools are fixed;
  - a durable browser engine, which doesn't exist ([libraries.md]: browsers are bundle-only).
- **The old app made the same move.** It ran the tool loop in the browser until T-APP-16, "The browser executes no tool", landed in `263c41d3d87c`.
- **Codemode and placement already exist.**
  - `@smthrs/agent` is a durable loop whose model writes JavaScript cells, and `ctx.call` is a cell's only authority ([agent-loop]).
  - `@smthrs/plan/Placement` already names `local`, `client` ("the viewer's browser host"), `remote` and `sandbox`.
  - The app composes these. It adds no runtime.
- **A receipt keeps the agent truthful.** Root `AGENTS.md` M-46 forbids reporting an import that didn't happen; a theme change follows the same rule.

## Consequences

- **New SDK pieces, each with a consumer here:**
  - `@smthrs/harness`: a `conversation` contract profile and `DoneText`;
  - `@smthrs/agent`: passes the profile through;
  - `@smthrs/model`: `ModelProxy` restored for the metered model endpoint (HOST-PLAN W5 (a));
  - `@smthrs/platform-browser`: the durable browser engine (B1).

  Revised by [0011](0011-the-agent-runs-in-the-browser.md). It dropped `@smthrs/engine`'s bounded memory retention and `BrowserFlows`, which served the in-memory browser engine, and `HostModel.seats` in `@smthrs/model-host`, because the endpoint resolves each role's model (0004 question 2).
- **Client flows are journaled** on the durable browser engine (0011, answering question 2). Until 0011 each was one unjournaled synchronous write, and a durable browser engine waited for the first client flow that had to wait.
- **`messages` gains `parts` on answers.** The `device` column (`{id, theme}`) on questions served device calls, which 0011 removed: the browser agent reads the theme from its own collection.
- **`POST /api/questions` is part of the message write path** (HOST-PLAN W5 (b)). Until 0011 it was to fold into `POST /api/flows/chat/Ask` after W5.
- **Answering gains one failure code,** `unfinished`: the frame cap ended the run before `ctx.done`.

## 1. The registry

| Source | Declared | Runs | When |
|---|---|---|---|
| App flows | `src/features/<f>/flows.ts`, listed in `src/flows/registry.ts`; framework-free, so the tab and the Worker import the same file (as `contract.ts` is today) | `client` or `remote` | now |
| Repository flows | `.smithers/flows/<name>/flow.ts` in a cloned repository, found by `Registry.layerProject` without importing it | `sandbox` only | feature 5 |
| Authored flows (agent or person) | `PromoteFlows` and `FlowStore`, admitted by content digest | `sandbox` only, never on the host | later |

**Identity.** App names live under `app/`, `chat/`, `ui/` and `view/`, which no other source may claim; this mirrors the install catalog's `reserved_name` ([flows README]). A repository flow is `{source, revision, tag}`. The catalog a cell was written against is the one its calls are checked against, by declaration digest ([agent-loop], "One catalog, shown and enforced"). So a deploy during an answer fails a changed call as a typed result rather than running new code under an old key.

**A declaration:**

```ts
export const SetTheme = Flow.make("app/theme/set", {
  description: "Set this device's theme.",
  payload: { mode: Schema.Literals(["light", "dark"]) },
  success: Schema.Struct({ mode: Schema.Literals(["light", "dark"]) }),
  modelInvocable: true,
  body: Node.capture({ action: WriteTheme.name }, (p) => WriteTheme.call(p))
}).annotate(Flow.Placement, Placement.client())
```

**The placement rule** is 0011's need rule, `flows.local-first-placement` in [rules.md](../rules.md), enforced by Jev. A flow is `remote` only when it needs a key the person must not hold, a machine to run code on, or to run while every device is off. Waiting, the network and duration never make a flow remote: the agent waits on the model and stays local. Revised by [0011](0011-the-agent-runs-in-the-browser.md); until then a `client` flow touched only this device's local collections and finished synchronously, anything that waited or used the network was `remote`, and `src/flows/registry.test.ts` ran every client flow under `Effect.runSync` and failed on any `net:` or `proc:` capability.

**The parity law** is ported from the old app's three-door law (`apps/app/AGENTS.md`). The registry test fails when:
- a flow the UI dispatches isn't in the registry, or
- a registered flow is neither `modelInvocable` nor carries a `userOnlyReason`.

Every user-facing action counts, composer and navigation included. Physical gestures, such as focusing the composer, are user-only with a reason. The UI dispatches only a typed `FlowName`. Internal steps (`chat/Settle`, fencing, transport) are not invocable, and dispatch still checks capabilities.

## 2. The flux link

```
 button · slash · view event ─┐                         ┌─ agent cell: await ctx.call("app/theme/set", {mode: "dark"})
                              ▼                         ▼
             FlowDispatch.dispatch(flow, input)     FlowBinding in the same browser engine
   client ─▶ browser engine (leader tab's worker; step record in SQLite on OPFS) ─▶ local collection (OPFS)
   remote ─▶ outbox "flow.start" (IndexedDB) ─▶ POST /api/flows/:name ─▶ Durable Object start ─▶ CloudflareRuntime
                                                    └▶ Postgres rows ─▶ Electric ─▶ collections on every device
```

Revised by [0011](0011-the-agent-runs-in-the-browser.md). Until then the agent's `ctx.call` went to a `FlowBinding` on the Cloudflare host, client flows ran in `BrowserFlows`, and a client flow the agent called became a device call (§3).

**`POST /api/flows/:name {executionId, payload}`:**
- **Admission:** the flow must be in the registry, `remote` and `startable`. The payload is decoded by the flow's own schema and size-bounded per flow.
- **Answers:** 202 `{txid}`, 200 for an execution that already exists, 400, 409 for the same id with another payload (HOST-PLAN's Durable Object conflict), and 413.
- **Idempotency:** the execution id is picked once on the device and stored with the outbox entry, so every replay is byte-identical.

**What is durable where:**

| Thing | Durable in | Survives |
|---|---|---|
| A client flow, an agent run, every model call | the browser engine's step record (SQLite on OPFS); a client flow's effect also in the persisted local collection it wrote | reload, restart, the leader tab closing: another tab or the next visit resumes |
| A remote start not yet admitted | the outbox (IndexedDB) | reload, restart |
| A remote flow | Durable Object storage, then the engine journal in Postgres (`smithers_flows`) | everything |

Revised by [0011](0011-the-agent-runs-in-the-browser.md). Until then agent runs and model calls were durable in Durable Object storage and Postgres, as remote flows are; a client flow's only record was the collection it wrote; and a device call lived on the answer row and in a `DurableDeferred`.

**Not built now:** a port for a local flow to wait on a remote child. It arrives with the first local flow, the agent included, that waits on a remote result. The durable browser engine, listed here until 0011, is B1, in progress.

## 3. Device calls

**Replaced by [0011](0011-the-agent-runs-in-the-browser.md).** The agent runs in the asking device's browser engine, so it calls a client flow as a child step (decision 5) and needs no pending part, deadline or receipt. The design below stays as the record for an agent on a remote host.

A client flow called by the agent runs on the device that asked:

```
cell: ctx.call("app/theme/set", {mode})        Worker binding (flow "device/call")
  1. append part {kind: "device-call", id, flow, input, deviceId, status: "pending"} to the answer (fenced, idempotent by id)
  2. await DurableDeferred "device/<id>", raced with DurableClock 20 s
device (outbox leader tab): live query on parts where deviceId = mine and status = "pending"
  3. BrowserFlows runs the same declaration ─▶ preferences collection
  4. outbox "device.receipt" ─▶ POST /api/flows/chat/DeviceReceipt {answerId, callId, result}
       ─▶ completes the deferred by its token ─▶ part "done" ─▶ Durable Object alarm now
  5. the cell gets the flow's result; past 20 s it gets {ok: false, error: {code: "device_unavailable"}} and the part is "expired"
```

- **Mechanics already exist.** A `DurableDeferred` token "identif[ies] the flow name, execution id, and deferred name so external code can complete the correct wait point later" (`flow/src/DurableDeferred.ts`). The standard `wait` flow already awaits a durable clock inside a cell call, so "the enclosing cell call is the durable boundary" (`agent/src/StandardFlows.ts`).
- **A late or repeated apply is harmless,** because client flows are setters. Sol's generation fencing is unnecessary.
- **Only the asking device acts,** in its outbox-leader tab (0002 decision 4). Other devices ignore the call. A local change is never broadcast.
- **The device id is a random UUID** in a persisted local `device` row: a target, not an identity.
- **Every question carries `device: {id, theme}`,** so "switch the theme" needs no extra round trip.
- **A deadline can delay later answers.** With answers in turn, a closed tab holds the next answer for at most 20 s.

## 4. The agent

```
chat/Answer on the browser engine (execution = answerId, Deadline 10 min; 0011)
  chat/Ask ─▶ turn wait (0002) ─▶ chat/LoadHistory (sealed: exchanges below position, view summaries)
  ─▶ chat/Respond = AgentAction("chat/Respond", { seat: "agent", output: Answer, system: CHAT_SYSTEM, profile: "conversation" })
       Agent.run: QuickJS cells ── ctx.call ─▶ catalog = registry ∩ modelInvocable, as FlowBinding sources
       each model call: FlowEngineLike.sealStep ─▶ ModelStep ─▶ the server's model endpoint, role "agent" (429 back to RetryPolicy)
       EventSink ─▶ answer row through the message write path (W5 (b)): text (DoneText), parts (steps, views); ≤ 1 write/s
  ─▶ chat/Settle
```

Revised by [0011](0011-the-agent-runs-in-the-browser.md). Until then `chat/Answer` was HOST-PLAN's flow on Cloudflare: the seat was `chat`, `ModelStep` called the provider with the host's key, the history carried the device, and the EventSink wrote fenced parts that included device calls.

- **Seats are roles on the server.** The browser's seat for each role (`agent`, `renderer`) is the model endpoint, which resolves the role to a model from an admin setting in Postgres, falling back to `Config` ([0004](0004-agent-ui-codemode-and-rendering.md) question 2). Until 0011, `@smthrs/model-host` was to gain `HostModel.seats({ chat: "CHAT_MODEL", renderer: "RENDER_MODEL" })`, a `SeatResolver` over configured models, with `RENDER_MODEL` defaulting to `CHAT_MODEL` (Cerebras `qwen-3.8-27b`).
- **The contract profile.** `@smthrs/harness` gains `profile: "workspace" | "conversation"`.
  - `conversation` keeps the REPL contract and rules 1 to 6 byte-for-byte. It drops rules 7 to 9, the git history fact, and the bug-fix example, whose `grep`, `read` and `edit` calls don't exist in this catalog (`harness/src/internal/cellPrompt.ts`).
  - The `workspace` profile stays byte-identical, so `test/CellPrompt.test.ts`'s pins hold.
  - Will's 2026-08-20 ruling on the `ctx.call` shape stands, and 0004's evals measure the new profile.
- **Caps.** `readOnlyCap`, `repeatCap` and `narrowingCap` stay off; `Agent.ts` says "a run that is meant to answer rather than act leaves it unset". `maxFrames` is 8, and the sandbox limits are explicit.
- **The browser host provides QuickJS** in the engine's worker (0011). Until 0011, W4's `CloudflareHost.layer` was to provide `QuickJSSandbox.Variant` with the build-time wasm module, because workerd refuses `WebAssembly.compile` over bytes (`harness/test/WorkerdSmoke.test.ts`).
- **No standard filesystem or shell flows.** The catalog is the registry's flows. Until 0011 the reason was that the Cloudflare host has neither (HOST-PLAN 1); the browser host has a file system and wasm jj, and the catalog still leaves them out.
- **Queue.** Enter queues a new question; it never steers the running answer. 0002 §5's `steer` and `cancel` mutations later feed `Steering.Source`; until then the steering source is `Agent.layerDefaults`' empty one.

**Streaming.**
- A cell reply has no prose path: a reply without a cell is rejected (`CellTurn.ts:3772`).
- So `@smthrs/harness` gains `DoneText.project(source)`. It returns the decoded prefix of the string or template literal passed to the last `ctx.done(` in a partly streamed cell, or nothing.
- The EventSink folds `ModelDelta` events through it, and a replay folds the recorded events the same way.
- Parts carry stable ids `(frame, ordinal)`.
- The sealed events are authoritative. Live text is replaceable, and settle writes the final text.
- Code and raw flow results never go to devices: parts hold only what a person sees.

**Instructions.** `CHAT_SYSTEM` lives in `src/features/agent/instructions.ts` (`worker/agent/instructions.ts` until 0011): the agent's name, prefer a template to a generated view, answer briefly, never claim a change before the flow's result. The rest of the teaching lives in the flows' own descriptions, where the model chooses (0004 §5).

## 5. The first flow: theme

- **The door.** One icon button in the header (aria-label only, no text) reads the theme and dispatches `app/theme/set` with the other mode. The agent calls the same declaration in its own browser engine (0011; until then through a device call).
- **The write.** The implementation writes `{id: "theme", mode}` to the persisted local `preferences` collection. Nothing about theme reaches Postgres. Until 0011 the requested mode in a device call and the reported `device.theme` did.
- **The DOM.** A follower in the browser host projects the collection onto `<html data-theme>`, the `@smthrs/ui` token contract (`ui-styleguide/src/paletteThemeCss.ts`). No component owns it.
- **Before paint.** Before the store opens, `index.html` paints from a mirror in `localStorage`, as the old app does.

## 6. Observability

- **Every dispatch** is a span `flow.dispatch {flow, placement, door, outcome}`, a log line with `trace_id` and `span_id`, and the counter `flow.dispatches{flow,placement,door,outcome}`. `door` is `button`, `slash`, `agent` or `view`.
- **Device calls** went with 0011, and so did their door, `device`, their counters `device_call.requested`, `received` and `expired`, and their latency histogram.
- **The agent** reports `agent.frames`, `agent.calls{flow,outcome}`, `agent.cells_rejected` and `agent.unfinished`, plus HOST-PLAN's model-step metrics and `agent_model_step_redispatches`.
- **No content anywhere.** No question text, cell source, flow input values or provider error text reaches telemetry. A sentinel test puts a canary in a question and in a flow input and reads it back absent from the OTLP exports.

## 7. Tests

- **Unit, on real compose Postgres and Electric with a scripted model:**
  - dispatch for both placements;
  - the outbox start with 202, 200 and 409;
  - the agent's call to a client flow as a journaled child step, applied once after a crash;
  - the setter applied twice;
  - `DoneText` property tests over escapes, template literals and cut-off input;
  - the profile pins;
  - the agent flow on the Node host (`sdk.host-agnostic-flows`).
- **End to end (`pnpm e2e`), on the real stack:**
  - "switch to dark mode" turns the asking device dark and leaves a second device unchanged;
  - reload keeps it;
  - closing the tab mid-answer pauses it, and reopening resumes it;
  - two asks while one streams answer in order;
  - a crash after the seal doesn't call the model again.
- **Coverage:** 100% in every touched package.

Revised by [0011](0011-the-agent-runs-in-the-browser.md). It replaced the device-call cases (receipt, timeout, duplicate, late receipt), bounded memory retention under 10,000 executions, and "a closed tab makes the agent say it couldn't".

## Sources

[HOST-PLAN] the lead's durable-answering plan, 2026-10-19 · [agent-loop] `packages/smithers/agent/docs/concepts/agent-loop.md`, `engine-port.md` · [libraries.md] `docs/libraries.md` · [flows README] `.smithers/flows/README.md` · `packages/smithers/flows/plan/src/Placement.ts` · `packages/smithers/flows/flow/src/{Flow/make.ts,DurableDeferred.ts}` · `packages/smithers/agent/src/{Agent.ts,ModelStep.ts,StandardFlows.ts,EventSink.ts}` · `packages/smithers/agent/harness/src/{internal/cellPrompt.ts,CellTurn.ts,QuickJSSandbox.ts}` · `packages/rpc/src/UiInstruction.ts` (the old app's author-only UI requests) · memory `gotcha_app_agent_lives_in_model_host_cloud_has_only_docs_20261013`.

## Implementation plan

Revised for [0011](0011-the-agent-runs-in-the-browser.md) on 2026-10-19. The agent flow runs on `@smthrs/platform-browser`'s durable engine (B1, in progress), and the theme and other client flows run in the same engine. Model calls go through the server's metered model endpoint (HOST-PLAN W5 (a)). Remote flows run on `@smthrs/platform-cloudflare` only by 0011's need rule, once W5 (c) wires its flow host into `worker/`.

One owner per file. HOST-PLAN's W1 to W6 keep theirs, and `PACKAGE.ts`, the vitest configs and `pnpm-workspace.yaml` go through the lead. Walking skeleton first: F1's profile, B1's tracer bullet, F4's theme, W5 (a)'s endpoint and F5, until the e2e "switch to dark mode" passes on `alchemy dev`.

| WS | Owns | Starts | Proves |
|---|---|---|---|
| F1 harness and agent | `packages/smithers/agent/harness/src/{internal/cellPrompt.ts,CellTurn.ts,DoneText.ts}`; the profile option in `packages/smithers/agent/src/{Agent.ts,AgentAction.ts}` | now | workspace pins unchanged; conversation profile; `DoneText` properties; 100% |
| F2 browser engine | B1: the durable engine in `packages/smithers/flows/platform-browser/src/` ([work note](../work/durable-browser-engine.md)) | started 2026-10-19 | a flow killed mid-run resumes on reopen without re-running finished steps; a second tab takes over from a closed leader; 100% |
| F3 model roles | none here: HOST-PLAN W5 (a) owns the endpoint, its roles and `admin/SetModel` | - | - |
| F4 flows, dispatch, theme | `apps/mvp/src/flows/**`, `src/features/theme/**`, `worker/Flows.ts` (the remote door), `db/migrations/0004_parts.ts` | now; `worker/Flows.ts` after W5 (c) | the parity law; placement by need; the door's answers; telemetry sentinel |
| F5 agent | `apps/mvp/src/features/agent/**`: `chat/Answer`, `chat/Respond` and `CHAT_SYSTEM` on the browser engine | after B1's tracer bullet and W5 (a) | `chat/Respond` against a scripted model behind the endpoint; streaming and replay; resume after a killed tab; the same flow on the Node host |
| F6 chat parts | the parts view in `apps/mvp/src/features/chat/**` | after 0002's app change lands | steps and streaming text render; no spinner except the answer |
| F7 e2e and docs | `apps/mvp/e2e/{flows,agent-theme}.spec.ts`; `docs/features/{flows,agent}.md`; `state.md`, `chat.md` and `observability.md` | with F4 to F6 | the e2e list above, with a GIF per flow; docs match the code |

Until 0011 the plan was: F2 an in-memory browser engine (`BrowserFlows.ts`) with bounded memory retention in `@smthrs/engine`; F3 `HostModel.seats` in `@smthrs/model-host`; F4 also `src/features/device/**`, `worker/DeviceCalls.ts` and a `device` column; F5 in `apps/mvp/worker/agent/**` and `worker/Answer.ts` after W1 to W5, proved on workerd QuickJS; and the walking skeleton ran F1, F2, F4 and F5.

## Questions for Will

1. **The agent loop runs on Cloudflare,** and the browser reaches the model only by asking. Your note says "using our existing Cloudflare-hosted model from the frontend". Both panels independently chose the server loop. Is that what you meant? Recommended: yes.
   - **Will, 2026-10-19: yes, with a condition.** "let's do it on cloudflare but make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally." The agent loop and every flow are host-agnostic Effect programs. Cloudflare reaches them only as injected layers from `@smthrs/platform-cloudflare`, wired in the Worker entry. The native app ([0010](0010-web-first-desktop-later.md)) runs the same code locally on `@smthrs/platform-bun` or `@smthrs/platform-node`. A test runs the agent flow on the Node host to prove it. Enforced by `sdk.host-agnostic-flows` in [rules.md](../rules.md).
2. **Client flows such as the theme run on an in-tab memory engine, unjournaled,** because each is one atomic local write. Sol recommended building an OPFS-backed durable browser engine first. Recommended: defer it until a client flow must wait.
   - **Will, 2026-10-19:** "A syncronous change to storage is by default durable yea. In fact this kinda explains why we maybe should reconsider where the agent runs. The agent should run on frontend and the frontend itself should be durable." This answer and the follow-ups replace question 1's placement: see [0011](0011-the-agent-runs-in-the-browser.md). The agent runs in the browser on a durable browser engine, flows run locally first, and model calls go through our server.
