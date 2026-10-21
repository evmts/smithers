---
"@smthrs/notifications": patch
---

Documents how a step declares a send's guarantee: each send in its own `irreversible` step, at least once with an
`idempotencyKey` (a Telegram message can arrive twice) or at most once without one.
