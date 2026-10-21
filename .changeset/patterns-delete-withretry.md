---
"@smthrs/patterns": major
"@smthrs/migrate": patch
---

`WithRetry` is deleted. It restated the engine's `RetryPolicy`, and
`WithRetry.retryEffect` retried and backed off in a fiber, so a crash lost the
attempt count (DUR-2). Declare a retry as the `retryPolicy` of the action that
can fail; the engine records every attempt and resumes the ladder after a
crash.

```ts
// Before
const retried = WithRetry.withRetry(Search, { attempts: 3, backoff: { initialMs: 100, factor: 2, maxMs: 1_000 } })
// After
const Search = Action.make("search", {
  payload: { query: Schema.String },
  success: Schema.String,
  error: Throttled,
  retryPolicy: RetryPolicy.make({ initialMs: 100, factor: 2, maxMs: 1_000, maxAttempts: 3 })
})
```

`DelegationChain` loses `maxAttempts`, `backoff` and `nonRetryable`. It calls
each tier once and escalates when the tier fails or its review rejects it; a
tier retries through its own actions' `retryPolicy`. `DelegationChain.bound` is
now `4 + 2 * maxDeriskRounds + maxDepth * 2 * tierOrder.length`.

`@smthrs/migrate` teaches `retries={n}` as an action's `retryPolicy`.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
