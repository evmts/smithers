---
"@smthrs/platform-cloudflare": patch
---

Every `cloudflare.execution.start` line names its execution and flow as
`smithers.execution.id` and `smithers.flow`, as its span and the alarm line
already did; never the payload. A `Retrying` alarm whose database connection
was lost or refused adds the driver's text for it as `db.error.message`, such
as `PgConnection: Connection closed`, beside `db.error`.
