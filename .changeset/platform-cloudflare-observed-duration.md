---
"@smthrs/platform-cloudflare": patch
---

`cloudflare.sandbox.wake`, `cloudflare.sandbox.rearm` and `cloudflare.terminal.session` log lines now say how long the
operation took (`durationMs`), so a slow container start says so in the records. Spans are unchanged.
