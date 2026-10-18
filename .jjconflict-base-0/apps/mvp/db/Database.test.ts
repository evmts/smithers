// The Postgres client layer, Hyperdrive's view of DATABASE_URL, and `pnpm db:migrate` (db/Database.ts, db/migrate.ts),
// against the compose Postgres in schemas of this file's own.
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { Effect, Logger, ManagedRuntime, Redacted, References } from "effect"
import { Migrator, SqlClient } from "effect/sql"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import * as Database from "./Database.ts"
import * as TestDatabase from "./TestDatabase.ts"

const runtime = ManagedRuntime.make(TestDatabase.layer("database"))
beforeAll(() => runtime.runPromise(Effect.void))
afterAll(() => runtime.dispose())

describe("hyperdrive", () => {
  test("splits DATABASE_URL into Hyperdrive's origin, URL-decoded, and asks for TLS when the URL does", () => {
    const { origin, sslmode } = Database.hyperdrive(
      Redacted.make("postgresql://app%40team:p%2Fss%20word@db.example.com/my%20db?sslmode=require"),
    )
    expect({ ...origin, password: Redacted.value(origin.password) }).toEqual({
      scheme: "postgres",
      host: "db.example.com",
      port: 5432,
      database: "my db",
      user: "app@team",
      password: "p/ss word",
    })
    expect(sslmode).toBe("require")
  })

  test("keeps the URL's port, and connects without TLS unless the URL requires it", () => {
    const { origin, sslmode } = Database.hyperdrive(
      Redacted.make("postgresql://smithers:smithers@localhost:54321/smithers?sslmode=prefer"),
    )
    expect(origin).toMatchObject({ host: "localhost", port: 54321, database: "smithers", user: "smithers" })
    expect(sslmode).toBe("disable")
  })
})

/** A schema of its own, empty, for as long as `use` runs, and the compose Postgres URL that connects with it. */
const emptySchema = async <A>(use: (url: string, schema: string) => Promise<A>) => {
  const schema = `cli_${crypto.randomUUID().replaceAll("-", "")}`
  await sql(`CREATE SCHEMA ${schema}`)
  try {
    const url = new URL("postgresql://smithers:smithers@localhost:54321/smithers")
    url.searchParams.set("options", `-c search_path=${schema}`)
    return await use(url.toString(), schema)
  } finally {
    await sql(`DROP SCHEMA ${schema} CASCADE`)
  }
}

const sql = (statement: string) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe(statement)))

/** Whether `schema` has `messages` (1 or 0), and the step its positions take (0 before it is migrated). */
const migrated = async (schema: string) => {
  const [found] = await sql(`
    SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname = '${schema}' AND tablename = 'messages') AS messages,
      (SELECT coalesce(max(increment_by), 0)::int FROM pg_sequences WHERE schemaname = '${schema}') AS step`)
  return found
}

describe("migrateAndReport", () => {
  test("applies what hasn't run and logs which, then logs that the database is up to date", () =>
    emptySchema(async (url) => {
      const lines: Array<{ readonly message: unknown; readonly applied: unknown }> = []
      const logger = Logger.make((options) => {
        const { applied } = options.fiber.getRef(References.CurrentLogAnnotations)
        lines.push({ message: options.message, applied })
      })
      const run = Database.migrateAndReport.pipe(
        Effect.provide(Database.layer(Effect.succeed(Redacted.make(url)))),
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      )
      await runtime.runPromise(run)
      await runtime.runPromise(run)
      expect(lines).toEqual([
        {
          message: ["db:migrate: applied"],
          applied: "1_messages, 2_answer_attempts, 3_paired_positions, 4_model_roles, 5_sign_in, 6_answer_parts, " +
            "7_repositories, 8_browser_answering, 9_clone_ids",
        },
        { message: ["db:migrate: up to date"], applied: "" },
      ])
    }))
})

describe("pnpm db:migrate", () => {
  const migrate = (url: string) =>
    promisify(execFile)(process.execPath, ["db/migrate.ts"], {
      cwd: fileURLToPath(new URL("..", import.meta.url).href),
      env: { ...process.env, DATABASE_URL: url },
    })

  test("applies every migration to an empty database once, then reports it up to date", () =>
    emptySchema(async (url, schema) => {
      const first = await migrate(url)
      expect(first.stdout).toContain("db:migrate: applied")
      expect(first.stdout).toContain("1_messages, 2_answer_attempts, 3_paired_positions, 4_model_roles")
      const second = await migrate(url)
      expect(second.stdout).toContain("db:migrate: up to date")
      expect(await migrated(schema)).toEqual({ messages: 1, step: 2 })
    }))
})

/** Applies the migrations up to and including `last` (`"0008"`) that haven't run. */
const through = (last: string) =>
  Migrator.make({})({
    loader: Migrator.fromRecord(
      Object.fromEntries(Object.entries(Database.migrations).filter(([name]) => name.slice(0, 4) <= last)),
    ),
  })

describe("0008_browser_answering", () => {
  test("fails what ChatApi left streaming, drops its attempts and sweep index, and indexes the turn wait", () =>
    emptySchema(async (url, schema) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      const earlier = Object.fromEntries(Object.entries(Database.migrations).filter(([name]) => name < "0008"))
      await on(Migrator.make({})({ loader: Migrator.fromRecord(earlier) }))
      // What ChatApi left: an answer it was still streaming on its first attempt, and one it finished.
      const [stuck, finished] = [crypto.randomUUID(), crypto.randomUUID()]
      const [asked, done] = [crypto.randomUUID(), crypto.randomUUID()]
      await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO messages (id, role, text, status) VALUES
          (${asked}, 'user', 'Still there?', 'done'), (${done}, 'user', 'Hello', 'done')`
        yield* sql`INSERT INTO messages (id, role, text, status, question_id, attempts) VALUES
          (${stuck}, 'assistant', 'Half an', 'streaming', ${asked}, 1),
          (${finished}, 'assistant', 'Hi.', 'done', ${done}, 1)`
      }))

      const applied = await on(through("0008"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["8_browser_answering"])
      const rows = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly id: string; readonly status: string; readonly failure: string | null; readonly text: string }>`
          SELECT id, status, failure, text FROM messages WHERE role = 'assistant' ORDER BY position`))
      expect(rows).toEqual([
        { id: stuck, status: "failed", failure: "abandoned", text: "Half an" },
        { id: finished, status: "done", failure: null, text: "Hi." },
      ])
      const [columns] = await sql(`
        SELECT count(*)::int AS attempts FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'messages' AND column_name = 'attempts'`)
      expect(columns).toEqual({ attempts: 0 })
      const indexes = await sql(`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = '${schema}' AND indexname LIKE 'messages_streaming%' ORDER BY indexname`)
      expect(indexes).toEqual([
        {
          indexname: "messages_streaming_position",
          indexdef: `CREATE INDEX messages_streaming_position ON ${schema}.messages USING btree ("position") ` +
            `WHERE (status = 'streaming'::text)`,
        },
      ])
    }))
})

describe("0009_clone_ids", () => {
  test("gives every row an attempt id of its own, and fails the clones started under the counter", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0008"))
      // A clone still running under the counter, one ready and one failed.
      await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO repositories (id, owner, name, status, stored_bytes) VALUES
          ('github/a/cloning', 'a', 'cloning', 'cloning', 10)`
        yield* sql`INSERT INTO repositories (id, owner, name, status, head_sha, settled_at) VALUES
          ('github/a/ready', 'a', 'ready', 'ready', ${"a".repeat(40)}, now())`
        yield* sql`INSERT INTO repositories (id, owner, name, status, failure, attempt, settled_at) VALUES
          ('github/a/failed', 'a', 'failed', 'failed', 'not_found', 3, now())`
      }))

      const applied = await on(through("0009"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["9_clone_ids"])
      const rows = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{
          readonly id: string
          readonly status: string
          readonly failure: string | null
          readonly attempt: number
          readonly settled: boolean
          readonly cloneId: string
        }>`
          SELECT id, status, failure, attempt, settled_at IS NOT NULL AS settled, clone_id::text AS "cloneId"
          FROM repositories ORDER BY id`))
      expect(rows.map(({ cloneId: _, ...row }) => row)).toEqual([
        { id: "github/a/cloning", status: "failed", failure: "unavailable", attempt: 1, settled: true },
        { id: "github/a/failed", status: "failed", failure: "not_found", attempt: 3, settled: true },
        { id: "github/a/ready", status: "ready", failure: null, attempt: 1, settled: true },
      ])
      // A new row draws its own id too; none repeats.
      const [added] = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly cloneId: string }>`
          INSERT INTO repositories (id, owner, name, status) VALUES ('github/a/new', 'a', 'new', 'cloning')
          RETURNING clone_id::text AS "cloneId"`))
      const ids = [...rows.map((row) => row.cloneId), added!.cloneId]
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      expect(new Set(ids).size).toBe(4)
    }))
})
