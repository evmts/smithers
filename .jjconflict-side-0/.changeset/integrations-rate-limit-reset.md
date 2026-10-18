---
"@smthrs/integrations": minor
---

A spent GitHub rate limit's error now carries `rateLimitResetAt` in its
`details`: `x-ratelimit-reset` as epoch milliseconds, uncapped, so a caller can
tell a person when GitHub answers again. `retryAfterMillis` stays the capped
wait a step's retry policy honors.
