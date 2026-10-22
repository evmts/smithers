---
"@smthrs/platform-cloudflare": patch
---

Guard a SQL error's reason when the bounded cause chain ends at that error.
Alarm diagnostics no longer throw when a `SqlError` is the eighth element.
Migration diagnostics retain their existing messages, failed statement and
URL-userinfo redaction.
