---
"@smthrs/notifications": minor
---

Add `Channels`: send one short message by email (Resend, with the message id as its idempotency key) or to a Telegram chat (the Bot API), through `Channels.layer({ email, telegram, timeout })`. Every failure is classified once: `DeliveryFailed` (`unreachable`, `timeout`, `unavailable`, `rate_limited` with the provider's wait as `retryAfterMillis`) for the flow engine to retry, and `DeliveryRefused` (`rejected`, `unauthorized`, `unconfigured`) to record. Neither failure, nor the send's span, carries the request, a credential or the destination; redirects are never followed.
