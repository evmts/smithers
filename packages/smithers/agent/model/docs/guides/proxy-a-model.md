---
title: "Proxy a model"
description: "Serve a Model from a Cloudflare Worker, Node or Bun with ModelProxy.serve, and call it from a browser as a Model with ModelProxy.layerClient."
sidebar:
  order: 5
---

A browser must never hold a provider key, so it cannot call a provider route
itself. `ModelProxy` splits the call across HTTP instead. The host runs
`ModelProxy.serve`, which owns the key and decides which model, system prompt
and parameters a request gets. The browser, another Worker or a CLI provides
`ModelProxy.layerClient`, a `Model` whose `stream` posts the request and reads
the events back. Code that calls `model.stream(request)` does not change.

```text
browser                         host (Worker, Node, Bun)          provider
Model.stream ──POST ModelRequest──▶ ModelProxy.serve
  (layerClient)                       prepare: the host's policy
                                      Model.stream ───────────────▶ route
             ◀──NDJSON ModelEvents── … then {"type":"end"}
```

## Serve from a Cloudflare Worker

`ModelProxy.serve` is an Effect, not a request handler function: it reads the
current `HttpServerRequest`, needs the `Model` service, and answers an
`HttpServerResponse`. Alchemy runs a Worker's `fetch` Effect per request, so
the handler drops in as is. `HostModel.layerConfig` from `@smthrs/model-host`
picks the host's model and key from the Worker's bindings:

```ts
import { Model, ModelProxy, ModelRequest } from "@smthrs/model"
import { HostModel } from "@smthrs/model-host"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

// Used when the CHAT_MODEL binding is unset.
const DEFAULT_CHAT_MODEL = {
  protocol: "openai-chat",
  baseUrl: "https://api.cerebras.ai",
  modelId: "qwen-3.8-27b",
  credential: "CEREBRAS_API_KEY"
}

export default class ChatApi extends Cloudflare.Worker<ChatApi>()(
  "ChatApi",
  { main: "worker/ChatApi.ts", compatibility: { date: "2026-10-01", flags: ["enable_request_signal"] } },
  Effect.gen(function*() {
    const { model, modelId } = yield* HostModel
    const chat = ModelProxy.serve({
      prepare: ModelProxy.policy({
        modelId,
        system: [ModelRequest.SystemPart.make({ text: "Answer briefly and plainly." })],
        params: ModelRequest.GenerationParams.make({ reasoningEffort: "low" }),
        maxMessages: 40
      }),
      maxBodyBytes: 512 * 1024
    }).pipe(Effect.provideService(Model.Model, model))

    return {
      fetch: Effect.gen(function*() {
        const request = yield* HttpServerRequest.HttpServerRequest
        if (request.url !== "/api/chat") return HttpServerResponse.empty({ status: 404 })
        return yield* chat
      })
    }
  }).pipe(Effect.provide(HostModel.layerConfig("CHAT_MODEL", DEFAULT_CHAT_MODEL)))
) {}
```

The `enable_request_signal` flag lets the Worker see a browser that goes away,
so a closed tab stops the provider call instead of paying for the rest of the
answer.

## Decide what the caller may choose

`prepare` runs on every decoded request before the model does, and its result
is what the model receives. A browser must not choose the model, system prompt,
parameters or tools on the host's key, so `prepare` is required.

`ModelProxy.policy` is the common hook: the caller chooses only the
conversation. It replaces `modelId`, `system` and `params` with the host's,
drops every other request field, and refuses with `400` a request that
declares tools or provider-run tools, has no messages, or has more than
`maxMessages`.

For any other rule, write `prepare` yourself and fail with a `Refusal`. Its
`status` and `message` reach the client as written, and `code` is the
`ModelError` code the client fails with (the status picks one when omitted):

```ts
import { ModelProxy, type ModelRequest } from "@smthrs/model"
import { Effect } from "effect"

const base = ModelProxy.policy({ modelId: "qwen-3.8-27b", maxMessages: 40 })

const prepare = (signedIn: boolean) => (request: ModelRequest.ModelRequest) =>
  signedIn
    ? base(request)
    : Effect.fail(new ModelProxy.Refusal({ status: 401, message: "Sign in to chat." }))
```

## Run it on Node or Bun

The same Effect runs under any `effect/http` server. As a web handler, with
`modelLayer` any layer that provides `Model` (a `Route.layer`, for one):

```ts
import { ModelProxy } from "@smthrs/model"
import { Effect } from "effect"
import { HttpEffect } from "effect/http"

const handler = HttpEffect.toWebHandler(
  ModelProxy.serve({ prepare: ModelProxy.policy({ modelId: "qwen-3.8-27b" }) }).pipe(
    Effect.provide(modelLayer)
  )
)
// Bun.serve({ fetch: handler }), or any server that takes (Request) => Promise<Response>.
```

## Call it from a browser

`ModelProxy.layerClient` provides `Model` over any Effect `HttpClient`. In a
browser, `FetchHttpClient` is the one, and a relative URL resolves against the
page:

```ts
import { Model, ModelProxy, ModelRequest } from "@smthrs/model"
import { Effect, Layer, Stream } from "effect"
import { FetchHttpClient } from "effect/http"

const ChatModel = ModelProxy.layerClient({ url: "/api/chat" }).pipe(Layer.provide(FetchHttpClient.layer))

const answer = (question: string) =>
  Effect.gen(function*() {
    const model = yield* Model.Model
    return model.stream(ModelRequest.ModelRequest.make({
      modelId: "host-chooses",
      system: [],
      messages: [ModelRequest.Message.user(question)],
      tools: [],
      params: ModelRequest.GenerationParams.make()
    }))
  }).pipe(
    Stream.unwrap,
    Stream.filter((event) => event.type === "text-delta"),
    Stream.map((event) => event.text),
    Stream.provide(ChatModel)
  )
```

The browser's `modelId`, `system` and `params` are placeholders: under
`policy` the host replaces them. Interrupting the fiber that runs the stream
aborts the request, and the host's model call stops with it.

Every failure is a `ModelError`, so the code from
[Handle failures](./handle-failures.md) applies unchanged. Each one carries
the request id as `requestId`.

| What happened                                       | `code`                                                     | `httpStatus` |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| The model failed after the stream started           | the model's own code; the message is a fixed safe headline | none         |
| The host refused the request                        | the `Refusal`'s code, or the status's                      | its status   |
| The body was not a `ModelRequest`, or was too large | `invalid_request`                                          | 400 or 413   |
| The host could not be reached, or the body broke    | `transport`                                                | none         |
| The body ended before its terminal line             | `transport`                                                | none         |
| A line the client could not decode                  | `invalid_provider_output`                                  | none         |
| The request could not be encoded                    | `invalid_request`                                          | none         |

## Observe it

Both halves record one span, three metrics and one log line per request,
joined by the request id and by trace context. The client sends a fresh id in
`x-smithers-request-id`; the server keeps it (or mints one if it is missing or
malformed) and echoes it in the response. Effect's `HttpClient` sends W3C
`traceparent`, so the browser's span, the host's spans and the provider call
share one trace:

```text
model.proxy.stream (client)
└─ POST (HttpClient)
   └─ http.server POST
      └─ model.proxy.serve
         └─ chat <model>   (Model.withGenAiSpan)
```

The `model.proxy.serve` and `model.proxy.stream` spans carry
`smithers.model.proxy.request_id`, `smithers.model.proxy.outcome`,
`http.response.status_code`, `error.type` (the `ModelError` code),
`smithers.model.proxy.events`, `smithers.model.proxy.duration_ms` and
`smithers.model.proxy.first_event_ms`; the server span adds
`gen_ai.request.model`, `gen_ai.provider.name` and
`smithers.model.proxy.request_bytes`.

| Metric                                | Kind      | Attributes                                       |
| ------------------------------------- | --------- | ------------------------------------------------ |
| `smithers_model_proxy_requests`       | counter   | `side`, `outcome`, `status`                      |
| `smithers_model_proxy_duration_ms`    | histogram | `side`, `outcome`                                |
| `smithers_model_proxy_first_event_ms` | histogram | `side`                                           |
| `smithers_model_proxy_tokens`         | counter   | `type` (`input`, `output`), `model`; server only |

`outcome` is `success`, `invalid` (bad method or body), `refused`, `failed` or
`interrupted`. The log line's message is the span name, and its level follows
the outcome: Info for `success` and `interrupted`, Warn for `invalid` and
`refused`, Error for `failed`. Its annotations are `requestId`, `traceId`,
`side`, `outcome`, `status`, `durationMs`, `events`, and when known `modelId`,
`provider`, `errorCode`, `errorTag`, `firstEventMs`, `requestBytes`,
`inputTokens` and `outputTokens`.

No span, metric or log line carries prompt or response text, provider error
text, or credentials. The test suite proves it with a sentinel prompt that the
model echoes and fails on.

On a cross-origin deployment, the host must allow the `traceparent`, `b3` and
`x-smithers-request-id` request headers in its CORS preflight. A same-origin
route, such as a site Worker that forwards `/api/*`, needs nothing.

## The wire format

The request is `POST` with a JSON `ModelRequest` body, encoded by the
`ModelRequest` schema. A `200` response is `application/x-ndjson`: one
Schema-encoded `ModelEvent` per line, then exactly one terminal line.

```text
{"type":"text-start","id":"t"}
{"type":"text-delta","id":"t","text":"Hello"}
{"type":"text-end","id":"t"}
{"type":"settle","stopReason":"stop"}
{"type":"end"}
```

A model that fails after the headers were sent ends the stream with
`{"type":"error","code":"rate_limited","message":"Model usage limit reached","retryAfterMillis":1200}`
instead. A body that stops before either line was cut. Any other status
carries `{"code","message","requestId"}`. `ModelProxy.Line` and
`ModelProxy.ErrorBody` are the schemas.
