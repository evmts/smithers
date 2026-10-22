/**
 * Standard metric definitions for the durable write boundary.
 *
 * This module only defines the metric handles, following the shape of Effect's
 * `ClusterMetrics`. `DurableWriter`'s retry policy updates them, so every
 * store that writes through the boundary — journal, run store, step cache,
 * engine state — lands in the same counter. No exporter ships in this
 * package; provide one — for example `@smthrs/observability` — and the
 * counter appears in it.
 *
 * @since 0.1.0
 */

import * as Metric from "effect/Metric"

/**
 * Counter over write transaction replays. Incremented once per scheduled
 * retry of a recognized transient conflict (`SQLITE_BUSY`, serialization
 * failure, deadlock), so a quiet system reads zero and a rising rate reads as
 * write contention. The attempt that finally fails past the retry budget is
 * not counted; it surfaces on the error channel instead.
 *
 * @category metrics
 * @since 0.1.0
 */
export const writeRetries = Metric.counter("flows_db_write_retries", {
  description: "Durable write transaction replays after transient conflicts"
})

/**
 * Timer over how long a PostgreSQL write waited for its schema's writer
 * lock, from its first attempt to holding the lock, across every wait that
 * ran out and every backoff between them. A writable
 * `PostgresDatabase` client records one observation per transaction it
 * begins: each outermost `DurableWriter.write` and each `withTransaction`.
 * Writes to one schema commit one at a time, so a rising wait reads as that
 * schema's write throughput binding. Read-only clients, statements outside
 * a transaction, and SQLite record nothing here.
 *
 * @category metrics
 * @since 1.0.0
 */
export const writerLockWait = Metric.timer("flows_db_writer_lock_wait", {
  description: "Time a PostgreSQL durable write waited for its schema's writer lock"
})

/**
 * Counter over PostgreSQL writer-lock waits that reached their client's
 * `writerLockTimeout`. Each such wait rolled its transaction back, letting
 * its server connection go, and the write tried again after a backoff. A
 * quiet system reads zero; a rising rate reads as a queue of writers longer
 * than the timeout covers, which `writerLockWait` then shows as wait time.
 *
 * @category metrics
 * @since 1.0.0
 */
export const writerLockTimeouts = Metric.counter("flows_db_writer_lock_timeouts", {
  description: "PostgreSQL writer-lock waits that reached the timeout and released their server connection",
  incremental: true
})

/**
 * Timer over how long a `PostgresDatabase` statement or transaction waited
 * for a connection from its pool, one observation per wait. A wait that runs
 * past the client's `acquireWarning` also logs `postgres.connection.waiting`
 * while it waits. A rising wait reads as a pool too small for the work sent
 * through it, or as a pooler that grants no server connection.
 *
 * @category metrics
 * @since 1.0.0
 */
export const connectionWait = Metric.timer("flows_db_connection_wait", {
  description: "Time a PostgreSQL statement or transaction waited for a pooled connection"
})

/**
 * Counter over `PostgresDatabase` connections that would not open or log in:
 * a refused or timed-out connection, or a refused login. Each also logs a
 * `postgres.login.failed` warning with the error's kind. A quiet system reads
 * zero; a rising rate reads as a server or pooler refusing clients, such as a
 * compute out of connections.
 *
 * @category metrics
 * @since 1.0.0
 */
export const loginFailures = Metric.counter("flows_db_login_failures", {
  description: "PostgreSQL connections that failed to open or log in",
  incremental: true
})
