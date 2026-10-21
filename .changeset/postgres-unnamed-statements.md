---
"@smthrs/database": patch
---

`PostgresDatabase.layer` sends every statement unnamed. `@effect/sql-pg`
otherwise prepares statements by name, keeps 100 per connection and closes the
oldest with a protocol `Close` message, and Cloudflare Hyperdrive drops the
connection on that message: the 101st distinct statement on one connection
failed with `PgConnection: Connection closed`. The flow engine's schema, about
110 statements in one transaction, therefore never installed behind Hyperdrive.

`PostgresDatabaseOptions.postgres` no longer accepts `prepare` or
`preparedStatementCacheSize`.
