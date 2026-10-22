---
"@smthrs/engine-store": patch
"@smthrs/platform-cloudflare": patch
---

Add persist-only hosted admission and composed execution-object cancellation. Cancellation records a durable tombstone before engine interruption, prevents delayed admission, survives retention, and releases active or parked runs through the engine. Hosts can fence first admission with an injected domain check. Cancellation failures report sanitized telemetry.
