---
"@smthrs/agent": major
---

The agent loop's model steps retry a transient provider failure on the durable engine, as `ModelStep.run` already did,
instead of in a schedule inside the step.

- **Durable attempts.** Each engine attempt makes one provider call. The attempt number, its backoff and what each
  failed attempt cost now survive a process restart: a restart used to start the in-step schedule over at attempt 1,
  and the failed calls' usage was held in memory until the step settled, so a killed process lost it. Each failed
  attempt is charged once, as it ends, under its own usage receipt; the sealed record carries only the last attempt's
  usage.
- **`modelRetryPolicy` is a `RetryPolicy`.** `Agent.Options`, `AgentAction.Host` and `FlowEngineLike.Options` take an
  engine `RetryPolicy` from `@smthrs/flow` in place of a `Schedule`. It must bound `maxAttempts`; `FlowEngineLike.make`
  dies with a `RangeError` otherwise.
- **`FlowEngineLike.defaultModelRetryPolicy`** waits one second, doubles to 16 s, makes at most six attempts with
  `jitterRatio` 0.2, and waits a provider's `Retry-After` when it names one. It retries only `transport` and
  `provider_internal` (`RetryPolicy.retryable`), so a rate limit or a spent quota reaches the loop at once. The 45 s
  wall-clock window is gone. The last attempt seals a `transport` failure as the step's value, so a replay answers it
  without a provider call; a `provider_internal` refusal still reaches the loop unsealed.
- **Re-issues stay inside an attempt.** A call cut off at `modelCallMs`, re-sent with the overrun teaching, and a call
  cut off for silence are each re-issued once, at once, inside the attempt, then sealed. A provider's own
  `call_timeout` is sealed without a re-issue.
- **Retry events.** A `retry` event, and the `model-retried` agent event it becomes, names the engine attempt it starts:
  the first retry is attempt 2.

`defaultModelRetryBaseMillis`, `defaultModelRetryFactor`, `defaultModelRetryTimes` and `defaultModelRetryWindowMillis`
are removed:

```ts
// Before
Agent.run({ ...options, modelRetryPolicy: Schedule.recurs(0) })
// After
Agent.run({ ...options, modelRetryPolicy: RetryPolicy.make({ initialMs: 1, factor: 1, maxMs: 1, maxAttempts: 1 }) })
```

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
