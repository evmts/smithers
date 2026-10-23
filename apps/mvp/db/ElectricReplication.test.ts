import { PgClient } from "@effect/sql-pg"
import { Context, Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { expect, test } from "vitest"
import * as ElectricReplication from "./ElectricReplication.ts"
import * as TestDatabase from "./TestDatabase.ts"

// The restart itself (`restarted`, `none`, `NotStreaming`) runs only as the suite's global setup (vitest.config.ts),
// before any test: inside the suite this file's own run holds the lock, so it can't be exercised here. Here this suite holds the
// suites' lock and a test's schema is connected, as another suite's would be: `fresh` leaves Electric's replication.
test("while another suite runs, Electric's replication connection is left as it is", async () => {
  const outcome = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const scratch = yield* Layer.build(TestDatabase.layer("electric_replication"))
        yield* Context.get(scratch, SqlClient.SqlClient)`SELECT 1`
        const server = yield* TestDatabase.serverUrl
        const admin = yield* Layer.build(PgClient.layer({ url: Redacted.make(server.toString()), maxConnections: 1 }))
        const sql = Context.get(admin, SqlClient.SqlClient)
        const walsenders = sql<{ readonly pid: number }>`
          SELECT pid FROM pg_stat_activity WHERE backend_type = 'walsender' AND datname = current_database()`
        const before = yield* walsenders
        const outcome = yield* ElectricReplication.fresh(sql)
        expect(yield* walsenders).toEqual(before)
        return outcome
      }),
    ),
  )
  expect(outcome).toBe("in-use")
})
