---
title: "A durable model call"
description: "Call a model as one sealed step of a running flow with ModelStep.run: what its key covers, what it retries, how it streams, and what happens when a process dies mid-call."
sidebar:
  order: 11
---

`ModelStep.run` makes one model call one step of the running flow. The engine
records the provider's whole answer under a key derived from the request, so a
resumed run reads the answer back instead of paying the provider again. The
agent loop's sealed model steps (`FlowEngineLike`'s `sealStep`) dispatch
through the same implementation.

## Call a model from a flow

`ModelStep.run` runs inside a flow body. It needs the request, the model that
serves it with that model's route, and a name for the step:

```ts
import { type FlowEngineLike, ModelStep } from "@smthrs/agent"
import { Flow, FlowRuntime } from "@smthrs/flow"
import { type Model, ModelEvent, ModelRequest } from "@smthrs/model"
import { Node } from "@smthrs/plan"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const Answer = Flow.make("chat/Answer", {
  payload: { question: Schema.String },
  success: Schema.String,
  error: ModelStep.Failure,
  body: () => Node.succeed("")
})

interface Provider {
  readonly model: Model.Model
  readonly route: FlowEngineLike.RouteResolver
}

const answer = ({ model, route }: Provider) => ({ question }: { readonly question: string }) =>
  Effect.gen(function*() {
    const result = yield* ModelStep.run({
      name: "chat/answer/model",
      request: ModelRequest.ModelRequest.make({
        modelId: "gpt-oss-120b",
        system: [ModelRequest.SystemPart.make({ text: "Answer in one sentence." })],
        messages: [ModelRequest.Message.user(question)],
        tools: [],
        params: ModelRequest.GenerationParams.make()
      }),
      model,
      route
    })
    if (result.error !== undefined) return `The model refused: ${result.error.code}`
    const { message } = ModelEvent.ModelEvent.settledMessage(result.events)
    return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")
  })

export const register = (provider: Provider) =>
  Effect.flatMap(FlowRuntime.FlowRuntime, (engine) => engine.register(Answer, answer(provider)))
```

`result.events` is the provider's answer as recorded. `result.error` is a
provider refusal the step sealed, such as `invalid_request` or
`context_overflow`. `result.replayed` says whether this run read the record
instead of calling the provider.

## Give it a model and its route

`model` and `route` are two views of one configured route. `route.prepare`
compiles a request into the credential-free bytes the step's key digests, and
`model` streams the same request with the credential applied:

```ts
import { FlowEngineLike } from "@smthrs/agent"
import { Route } from "@smthrs/model"
import * as Effect from "effect/Effect"

const provider = (configured: Route.Route<any, any, any, any>) =>
  Effect.map(Route.toModel(configured), (model) => ({
    model,
    route: FlowEngineLike.routeResolver(configured)
  }))
```

`Route.toModel` needs a `RequestExecutor`. Build both views from the same
configured route: a `route` that disagrees with `model` keys the step on bytes
the provider never receives.

## What the key covers

| In the key                                                         | Not in the key                                     |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| The step `name`                                                    | The credential, which is applied after preparation |
| The route id, protocol, method, URL and public headers             | The literal key order of the request               |
| The canonical body bytes the provider is sent                      | `retryPolicy`, `heartbeatTimeoutMs` and `onEvent`  |
| The encoded request: model id, history, system text, tools, params |                                                    |

The engine scopes the key to the execution unless the host declares a
complete cache environment. So within one execution a second call with the
same name and request reads the first call's record, and another execution
with an identical request makes a call of its own.

## What is retried

| What the provider does                                                                                                              | What the step does                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Drops the connection, ends the body without a settlement, or answers `transport` or `provider_internal`                             | Retries inside the step, up to five times over about thirty seconds, resending byte-identical bodies so the prompt prefix holds. |
| Refuses for capacity: `rate_limited`, `quota_exceeded`, `provider_internal` after the in-step retries, or HTTP 429, 503, 504 or 529 | Fails without sealing anything. `retryPolicy` decides whether the engine runs another attempt.                                   |
| Refuses the request: any other `ModelError`                                                                                         | Seals the refusal as `result.error`. A resumed run reads it back without asking again.                                           |
| Fails with a permission error                                                                                                       | Fails the step. The default policy never retries it.                                                                             |

`ModelStep.defaultRetryPolicy` waits one second, doubling to thirty, shaves up
to a fifth off each delay so steps refused together do not return together,
and gives up two minutes after the first attempt. When the policy gives up,
`ModelStep.run` fails with the last refusal, such as a `ModelError` whose
`code` is `rate_limited`.

## Liveness

Each attempt and each streamed event is a heartbeat. An attempt that streams
nothing for `heartbeatTimeoutMs`, sixty seconds by default, fails with
`Action.AttemptTimedOut`, and `retryPolicy` decides whether another runs. A
provider that thinks for a long time before its first token needs a larger
value.

## Stream the answer

`onEvent` receives each provider event while the call runs. An attempt that
follows a failed or cut-off one starts with a `retry` event, so fold events as
`ModelEvent.settledMessage` does and discard what came before a `retry`:

```ts
const streamed = Effect.gen(function*() {
  const live = yield* Queue.unbounded<ModelEvent.ModelEvent>()
  const result = yield* ModelStep.run({
    name: "chat/answer/model",
    request,
    model,
    route,
    onEvent: (event) => Effect.asVoid(Queue.offer(live, event))
  })
  return { live, result }
})
```

A replay hands `onEvent` the recorded events, so a consumer that rebuilds its
view on a resumed run sees the whole answer. `onEvent` runs inside the step: a
slow one delays the call, and its time counts against the heartbeat.

## When a process dies

| Where the process dies                | What the resumed run does                                                   |
| ------------------------------------- | --------------------------------------------------------------------------- |
| After the step sealed its answer      | Reads the record. The provider is not called again.                         |
| While the provider is still answering | Calls the provider again, and counts it in `agent_model_step_redispatches`. |
| After the whole execution settled     | Returns the settled result. The step does not run.                          |

A call cut off mid-flight is delivered at least once. The provider may have
finished and billed the first call, and nothing durable says so, so the
resumed run asks again. The repeat is counted and logged as a warning, and its
events start with a `retry` event whose `code` is `interrupted`.

## What it reports

A model step logs, traces and counts each call, and none of it carries the
prompt, the provider's error text, or a credential:

- **Span** `ModelStep`, with `smithers.model_step.name`,
  `gen_ai.request.model`, `smithers.model_step.outcome` (`sealed`,
  `sealed_error` or `replayed`) and `smithers.model_step.error_code`. A
  failure that crosses a span opened inside the step records only its tag and
  code.
- **Logs**, inside that span: `A model step's provider call ended` at debug
  level with `step`, `model`, `attempt`, `outcome` and `code`;
  `A model step replayed its recorded result` at debug level; and a warning
  when a cut-off call is made again.
- **Counters**: `agent_model_step_calls` by `step` and `outcome` (`sealed`,
  `sealed_error`, `refused`, `interrupted`, `failed`),
  `agent_model_step_replays` by `step`, and `agent_model_step_redispatches` by
  `step`.
