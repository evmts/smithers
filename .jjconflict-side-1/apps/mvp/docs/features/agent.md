# The agent

Smithers answers in the browser. The agent is `chat/Answer`, a `@smthrs/flow` flow on this device's durable engine, started with the answer's id as its execution id. The asking tab starts it: once ChatApi takes the question (`202`, or `200` for a resend), chat's outbox dispatches `chat/Answer { answerId }` (door `composer`) in the background and goes on waiting for Electric. The engine starts an execution once, so a resend that dispatches again starts no second run. Its model calls go through the server's metered model endpoint, role `agent`, and its writes through ChatApi's answer routes. Closing the tab pauses an answer; the next tab or visit resumes it where it was, and a model call that sealed is never paid for again. An answer never streams forever: the run settles it however it ends, and the server's `chat/Expire` settles one whose run never does ([settling](#settling)). Decisions: [0003](../decisions/0003-flows-and-the-agent.md), [0011](../decisions/0011-the-agent-runs-in-the-browser.md).

## How an answer runs

```
chat/Answer { answerId }                               (execution id = answerId; no flow deadline)
  chat/TurnDeadline ─ its first start + the turn wait (10 minutes), sealed
  chat/LoadTurn ─ GET /api/answers/<id> ─▶ { question, history }   409 not_your_turn: retried until earlier answers
                  settle, or TurnOutOfTime once the turn deadline has passed
  chat/Respond  ─ AgentAction over @smthrs/agent's cell loop, profile "conversation", at most 8 frames
                  each model call: a sealed ModelStep ─ ModelProxy client ─▶ POST /api/model/agent
                  each ctx.call: an app flow from the agent's catalog, as a child execution (flows.md)
                  EventSink ─▶ AnswerProgress ─ POST /api/answers/<id> { streaming, text, parts }, at most once a second
  chat/Settle   ─ POST /api/answers/<id> { done, text, parts, tokens } or { failed, failure }

ChatApi, when it takes the question ─▶ chat/Expire { answerId } on its Durable Object (remote-flows.md)
  chat/ExpiresAt ─ created_at + ANSWER_EXPIRY (25 minutes) ─▶ durable sleep ─▶ chat/Abandon: failed, abandoned, if still streaming
```

| File | What it holds |
|---|---|
| `src/features/agent/flows.ts` | `chat/Answer` and its steps: `chat/TurnDeadline`, `chat/LoadTurn`, `chat/Respond`, `chat/Settle`. It imports `@smthrs/agent`, so only the engine worker and the Node host load it |
| `src/features/agent/reference.ts` | `chat/Answer`'s reference: its tag and schemas, which the tab dispatches by and the declaration is made from ([flows](flows.md#how-a-dispatch-runs)) |
| `src/features/agent/instructions.ts` | `CHAT_SYSTEM`: the agent's name, brevity, and never claiming a change before the flow that makes it answered |
| `src/features/agent/host.ts` | What the flow runs on: the `agent` seat, the catalog, the policies, the sink and the turn wait |
| `src/features/agent/progress.ts` | The fold of the agent's events into the answer's streaming text and parts, and the writer that sends them |
| `src/features/agent/answers.ts` | `AnswerApi`, the answer routes over Effect `HttpClient` |
| `src/features/agent/contract.ts`, `schema.ts` | The routes, limits, turn wait, settle window and wire shapes the browser and ChatApi share |
| `src/features/model/contract.ts` | The `agent` role's liveness bound, `agentLiveSeconds` ([turn by turn](#turn-by-turn)) |
| `worker/Answers.ts` | The answer routes, in ChatApi |
| `worker/flows/Expire.ts` | `chat/Expire`, the remote flow that settles an answer no run settled ([settling](#settling)) |
| `db/migrations/0006_answer_parts.ts` | `messages.parts` and the `unfinished` failure |
| `db/migrations/0008_browser_answering.ts` | Settles the answers ChatApi left `streaming` as `failed`, `abandoned`; drops `attempts` and the sweep's index; indexes the turn wait |

## The host

One composition (`AgentHost.layer({ origin })`) serves every host; the host supplies its engine (`FlowRuntime`), `Crypto` and an `HttpClient`. In the browser that is the engine worker (`src/flows/engine.worker.ts`), on the page's origin; in the tests, the Node host.

- **The seat.** `chat/Respond` declares the seat `agent`, which resolves to `ModelProxy.makeClient` on `<origin>/api/model/agent`, keyed by `ModelProxy.prepare`: the credential-free request the client sends. The endpoint picks the role's model ([model endpoint](model-endpoint.md)). Any other seat is unresolved.
- **The catalog.** The registry's model-invocable client flows (`src/flows/catalog.ts`); nothing else.
- **The policies.** A quota refusal parks the step (`QuotaPolicy.layerDefault`). The server holds the budget, so the device's own is unbounded. No judge runs (`claimCap` 0, `Evaluator.layerUnavailable`).
- **The sandbox.** QuickJS, at most 8 flow calls a cell; no steering yet, so a new question waits its turn.

## Streaming

The model's text reaches the answer while it streams. The agent's `EventSink` records each event against the run's execution id, the answer's, and folds it (`progress.ts`):
- each `text-delta` is appended to the current reply, and a new model call or a retry starts the reply over;
- the answer's text is `DoneText.project(reply)` from `@smthrs/harness`: the literal passed to the reply's last `ctx.done(`, decoded as far as it has arrived;
- each flow call is a part, `{ id: "<frame>.<ordinal>", kind: "step", flow, status }`, `running` until it settles `done` or `failed`. A resumed run replays a sealed call's settlement without its start, so a settlement adds its part.

A writer sends each changed answer's text and parts at most once a second (`partsEvery`). A streaming write the routes refuse is dropped: `chat/Settle` writes what counts. Parts hold only what a person sees: never a cell's code, a flow's input or its result.

## Settling

An answer never streams forever. Every way its run ends settles it, as a step of the same run, and what the run can't settle, the server does.

`chat/Settle { answerId, ending }` writes, for how the run ended:
- `done`, with the text, the parts and the tokens the run's model calls reported, when the agent answered. Token counts are whole; a provider's fractional count is rounded, where it once killed the step and left the answer streaming;
- `failed`, `empty`, when it answered nothing;
- `failed`, `rate_limited` or `model_error`, when its model failed, and `unfinished` when it ran out of frames;
- `failed`, `unfinished`, when the turn wait ran out ([turn by turn](#turn-by-turn)).

A settle the routes already took is answered as taken, so a step run again after a crash changes nothing. A run resumed after its agent step sealed has no parts to send; the settle then keeps the parts the answer has.

`chat/Answer` declares no flow `deadline`. The engine ends a run past its flow deadline with a defect, and a defect settles nothing: a plan's `Node.catch` sees typed failures only, by the engine's design (`@smthrs/flow`'s `Interpreter.ts`, the `Catch` node), and a flow's finalizers aren't durable. A plan can't race a durable timer against running work either: a member parked on a timer waits for the next drive, so a run that never parks would never see it.

What the run can't settle, `chat/Expire { answerId }` does (`worker/flows/Expire.ts`, [remote flows](remote-flows.md)). ChatApi starts it on its Durable Object when it takes a question, `202` or a resend's `200`, one execution per answer (`chat-expire-<answerId>`), without waiting for it; the same start again is a no-op. It sleeps on a durable timer until the answer is `ANSWER_EXPIRY` old (25 minutes, counted from when it was asked), then settles it `failed`, `abandoned` if it is still `streaming`, and changes nothing otherwise. That covers a device that never comes back (a closed browser profile, an e2e context, a phone left shut), a run that ended in a defect, and a run whose settle couldn't land. It runs on the server because it must happen while every device is off ([`flows.local-first-placement`](../rules.md#flowslocal-first-placement), need `devices-off`).

The expiry is longer than any live run: a run waits at most its turn wait (10 minutes), its agent's few model calls take seconds (each at most 3.0 s in ChatApi's dev logs of 2026-10-20), its settle retries at most `ANSWER_SETTLE_WITHIN` (10 minutes), and it starts within seconds of the ask (16.4 s at most in the same logs). About 21 minutes at worst; 25 leaves room for an agent ten times slower. A device that comes back after the expiry finds its answer settled: its turn, streaming writes and settle are refused `409 settled`, and its run fails `AnswerSettled`.

## The answer routes

Only a Member or above may call them (asking is `repo:ask`, [0007](../decisions/0007-roles-and-tags.md) §2), like the model endpoint and `POST /api/questions`. An answer changes only while it is `streaming`.

| Route | Answers |
|---|---|
| `GET /api/answers/<id>` | `200 { question, history }`: the finished exchanges before it, oldest first (at most 19, 24,000 characters). `409 { code: "not_your_turn" }` while an earlier live answer streams ([turn by turn](#turn-by-turn)); `409 { code: "settled" }` |
| `POST /api/answers/<id>` | `200 { txid }`; `200 { txid: null }` for a settle that already landed; `409 { code: "settled" }` for any other write to a settled answer; `400` for a body that isn't an answer write; `413` over 256 KiB |
| both | `401` signed out; `403 { code: "forbidden" }` for a Guest or a person with no role; `404` for an id that isn't an answer; `405` for another method; `503 { code: "unavailable" }` when Postgres can't be reached |

## Turn by turn

Answers come in order, one question at a time (decision 0002). `chat/LoadTurn` asks for its turn and, while an earlier answer streams or the routes can't be reached, fails `NotYourTurn` or `AnswersUnavailable`, which its retry policy retries (250 ms, doubling to 4 s). It waits until the run's turn deadline: `chat/TurnDeadline`, sealed at the run's first start, is that start plus the turn wait (`ANSWER_TURN_WAIT`, 10 minutes, or the host's own). Once it has passed, the step answers `TurnOutOfTime` instead, and the run settles the answer `failed`, `unfinished`, without calling a model. A run resumed after a crash keeps the deadline its first start set. An answer that settled some other way fails the run with `AnswerSettled`, and no model is called.

An earlier answer holds up a turn only while it is live: written in the last `ANSWER_TURN_LIVE_SECONDS` (30 by default). That is the `agent` role's liveness bound, read with Effect `Config` beside the role (`agentLiveSeconds`, `src/features/model/contract.ts`): how long a live run of the role may go without writing. A running agent writes about once a second while its text and steps change, and each `409 not_your_turn` marks the waiting answer itself as written, so a queue of waiting answers stays in order.

The default comes from ChatApi's dev logs of 2026-10-20 (`.alchemy/log/dev_williamcory/ChatApi`, 09:57 to 10:30 UTC, `qwen-3.8-27b` on Cerebras):

| Measured | n | p50 | p95 | max |
|---|---|---|---|---|
| `model.proxy.serve` for role `agent`, first event | 47 | 655 ms | 2,060 ms | 2,841 ms |
| the same calls, whole | 47 | 690 ms | 2,090 ms | 3,031 ms |
| the `202` or `200` that tells the device its question was taken, to its run's first `GET /api/answers/<id>` | 46 | 520 ms | 4.5 s | 16.4 s |

The model isn't the slow part: nothing writes an answer until its device's engine starts the run, in the background. A start plus one model call is about 19.4 s at worst, and 30 s is that with half again as margin. The trade-off runs both ways. A live run silent longer than the bound only lets a later answer start beside it, without the earlier exchange in its history. An answer whose device is gone holds up later answers no longer than the bound, and `chat/Expire` settles it later ([settling](#settling)). The routes themselves only read liveness: they never run, retry or settle an answer.

## Durability

| What happens | What the agent does |
|---|---|
| The tab closes, or the browser dies, mid-answer | The next tab's engine takes the run over at once and resumes it: sealed model calls and flow calls replay from their record; the call in flight runs again |
| A model call streams nothing for 300 s (`defaultModelIdleMs` in `@smthrs/agent`'s `ModelStep`) | It fails, and the step's retry policy decides |
| The answer routes are unreachable | `chat/LoadTurn` retries until the turn deadline, then the run settles `unfinished`; `chat/Settle` retries for up to 10 minutes (`ANSWER_SETTLE_WITHIN`) |
| An earlier answer keeps the turn for the whole turn wait | `chat/LoadTurn` answers `TurnOutOfTime`, and the run settles the answer `failed`, `unfinished` |
| The run ends in a defect | Nothing in the run can settle it ([settling](#settling)); `chat/Expire` settles it `failed`, `abandoned` |
| The device that asked never comes back | After `ANSWER_TURN_LIVE_SECONDS` without a write it no longer holds up later answers ([turn by turn](#turn-by-turn)); once it is `ANSWER_EXPIRY` old, `chat/Expire` settles it `failed`, `abandoned` |
| That device comes back after the expiry | Its writes are refused `409 settled`, and its run fails `AnswerSettled` |

## Configuration

| Variable | Default | |
|---|---|---|
| `ANSWER_TURN_LIVE_SECONDS` | `30` | a positive integer: how long an earlier `streaming` answer holds up later turns since its last write, the `agent` role's liveness bound (`src/features/model/contract.ts`) |
| `ANSWER_EXPIRY` | `25 minutes` | a duration: how old a `streaming` answer gets before `chat/Expire` settles it `abandoned` (`worker/flows/Expire.ts`). Read by the `FlowExecution` Durable Object |

The turn wait (`ANSWER_TURN_WAIT`, 10 minutes) and the settle window (`ANSWER_SETTLE_WITHIN`, 10 minutes) are constants in `src/features/agent/contract.ts`; the browser has no environment to read. A host may pass its own turn wait (`HostOptions.turnWait`).

## Observability

`ModelStep`'s and `ModelProxy`'s records cover every model call ([model endpoint](model-endpoint.md)). The answer routes add:

| Record | Kind | Fields |
|---|---|---|
| `chat.answer.turn`, `chat.answer.write` | log | `answerId`, `status`, `durationMs`; `historyExchanges`; `write` (`streaming`, `done`, `failed`), `parts`, `bytes`, `existing`; `errorCode` on a 503 |
| `chat.answer.request` | span | `smithers.chat.answer_id`, `http.response.status_code` |
| `smithers_answer_requests` | counter | `route` (`turn`, `write`), `status` |

`chat/Expire` and ChatApi's start of it add:

| Record | Kind | Fields |
|---|---|---|
| `chat.answer.expire` | log | `answerId`, `outcome`: Info `abandoned`, `settled`, `missing` once the flow decides; Warn `failed` (one step's attempt, with `errorCode`, `sql:<reason>`) and `not_started` (ChatApi couldn't start it, with `errorCode`: the host's code, or `conflict`) |
| `chat.answer.expire` | span | `smithers.chat.answer_id`, one per step attempt |
| `smithers_answer_expiries` | counter | `outcome`: `abandoned`, `settled`, `missing`, `failed`, `not_started` |
| `chat.question` | log field | `expiry`: `started` or `not_started`, on every question ChatApi took |

The Durable Object's own `cloudflare.execution.start` and `cloudflare.execution.alarm` records show the expiry's start, its park on the timer and its end ([observability](../observability.md#remote-flow-executions)). No record carries a question, an answer's text or a cell (sentinel tests).

## Tests

| Test | Proves |
|---|---|
| `src/features/agent/agent.test.ts` | `chat/Answer` on the Node host over the compose Postgres, against ChatApi's real model endpoint and answer routes, with a scripted model: an answer; a theme call as a journaled step whose receipt the agent answers from; text and parts streaming to the row; resume after the tab is killed, with 3 model calls (one sealed, one cut off, one after) and one theme write; replay of a settled run without a model call; answers in turn; `model_error`, `unfinished`, `empty`, `AnswerSettled`; a turn that never comes settling `unfinished` at the turn deadline with no model call; a run killed while it waits settling on resume by the deadline its first start set; fractional token counts settling `done`; the seat |
| `worker/flows/Expire.test.ts` | `chat/Expire` on the Node host: a streaming answer settles `abandoned` with its text kept, only once it is the expiry old; a settled answer is left as it is; a missing one is `missing`; a device that comes back after it fired fails its run `AnswerSettled`; its records by outcome without the text; `ANSWER_EXPIRY` and its default |
| `worker/Chat.test.ts` "chat/Expire" | Asking starts the expiry once per answer, and a resend starts the same execution; a start the host refuses is `not_started`, logged and counted, and the ask is still `202`; a question ChatApi doesn't take starts nothing |
| `worker/ExecutionHost.test.ts` "the deployed flows run chat/Expire" | The deployed host parks the expiry on its durable timer with the alarm armed for it, then settles the answer `abandoned` at the alarm |
| `src/flows/engine.test.ts` | The same agent on the browser's architecture in Node: started through `BrowserEngine`, run by the leader, its theme call painting the tab through the tab port |
| `src/features/chat/chat.test.ts` "the agent" | The whole app on a Node device whose engine leads: asking dispatches the answer, which streams then settles; a resend answered `200` runs once; a signed-out (`401`) or Guest (`403`) ask stays Not sent |
| `src/features/agent/progress.test.ts`, `answers.test.ts` | The fold, the settlement, the prompt, the writer, the sink, and every refusal `AnswerApi` reads |
| `worker/Answers.test.ts` | Every route and status, a Guest's and a roleless person's `403`, idempotent settles, history, turns, the liveness bound (a quiet answer stops holding up later ones; a waiting one stays live; `ANSWER_TURN_LIVE_SECONDS` and its default), records without the text |

Run them with the compose Postgres up (`pnpm db:up`): `pnpm exec vitest run src/features/agent src/flows/engine.test.ts worker/Answers.test.ts worker/flows/Expire.test.ts`.
