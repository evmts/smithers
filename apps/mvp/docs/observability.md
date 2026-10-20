# Observability

Every request, answer and sync in the app can be traced end to end, counted, and explained from its records alone, without adding a log line after the fact. This page is the contract. Code that adds a feature adds its entries here, and the tests under [Tests](#tests) enforce them.

Status (2026-10-19): every record below exists and is tested.

## Rules

- **No content, no credentials.** Diagnostics never carry a question, an answer, a prompt, a model key, a database password or the Electric secret. They carry ids, counts, durations, sizes, status codes, model ids and error codes. A test asks questions containing a sentinel string and fails if the sentinel appears in any log record, span attribute or event, or metric attribute.
- **One id per answer, everywhere.** The answer id (`answerId`) appears on:
  - the browser's logs and spans;
  - the body of `POST /api/questions`;
  - ChatApi's `chat.question`, `chat.dispatch` and `chat.answer` log lines and spans.

  W3C trace context (`traceparent` on `POST /api/questions`) parents ChatApi's `chat.question` span. Its child `chat.dispatch` starts the background `chat.answer` span as its own child, so one trace runs from the browser's ask to the answer settling.
- **Every log line names its trace.** ChatApi's log lines carry the current span's `trace_id` and `span_id` among their annotations (`Logger.layerStructuredJson` in `@smthrs/observability`), the same names as the browser records ChatApi relays, so a log search joins them by trace.
- **Every outcome is recorded, not just success.** Completion, failure, fencing, abandonment and database errors each have a log line, span attributes and a metric.
- **Effect does the recording.** Logs are `Effect.log*` with annotations, spans are `Effect.withSpan`, metrics are `Metric`. The host decides where they go, so the same code records in a browser, a Worker and a test.

## Where it goes

```
browser ── Effect logs, spans, metrics ── OTLP JSON (@smthrs/observability Otlp.layerFetch) ── POST /api/telemetry/v1/*
                                                                                                    │ OtlpRelay.serve
ChatApi Worker ── Effect logs, one JSON object per line ── Workers Logs (persisted) ◀──────────────┘ one line per record
               ── Effect spans ── Cloudflare.Telemetry() ── Workers Traces (persisted)
               ── Effect metrics ── the isolate's registry; every value is also a log line field
site Worker    ── Workers Logs + Traces (platform: requests and the service binding to ChatApi)
optional       ── Cloudflare.Workers.ObservabilityDestination: Workers Logs and Traces to any OTLP collector
```

- **Logs.** ChatApi installs `Logger.layerStructuredJson()` (`@smthrs/observability`) in its handlers and its cron, so Workers Logs indexes every annotation as a field, `trace_id` and `span_id` included. Both Workers persist logs (`observability.logs.persist` in `alchemy.run.ts` and `worker/ChatApi.ts`).
- **Traces.** `Cloudflare.Telemetry({ persist: true })` turns on Workers Traces for ChatApi and mirrors its Effect spans into Cloudflare's waterfall. The site Worker sets `observability.traces` directly.
- **Metrics.** Workers has no metric exporter in this stack, so ChatApi's Effect metrics live in the isolate and the tests read them. Every metric is also a field of a log line (the table below names it), so Workers Logs' query builder counts and percentiles them, for example p95 of `firstTextMs` over `chat.answer` lines.
- **Locally**, `alchemy dev` writes each Worker's logs to `.alchemy/log/dev_<user>/<Worker>/`, and the browser's console shows its own records.

## What is recorded

### Browser

`appLayer` (`src/boot.ts`) installs `Otlp.layerFetch` with `serviceName: "smithers-mvp-web"`, so every Effect log, span and metric on the app's runtime goes to `POST /api/telemetry/v1/*`, and the console keeps its own copy. Every chat record is annotated `feature: chat`; boot and page records `feature: app`.

Logs:

| Message | When | Level | Fields |
|---|---|---|---|
| `chat ready` | the conversation's first snapshot loaded | Info | |
| `chat couldn't open` | the conversation's first snapshot failed | Error | `status` when ChatApi or Electric answered |
| `chat sync failed` | sync turned `failed`: shape requests kept failing for 10 s (`openWithin`), at open or after one failed, or Electric gave up on the shape (a 4xx, or a response it couldn't read) | Error | `reason` (`unreachable`, `refused`, `invalid_response`), `status` when there was one |
| `chat sync up to date` | a shape request succeeded while sync was `syncing` or failed as `unreachable` | Info | |
| `chat sync retried` | Try again, or the browser came back online, while sync was `failed` | Info | `via` (`button`, `online`) |
| `question asked` | `ask` inserted a question | Info | `questionId`, `answerId`, `question.length` |
| `question taken` | ChatApi took it and Electric delivered both rows | Info | `questionId`, `answerId`, `taken` (`inserted`, or `existing` for a retry ChatApi answered 200) |
| `question not taken` | it rolled back | Warn | `questionId`, `answerId`, `reason`, `status` when ChatApi answered |
| `earlier messages loaded` | Load earlier's page arrived | Info | `limit` |
| `earlier messages didn't load` | Load earlier's page didn't arrive; the window stays | Warn | `limit` |
| `page error` | an uncaught error on the window | Error | `name`, `source` (`file:line:column`); never the message |
| `unhandled rejection` | a rejection nothing handled | Error | `name`; never the message |
| `collection cleanup failed` | a collection's cleanup rejected as its scope closed | Warn | `collection` |

`question not taken` `reason`: `unreachable` (no whole answer from ChatApi, body included, in 15 s, for example offline or a stalled body), `refused` (an answer other than 200 or 202, such as 409), `invalid_response` (a 202 body outside the contract), `unconfirmed` (taken, but Electric didn't deliver both rows in 15 s).

Spans:

| Span | Kind | Attributes |
|---|---|---|
| `chat.ask` | internal: from asking ChatApi to Electric delivering the rows | `questionId`, `answerId`, `question.length`, `taken` (`inserted` or `existing`), `txid` when inserted, `outcome` (`asked` or the `reason`) |
| `chat.history.load` | internal: from Load earlier to its page arriving | `limit`, `outcome` (`loaded` or `failed`) |
| `chat.question.post` | internal, child of `chat.ask` | `http.response.status_code` |
| `POST` | client (Effect `HttpClient`), child of `chat.question.post` | `url.full`, `http.response.status_code`; sends `traceparent`, which parents ChatApi's `chat.question` |

Metrics (`src/features/chat/metrics.ts`, `src/boot.ts`):

| Metric | Kind | Attributes |
|---|---|---|
| `smithers_web_questions` | counter | |
| `smithers_web_ask_failures` | counter | `reason` |
| `smithers_web_composer_opens` | counter | `via` = `shortcut` or `button`; an open composer opened again doesn't count |
| `smithers_web_answer_first_text_ms` | histogram | from asking to the answer's first text on the asking tab |
| `smithers_web_sync_failures` | counter | `reason` = `unreachable`, `refused` or `invalid_response` |
| `smithers_web_sync_retries` | counter | `via` = `button` or `online`; only while sync was `failed` |
| `smithers_web_history_loads` | counter | `outcome` = `loaded` or `failed` |
| `smithers_web_boot_ms` | histogram | from page start to the conversation's first snapshot |

Answer outcomes are ChatApi's to record, since it answers whether or not the asking tab stays.

### ChatApi Worker

Logs (`worker/Chat.ts`, `worker/Answer.ts`, `worker/ShapeProxy.ts`):

| Message | When | Level | Fields |
|---|---|---|---|
| `chat.question` | every `POST /api/questions` | Info 2xx, Warn 4xx, Error 5xx | `status`, `bytes`, `durationMs`; `questionId`, `answerId` once the body is valid; `existing: true` for a retry; `dispatch` (the dispatch's `outcome`) when it started answering; `errorCode`: `utf8` for malformed UTF-8, `id_taken` and `sql:UniqueViolation` for 409, `sql:<reason>` for 503 |
| `chat.dispatch` | every request to start answering | Info, Error for `error` | `answerId`, `trigger` (`ask`, `retry` or `sweep`), `outcome` (`started`; `running`, already running in this isolate; or `error`), `durationMs` |
| `chat.answer` | every answer run that ended, once | Info `done`, Warn `failed` and `fenced`, Error `error` | `answerId`, `questionId`, `outcome`, `failure`, `errorCode`, `httpStatus`, `modelId`, `stopReason`, `inputTokens`, `outputTokens`, `attempt`, `firstTextMs`, `durationMs`, `historyExchanges`, `characters` |
| `chat.sweep` | the sweep found stuck answers, or failed | Warn, Error | `abandoned` (how many it settled), `answerIds` (theirs), `redispatched` (how many it dispatched again); `outcome: error` on failure |
| `chat.shape` | every shape request, once it has ended | Error 5xx or a failed body, Warn other 4xx, Info otherwise | `status` (499 when the browser left before Electric answered), `live`, `durationMs` (to the body's end), `bytes` (body bytes sent), `outcome` (`complete`, `aborted` or `failed`) |
| the browser's records | every OTLP record relayed | the record's severity | its attributes, `otlp.signal`, `service.name`, `trace_id`, … (`OtlpRelay`) |

Every ChatApi line also carries `trace_id` and `span_id` when it is logged inside a span.

`chat.answer` outcomes:

| `outcome` | Means |
|---|---|
| `done` | settled `done` |
| `failed` | settled `failed` with `failure` (`rate_limited`, `model_error`, `empty`); `errorCode` is the model's `ModelError` code, `httpStatus` its status |
| `fenced` | the answer had settled, for example by the sweep, or a later attempt claimed it, so this run wrote nothing more |
| `error` | Postgres failed (`errorCode: sql:<reason>`), or the run died (`defect`); nothing settled it, so the sweep dispatches it again |

`firstTextMs` and `durationMs` count from the start of the run, after the response. `attempt` is the run's streaming attempt; `historyExchanges` is how many exchanges the model saw; `characters` is the answer's length.

Spans:

| Span | Kind | Attributes |
|---|---|---|
| `chat.question` | server, parented by `traceparent` | `smithers.chat.question_id`, `smithers.chat.answer_id`, `http.response.status_code` |
| `chat.dispatch` | internal, child of `chat.question` or `chat.sweep` | `smithers.chat.answer_id`, `smithers.chat.dispatch.trigger`, `smithers.chat.dispatch.outcome` |
| `chat.answer` | internal, child of `chat.dispatch` | `smithers.chat.<field>` for every `chat.answer` field (`smithers.chat.first_text_ms`, `smithers.chat.attempt`, …); `error.type` = the failure |
| `chat <model>` | client, from `Model.withGenAiSpan` (`@smthrs/model`) | `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`, timing |
| `chat.sweep` | internal | `smithers.chat.sweep.abandoned`, `smithers.chat.sweep.redispatched` |
| `chat.shape` | server | `http.response.status_code`, `smithers.chat.shape.live` |
| SQL statements | client (`effect/sql`) | `db.query.text`: the statement with `$1` placeholders, never its values |
| HTTP calls to the model and Electric | client (Effect `HttpClient`) | `url.full` with `secret` redacted; request headers with `authorization` redacted |

Metrics (`worker/ChatMetrics.ts`):

| Metric | Kind | Attributes | Log field |
|---|---|---|---|
| `smithers_chat_questions` | counter | `status` | `chat.question` `status` |
| `smithers_chat_answers` | counter | `outcome`, `failure` (`none` unless failed; the sweep adds `failed`/`abandoned`) | `chat.answer` `outcome`, `failure`; `chat.sweep` `abandoned` |
| `smithers_chat_tokens` | counter | `type` = `input` or `output` | `inputTokens`, `outputTokens` |
| `smithers_chat_answer_first_text_ms` | histogram | | `firstTextMs` |
| `smithers_chat_answer_ms` | histogram | `outcome` | `durationMs` |
| `smithers_chat_swept` | counter | | `chat.sweep` `abandoned` |
| `smithers_chat_dispatches` | counter | `trigger`, `outcome` | `chat.dispatch` `trigger`, `outcome` |
| `smithers_chat_shape_requests` | counter | `status`, `live` | `chat.shape` |
| `flows_observability_otlp_relayed`, `flows_observability_otlp_relay_dropped` | counters | `signal` | (`OtlpRelay`) |

## Tests

| Test | Proves |
|---|---|
| `e2e/fixtures.ts` | every e2e test keeps the browser console; a failing test saves `browser.log` |
| `worker/ChatApi.test.ts` "question text never reaches a log line, span or metric" | a sentinel in questions, a model error message and an invalid body appears in no log, span attribute or event, or metric attribute |
| `worker/ChatApi.test.ts` "done, with the model id, tokens and stop reason, and one log line of metadata" | the exact `chat.answer` fields, the `chat.question` and `chat.dispatch` lines, the metrics and the `chat.question`, `chat.dispatch`, `chat.answer` and `chat <model>` spans in one trace |
| `worker/ChatApi.test.ts` "every line of a request with a traceparent carries its trace id and the span that logged it" | `chat.question`, `chat.dispatch` and `chat.answer` carry the `traceparent`'s `trace_id` and their own span's `span_id` |
| `worker/ChatApi.test.ts` retry, failure, answering-again, fencing, sweep and shape tests | each outcome's log level and fields, `existing`, `dispatch`, `attempt`, `error.type`, `smithers_chat_dispatches`, `smithers_chat_swept`, one `chat.shape` line per request with its bytes (502 at Error, an abandoned request `aborted`), and the Electric secret in no log or span |
| `packages/smithers/flows/observability/test/Logger.test.ts` | `Logger.layerStructuredJson` writes the current span's `trace_id` and `span_id`, and a caller's own annotations under those names win |
| `worker/ChatApi.test.ts` "relays the browser's OTLP records" | a browser log record becomes a ChatApi log line with its attributes |
| `src/features/chat/chat.test.ts` "exports the ask's span in ChatApi's trace, its logs and metrics, and never what anyone wrote" | through `appLayer` and ChatApi's real handler: the browser's `chat.ask` carries the answer id and shares its trace id with ChatApi's `chat.question`; `question asked`, `question not taken` and the browser metrics are exported; a sentinel in questions and answers appears in no browser export |
| `src/features/chat/chat.test.ts` composer, first-text and failure tests | `smithers_web_composer_opens` by `via`, `smithers_web_answer_first_text_ms` once per answer, `smithers_web_ask_failures` by `reason` |
| `src/features/chat/chat.test.ts` sync health and history tests | `smithers_web_sync_failures` by `reason`, `smithers_web_sync_retries` by `via`, `smithers_web_history_loads` by `outcome` |
| `src/features/chat/chat.test.ts` "exports sync and history records, and never what anyone wrote" | `chat sync failed`, `chat sync retried`, `chat sync up to date` and `earlier messages loaded` are exported with their fields, `chat.history.load` with its `outcome`, and a sentinel in questions appears in no export |
| `src/boot.test.ts` | `smithers_web_boot_ms` once the conversation is ready and not when it can't open; page errors logged by name and place, never their message |
