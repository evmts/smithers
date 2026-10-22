/**
 * Journal-driven progress for a run whose action attempt is still working.
 * @since 1.0.0
 */

import * as Dialect from "@smthrs/database/Dialect"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"

/**
 * Advances the existing revision feed at most once per two seconds per run
 * from journal inserts, in the same transaction as the inserted event.
 * @category migrations
 * @since 1.0.0
 */
export const runProgress: Effect.Effect<void, unknown, SqlClient.SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ALTER TABLE flows_runs ADD COLUMN progress_at_ms ${Dialect.integer(sql)}`
  // Statement time stays fixed across both expressions and ignores event time.
  const now = Dialect.isPostgres(sql)
    ? "CAST(floor(extract(epoch FROM statement_timestamp()) * 1000) AS BIGINT)"
    : "CAST(unixepoch('subsec') * 1000 AS INTEGER)"
  yield* Dialect.trigger(sql, {
    name: "flows_journal_run_progress",
    table: "flows_journal_events",
    event: "AFTER INSERT",
    body: `UPDATE flows_runs SET progress_at_ms = ${now}
      WHERE run_id = NEW.run_id
        AND (progress_at_ms IS NULL OR progress_at_ms <= ${now} - 2000);`
  })
})
