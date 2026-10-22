---
"@smthrs/database": minor
---

A `PostgresDatabase` write waits for its schema's writer lock at most
`writerLockTimeout` at a time (2 seconds by default,
`PostgresDatabase.defaultWriterLockTimeout`). A wait that runs out rolls the
transaction back, letting its server connection go, counts once in the new
`DatabaseMetrics.writerLockTimeouts` counter (`flows_db_writer_lock_timeouts`),
and tries again after a jittered backoff from half the timeout to four times
it. The limit is `SET LOCAL lock_timeout`, so any lock the write waits on
longer afterwards fails with `lock_not_available`, which `DurableWriter`
retries.

Writers used to wait without limit inside their transaction, each holding a
server connection. Behind Cloudflare Hyperdrive, a queue of writers as long as
the configuration's origin connections held them all, and Hyperdrive closed
every other client after 15 seconds without one: flow alarms failed with
`PgConnection: Connection closed` under load. `writerLockWait` now times a
write's whole wait, every backoff included.

A wait for a pooled connection is timed by the new `DatabaseMetrics.connectionWait`
timer (`flows_db_connection_wait`), and one that runs past `acquireWarning` (10
seconds by default, `PostgresDatabase.defaultAcquireWarning`) logs a
`postgres.connection.waiting` warning while it waits. The wait keeps the
caller's interruptibility, so a finalizer's write still commits after its
caller is interrupted.

A connection that is refused or times out while opening, or whose login the
server refuses, counts in the new `DatabaseMetrics.loginFailures` counter
(`flows_db_login_failures`) and logs a `postgres.login.failed` warning with
its kind.
