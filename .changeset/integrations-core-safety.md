---
"@smthrs/integrations": major
---

Make all PKCE helpers lazy Effects with typed validation failures, and require HTTPS for remote authorization endpoints. Omit raw webhook decoder errors from logs and do not coalesce events without correlation IDs. Order decimal and opaque version tokens transitively.

`Source.runWithCursor` now requires a flow execution and journals polling, handling, and cursor commits, with durable timers between turns. Replace `schedule` with `intervalMs` and optional `maxTurns`; `DEFAULT_SCHEDULE` is removed. Poll and handler failures use `IntegrationError` so they can be journaled. Provide a persistent host and cursor store in production and key the enclosing orchestration action for recovery.
