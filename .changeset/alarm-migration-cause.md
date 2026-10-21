---
"@smthrs/platform-cloudflare": patch
---

A `Retrying` alarm names a failed schema migration's cause. `Outcome`'s
`Retrying` case gains `detail`, which the `cloudflare.execution.alarm` line
and span also carry:

- any failure that reached the database: `db.error`, the SQL error's kind, and
  `db.response.status_code`, its SQLSTATE code;
- a `MigrationError`: also `db.migration` (`<id>_<name>`), `db.migration.kind`,
  `error.message`, `db.query.text` (the statement that failed) and
  `db.error.message` (the database's message, left out for a data exception,
  SQLSTATE class `22`).

A flow's own failure still logs its tag only. Every `cloudflare.execution.alarm`
line now also carries `smithers.execution.id` and `smithers.flow`, as its span
already did.
