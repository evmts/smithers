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
            "7_repositories, 8_browser_answering, 9_clone_ids, 10_views, 11_question_askers, 12_model_reservations, " +
            "13_runs, 14_branch_workspace, 15_flows, 16_github_issues, 17_model_charges",
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

describe("0010_views", () => {
  test("adds views that sit among the messages by the conversation's own sequence, never on a message's position", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0009"))
      const [question, answer, view, refused] = [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ]
      // A question and its answer before the table exists.
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`
          WITH q AS (INSERT INTO messages (id, role, text, status) VALUES (${question}, 'user', 'Hi', 'done') RETURNING position)
          INSERT INTO messages (id, role, status, question_id, position) OVERRIDING SYSTEM VALUE
          SELECT ${answer}, 'assistant', 'streaming', ${question}, position + 1 FROM q`))

      const applied = await on(through("0010"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["10_views"])
      const [added] = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly position: string }>`
          INSERT INTO views (id, template, props) VALUES (${view}, 'webpage', '{"url":"https://example.com/"}')
          RETURNING position::text AS position`))
      const positions = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly position: string }>`SELECT position::text AS position FROM messages ORDER BY position`))
      // After the answer, on a position no message holds.
      expect(Number(added!.position)).toBeGreaterThan(Number(positions.at(-1)!.position))
      expect(positions.map((row) => row.position)).not.toContain(added!.position)
      // Only the two templates, and props that are an object.
      const rejected = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        Effect.all([
          Effect.flip(sql`INSERT INTO views (id, template, props) VALUES (${refused}, 'iframe', '{}')`),
          Effect.flip(sql`INSERT INTO views (id, template, props) VALUES (${refused}, 'link', '[]')`),
        ])))
      expect(rejected.map((error) => error.reason._tag)).toEqual(["ConstraintError", "ConstraintError"])
    }))
})

describe("0011_question_askers", () => {
  test("adds the asker to questions only, and fails the answers no one may write any more", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0010"))
      // Before askers: one answer still streaming, one finished.
      const [asked, stuck, done, finished] = [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ]
      await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO messages (id, role, text, status) VALUES
          (${asked}, 'user', 'Still there?', 'done'), (${done}, 'user', 'Hello', 'done')`
        yield* sql`INSERT INTO messages (id, role, text, status, question_id) VALUES
          (${stuck}, 'assistant', 'Half an', 'streaming', ${asked}),
          (${finished}, 'assistant', 'Hi.', 'done', ${done})`
      }))

      const applied = await on(through("0011"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["11_question_askers"])
      const rows = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly id: string; readonly status: string; readonly failure: string | null; readonly askedBy: null }>`
          SELECT id, status, failure, asked_by AS "askedBy" FROM messages ORDER BY position`))
      expect(rows).toEqual([
        { id: asked, status: "done", failure: null, askedBy: null },
        { id: done, status: "done", failure: null, askedBy: null },
        { id: stuck, status: "failed", failure: "abandoned", askedBy: null },
        { id: finished, status: "done", failure: null, askedBy: null },
      ])
      // A question records its asker; an answer can't.
      const [question, answer] = [crypto.randomUUID(), crypto.randomUUID()]
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`INSERT INTO messages (id, role, text, status, asked_by) VALUES (${question}, 'user', 'Mine', 'done', 'p-1')`))
      const refused = await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`INSERT INTO messages (id, role, status, question_id, asked_by)
          VALUES (${answer}, 'assistant', 'streaming', ${question}, 'p-1')`)))
      expect(refused.reason._tag).toBe("ConstraintError")
    }))
})

describe("0012_model_reservations", () => {
  test("settles every earlier call, seeds each day's counter from them, and keeps the counter from going negative", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0011"))
      // Three calls metered before reservations: two today (UTC), one two days ago.
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`
          INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens, created_at)
          VALUES ('a', 'r', 'agent', 'm', 10, 5, now()), ('b', 'r', 'agent', 'm', 1, 2, now()),
            ('c', 'r', 'judge', 'm', 100, 0, now() - interval '2 days')`))

      const applied = await on(through("0012"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["12_model_reservations"])
      const rows = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly id: string; readonly days: number; readonly reserved: number; readonly settled: boolean }>`
          SELECT invocation_id AS id, ((now() AT TIME ZONE 'UTC')::date - day) AS days, reserved_tokens AS reserved,
            settled_at = created_at AS settled
          FROM model_usage ORDER BY invocation_id`))
      expect(rows).toEqual([
        { id: "a", days: 0, reserved: 0, settled: true },
        { id: "b", days: 0, reserved: 0, settled: true },
        { id: "c", days: 2, reserved: 0, settled: true },
      ])
      const counters = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly days: number; readonly committed: string }>`
          SELECT ((now() AT TIME ZONE 'UTC')::date - day) AS days, committed::text AS committed
          FROM model_budget_days ORDER BY day DESC`))
      expect(counters).toEqual([{ days: 0, committed: "18" }, { days: 2, committed: "100" }])
      const refused = await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`UPDATE model_budget_days SET committed = -1`)))
      expect(refused.reason._tag).toBe("ConstraintError")
    }))
})

describe("0017_model_charges", () => {
  test("charges each earlier call what it settled to, or its reservation while open, and expires it after an hour", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0016"))
      // One call settled to 15 of the 100 it reserved, and one still open with 40 reserved.
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`
          INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens, day,
            reserved_tokens, settled_at)
          VALUES ('settled', 'r', 'agent', 'm', 10, 5, (now() AT TIME ZONE 'UTC')::date, 100, now()),
            ('open', 'r', 'agent', 'm', 0, 0, (now() AT TIME ZONE 'UTC')::date, 40, NULL)`))

      const applied = await on(through("0017"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["17_model_charges"])
      const rows = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly id: string; readonly charged: number; readonly expiresInSeconds: number }>`
          SELECT invocation_id AS id, charged_tokens AS charged,
            extract(epoch FROM expires_at - created_at)::int AS "expiresInSeconds"
          FROM model_usage ORDER BY invocation_id`))
      expect(rows).toEqual([
        { id: "open", charged: 40, expiresInSeconds: 3_600 },
        { id: "settled", charged: 15, expiresInSeconds: 3_600 },
      ])
      const refused = await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`UPDATE model_usage SET charged_tokens = -1`)))
      expect(refused.reason._tag).toBe("ConstraintError")
    }))
})
