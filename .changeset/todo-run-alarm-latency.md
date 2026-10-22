---
"@smthrs/platform-cloudflare": patch
---

Wake repeated starts immediately and cap host failure backoff at five seconds so recovered capacity is retried promptly. Flow action retry policies are unchanged.
