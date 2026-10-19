# Observability

Every request, answer and sync in the app can be traced end to end, counted, and explained from its records alone, without adding a log line after the fact. This page is the contract. Code that adds a feature adds its entries here, and the tests under [Tests](#tests) enforce them.

Status (2026-10-19): this is the target. The answerer's lifecycle logs exist. The rest lands with the Smithers model transport (`@smthrs/model`) and is marked **planned** below until its test passes.

## Rules

- **No content, no credentials.** Diagnostics never carry a question, an answer, a prompt, a model key or a token. They carry ids, counts, durations, sizes, status codes, model ids and error codes. A test asks a question containing a sentinel string and fails if the sentinel appears in any log record, span attribute or metric label.
- **One id per answer, everywhere.** The answer id (`answerId`) appears on:
  - the browser's logs and spans;
  - the request to `/api/chat`;
  - ChatApi's request log and span;
  - the model call's span.

  W3C trace context (`traceparent`) joins them into one trace.
- **Every outcome is recorded, not just success.** Completion, failure, refusal, interruption and abandonment each have a log line, a span status and a metric.
- **Effect does the recording.** Logs are `Effect.log*` with annotations, spans are `Effect.withSpan` / `Effect.fn`, metrics are `Metric`. The host decides where they go, so the same code records in a browser, a Worker and a test.

## Where it goes

```
browser ── Effect logs, spans, metrics ── OTLP (@smthrs/observability Otlp.layerFetch) ── POST /api/telemetry/v1/*
                                                                                              │
ChatApi Worker ── Effect logs ── Workers Logs   (observability.logs, persisted)               │
               ── Effect spans ── Workers Traces (Cloudflare.Workers.Telemetry)  ◀────────────┘ browser records re-emitted
               ── usage metrics ── Analytics Engine (dataset smithers_mvp_usage)
site Worker    ── Workers Logs + Traces (platform: requests, sync Durable Object)
optional       ── ObservabilityDestination: Workers Logs and Traces to any OTLP collector
```

Locally, `alchemy dev` writes each Worker's logs to `.alchemy/log/dev_<user>/<Worker>/`, and the browser's console shows its own records.

## What is recorded

### Browser

| Record | Kind | Fields | Status |
|---|---|---|---|
| `answer started` / `answer completed` / `answer failed` | log | `answerId`, `session`, failure cause (failed only) | exists |
| `answer from before this page loaded failed` | log | `answerId`, `session` | exists |
| `chat.answer` | span | `answerId`, outcome, first-text ms, duration ms, text length | planned |
| `smithers_web_answers` | counter | `outcome` = completed, failed, abandoned | planned |
| `smithers_web_answer_first_text_ms`, `smithers_web_answer_ms` | histograms | | planned |
| `smithers_web_questions`, `smithers_web_composer_opens` | counters | `via` = shortcut or button (opens) | planned |
| `smithers_web_boot_ms` | histogram | time from page start to chat ready | planned |
| page errors and unhandled rejections | log, Error | message and stack, no state | planned |

### ChatApi Worker

| Record | Kind | Fields | Status |
|---|---|---|---|
| one line per `/api/chat` request | log | `answerId`, request id, status, outcome, model id, input and output tokens, finish reason, first-event ms, duration ms | planned (SDK transport) |
| `model.http.serve` | span | the same | planned (SDK transport) |
| `chat <model>` | span | GenAI attributes from `Model.withGenAiSpan` | planned (SDK transport) |
| `smithers_model_http_*` | metrics | requests by outcome and status, duration, first event, tokens | planned (SDK transport) |
| a usage point per answer | Analytics Engine | outcome, model id, tokens, duration | planned |

### Sync

LiveStore's sync Durable Object logs at Error when it rejects a push with `ServerAheadError`. This is its normal protocol when two devices push at once: the client pulls and rebases, then pushes again. It is not a failure, and the dashboards don't count it as one.

## Tests

| Test | Proves |
|---|---|
| `e2e/fixtures.ts` | every e2e test keeps the browser console; a failing test saves `browser.log` |
| redaction (planned) | a sentinel in a question appears in no log, span attribute or metric |
| correlation (planned) | one `answerId` appears in the browser's records and ChatApi's log for the same answer |
| SDK transport tests (planned) | spans, metrics and logs of `@smthrs/model`'s HTTP transport |
