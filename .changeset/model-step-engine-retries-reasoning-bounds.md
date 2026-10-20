---
"@smthrs/agent": major
"@smthrs/model": minor
---

`ModelStep.run` retries in one place, its `retryPolicy`, and gives a model that
reasons time to think.

- **One retry decision.** The step makes one HTTP request per attempt and
  retries nothing itself. It provides the new `RequestExecutor.Retries`
  reference as 0, so the route's executor repeats nothing either. A dropped
  connection, `transport`, `provider_internal` and every capacity refusal fail
  the attempt unsealed, and the engine's policy waits the provider's
  `Retry-After`. An overloaded provider used to get six calls in 45 seconds
  inside each step attempt, Retry-After ignored, and three requests for each
  call from the executor, all multiplied by the policy's own retries: up to
  about 72 requests for one `run`. It now gets one per policy attempt.
- **`defaultRetryPolicy` counts attempts.** At most six attempts, waiting one
  second and doubling, with a provider's `Retry-After` up to 30 seconds. The
  two-minute window is gone: it counted from the first attempt, so it
  forbade any retry of a long reasoning call that dropped its connection late.
- **Bounds by reasoning effort.** `heartbeatTimeoutMs` defaults to
  `ModelStep.heartbeatTimeoutMsFor(request.params.reasoningEffort)`: 60 s at
  `none`, `minimal` and `low`, 300 s when unset and at `medium` and `high`, and
  no bound at `xhigh` and `max`. The new `callTimeoutMs` option defaults to
  `ModelStep.callTimeoutMsFor(effort)`, the agent loop's 300 s, 900 s and
  1,800 s ceilings. A call past it is sealed as a `call_timeout` error and not
  retried. Zero disarms either bound.
- **`RequestExecutor.Retries`** is a new context reference: the retries a
  caller allows each request, overriding the executor's `maxRetries`.
- **Keep-alives are heartbeats.** `Model.Liveness` is a new context reference
  that a route runs for every chunk of response bytes, including a keep-alive
  comment or ping that decodes to no event. `ModelStep` provides its heartbeat
  there, so a provider that thinks in silence but keeps its connection open is
  not cut off.

`ModelStep.defaultHeartbeatTimeoutMs` is removed:

```ts
// Before
ModelStep.run({ name, request, model, route, heartbeatTimeoutMs: ModelStep.defaultHeartbeatTimeoutMs })
// After
ModelStep.run({ name, request, model, route, heartbeatTimeoutMs: ModelStep.heartbeatTimeoutMsFor("low") })
```

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
