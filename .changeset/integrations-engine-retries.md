---
"@smthrs/integrations": major
"@smthrs/cli": patch
---

The flow engine is now the only retry. `GitHubClient` and `OAuthToken` make
one request per call and never repeat it, so a retry survives a crash and one
GitHub write makes at most three requests, not up to twelve.

- A failure says what the engine needs: `details.retryable`, and
  `details.retryAfterMillis` from a 429's or a secondary rate limit's
  `Retry-After` (or `x-ratelimit-reset`), or a 5xx's `Retry-After`, capped at
  one minute. The field is named as `RetryPolicy.decide` reads it.
- `Core.ActionFailure.Failure` is what an action declares as its `error`:
  `RetryableIntegrationFailure` (tag `/integrations/RetryableIntegrationFailure`)
  for a failure another attempt may clear, carrying `retryAfterMillis`, and
  `IntegrationFailure` for every other. `Core.ActionFailure.retryPolicy` lists
  `IntegrationFailure` as non-retryable, so a 404 or a 422 is reported at once.
  `fromIntegrationError(error, { reconciles: true })` makes a lost write
  retryable for a step that reads before it writes.
- The GitHub write-back actions use that policy: at most three attempts,
  waiting the server's `Retry-After`. `CommentOnIssue` is never retried; a rate
  limit fails `RetryableIntegrationFailure` with `retryAfterMillis`.
- `maxRetries` is removed from `GitHubConfig` and `OAuthToken.Endpoint`.
  `GitHubClient.request`'s span no longer records `http.attempts`.
- `OAuthToken` no longer sleeps and re-reads the store after a refused
  rotation. An `invalid_grant` fails `retryable` `permission-denied`, with
  `retryAfterMillis: 0` when another source already rotated the stored token
  and `ROTATION_SETTLE_MS` (500) when it may still be persisting it; the step's
  next attempt presents the stored token.

A caller outside a flow step now gets one attempt. Run the call as a durable
step instead:

```ts
const Comment = Action.make("app/comment", {
  payload: CommentPayload,
  success: Schema.Unknown,
  error: Core.ActionFailure.Failure,
  idempotencyKey: (payload) => payload,
  retryPolicy: Core.ActionFailure.retryPolicy
})
// Before
GitHub.GitHubClient.make({ token, maxRetries: 3 })
// After
GitHub.GitHubClient.make({ token })
```

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
