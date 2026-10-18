/**
 * Durable writes per second through PostgreSQL's per-schema writer lock.
 *
 * Every `DurableWriter.write` on `PostgresDatabase` takes the schema's
 * transaction-scoped advisory lock, so writes to one schema commit one at a
 * time however many processes send them. Each writer here is a separate
 * client with one connection, the way separate Workers or Durable Objects
 * write, and each write inserts one row in its own transaction. The cases:
 *
 * - one writer on one schema: the latency floor of a write;
 * - sixteen writers on one schema: the lock's ceiling;
 * - sixteen writers on sixteen schemas: no shared lock, bounded by the
 *   server connections the pooler grants (four on the compose PgBouncer).
 *
 * Writes per second is the reported rate times the writes per iteration
 * (1 or 16); the line printed after each case states it. Endpoints are the
 * compose PgBouncer (`pool_mode=transaction`, 127.0.0.1:54322) and, beside it,
 * the compose PostgreSQL it fronts (127.0.0.1:54321).
 *
 * Run: `docker compose up -d postgres pgbouncer` in apps/mvp, then
 * `pnpm --filter @smthrs/database bench`.
 */
import * as Pg from "@effect/sql-pg"
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { SqlClient } from "effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import { afterAll, describe, test, type TestContext } from "vitest"
import { DurableWriter, PostgresDatabase } from "../src/index.ts"
import * as TestDatabase from "../src/test/TestDatabase.ts"
import { listening, pgbouncerUrl } from "./harness/listening.ts"

const endpoints = [
  { name: "PgBouncer pool_mode=transaction", url: pgbouncerUrl },
  { name: "PostgreSQL", url: "postgres://smithers:smithers@127.0.0.1:54321/smithers" }
]

const scope = Effect.runSync(Scope.make())
afterAll(() => Effect.runPromise(Scope.close(scope, Exit.void)))

/** One writer: its own one-connection client on `schema`, and a table to insert into. */
const writer = (url: string, schema: string) =>
  Effect.runPromise(Effect.gen(function*() {
    const sql = Context.get(
      yield* Layer.buildWithScope(
        PostgresDatabase.layer({ url, driver: Pg, schema, postgres: { maxConnections: 1 } }),
        scope
      ),
      SqlClient
    )
    yield* sql`CREATE TABLE IF NOT EXISTS writes (id BIGINT GENERATED ALWAYS AS IDENTITY, writer TEXT NOT NULL)`
    yield* Scope.addFinalizer(scope, TestDatabase.dropSchema(sql, schema).pipe(Effect.orDie))
    const durable = DurableWriter.make(sql)
    const name = randomUUID()
    return durable.write(sql`INSERT INTO writes (writer) VALUES (${name})`)
  }))

const name = () => `bench_${randomUUID().replaceAll("-", "")}`

for (const endpoint of endpoints) {
  const up = await listening(endpoint.url)
  describe.skipIf(!up)(`${endpoint.name} (${new URL(endpoint.url).host})`, () => {
    const measure = async (
      bench: TestContext["bench"],
      label: string,
      writes: ReadonlyArray<Effect.Effect<void, DurableWriter.DatabaseError>>
    ) => {
      const all = Effect.all(writes, { concurrency: "unbounded", discard: true })
      const result = await bench(label, () => Effect.runPromise(all)).run()
      console.log(`${endpoint.name}, ${label}: ${Math.round(result.throughput.mean * writes.length)} writes/s`)
    }

    test("one writer, one schema", async ({ bench }) => {
      await measure(bench, "1 writer, 1 schema", [await writer(endpoint.url, name())])
    })

    test("sixteen writers, one schema", async ({ bench }) => {
      const schema = name()
      const writers = []
      // One at a time: concurrent CREATE TABLE IF NOT EXISTS in one schema can collide.
      for (let index = 0; index < 16; index++) writers.push(await writer(endpoint.url, schema))
      await measure(bench, "16 writers, 1 schema", writers)
    })

    test("sixteen writers, sixteen schemas", async ({ bench }) => {
      const writers = await Promise.all(Array.from({ length: 16 }, () => writer(endpoint.url, name())))
      await measure(bench, "16 writers, 16 schemas", writers)
    })
  })
}
