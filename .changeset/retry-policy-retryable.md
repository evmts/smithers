---
"@smthrs/flow": minor
---

`RetryPolicy.make({ retryable })` lists the only failures a policy retries, each an error tag and optionally the
`code` it carries, so a tag shared by transient and terminal failures (a provider's `ModelError`) can retry only its
transient codes. `nonRetryable` and `defaultNonRetryable` still win. A policy without `retryable` classifies exactly as
before.
