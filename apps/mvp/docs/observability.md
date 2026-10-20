# Observability

Every request, answer and sync in the app can be traced end to end, counted, and explained from its records alone, without adding a log line after the fact. This page is the contract. Code that adds a feature adds its entries here, and the tests under [Tests](#tests) enforce them.

Status (2026-10-19): every record below exists and is tested.

## Rules

- **No content, no credentials.** Diagnostics never carry a question, an answer, a prompt, a model key, a database password or the Electric secret. They carry ids, counts, durations, sizes, status codes, model ids and error codes. A failure is recorded by its code, and a defect by its name, never by its message. A test asks questions containing a sentinel string and fails if the sentinel appears in any log record, span attribute, event or failure, or metric attribute.
- **One id per answer, everywhere.** The answer id (`answerId`) appears on:
  - the browser's logs and spans;
  - the body of `POST /api/questions`;
  - ChatApi's `chat.question` log line and span, and the answer routes' `chat.answer.turn` and `chat.answer.write` lines and `chat.answer.request` span ([agent.md](features/agent.md#observability)).
  - `chat/Expire`'s `chat.answer.expire` line and span, by `answerId` (below).

  W3C trace context (`traceparent` on `POST /api/questions`) parents ChatApi's `chat.question` span when it is well formed: version `00`, 55 characters of lowercase hex, neither id all zeros. Its sampled flag is ignored, and `b3` headers parent nothing. ChatApi doesn't answer: the browser's agent does, in a run of its own, whose model calls and answer writes are requests of their own ([agent.md](features/agent.md#observability)).
- **Every log line names its trace.** ChatApi's log lines carry the current span's `trace_id` and `span_id` among their annotations (`Logger.layerStructuredJson` in `@smthrs/observability`), the same names as the browser records ChatApi relays, so a log search joins them by trace.
- **Every outcome is recorded, not just success.** Completion, failure, refusals, database errors and defects each have a log line, span attributes and a metric. Every Warn or Error line of ChatApi's own carries an `errorCode` or an `outcome` that says why.
- **Effect does the recording.** Logs are `Effect.log*` with annotations, spans are `Effect.withSpan`, metrics are `Metric`. The host decides where they go, so the same code records in a browser, a Worker and a test.

## Where it goes

```
browser tab ─── Effect logs, spans, metrics ── OTLP JSON (@smthrs/observability Otlp.layerFetch) ── POST /api/telemetry/v1/*
engine worker ── the same, only the spans the relay keeps ─────────────────────────────────────────┤
                                                                                                    │ OtlpRelay.serve
ChatApi Worker ── Effect logs, one JSON object per line ── Workers Logs (persisted) ◀──────────────┘ one line per record
               ── Effect spans ── Cloudflare.Telemetry() ── Workers Traces (persisted)
               ── Effect metrics ── the isolate's registry; every value is also a log line field
site Worker    ── Workers Logs + Traces (platform: requests and the service binding to ChatApi)
optional       ── Cloudflare.Workers.ObservabilityDestination: Workers Logs and Traces to any OTLP collector
```

- **Logs.** ChatApi installs `Logger.layerStructuredJson()` (`@smthrs/observability`) in its handlers, so Workers Logs indexes every annotation as a field, `trace_id` and `span_id` included. Both Workers persist logs (`observability.logs.persist` in `alchemy.run.ts` and `worker/ChatApi.ts`).
- **Traces.** `Cloudflare.Telemetry({ persist: true })` turns on Workers Traces for ChatApi and mirrors its Effect spans into Cloudflare's waterfall. The site Worker sets `observability.traces` directly.
- **Metrics.** Workers has no metric exporter in this stack, so ChatApi's Effect metrics live in the isolate and the tests read them. Every metric is also a field of a log line (the table below names it), so Workers Logs' query builder counts and percentiles them, for example p95 of `durationMs` over `chat.question` lines.
- **Locally**, `alchemy dev` writes each Worker's logs to `.alchemy/log/dev_<user>/<Worker>/`, and the browser's console shows its own records.

## What is recorded

### Browser

`appLayer` (`src/boot.ts`) installs `Otlp.layerFetch` with `serviceName: "smithers-mvp-web"`, so every Effect log, span and metric on the app's runtime goes to `POST /api/telemetry/v1/*`, and the console keeps its own copy. Every chat record is annotated `feature: chat`; boot and page records `feature: app`.

Logs:

| Message | When | Level | Fields |
|---|---|---|---|
| `chat ready` | the conversation was restored from the device (or, without a device store, synced) | Info | |
| `chat couldn't restore` | the device store couldn't restore the conversation; it still syncs | Error | |
| `persistent storage requested` | boot asked the browser to keep the site's storage | Info | `granted` (`true`, `false`) |
| `question asked` | `ask` put a question into the outbox | Info | `questionId`, `answerId`, `question.length`, `queued` (whether the pill showed) |
| `question stored` | a send got the question into Postgres, this device's engine recorded the run that answers it, and Electric delivered it | Info | `questionId`, `answerId`, `taken` (`inserted`, or `existing` for a resend ChatApi answered 200) |
| `answer not started` | ChatApi took the question, but this device's engine didn't record the run that answers it; the outbox sends the question again | Warn | `questionId`, `answerId`, `reason` (`refused`, `unavailable` when this tab has no engine, `invalid`, `defect`, `interrupted` when the tab closed first) |
| `question not sent` | ChatApi refused it for good; it stays on the device, unsent | Warn | `questionId`, `answerId`, `reason` (`refused` 400, `conflict` 409, `too_large` 413), `status` |
| `question not admitted` | the outbox couldn't take it (another tab leads the outbox, so this one takes the lead and sends it once it leads; or its storage failed); it stays unsent until then | Warn | `questionId` |
| `unsent question handled` | Edit, Discard or Retry on an unsent question | Info | `questionId`, `action` (`edit`, `discard`, `retry`) |
| `queued question taken back` | the tab's side of Edit on a queued question (`chat/edit`) | Info, Warn for `failed` | `questionId`, `outcome` (`edited`, `sent`, `failed`) |
| `chat draft restored` | a reload put the kept draft back into the composer | Info | `draft.length` |
| `outbox write withdrawn` | `Outbox.withdraw` took a write back (`@smthrs/effect-tanstack-db`) | Info | none of the write's contents |
| `chat connection changed` | the connection pill changed | Info | `status` (`up`, `offline`, `failed`, `stopped`) |
| `browser.engine.unavailable` | this tab's engine is unavailable (`@smthrs/platform-browser` `BrowserEngine`): its worker threw, as when a module can't load in a worker (`reason: worker-failed`), or couldn't build the engine (`engine-failed`); or its sign-out wipe couldn't delete the device's stores (`worker-failed`, `error.type` `WipeUnfinished`, src/wipe.ts); the device store opens in memory and the pill says Smithers can't run here | Error | `reason`, `error.type` (the failure's name, never its message) |
| `chat retried` | Retry on the pill, or the browser came back online | Info | `via` (`button`, `online`) |
| `page error` | an uncaught error on the window | Error | `name`, `source` (`file:line:column`); never the message |
| `unhandled rejection` | a rejection nothing handled | Error | `name`; never the message |
| `page reloaded` | a page restored from the back/forward cache, just before it reloads | Info | none. It reaches the relay only if an export runs before the page unloads; the console always keeps it |
| `collection cleanup failed` | a collection's cleanup rejected as its scope closed (`@smthrs/effect-tanstack-db`) | Warn | `collection` (its id), `error` (the error's name, never its message) |
| `persistence unavailable` | the device store's database couldn't open, so rows stay in memory (`@smthrs/effect-tanstack-db`) | Warn | `error` (the error's tag) |
| `persisted write failed` | the device couldn't store a write to a persisted collection, such as an unsent question, so it rolled back; TanStack DB fails one whose coordinator tab closed mid-write (`IndeterminateCommitError`) (`@smthrs/effect-tanstack-db`) | Warn | `collection` (its id), `operation` (`insert`, `update`, `delete`), `error` (the error's name, never its message) |
| `outbox couldn't load its writes` | the outbox's storage couldn't be read at start (`@smthrs/effect-tanstack-db`) | Warn | |
| `outbox write failed` | a send died with a defect; it is never sent again (`@smthrs/effect-tanstack-db`) | Error | `name`, `outcome: defect` |
| `session loaded` | the tab learned who is signed in (`features/auth`) | Info | `feature: auth`, `signedIn`; never the login |
| `session unreachable` | ChatApi couldn't say who is signed in | Warn | `feature: auth`, `status` when ChatApi answered outside the contract |
| `sign in pressed` | Sign in with GitHub pressed | Info | `feature: auth` |
| `signed out` | ChatApi ended this browser's session | Info | `feature: auth` |
| `sign out failed` | ChatApi didn't end it; the person stays signed in | Warn | `feature: auth`, `status` when ChatApi answered |
| `device wiped` | after a sign-out ChatApi took, the host wiped this device's synced data and outbox (the browser's reloads, and its next boot deletes them) | Info | `feature: auth` |
| `device wipe failed` | the host couldn't wipe the device; the person is still signed out | Warn | `feature: auth` |
| `slash.run` | a slash command ran its flow from the composer ([slash commands](features/slash-commands.md)); the flow's own record is `flow.dispatch`, door `slash` | Info | `feature: commands`, `command`, `flow`; never the arguments |
| `slash.refused` | a line naming no command, or missing or misusing an argument, stayed in the composer | Warn | `feature: commands`, `outcome` (`unknown`, `missing`, `invalid`), `command` when the app offers it; never what was typed |

Every send runs inside the outbox (`@tanstack/offline-transactions`), a library that calls the `ask` mutation. The mutation runs with the services captured when the store was built, so it reaches the same exporter as every other record, and its `HttpClient` sends the trace to ChatApi. A send's trace is its own; it links to the ask's span.

Spans:

| Span | Kind | Attributes |
|---|---|---|
| `chat.ask` | internal: `ask` putting the question into the outbox, synchronously | `questionId`, `answerId`, `question.length` |
| `outbox.send` | internal: one send of one write (`@smthrs/effect-tanstack-db`), linked to the span the write was made in (`chat.ask`) | `name` (`ask`), `attempt` (1 for the first send), `outcome` (`sent`, `retry`, `refused`, `defect`, `withdrawn`) |
| `outbox.withdraw` | internal: Edit taking a queued question back out of the outbox (`Outbox.withdraw`) | `outcome` |
| `chat.copy`, `chat.edit` | internal, in the engine worker: `chat/copy`'s and `chat/edit`'s steps asking the tab that started the run ([chat](features/chat.md#message-controls)); each is also a log line of the same name, Info when copied or edited, Warn for `not_found` or `sent`, Error for `failed` or `gone` | `smithers.chat.door`, `smithers.chat.outcome`; the log line's `door`, `outcome`, `executionId`, `durationMs` |
| `chat.ask.send` | internal, child of `outbox.send`: from asking ChatApi, through this device's engine recording the answer's run, to Electric delivering the question | `questionId`, `answerId`, `taken` |
| `chat.question.post` | internal, child of `chat.ask.send` | `http.response.status_code` |
| `POST` | client (Effect `HttpClient`), child of `chat.question.post` | `url.full`, `http.response.status_code`; sends `traceparent`, which parents ChatApi's `chat.question` |
| `auth.session.get`, `auth.sign_out.post` | internal: asking who is signed in, signing out (`features/auth/api.ts`) | `http.response.status_code` |
| `GET`, `POST` | client (Effect `HttpClient`), children of the two above | `url.full`, `http.response.status_code` |

Metrics (`src/features/chat/metrics.ts`, `src/boot.ts`, `src/page.ts`, and `@smthrs/effect-tanstack-db`'s `Outbox` and `Persistence`):

| Metric | Kind | Attributes |
|---|---|---|
| `smithers_web_questions` | counter | `queued` = `true` when the pill showed |
| `smithers_web_ask_failures` | counter | `reason` = `refused`, `conflict`, `too_large` or `not_admitted` |
| `smithers_web_unsent_actions` | counter | `action` = `edit`, `discard` or `retry` |
| `smithers_web_message_copies` | counter (engine worker) | `door` (`button`, `slash`, `agent`, `unknown` when the tab is gone), `which` (`message` or `latest`), `outcome` (`copied`, `failed`, `not_found`, `gone`) |
| `smithers_web_question_edits` | counter (engine worker) | `door`, `outcome` (`edited`, `not_found`, `sent`, `failed`, `gone`) |
| `smithers_web_composer_opens` | counter | `via` = `shortcut` or `button`; an open composer opened again doesn't count |
| `smithers_web_answer_first_text_ms` | histogram | from asking to the answer's first text on the asking tab, time queued included |
| `smithers_web_sync_failures` | counter | each time the pill showed: `reason` = `offline`, `unreachable`, `refused`, `invalid_response` or `engine` |
| `smithers_browser_engine_unavailable` | counter | `reason` = `worker-failed` or `engine-failed` (`BrowserEngine`) |
| `smithers_web_sync_retries` | counter | `via` = `button` or `online` |
| `smithers_web_history_loads` | counter | Load earlier presses |
| `smithers_web_storage_persisted` | counter | `granted` = `true` or `false` |
| `smithers_web_boot_ms` | histogram | from page start to the conversation restored from the device |
| `smithers_web_page_reloads` | counter | a page restored from the back/forward cache; reaches the relay only if an export runs before the page unloads |
| `smithers_slash_choices` | counter | rows chosen from the command menu: `kind` = `commands` or `values`, `how` = `accept` (Enter or a click) or `complete` (Tab) |
| `smithers_slash_submits` | counter | command lines submitted: `outcome` = `run`, `unknown`, `missing` or `invalid`, and `command` for a command the app offers |
| `outbox_attempts` | counter | `name`, `outcome` = `sent`, `retry`, `refused`, `defect`, or `sent_elsewhere` (a write this tab queued that the tab which took the lead sent meanwhile; settled here without a second send) |
| `outbox_refused` | counter | `name`, `status` |
| `outbox_queued_ms` | histogram | `name`: from the write to its mutation succeeding |
| `outbox_leader_changes` | counter | `leader` = `true` or `false` |
| `persistence_restore_ms` | histogram | `collection`: from creating a persisted collection to its rows restored |
| `persistence_unavailable` | counter | the database couldn't open |
| `persistence_write_failures` | counter | `collection`, `operation`: writes to a persisted collection the device couldn't store |
| `smithers_web_sign_in_presses` | counter | Sign in with GitHub presses |
| `smithers_web_sign_outs` | counter | `outcome` = `signed_out` or `failed` |
| `smithers_web_device_wipes` | counter | `outcome` = `wiped` or `failed` |

Every name above, and every attribute, is in the feature's contract (`CHAT_TELEMETRY` in `src/features/chat/contract.ts`, `AUTH_TELEMETRY` in `src/features/auth/contract.ts`, `COMMANDS_TELEMETRY` in `src/features/commands/contract.ts`, and the app's own `APP_TELEMETRY` in `src/telemetry.ts`), which the relay keeps ([below](#relayed-browser-records)).

#### The engine worker

Each tab's engine worker (`src/flows/engine.worker.ts`) passes `BrowserRuntime.run` the exporter `engineTelemetry` (`src/flows/engine.ts`): `Otlp.layerFetch` to the same `POST /api/telemetry/v1/*`, with `serviceName: "smithers-mvp-engine"` and `spans: EXPORTED_SPANS`. Every log line, span and metric of the leader, the durable engine and the flows it runs, the agent's model calls included, reaches ChatApi's log like the tab's, but only the spans named below: the engine records about 3,900 spans for one answer (its SQL statements, runs, attempts, journal and one per poll), 3.2 MB of OTLP that ChatApi would refuse as 413, and sends 45 of them, 53 KB.

| Records | From | Fields |
|---|---|---|
| `flow.dispatch` (log and span), `smithers_flow_dispatches` | the tab's dispatch (`src/flows/dispatch.ts`) | `flow`, `door`, `executionId`, `outcome`, `durationMs`; `reason` on an error, and `refusal` (such as `plan_changed`) when the engine's interpreter refused the run; the span's `smithers.flow.*` |
| `browser.engine.storage`, `browser.storage.persist`, `smithers_browser_engine_requests`, `smithers_browser_engine_storage` | the tab's side of the engine (`@smthrs/platform-browser`) | `request`, `outcome`, `error.type` |
| `browser.runtime.elect`, `browser.runtime.leader`, `browser.runtime.wake`, `browser.runtime.request` (a failed request's line), `browser.runtime.statement`, `browser.runtime.lost`, `browser.runtime.stopped`, `smithers_browser_runtime_*` | the leader (`@smthrs/platform-browser`) | `flows`, `request`, `outcome`, `error.type`, `smithers.execution.id`, `smithers.flow`, `smithers.wake` |
| `FlowEngine.execute` and `Action.execute` (a run and each of its steps), the engine's three warnings, `flows_engine_*`, `flows_run_*`, `flows_journal_*`, `flows_db_*`, `flows_step_cache_*` | the durable engine (`@smthrs/flows`) | `executionId`, `flow`, `runId`, `action`, `stepKey`, `attempt`, `tier`, `outcome`, `error`, `code`, `op`, `to`, `channel`, `receipt` |
| `web.navigate` (log and span), `smithers_web_navigations` | `app/navigate`'s step ([flows](features/flows.md#navigation)) | `door` (the dispatch's, `agent`, or `unknown` when the tab that dispatched it is gone), `outcome` (`navigated`, `refused`, `gone`, `failed`), `executionId`, `durationMs`, `reason` on a refusal; the span's `smithers.navigation.door` and `smithers.navigation.outcome`. Never the path |
| `web.page.open` (log and span), `smithers_web_pages_opened` | `app/web/open`'s steps for the agent's openings, the tab for a person's ([web pages](features/web-pages.md#observability)) | `web_mode` (`embed`, `tab`), `door`, `outcome` (`embedded`, `card`, `opened`, `refused`, `forbidden`, `unavailable`), `reason` on a refusal; the span's `smithers.web.mode` and `smithers.web.outcome`. Never the URL, its origin or its path |
| `jev.judge` (log and span), `smithers_jev_judgments`, `smithers_jev_verdicts` | `app/jev/classify`'s and `app/jev/evaluate`'s steps in the engine worker ([Jev](features/jev.md#observability)) | `flow`, `items`, `outcome` (`judged` or the judge's failure code), the verdicts by code (`yes`, `no`, `labeled`, `unsure`), `durationMs`; the span's `smithers.jev.flow`, `smithers.jev.items` and `smithers.jev.outcome`. Never an item, a question, a label, a text or a criterion |
| `invoke_agent`, `chat agent`, `ModelStep`, `model.proxy.stream`, `execute_tool <flow>`, `agent_model_step_calls`, `agent_model_step_replays`, `agent_model_step_redispatches`, `smithers_model_proxy_*` (`side: client`) | the agent (`@smthrs/agent`, `@smthrs/model`) | `step` (the step's name, `harness/sealStep`), `gen_ai.*`, `smithers.model_step.*`, `smithers.model.proxy.*`, `requestId`, `modelId`, `events`, `firstEventMs`, `inputTokens`, `outputTokens` |

The full lists are `FLOWS_TELEMETRY` (`src/flows/contract.ts`), `AGENT_TELEMETRY` (`src/features/agent/contract.ts`), `THEME_TELEMETRY` (`src/features/theme/contract.ts`, the agent's `execute_tool app/theme/set`) and `NAVIGATION_TELEMETRY` (`src/features/navigation/contract.ts`, with the agent's `execute_tool app/navigate`) and `WEB_TELEMETRY` (`src/features/web/contract.ts`, with the agent's `execute_tool app/web/open`). None of their fields carries a flow's input, a prompt, an answer or a provider's text: a step key and a tool call's id are digests.

An answer's writes are ChatApi's to record, through the answer routes ([agent.md](features/agent.md#observability)).

### ChatApi Worker

Logs (`worker/Chat.ts`, and `ShapeProxy` from `@smthrs/effect-electric`, mounted in `worker/Chat.ts` with the name `chat.shape` and the metric `smithers_chat_shape_requests`):

| Message | When | Level | Fields |
|---|---|---|---|
| `chat.question` | every `POST /api/questions` | Info 2xx, Warn 4xx, Error 5xx | `status`, `bytes` (body bytes read, absent when a declared length was refused), `durationMs`; `questionId`, `answerId` once the body is valid; `existing: true` for a retry; `expiry: started` for a question ChatApi acknowledged; `errorCode` for every 4xx and 5xx (below), and `defect`, the defect's name, for 500 |
| `chat.answer.expire` | ChatApi stored a question but couldn't start its `chat/Expire`, and answered `503` | Warn | `answerId`, `outcome: not_started`, `errorCode` (the remote host's code, or `conflict`) |
| `chat.shape` | every shape request, once it has ended | Error 5xx or a failed body, Warn other 4xx, Info otherwise | `status` (499 when the browser left before Electric answered), `live`, `durationMs` (to the body's end), `bytes` (body bytes sent), `outcome` (`complete`, `aborted` or `failed`) |
| `chat.view.add` | every `POST /api/views` ([web pages](features/web-pages.md#the-views-table)) | Info 2xx, Warn 4xx, Error 5xx | `status`, `bytes`, `durationMs`; `viewId`, `template` once the body is valid; `reason` for a page it refused; `existing: true` for the same add again; `errorCode` for 503. Never the URL |
| `chat.views.shape` | every `GET /api/shapes/views`, once it has ended | as `chat.shape` | as `chat.shape` |
| `chat.throttle` | a Rate Limiting binding failed, so the request went through ([throttling](features/chat.md#throttling)) | Warn | `route` (`shape`, `telemetry`), `outcome: error`. Never the address or the network |
| the browser's records | every OTLP record relayed ([below](#relayed-browser-records)) | the record's severity | the fields the allowlist keeps |

Every ChatApi line also carries `trace_id` and `span_id` when it is logged inside a span.

`chat.question` `errorCode`:

| Status | `errorCode` |
|---|---|
| 400 | `invalid` (not the contract's JSON), `utf8` (malformed UTF-8), `body` (the body broke off) |
| 401 | `authentication` (nobody is signed in) |
| 403 | `forbidden` (a Guest, or a person with no role: asking is Member or above) |
| 405 | `method` |
| 409 | `id_taken` (the question's id), `answer_id_taken` (the answer's id) |
| 413 | `too_large` |
| 500 | `defect`, with the defect's name as `defect`: a tagged value's tag, an error's name, or its type; `unknown` when that isn't an identifier |
| 503 | `sql:<reason>` (Postgres unreachable, or refusing the insert, such as a position taken), `database` (another failure building the client), `@smthrs/mvp/auth/SessionsUnavailable` (sessions couldn't be read), `expiry_not_started` (the question is stored, but its expiry's start wasn't recorded; `chat.answer.expire` has the host's code) |

Spans:

| Span | Kind | Attributes |
|---|---|---|
| `chat.question` | server, parented by a well-formed `traceparent` | `smithers.chat.question_id`, `smithers.chat.answer_id`, `http.response.status_code`; `error.type` = the `errorCode` for 5xx. A defect is caught inside it, so the span never ends with the defect's message |
| `chat.shape` | server | `http.response.status_code`, `electric.shape.live` |
| `chat.view.request` | server | `http.response.status_code` |
| `chat.views.shape` | server | `http.response.status_code`, `electric.shape.live` |
| SQL statements | client (`effect/sql`) | `db.query.text`: the statement with `$1` placeholders, never its values |
| HTTP calls to the model and Electric | client (Effect `HttpClient`) | `url.full` with `secret` redacted; request headers with `authorization` redacted |

Metrics (`worker/ChatMetrics.ts`):

| Metric | Kind | Attributes | Log field |
|---|---|---|---|
| `smithers_chat_questions` | counter | `status` | `chat.question` `status` |
| `smithers_chat_shape_requests` | counter | `status`, `live` | `chat.shape` |
| `smithers_view_requests` | counter (`worker/Views.ts`) | `status` | `chat.view.add` `status` |
| `smithers_view_shape_requests` | counter (`worker/Views.ts`) | `status`, `live` | `chat.views.shape` |
| `smithers_throttle_decisions` | counter (`worker/Throttle.ts`) | `route` (`shape`, `telemetry`), `outcome` (`admitted`, `limited`, `error`) | `chat.throttle` for `error`; a `limited` request has no log line, so a flood writes none |
| `flows_observability_otlp_relayed` | counter | `signal` | (`OtlpRelay`) |
| `flows_observability_otlp_relay_dropped` | counter | `signal`, `reason` = `not_allowed` (off the allowlist) or `over_limit` (past 200 in one export) | (`OtlpRelay`) |

### Model endpoint

`POST /api/model/<role>` ([model-endpoint.md](features/model-endpoint.md)) records through `ModelProxy.serve` (`@smthrs/model`), which ChatApi mounts with the attribute `role` and `onEnd` metering (`worker/ModelEndpoint.ts`). None of its records carries a prompt, an answer, provider error text, a key or an actor id.

| Message | When | Level | Fields |
|---|---|---|---|
| `model.proxy.serve` | every request, once it has ended | Info `success` and `interrupted`, Warn `invalid` and `refused`, Error `failed` | `role`, `requestId` (the caller's), `invocationId` (the server's, the `model_usage` key), `traceId`, `side: server`, `outcome`, `status`, `durationMs`, `events`; when known `modelId`, `provider`, `errorCode` (the `ModelError` code: `authentication`, `quota_exceeded`, `no_route`, `provider_internal`, …), `errorTag`, `firstEventMs`, `requestBytes`, `inputTokens`, `outputTokens` |
| `model.endpoint` | Postgres failed (sessions, the role lookup or the budget reservation), or a role's setting is unusable | Error | `role`, `errorCode`: `sql:<reason>`, or `unusable:<reason>` (the planner's code, such as `credential_missing`, `credential_unknown` or `invalid`) |
| `model.usage` | a call's usage was unknown, so it kept its reservation (`kept`); it ended after its reservation expired (`expired`); or its settle failed and it stays counted at the reservation | Info `kept`, Warn `expired`, Error for a failed settle | `role`, `invocationId`, `requestId`; `outcome` and `ended` (the call's `success`, `failed` or `interrupted`) for `kept` and `expired`, and `reported` (`none`, `partial` or `complete`: which counts the model reported) for `kept`; `errorCode` for a failed settle |
| `admin.set_model` | every `admin/SetModel` step that ended | Info `set`, Warn `refused`, Error `error` | `outcome`, `role`; `modelId` when set; `reason` (`not_admin`, `delegated`) when refused; `errorCode` on error |

Spans: `model.proxy.serve` (server, or internal under an HTTP server span) with `smithers.model.proxy.request_id`, `smithers.model.proxy.invocation_id`, `smithers.model.proxy.outcome`, `http.response.status_code`, `error.type`, `gen_ai.request.model`, `gen_ai.provider.name`, `smithers.model.proxy.events`, `smithers.model.proxy.duration_ms`, `smithers.model.proxy.first_event_ms` and `smithers.model.proxy.request_bytes`; under it `chat <model>` from `Model.withGenAiSpan`, and the SQL statements of the role lookup, the budget reservation and its settle. A failed span ends with a `ModelError` rebuilt from its code alone. `admin.set_model` (internal) carries `smithers.model.role`.

| Metric | Kind | Attributes | Log field |
|---|---|---|---|
| `smithers_model_tokens` | counter | `role`, `model`, `type` = `input` or `output` | `model.proxy.serve` `inputTokens`, `outputTokens` |
| `smithers_model_proxy_requests` | counter | `role`, `side: server`, `outcome`, `status` | `model.proxy.serve` `outcome`, `status` |
| `smithers_model_proxy_duration_ms` | histogram | `role`, `side: server`, `outcome` | `durationMs` |
| `smithers_model_proxy_first_event_ms` | histogram | `role`, `side: server` | `firstEventMs` |
| `smithers_model_usage_writes` | counter | `outcome` = `recorded` (settled to what it spent), `kept` (its usage was unknown), `expired` (it ended after its reservation expired) or `error`: settles of a call's reservation | `model.usage` for every outcome but `recorded` |

The spend alert reads `smithers_model_tokens`, by role and model ([todo.md](todo.md#alerts-on-token-spend)). The budget itself is the `model_budget_days` counter and the `model_usage` ledger, not a metric; a refused reservation is `model.proxy.serve` with `status` 429 and `errorCode` `quota_exceeded`.

### Sign-in

ChatApi's sign-in routes and sessions ([sign-in.md](features/sign-in.md), `worker/SignIn.ts`), the role check (`auth/RecheckRole`, `worker/flows/RecheckRole.ts`) and the token revocation at sign-out (`auth/RevokeGitHubToken`, `worker/flows/RevokeGitHubToken.ts`). No record carries a token, a code, `state`, a cookie, a secret, GitHub's text or a login: a person is their id, a session its id.

| Message | When | Level | Fields |
|---|---|---|---|
| `auth.sign_in` | every `GET /api/auth/sign-in` | Info `redirected`, and `signed_in` with `reason: local_developer` under `alchemy dev` without the App; Warn `failed` | `outcome`; `reason` (`not_configured`, `error`) and `errorCode` when it failed |
| `auth.callback` | every callback | Info `signed_in`, Warn `failed` | `outcome`, `durationMs`; `personId` and `role` (`none` for no role) when signed in; `reason` when it failed (below), and `errorCode` for `database`, `sign_out_not_started` and `error` |
| `auth.sign_out` | every `POST /api/auth/sign-out` | Info `signed_out` and `no_session`, Warn `refused` and `failed` | `outcome`; `reason: cross_site` when refused, `local_developer` for the dev fallback, `not_started` when the host didn't record the sign-out flow's start and `error` for any other failure; `errorCode` when it failed (the host's code, or `conflict`, for `not_started`) |
| `auth.session` | Postgres failed reading a session | Error | `outcome: error`, `errorCode` (`sql:<reason>`) |
| `auth.config` | SESSION_SECRET is shorter than 32 characters, so sign-in is off | Error | `errorCode: session_secret_too_short` |
| `auth.role_check` | every role check step that ended, or a check ChatApi couldn't start | Info for each step's outcome: `redeem` (`none`, `unusable`, `refused`, `redeemed`), `store` (`stored`, `changed`, `none`), `check` (`checked`, `revoked`, `ended`) and `keep` (`kept`); Warn `failed` (one attempt) and `not_started` | `sessionId`, `step` (absent for `not_started`), `outcome`; `role` (`none` for no role) for `check` and `keep`; `errorCode` (GitHub's refusal or `sql:<reason>`) when it failed |
| `auth.revoke_token` | every sign-out step that ended | Info for each step's outcome: `end` (`ended`, `over`), `revoke` (`revoked`, `unreadable`, `none`, `live`) and `forget` (`forgotten`); Warn `failed` (one attempt) | `sessionId`, `step`, `outcome`; `errorCode` (GitHub's refusal or `sql:<reason>`) when it failed |

A callback's `reason`: `not_configured`, `method`, `state_mismatch` (the state isn't this browser's), `replayed` (its sign-in already finished), `expired` (over 10 minutes), `denied` (the person declined on GitHub), `invalid` (no code), `unreadable` (the sealed verifier didn't open), `sign_out_not_started` (the host didn't record the sign-out of the session this browser held, so GitHub's code was never redeemed), `<step>_<reason>` for GitHub (`exchange_rejected`, `user_unavailable`, `permission_misconfigured`, …), `database`, or `error` (a defect, by its name).

Spans: `auth.sign_in`, `auth.callback`, `auth.sign_out`, `auth.session` and `auth.resolve` (internal, each request that reads the session cookie); `auth.role_check` and `auth.revoke_token` with `smithers.auth.session_id` and `smithers.auth.step`; `GitHubClient.request` (`@smthrs/integrations`) for GitHub's REST calls, the revocation's `DELETE` among them; `OAuthToken.request` (`@smthrs/integrations`) with `oauth.provider` for the code and refresh exchanges; and the SQL statements, placeholders only.

| Metric | Kind | Attributes | Log field |
|---|---|---|---|
| `smithers_auth_requests` | counter | `route` (`sign_in`, `callback`, `sign_out`), `outcome`, `reason` (`none` unless refused or failed) | the route's line |
| `smithers_auth_role_checks` | counter | `step` and `outcome`: a step's outcome above, or `failed` | `auth.role_check` `step`, `outcome` |
| `smithers_auth_token_revocations` | counter | `step` and `outcome`: a step's outcome above, or `failed` | `auth.revoke_token` `step`, `outcome` |

### Remote flow executions

The `FlowExecution` Durable Object ([remote-flows.md](features/remote-flows.md)) records through `ExecutionObject` (`@smthrs/platform-cloudflare`), with `Logger.layerStructuredJson()` installed in both handlers (`worker/Executions.ts`), so its lines reach Workers Logs as ChatApi's do. None of its records carries the payload or a failure's message.

| Message | When | Level | Fields |
|---|---|---|---|
| `cloudflare.execution.start` | every `start` | Info `accepted` and `duplicate`, Warn `conflict` and `failed` | `outcome`; `error.type`, the failure's tag, for `failed` |
| `cloudflare.execution.alarm` | every alarm | Info `idle`, `settled`, `parked` and `forgotten`, Warn `retrying` | `outcome`; for `retrying`, `error.type` (the failure's tag) and `smithers.execution.attempt` |
| `probe.mark` | each step of `probe/Pause` | Info | `label` |
| `chat.answer.expire` | each step of `chat/Expire` that decided or failed ([agent.md](features/agent.md#settling)) | Info `abandoned`, `settled`, `missing`, and `waiting` (a round that found the queue moved, so the next round waits again); Warn `failed` (one attempt) | `answerId`, `outcome`; `errorCode` (`sql:<reason>`) when it failed |

Spans `cloudflare.execution.start` and `cloudflare.execution.alarm` carry `smithers.execution.id`, `smithers.flow` and the outcome as `smithers.execution.start` or `smithers.execution.alarm`; a retrying alarm adds `error.type` and `smithers.execution.attempt`. Each `chat/Expire` step attempt is a `chat.answer.expire` span with `smithers.chat.answer_id`. The engine adds its own spans and SQL statement spans inside the alarm.

| Metric | Kind | Attributes | Log field |
|---|---|---|---|
| `smithers_cloudflare_execution_starts` | counter | `outcome`: `accepted`, `duplicate`, `conflict` or `failed` | `cloudflare.execution.start` `outcome` |
| `smithers_cloudflare_execution_alarms` | counter | `outcome`: `idle`, `settled`, `parked`, `retrying` or `forgotten` | `cloudflare.execution.alarm` `outcome` |
| `smithers_answer_expiries` | counter | `outcome`: `abandoned`, `settled`, `missing`, `waiting`, `failed`, or `not_started` (counted by ChatApi) | `chat.answer.expire` `outcome` |

An answer stuck `streaming` shows as no `chat.answer.write` for its `answerId` after its `chat.question`, then, 25 minutes after its queue last moved, `chat.answer.expire` `abandoned` for it, after a `waiting` line for each round that found the queue moved. A `not_started` line comes with a `503`, so the outbox sends the question again.

A run that keeps failing shows as `cloudflare.execution.alarm` lines at Warn with a rising `smithers.execution.attempt` for one `smithers.execution.id`; its `error.type` names the cause ([troubleshooting](../../../packages/smithers/flows/platform-cloudflare/docs/troubleshooting.md)).

### Repositories

RepoApi (`worker/RepoApi.ts`), the clone (`worker/flows/RepoClone.ts`) and the browser's repository view ([repo.md](features/repo.md)). No record carries a file's contents, a commit message, Code Storage's or GitHub's error text, a token or the Code Storage key.

| Message | When | Level | Fields |
|---|---|---|---|
| `repo.clone.request` | every `POST /api/repos` | Info 2xx, Warn 4xx, Error 5xx | `outcome` (`started`, `existing`, `method`, `conflict`, or the refusal's code), `status`, `durationMs`; `id`, `attempt` and `cloneId` once valid; `row` (the existing row's status); `errorCode` for 503 (`conflict` when the start found another payload under the attempt's execution id, and the attempt settled `failed`) |
| `repo.tree`, `repo.blob`, `repo.raw`, `repo.refs` | every read | Info 200, Warn 4xx, Error 5xx | `repoId`, `status`, `bytes` (returned), `durationMs`; `sha` for a tree or a file; `errorCode` (`not_found`, `too_large`, `capacity`, `unavailable`, or a defect's name) |
| `repo.meter` | a read's bytes Postgres didn't record; the read still answered | Warn | `bytes`, `errorCode` |
| `repo.clone.step` | each of Inspect, Import, Pull and AwaitSync that answered | Info | `step`, `id`; Inspect's `cloneId`, `outcome` and `reason`; Import's `created`; AwaitSync's `outcome` (`ready`, `timed_out`); the engine's `runId`, `stepKey`, `attempt` |
| `repo.clone.settle` | Settle | Warn `failed`, Info otherwise | `id`, `cloneId`, `status`, `reason` (the failure or budget, or `none`), `settled` (false for a stale attempt); `errorCode` when Postgres refused |
| `repo.spend.alert` | a metered write crossed 50%, 80% or 100% of `REPO_BUDGET_USD` for the first time this month | Error | `pct`, `estimateUsd` |
| `repo.config` | the Code Storage key didn't import; the deployment clones nothing | Error | `errorCode` (`invalid_key`) |
| `repo.shape` | every `GET /api/shapes/repositories`, once its body ended (`ShapeProxy`) | as `chat.shape` | as `chat.shape` |
| `immutable cache call failed; reading through` | the cache refused a `get` or `put` (`@smthrs/artifacts`) | Warn | `backend`, `namespace`, `operation`, `reason` |

| Span | Kind | Attributes |
|---|---|---|
| `repo.clone.request` | server | `smithers.repo.id`, `http.response.status_code` |
| `repo.tree`, `repo.blob`, `repo.raw`, `repo.refs` | server | `http.response.status_code`, `smithers.repo.bytes` |
| `repo.clone.inspect`, `repo.clone.import`, `repo.clone.pull`, `repo.clone.await_sync`, `repo.clone.settle` | internal, inside the engine's step spans | `smithers.repo.id` |
| `CodeStorage.<operation>`, `GitRemote.head` | internal (`@smthrs/effect-code-storage`) | `code_storage.repo`, `git.remote` |
| `GitHubClient.request` | internal (`@smthrs/integrations`) | `http.request.method`, `url.path` |
| `ImmutableCache.get`, `ImmutableCache.put` | internal (`@smthrs/artifacts`) | `immutable_cache.backend`, `.namespace`, `.outcome`, `.bytes` |

| Metric | Kind | Attributes |
|---|---|---|
| `repo_clone_requests` | counter | `outcome` |
| `repo_reads` | counter | `kind` (`tree`, `blob`, `raw`, `refs`), `status` |
| `repo_read_bytes_total` | counter | bytes returned |
| `repo_shape_requests` | counter | `status`, `live` |
| `repo_clones` | counter | `outcome` (`ready`, `failed`, `capacity`), `reason` |
| `repo_capacity` | counter | `reason` |
| `repo_stored_bytes`, `repo_spend_estimate_usd` | gauge | as of the last metered write |
| `repo_spend_alerts` | counter | `pct` |
| `code_storage_requests`, `code_storage_bytes_read` | counter | `operation`, `outcome` (`@smthrs/effect-code-storage`) |
| `git_remote_requests` | counter | `outcome` |
| `immutable_cache_requests`, `immutable_cache_bytes` | counter | `backend`, `namespace`, `operation`, `outcome` |

The browser (`src/features/repo/`), the tab's and the engine worker's, relayed through ChatApi's allowlist (`REPO_TELEMETRY` in `src/features/repo/contract.ts`). `repo/clone` and `repo/copy` record in their steps, on the engine worker, whichever door ran them:

| Record | Kind | Fields |
|---|---|---|
| `repo.open` | log and span | `kind` (`tree`, `blob`); the span's `smithers.repo.kind` |
| `repo.clone` | log and span, `repo/clone`'s step; Info `started` and `existing`, Warn otherwise | `outcome` (`started`, `existing`, `sign_in`, `forbidden`, `limit`, `invalid`, `not_configured`, `unavailable`), `status` (RepoApi's, for a refusal), `durationMs` |
| `repo.clone.unconfirmed` | log, Warn: a person's clone RepoApi took whose row Electric didn't deliver in time | |
| `repo.copy` | log and span, `repo/copy`'s step; Info `copied`, Warn `refused`, Error otherwise | `what` (`permalink`, `path`, `contents`, `clone-url`), `door` (the dispatch's, `agent`, or `unknown` when the tab that asked is gone), `outcome` (`copied`, `failed`, `refused`, `unavailable`, `gone`), `executionId`, `durationMs`; the span's `smithers.repo.copy` |
| `repo.tree.load`, `repo.blob.load`, `repo.refs.load` | log | `outcome`, `durationMs`, `status` |
| `repo.clone.post`, `repo.tree.get`, `repo.blob.get`, `repo.refs.get` | span, parents the client's `GET` or `POST` | `http.response.status_code` |
| `execute_tool repo/tree`, `repo/read`, `repo/refs`, `repo/clone`, `repo/copy` | span: the agent's call of the flow | |
| `smithers_web_repo_clone_clicks` | counter | `kind` (`clone`, `retry`) |
| `smithers_web_repo_clones` | counter | `outcome`, as `repo.clone` |
| `smithers_web_repo_opens` | counter | `kind` |
| `smithers_web_repo_tree_load_ms`, `smithers_web_repo_blob_load_ms`, `smithers_web_repo_refs_load_ms` | histogram | `outcome` |
| `smithers_web_repo_copies` | counter | `what`, `door`, `outcome`, as `repo.copy` |

### GitHub

The git loop's routes, flows and tokens, and the browser's issue writes, record ids, operations, outcomes, statuses and durations, never a title, a body, a login, a payload, the webhook secret or a token. [issues.md](features/issues.md#observability) lists every record; `worker/github/Flows.test.ts`, `worker/github/Api.test.ts` and `src/features/issues/issues.test.ts` assert them and their sentinels.

| Record | Kind | Where |
|---|---|---|
| `github.webhook`, `github.write.request`, `github.shape.<table>`, `github.reconcile.start` | log, span | ChatApi |
| `github.write`, `github.write.give_up`, `github.apply`, `github.reconcile`, `github.token.mint`, `github.config` | log, span | the `FlowExecution` Durable Object |
| `github_webhooks`, `github_delivery_lag_ms`, `github_write_requests`, `github_writes`, `github_write_ms`, `github_write_unknown`, `github_applies`, `github_reconciles`, `github_reconcile_changed`, `github_sync_age_seconds`, `github_token_mints`, `github_shape_requests` | counters, histograms, gauge | ChatApi and the Durable Object |
| `issues.write.queue`, `issues.write.send`, `issues.pending`, `smithers_issue_writes`, `smithers_issue_write_sends`, `smithers_issue_pending_actions` | browser | the engine worker and the tab |

### Agent status

What the agent's runs report, and what the person does about a question ([agent-status.md](features/agent-status.md#observability)). No record carries a question, an option or an answer.

| Record | Kind | Where | Fields |
|---|---|---|---|
| `agent.status.report`, `agent.status.answer` | log | ChatApi | `runId`, `report` or `version`, `status`, `durationMs`, `bytes`, `existing`, `errorCode` |
| `agent.status.request` | span | ChatApi | `smithers.run.id`, `http.response.status_code` |
| `smithers_run_requests` | counter | ChatApi | `route` (`report`, `answer`), `status` |
| `smithers_run_shape_requests` | counter | ChatApi | `status`, `live` |
| `agent.status.report`, `agent.status.answer` | span | engine worker | `smithers.run.id`, `http.response.status_code` |
| `agent.status.report` | log | engine worker | `runId`, `status`, `outcome` (`sent`, `failed`), `errorCode` |
| `smithers_agent_status_reports` | counter | engine worker | `status`, `outcome` (`sent`, `skipped`, `failed`) |
| `agent.status.answer`, `agent.status.deliver` | log | engine worker | `outcome`, `delivered` |
| `smithers_agent_status_answers` | counter | engine worker | `outcome` |
| `agent.status.shown` | log | tab | `runId`, `version`, `surface` |
| `smithers_agent_status_shown` | counter | tab | `surface` |

### Branch workspace

Tracking a branch, its conversation, its terminals and its machine ([branch-workspace.md](features/branch-workspace.md#observability)). No record carries a terminal's bytes, a screen, a branch's name, a token or anything asked; no metric label carries an id.

| Record | Kind | Where | Fields |
|---|---|---|---|
| `branch.track` | log, span | ChatApi | `repoId`, `outcome` (`tracked`, `existing`, or the refusal), `mode`, `forge`, `status`, `bytes`, `durationMs`, `errorCode` |
| `smithers_branch_tracks` | counter | ChatApi | `outcome` |
| `terminal.open`, `terminal.connect` | log, span | ChatApi | `terminalId`, `branchId`, `access`, `outcome`, `code`, `status`, `durationMs`, `errorCode` |
| `smithers_terminal_requests` | counter | ChatApi | `route` (`open`, `connect`), `outcome` |
| `terminal.shape` | log, span | ChatApi | `status`, `live`, `durationMs`, `bytes`, `outcome` |
| `smithers_terminal_shape_requests` | counter | ChatApi | `status`, `live` |
| `terminal.open.wake`, `terminal.open` | log | the `FlowExecution` Durable Object | `branchId`, `generation`, `terminalId`, `outcome`, `recorded`, `errorCode` |
| `sandbox.wake`, `terminal.session`, `terminal.open` | span | the `FlowExecution` Durable Object | `smithers.branch.id`, `smithers.terminal.id` |
| `smithers_terminal_opens` | counter | the `FlowExecution` Durable Object | `outcome` (`open`, `unavailable`, `checkout`) |
| `sandbox.object.wake` (span), `sandbox.checkout`, `sandbox.wake` (logs) | | `SandboxObject` | `smithers.branch.id`, `exitCode`, `errorCode` |
| `smithers_cloudflare_terminal_connects`, `_sessions_open`, `_bytes`, `_sessions`, `smithers_cloudflare_sandbox_wakes` | counters | `SandboxObject` (`@smthrs/platform-cloudflare`) | `access`, `outcome`, `direction` |
| `git.proxy` (log), `GitProxy.uploadPack` (span), `git_proxy_requests` | | `SandboxObject` (`@smthrs/effect-code-storage`) | `service`, `outcome`, `status`, `durationMs` |
| `branch.track`, `branch.open`, `smithers_web_branch_tracks`, `smithers_web_branch_opens`, `chat conversation opened`, `chat conversation shown` | browser | the engine worker and the tab | `outcome`, `status`, `durationMs`, `conversation`, `conversationId` |
| `terminal.open`, `terminal.open.press`, `terminal.connect`, `smithers_web_terminal_opens`, `terminal_open_ms`, `terminal_reconnects`, `terminal_bytes`, `terminal_ended` | browser | the engine worker and the tab | `outcome`, `status`, `terminalId`, `branchId`, `durationMs`, `code`, `direction`, `reason` |

### Relayed browser records

`POST /api/telemetry/v1/{logs,traces,metrics}` relays the browser's records through `OtlpRelay.serve` with limits and an allowlist (`worker/Chat.ts`; [chat.md](features/chat.md#post-apitelemetryv1logstracesmetrics)):

- **One list, shared:** `BROWSER_TELEMETRY` (`src/telemetry.ts`) merges every feature's contract (`APP_TELEMETRY`, `CHAT_TELEMETRY`, `AUTH_TELEMETRY`, `FLOWS_TELEMETRY`, `AGENT_TELEMETRY`, `THEME_TELEMETRY`, `NAVIGATION_TELEMETRY`, `REPO_TELEMETRY`, `STATUS_TELEMETRY`, `BRANCH_TELEMETRY`, `TERMINAL_TELEMETRY` and the others). The relay takes it as `allow`, and the engine worker's exporter sends only its span names, so the browser and ChatApi can't drift: `src/telemetry.test.ts` fails when the relay drops anything the browser exports that `WITHHELD` doesn't name.
- **Records:** the log messages, span names and metric names under [Browser](#browser) and [The engine worker](#the-engine-worker), by name. Any other record is dropped and counted as `not_allowed`.
- **Fields:** the relay's own (`RELAY_FIELDS`: `otlp.signal`, `service.name`, `otlp.severity`, `trace_id`, `span_id`, `otlp.parent_span_id`, `otlp.duration_ms`, `otlp.metric_type`, `otlp.unit`, `otlp.value`, `otlp.count`, `otlp.sum`), each feature's attributes, `exception.type`, and the HTTP client span's `http.request.method`, `http.response.status_code`, `url.full`, `url.path`, `url.query`, `url.scheme`, `server.address`, `server.port` and `error.type`. Every other field is removed.
- **Withheld (`WITHHELD`):** the fields `exception.message`, `exception.stacktrace` and `otlp.status_message`, since a message can quote what someone wrote, and `effect.fiberId`; and the per-request spans `browser.engine.request` (the tab's, dropped by the relay) and `browser.runtime.request` (the leader's, never sent), one per poll, hundreds per answer, which `smithers_browser_engine_requests` and `smithers_browser_runtime_requests` count.
- **Limits:** 128 KiB per export (413 past it), and 200 records per export (the rest dropped and counted as `over_limit`).

The relay doesn't check the values: a caller picks its records' `service.name`, `trace_id` and `span_id`.

## Tests

| Test | Proves |
|---|---|
| `e2e/fixtures.ts` | every e2e test keeps the browser console; a failing test saves `browser.log` |
| `worker/Chat.test.ts` "what anyone wrote never reaches a log line, span or metric" | a sentinel in questions, an invalid body, a refused retry and a Guest's refused question appears in no log, span attribute, event or failure, or metric attribute |
| `worker/Chat.test.ts` "a crash on … is 500, logged by the defect's name and never its message" | a defect is `chat.question` at Error with `errorCode: defect` and its name, `error.type` on a span that ends without it, and its message nowhere |
| `worker/Chat.test.ts` 400, 401, 403, 405, 409, 413 and 503 tests | each `chat.question` `errorCode` |
| `worker/Chat.test.ts` "traceparent" tests | a well-formed `traceparent` parents `chat.question` and its line carries its `trace_id` and the span's `span_id`; the sampled flag is ignored; a malformed one, or `b3`, parents nothing |
| `worker/Chat.test.ts` "POST /api/telemetry/v1/*" tests | a browser record becomes one ChatApi line with only the allowlisted fields; a span's status message is dropped; records off the allowlist or past 200 are dropped and counted; past 128 KiB is 413 |
| `worker/ShapeProxy.test.ts` | one `chat.shape` line per request with its bytes (502 at Error, an abandoned request `aborted`), and the Electric secret in no log or span |
| `worker/ModelEndpoint.test.ts` "telemetry" | a sentinel in the prompt, echoed by the model and quoted in a provider's error, and a sentinel key, appear in no log, span attribute, event or failure, or metric attribute |
| `worker/ModelEndpoint.test.ts` refusal, role and metering tests | `model.proxy.serve` with `role` and its outcome for 401, 403, 400, 429 and 503; `model.endpoint` with `sql:<reason>` and `unusable:<reason>`; `model.usage` for `kept` (with `ended` and `reported`), `expired` and a failed settle, and `smithers_model_usage_writes` by outcome; `smithers_model_tokens` by role and model |
| `worker/SetModel.test.ts` | `admin.set_model` at Warn with the refusal's reason, and at Error with the SQL reason |
| `packages/smithers/agent/model/test/ModelProxy.test.ts` | the proxy's spans, metrics and log lines, the host's attributes on server records only, and no prompt, response or provider text in any of them |
| `packages/smithers/flows/observability/test/Logger.test.ts` | `Logger.layerStructuredJson` writes the current span's `trace_id` and `span_id`, and a caller's own annotations under those names win |
| `src/features/chat/telemetry.test.ts` "asking" | read back from the browser's OTLP exports, attribute by attribute: `question asked`, `question stored`, `question not sent` and `unsent question handled`; `chat.ask`, then `outbox.send` linked to it, with `chat.ask.send`, `chat.question.post` and `POST` in one trace with ChatApi's `chat.question`; `smithers_web_questions`, `smithers_web_ask_failures`, `smithers_web_unsent_actions`, `smithers_web_composer_opens`, `smithers_web_answer_first_text_ms`, `outbox_attempts`, `outbox_refused`, `outbox_queued_ms`, `outbox_leader_changes` and `persistence_restore_ms`; a sentinel in questions and answers in no export |
| `src/features/chat/telemetry.test.ts` "an answer not started" | `answer not started`, `reason` `unavailable`, for a question ChatApi took on a tab whose engine worker failed |
| `src/features/chat/telemetry.test.ts` "the connection and the window" | the same for `chat connection changed`, `chat retried`, `smithers_web_sync_failures`, `smithers_web_sync_retries` and `smithers_web_history_loads` |
| `packages/effect-tanstack-db/test/Outbox.test.ts`, `Persistence.test.ts` | `outbox.send` with its link and attributes, `outbox write failed`, `outbox couldn't load its writes`, `persistence unavailable`, `persisted write failed`, and every `outbox_*` and `persistence_*` metric |
| `src/features/chat/chat.test.ts` | each metric's count by its attributes in every case: asking, failures, sync health, history, the composer and shortcuts |
| `src/boot.test.ts` | read back from the OTLP exports: `chat ready` and `smithers_web_boot_ms` once the conversation is restored from the device; `chat couldn't restore` and no boot time when it can't be; `persistent storage requested` and `smithers_web_storage_persisted`, granted or not; `page error` and `unhandled rejection` by name and place, never their message; `page reloaded` and `smithers_web_page_reloads` |
| `packages/effect-tanstack-db/test/Collection.test.ts` | `collection cleanup failed` with the collection's id and the error's name, never its message |
| `packages/effect-electric/test/ShapeProxy.test.ts` | the shape proxy's log line, span, count and 405, a subset request's parameters dropped and never forwarded, and the Electric secret in no log or span |
| `src/telemetry.test.ts` "the relay keeps everything the browser exports" | the tab's and the engine worker's exports, as `src/boot.ts` and `src/flows/engine.worker.ts` install their exporters, through the real relay with `BROWSER_TELEMETRY`: an answer whose agent calls a flow, asking, a refused ask, sync failing and retried. Nothing is dropped that `WITHHELD` doesn't name, the end-to-end tests' fields arrive, and no engine export comes near 128 KiB |
| `src/telemetry.test.ts` "the contract" | no field that can carry what someone wrote; every record name is a string literal in the app or the SDK packages it names, or one a library forms (`GET`, `chat agent`, `execute_tool <flow>`) |
| `packages/smithers/flows/observability/test/Otlp.test.ts` "exports only the spans `spans` names" | an exporter's `spans` list: only the named spans are sent, a dropped span's children keep its trace and parent id, and logs are sent as before |
| `packages/smithers/flows/platform-browser/test/BrowserRuntime.test.ts` "run sends the worker's logs, spans and metrics to its telemetry" | `BrowserRuntime.run`'s `telemetry` receives the leader's log, spans and counts |
| `worker/ExecutionHost.test.ts` "every start and alarm is one log line and one count by outcome, never the payload" | `cloudflare.execution.start` (`accepted`, `duplicate`) and `cloudflare.execution.alarm` (`settled`) lines and their counters, with a sentinel payload absent from every line |
| `worker/flows/Pause.test.ts` "logs one probe.mark line" | the deployed probe step logs `probe.mark` with its `label` |
| `worker/flows/Expire.test.ts` "each step logs and counts its outcome, never the text" | `chat.answer.expire` for `abandoned`, `settled` and `failed` (with `sql:<reason>`), `smithers_answer_expiries` by outcome, and a sentinel question in no line |
| `worker/Chat.test.ts` "chat/Expire" | `chat.question` `expiry`, and a refused start's `chat.question` `503` with `expiry_not_started` and `chat.answer.expire` `not_started` with the host's code or `conflict`, counted |
| `worker/SignIn.test.ts` "telemetry" | GitHub's tokens, the code, `state`, the session cookie and its token, SESSION_SECRET, the client secret and the login appear in no log, span attribute, event or failure, or metric attribute; ChatApi's relay keeps the browser's sign-in records and drops a field off its allowlist |
| `worker/SignIn.test.ts` route tests | `smithers_auth_requests` by route, outcome and reason for every refusal and failure, and the `auth.callback`, `auth.sign_in`, `auth.session` and `auth.config` lines with their `errorCode` |
| `worker/flows/RecheckRole.test.ts` "its records carry the outcome and the session id, never a token or a login" and "keeping the role records it, …" | `auth.role_check` by step: `redeemed`, `stored`, `checked`, `none`, `failed` and `kept`, with no token or login |
| `worker/flows/RevokeGitHubToken.test.ts` "its records carry the outcome and the session id, never a token or a login" | `auth.revoke_token` by step: `over`, `failed` and `revoked`, with no token or login |
| `worker/SignIn.test.ts` sign-out tests | `auth.sign_out` `failed` with reason `not_started` and the host's code; `auth.callback` `failed` with reason `sign_out_not_started` |
| `src/features/auth/auth.test.ts` | `session loaded` with `signedIn` and never the login, `session unreachable` and `sign out failed` with their `status`, `device wiped` and `device wipe failed`, `smithers_web_sign_in_presses`, `smithers_web_sign_outs` and `smithers_web_device_wipes` by outcome |
| `worker/RepoApi.test.ts` | `repo.clone.request` by outcome, `repo.tree` and `repo.blob` with `repoId`, `sha` and `errorCode`, `repo.raw` and `repo.refs` (no `sha`), `repo.meter`, `repo.clone.step` and `repo.clone.settle`, `repo.spend.alert` once per threshold, `repo_clone_requests`, `repo_reads`, `repo_clones`, the gauges, and a sentinel file and commit message in no log, span or metric |
| `worker/flows/RepoClone.test.ts` | `repo_clones` and `repo_capacity` by reason; `repo.clone.settle` with `errorCode` when Postgres refuses |
| `worker/RepoConfig.test.ts` | `repo.config` with `invalid_key`, and the key nowhere in the log |
| `src/features/repo/repo.test.ts`, `faults.test.ts`, `copy.test.ts` | the browser's repository records and metrics by outcome: `repo.clone` and `smithers_web_repo_clones` for each of RepoApi's answers, `repo.clone.unconfirmed`, `repo.copy` and `smithers_web_repo_copies` by what, door (a person's and the agent's) and outcome, and `repo.refs.load` |
| `src/features/commands/commands.test.ts` | `smithers_slash_choices` by kind and how, `smithers_slash_submits` by outcome and command (none for a name the app doesn't offer), and `smithers_flow_dispatches` with door `slash` for a command that ran |
| `src/features/navigation/navigation.test.ts` | `web.navigate` and `smithers_web_navigations` by door and outcome for every outcome, the span's attributes, every field one the relay keeps, and a sentinel path in no line or span |
| `src/features/web/web.test.ts`, `src/features/views/views.test.ts`, `worker/Views.test.ts` | `web.page.open` and `smithers_web_pages_opened` by mode, door and outcome for the agent's steps and a person's tab, every field one the relay keeps, a sentinel page in no line or span; `chat.view.add` and its counts for every status |
| `src/features/jev/jev.test.ts` | `jev.judge`, `smithers_jev_judgments` and `smithers_jev_verdicts` by flow, outcome and verdict code, every field one the relay keeps, a sentinel item, question, label, text and criterion in no line or span |
| `e2e/navigate.spec.ts` | locally, the engine worker's `web.navigate` lines for the agent's navigation and refusal, read from ChatApi's relayed records |
