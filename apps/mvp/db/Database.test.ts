// The Postgres client layer, Hyperdrive's view of DATABASE_URL, and `pnpm db:migrate` (db/Database.ts, db/migrate.ts),
// against the compose Postgres in schemas of this file's own.
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { Effect, Logger, ManagedRuntime, Redacted, References } from "effect"
import { Migrator, SqlClient } from "effect/sql"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { digestSync } from "@smthrs/crypto"
import { readGenerated, renderSource } from "../src/features/flows-ui/source.ts"
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

describe("layer", () => {
  test("prepares no statement by name, past the hundred a connection's statement cache keeps", async () => {
    const marker = `prepared_${crypto.randomUUID().replaceAll("-", "")}`
    const held = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        for (let index = 0; index < 150; index++) yield* sql.unsafe(`SELECT ${index} AS ${marker}`)
        return yield* sql<{ readonly count: number }>`SELECT count(*)::int AS count FROM pg_prepared_statements
          WHERE statement LIKE ${`%${marker}%`}`
      }).pipe(Effect.provide(Database.layer(Effect.succeed(Redacted.make(Database.LOCAL_URL))))),
    )
    expect(held).toEqual([{ count: 0 }])
  })
})

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
          // Every migration the migrator loads, in order, as `<id>_<name>`: `0028_clone_progress` logs `28_clone_progress`.
          applied: Object.keys(Database.migrations)
            .sort()
            .map((key) => `${Number(key.slice(0, 4))}_${key.slice(5)}`)
            .join(", "),
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

describe("0018_triage", () => {
  test("existing issues read proposed until their next read, which the cleared cursor brings; triage writes are taken", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0017"))
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`
          INSERT INTO items (id, repo_id, number, kind, github_id, title, state, created_at, updated_at,
            source_updated_at, fetched_at)
          VALUES ('github/a/b#1', 'github/a/b', 1, 'issue', 1, 't', 'open', now(), now(), now(), now())`))
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`INSERT INTO github_sync (repo_id, stream, cursor) VALUES ('github/a/b', 'issues', 'c1'), ('github/a/b', 'other', 'c2')`))

      const applied = await on(through("0018"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["18_triage"])
      const sql = <A extends object>(statement: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))
      expect(await sql(`SELECT triage, triage_pinned AS pinned FROM items`)).toEqual([{ triage: "proposed", pinned: false }])
      expect(await sql(`SELECT stream, cursor FROM github_sync ORDER BY stream`)).toEqual([
        { stream: "issues", cursor: null },
        { stream: "other", cursor: "c2" },
      ])
      const hash = "0".repeat(64)
      // Run triage again and Pause need no person's session; a person's override does.
      await sql(`
        INSERT INTO github_writes (id, repo_id, actor_id, session_id, via, op, payload, payload_hash)
        VALUES ('00000000-0000-4000-8000-000000000001', 'github/a/b', 'p', NULL, 'person', 'triage/run', '{}', '${hash}')`)
      const refused = async (statement: string) =>
        (await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe(statement))))).reason._tag
      expect(await refused(`
        INSERT INTO github_writes (id, repo_id, actor_id, session_id, via, op, payload, payload_hash)
        VALUES ('00000000-0000-4000-8000-000000000002', 'github/a/b', 'p', NULL, 'person', 'issue/triage', '{}', '${hash}')`))
        .toBe("ConstraintError")
      expect(await refused(`UPDATE items SET triage = 'maybe'`)).toBe("ConstraintError")
      expect(await refused(`
        INSERT INTO triage_settings (repo_id, enabled_by, enabled_at, paused, paused_reason, daily_tokens)
        VALUES ('github/a/b', 'p', now(), true, NULL, 10)`)).toBe("ConstraintError")
      expect(await refused(`
        INSERT INTO triage_decisions (id, repo_id, item_id, number, via, decision, abstained)
        VALUES ('00000000-0000-4000-8000-000000000003', 'github/a/b', 'github/a/b#1', 1, 'flow', 'accept', 'budget')`))
        .toBe("ConstraintError")
    }))
})

describe("0019_spend_alerts", () => {
  test("marks every earlier call as carried, so the first alert reports only later spend; alert rows are bounded", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0018"))
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`
          INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens, day,
            reserved_tokens, charged_tokens, expires_at, settled_at)
          VALUES ('earlier', 'r', 'agent', 'm', 10, 5, (now() AT TIME ZONE 'UTC')::date, 100, 15, now(), now())`))

      const applied = await on(through("0019"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["19_spend_alerts"])
      const sql = <A extends object>(statement: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))
      expect(await sql(`SELECT spend_alert_id AS carried FROM model_usage`)).toEqual([{ carried: "before_spend_alerts" }])
      const refused = async (statement: string) =>
        (await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe(statement))))).reason._tag
      const alert = (overrides: string) => `
        INSERT INTO spend_alerts (id, window_start, window_end, calls, tokens, cost_usd, roles, day_tokens, budget)
        SELECT * FROM (SELECT 'a'::text, now(), now() + interval '15 minutes', 1, 10::bigint, 0.5::float8,
          '[]'::jsonb, 10::bigint, 100::bigint) v ${overrides}`
      await sql(alert(""))
      expect(await sql(`SELECT kind, audience FROM spend_alerts`)).toEqual([{ kind: "model", audience: "admin" }])
      expect(await refused(`UPDATE spend_alerts SET calls = 0`)).toBe("ConstraintError")
      expect(await refused(`UPDATE spend_alerts SET window_end = window_start`)).toBe("ConstraintError")
      expect(await refused(`UPDATE spend_alerts SET roles = '{}'`)).toBe("ConstraintError")
      expect(await refused(`UPDATE spend_alerts SET audience = 'everyone'`)).toBe("ConstraintError")
      expect(await refused(`UPDATE spend_alerts SET budget = 0`)).toBe("ConstraintError")
    }))
})

describe("0021_secrets", () => {
  test("keeps sealed values by repository and name, bounded bindings, and an audit that names its actor or its guest", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0020"))

      const applied = await on(through("0021"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["21_secrets"])
      const sql = <A extends object>(statement: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))
      const refused = async (statement: string) =>
        (await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe(statement))))).reason._tag
      const secret = (name: string, hosts: string, methods = "NULL") => `
        INSERT INTO secrets (repo_id, name, ciphertext, nonce, key_version, hosts, methods, updated_by)
        VALUES ('github/a/b', '${name}', 'c', 'n', 1, ${hosts}, ${methods}, 'p')`
      await sql(secret("API_KEY", "ARRAY['api.example.com']"))
      expect(await sql(`SELECT name, hosts, methods FROM secrets`)).toEqual([
        { name: "API_KEY", hosts: ["api.example.com"], methods: null },
      ])
      expect(await refused(secret("API_KEY", "ARRAY['other.example.com']"))).toBe("UniqueViolation")
      expect(await refused(secret("api_key", "ARRAY['a.com']"))).toBe("ConstraintError")
      expect(await refused(secret("EMPTY", "ARRAY[]::text[]"))).toBe("ConstraintError")
      expect(await refused(secret("NO_METHODS", "ARRAY['a.com']", "ARRAY[]::text[]"))).toBe("ConstraintError")
      expect(await refused(`UPDATE secrets SET key_version = 0`)).toBe("ConstraintError")
      await sql(`
        INSERT INTO secret_events (repo_id, action, names, actor_id, invocation_key)
        VALUES ('github/a/b', 'set', ARRAY['API_KEY'], 'p', 'k1')`)
      await sql(`
        INSERT INTO secret_events (repo_id, action, names, scope, host, method, outcome)
        VALUES ('github/a/b', 'use', ARRAY['API_KEY'], 'b:1', 'api.example.com', 'GET', 'forwarded')`)
      expect(await refused(`
        INSERT INTO secret_events (repo_id, action, names, actor_id, invocation_key)
        VALUES ('github/a/b', 'set', ARRAY['API_KEY'], 'p', 'k1')`)).toBe("UniqueViolation")
      expect(await refused(`INSERT INTO secret_events (repo_id, action) VALUES ('github/a/b', 'set')`))
        .toBe("ConstraintError")
      expect(await refused(`INSERT INTO secret_events (repo_id, action, host) VALUES ('github/a/b', 'use', 'a.com')`))
        .toBe("ConstraintError")
      expect(await refused(`
        INSERT INTO secret_events (repo_id, action, actor_id, invocation_key) VALUES ('github/a/b', 'read', 'p', 'k2')`))
        .toBe("ConstraintError")
    }))
})

describe("0022_todos", () => {
  test("a TODO is placed exactly while open; positions are unique per stack at each statement's end; bounds hold", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0021"))

      const applied = await on(through("0022"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["22_todos"])
      const sql = <A extends object>(statement: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))
      const refused = async (statement: string) =>
        (await on(Effect.flip(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe(statement))))).reason._tag
      await sql(`INSERT INTO stacks (repo_id) VALUES ('github/a/b')`)
      expect(await sql(`SELECT next_number AS "next", version::int AS version, lanes, max_open AS "maxOpen" FROM stacks`))
        .toEqual([{ next: 1, version: 0, lanes: 1, maxOpen: 50 }])
      const todo = (n: number, fields = `'queued', ${n}, NULL`) => `
        INSERT INTO todos (id, repo_id, number, title, state, position, settled_at, created_by, created_login)
        VALUES ('00000000-0000-4000-8000-00000000000${n}', 'github/a/b', ${n}, 'T${n}', ${fields}, 'p', 'maya')`
      await sql(todo(1))
      await sql(todo(2))
      await sql(todo(3))
      // Closing a gap in one statement: each row passes through a position another holds.
      await sql(`UPDATE todos SET state = 'dropped', position = NULL, settled_at = now() WHERE number = 1`)
      await sql(`UPDATE todos SET position = position - 1 WHERE position IS NOT NULL`)
      expect(await sql(`SELECT number, position FROM todos ORDER BY number`)).toEqual([
        { number: 1, position: null },
        { number: 2, position: 1 },
        { number: 3, position: 2 },
      ])
      expect(await refused(`UPDATE todos SET position = 1 WHERE number = 3`)).toBe("UniqueViolation")
      expect(await refused(todo(4, `'queued', NULL, NULL`))).toBe("ConstraintError")
      expect(await refused(todo(5, `'merged', 3, now()`))).toBe("ConstraintError")
      expect(await refused(todo(6, `'dropped', NULL, NULL`))).toBe("ConstraintError")
      expect(await refused(todo(2, `'queued', 3, NULL`).replace("00000000002", "00000000009"))).toBe("UniqueViolation")
      expect(await refused(`UPDATE todos SET title = '  ' WHERE number = 2`)).toBe("ConstraintError")
      expect(await refused(`UPDATE todos SET state = 'paused' WHERE number = 2`)).toBe("ConstraintError")
      const request = (acceptance: string) => `
        INSERT INTO todo_requests (todo_id, revision, repo_id, prompt, acceptance, by_login)
        VALUES ('00000000-0000-4000-8000-000000000002', 1, 'github/a/b', 'Do it', ${acceptance}, 'maya')`
      await sql(request(`ARRAY['done']`))
      expect(await refused(request(`ARRAY['again']`))).toBe("UniqueViolation")
      expect(await refused(request(`array_fill('x'::text, ARRAY[21])`).replace(", 1, 'github", ", 2, 'github")))
        .toBe("ConstraintError")
      const op = (fields: string) => `
        INSERT INTO stack_ops (id, repo_id, actor_id, via, op, payload_hash, outcome, result)
        VALUES (gen_random_uuid(), 'github/a/b', 'p', ${fields}, '{}')`
      await sql(op(`'person', 'commit', '${"0".repeat(64)}', 'committed'`))
      expect(await refused(op(`'robot', 'commit', '${"0".repeat(64)}', 'committed'`))).toBe("ConstraintError")
      expect(await refused(op(`'person', 'rename', '${"0".repeat(64)}', 'committed'`))).toBe("ConstraintError")
      expect(await refused(op(`'person', 'commit', 'not-a-hash', 'committed'`))).toBe("ConstraintError")
      expect(await refused(op(`'person', 'commit', '${"0".repeat(64)}', 'done'`))).toBe("ConstraintError")
    }))
})

describe("0025_flow_source", () => {
  /** A `SKILL.md` as 0015's prompt flows stored it (`renderSkill`, before 0025). */
  const skill = (name: string, description: string, flows: ReadonlyArray<string>, instructions: string) =>
    [
      "---",
      `name: ${name}`,
      `description: ${JSON.stringify(description)}`,
      "capabilities: []",
      ...(flows.length === 0 ? [] : ["flows:", ...flows.map((flow) => `  - ${JSON.stringify(flow)}`)]),
      "---",
      "",
      instructions.trim(),
      "",
    ].join("\n")

  /** The compose Postgres migrated through 0024 in a schema of its own, `rows` inserted, then 0025 applied. */
  const migrate = (
    rows: ReadonlyArray<string>,
    use: (sql: <A extends object>(statement: string) => Promise<ReadonlyArray<A>>) => Promise<void>,
  ) =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      const sql = <A extends object>(statement: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))
      await on(through("0024"))
      for (const row of rows) await sql(row)
      const applied = await on(through("0025"))
      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["25_flow_source"])
      await use(sql)
    })

  const quoted = (text: string) => `'${text.replaceAll("'", "''")}'`
  const flowId = "00000000-0000-4000-8000-000000000001"
  const notes = {
    name: "release-notes",
    description: "Summarize merged pull requests: since \"the\" last tag.",
    flows: ["repo/read", "repo/tree"],
    instructions: "Read the repository.\n\nThen summarize what merged.",
  }
  const draft = (id: number, status: string, files: string) => `
    INSERT INTO flow_drafts (id, actor_id, scope, request, status, files, checks)
    VALUES ('00000000-0000-4000-8000-00000000010${id}', 'p', 'person', 'Notes', '${status}', ${files}::jsonb,
      '[{"check": "parses", "ok": true}]'::jsonb)`
  const files = (...entries: ReadonlyArray<readonly [string, string]>) =>
    quoted(JSON.stringify(entries.map(([path, text]) => ({ path, text }))))

  test("every revision and draft becomes flow source that reads back as drafted; placement is client", () =>
    migrate(
      [
        `INSERT INTO flows (id, owner_id, name, revision, description) VALUES ('${flowId}', 'p', 'release-notes', 3, 'N')`,
        `INSERT INTO flow_revisions (flow_id, revision, digest, source, created_by) VALUES
          ('${flowId}', 1, '${"0".repeat(64)}', ${quoted(skill(notes.name, notes.description, notes.flows, notes.instructions))}, 'p'),
          ('${flowId}', 2, '${"0".repeat(64)}', ${quoted(skill(notes.name, "Plain.", [], "Go."))}, 'p'),
          ('${flowId}', 3, '${digestSync("export default 1")}', 'export default 1', 'p')`,
        draft(1, "ready", files(["SKILL.md", skill(notes.name, notes.description, notes.flows, notes.instructions)])),
        draft(2, "ready", "'[]'"),
        draft(3, "saved", files(["notes.md", "Kept."], ["SKILL.md", skill("other", "Other.", [], "Do.")])),
      ],
      async (sql) => {
        expect(await sql(`SELECT placement FROM flows`)).toEqual([{ placement: "client" }])
        const revisions = await sql<{ revision: number; digest: string; source: string }>(
          `SELECT revision, digest, source FROM flow_revisions ORDER BY revision`,
        )
        const first = renderSource(notes)
        const second = renderSource({ name: notes.name, description: "Plain.", flows: [], instructions: "Go." })
        expect(revisions).toEqual([
          { revision: 1, digest: digestSync(first), source: first },
          { revision: 2, digest: digestSync(second), source: second },
          // Already source: untouched.
          { revision: 3, digest: digestSync("export default 1"), source: "export default 1" },
        ])
        expect(readGenerated(first)).toEqual(notes)
        const drafts = await sql<{ status: string; files: unknown; checks: unknown }>(
          `SELECT status, files, checks FROM flow_drafts ORDER BY id`,
        )
        expect(drafts).toEqual([
          { status: "ready", files: [{ path: "flow.ts", text: first }], checks: [{ check: "parses", ok: true }] },
          { status: "ready", files: [], checks: [{ check: "parses", ok: true }] },
          {
            status: "saved",
            files: [
              { path: "notes.md", text: "Kept." },
              { path: "flow.ts", text: renderSource({ name: "other", description: "Other.", flows: [], instructions: "Do." }) },
            ],
            checks: [{ check: "parses", ok: true }],
          },
        ])
        // Placement holds only its two values.
        await sql(`UPDATE flows SET placement = 'sandbox'`)
        await expect(sql(`UPDATE flows SET placement = 'everywhere'`)).rejects.toBeDefined()
      },
    ))

  test("a draft whose SKILL.md doesn't read keeps no file: it fails migrated unless it was saved", () =>
    migrate(
      [
        draft(1, "needs_you", files(["SKILL.md", "No frontmatter."])),
        draft(2, "ready", files(["SKILL.md", "---\nname: x\n---\n\nNo description.\n"])),
        draft(3, "ready", files(["SKILL.md", "---\nname: \ndescription: \"D.\"\n---\n\nNo name.\n"])),
        draft(4, "ready", files(["SKILL.md", "---\nname: x\ndescription: \"broken\n---\n\nGo.\n"])),
        draft(5, "ready", files(["SKILL.md", "---\nname: x\ndescription: \"D.\"\nflows:\n  - \"broken\n---\n\nGo.\n"])),
        draft(6, "saved", files(["SKILL.md", "No frontmatter."])),
        draft(7, "proposed", files(["SKILL.md", "No frontmatter."])),
      ],
      async (sql) => {
        const failed = { status: "failed", failure: "migrated", files: [], checks: [] }
        expect(await sql(`SELECT status, failure, files, checks FROM flow_drafts ORDER BY id`)).toEqual([
          failed,
          failed,
          failed,
          failed,
          failed,
          { status: "saved", failure: null, files: [], checks: [{ check: "parses", ok: true }] },
          { status: "proposed", failure: null, files: [], checks: [{ check: "parses", ok: true }] },
        ])
      },
    ))

  test("a revision that doesn't read fails the migration, naming its flow and revision, never its text", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0024"))
      await on(Effect.flatMap(SqlClient.SqlClient, (client) =>
        client.unsafe(`INSERT INTO flows (id, owner_id, name, revision, description) VALUES ('${flowId}', 'p', 'x', 1, 'X')`)))
      await on(Effect.flatMap(SqlClient.SqlClient, (client) =>
        client.unsafe(`
          INSERT INTO flow_revisions (flow_id, revision, digest, source, created_by)
          VALUES ('${flowId}', 1, '${"0".repeat(64)}', '---\nsecret canary\n---\n', 'p')`)))
      const failure = await on(through("0025")).then(() => "applied", (error: unknown) => String(error))
      expect(failure).toContain(`0025_flow_source: flow ${flowId} revision 1 doesn't read`)
      expect(failure).not.toContain("canary")
    }))
})

describe("0028_clone_progress", () => {
  test("ready copies are reclaimable unless the App is known installed; a running clone is fetching; clone entries fit", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0027"))
      await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO repositories (id, owner, name, status, head_sha, settled_at) VALUES
          ('github/a/plain', 'a', 'plain', 'ready', ${"a".repeat(40)}, now()),
          ('github/a/installed', 'a', 'installed', 'ready', ${"b".repeat(40)}, now())`
        yield* sql`INSERT INTO repositories (id, owner, name, status) VALUES ('github/a/running', 'a', 'running', 'cloning')`
        yield* sql`INSERT INTO repositories (id, owner, name, status, failure, settled_at) VALUES
          ('github/a/failed', 'a', 'failed', 'failed', 'not_found', now())`
        yield* sql`INSERT INTO github_repositories (repo_id, installation_id) VALUES ('github/a/installed', 77)`
      }))

      const applied = await on(through("0028"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["28_clone_progress"])
      const rows = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly id: string; readonly stage: string | null; readonly reclaimable: boolean }>`
          SELECT id, stage, reclaimable FROM repositories ORDER BY id`))
      expect(rows).toEqual([
        { id: "github/a/failed", stage: null, reclaimable: false },
        { id: "github/a/installed", stage: null, reclaimable: false },
        { id: "github/a/plain", stage: null, reclaimable: true },
        { id: "github/a/running", stage: "fetching", reclaimable: false },
      ])
      // A clone's feed entry has a run's states; the repository events stay updates; nothing else is a kind.
      const insert = (kind: string, state: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
          sql`INSERT INTO notifications (recipient, subject, kind, state, href)
            VALUES ('ann', ${`${kind}:${state}:${crypto.randomUUID()}`}, ${kind}, ${state}, '/a/b')`)).then(
            () => "taken",
            () => "refused",
          )
      expect(await insert("clone", "working")).toBe("taken")
      expect(await insert("clone", "failed")).toBe("taken")
      expect(await insert("clone", "update")).toBe("refused")
      expect(await insert("main", "update")).toBe("taken")
      expect(await insert("main", "done")).toBe("refused")
      expect(await insert("tour", "update")).toBe("refused")
      // A stage only names how far a clone has come.
      const staged = await on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql`UPDATE repositories SET stage = 'pushing' WHERE id = 'github/a/running'`)).then(() => "taken", () => "refused")
      expect(staged).toBe("refused")
    }))
})

describe("0043_docs_views", () => {
  test("adds the docs template to views, keeps the others, and still refuses anything else", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
        runtime.runPromise(Effect.provide(effect, database))
      await on(through("0042"))
      const insert = (template: string) =>
        on(Effect.flatMap(SqlClient.SqlClient, (sql) =>
          sql`INSERT INTO views (id, template, props, conversation_id)
            SELECT ${crypto.randomUUID()}, ${template}, '{"url":"https://docs.example/a.md"}', id FROM conversations LIMIT 1`))
          .then(() => "taken", () => "refused")
      expect(await insert("docs")).toBe("refused")

      const applied = await on(through("0043"))

      expect(applied.map(([id, name]) => `${id}_${name}`)).toEqual(["43_docs_views"])
      expect(await insert("docs")).toBe("taken")
      expect(await insert("webpage")).toBe("taken")
      expect(await insert("link")).toBe("taken")
      expect(await insert("iframe")).toBe("refused")
    }))
})

describe("0048_github_projection_fences", () => {
  test("upgrades legacy deletions and uncertain merge counters without resurrecting projections", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => runtime.runPromise(Effect.provide(effect, database))
      await on(through("0042"))
      const old = "2026-01-01T00:00:00Z"
      const gone = "2026-01-02T00:00:00Z"
      const id = "github/acme/widgets#1"
      const head = "a".repeat(40)
      const write = crypto.randomUUID()
      await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO items (id, repo_id, number, kind, github_id, title, body, state,
          created_at, updated_at, source_updated_at, fetched_at, deleted_at)
          VALUES (${id}, 'github/acme/widgets', 1, 'pull', 1, 'Gone', '', 'closed',
            ${old}::timestamptz, ${old}::timestamptz, ${old}::timestamptz, ${old}::timestamptz, ${gone}::timestamptz)`
        yield* sql`INSERT INTO comments (id, repo_id, item_id, github_id, body, created_at, updated_at,
          source_updated_at, fetched_at, deleted_at)
          VALUES ('comment-1', 'github/acme/widgets', ${id}, 1, '', ${old}::timestamptz, ${old}::timestamptz,
            ${old}::timestamptz, ${old}::timestamptz, ${gone}::timestamptz)`
        yield* sql`INSERT INTO pulls (item_id, repo_id, number, head_ref, head_sha, base_ref, base_sha,
          source_updated_at, fetched_at)
          VALUES (${id}, 'github/acme/widgets', 1, 'feature', ${head}, 'main', ${head}, ${old}::timestamptz, ${old}::timestamptz)`
        yield* sql`INSERT INTO pull_commits (item_id, position, repo_id, sha, headline)
          VALUES (${id}, 1, 'github/acme/widgets', ${head}, 'Old')`
        yield* sql`INSERT INTO reviews (id, repo_id, item_id, github_id, state, fetched_at)
          VALUES ('review-1', 'github/acme/widgets', ${id}, 1, 'COMMENTED', ${old}::timestamptz)`
        yield* sql`INSERT INTO github_writes (id, repo_id, actor_id, session_id, via, op, payload, payload_hash, attempts)
          VALUES (${write}::uuid, 'github/acme/widgets', 'maya', ${crypto.randomUUID()}::uuid, 'person', 'pr/merge',
            ${JSON.stringify({ op: "pr/merge", number: 1, headSha: head, baseSha: head, method: "squash" })}::jsonb,
            ${"a".repeat(64)}, 3)`
      }))
      await on(through("0048"))
      const rows = await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [row] = yield* sql<{ readonly gone: number; readonly comment: number; readonly pulls: number;
          readonly commits: number; readonly reviews: number; readonly mergeUnknown: boolean; readonly attempts: number }>`
          SELECT (extract(epoch FROM gone_at) * 1000)::float8 AS gone,
            (SELECT (extract(epoch FROM fetched_at) * 1000)::float8 FROM comments WHERE id = 'comment-1') AS comment,
            (SELECT count(*)::int FROM pulls) AS pulls, (SELECT count(*)::int FROM pull_commits) AS commits,
            (SELECT count(*)::int FROM reviews) AS reviews,
            (SELECT merge_unknown FROM github_writes WHERE id = ${write}::uuid) AS "mergeUnknown",
            (SELECT attempts FROM github_writes WHERE id = ${write}::uuid) AS attempts
          FROM github_projection_fences WHERE item_id = ${id}`
        return row
      }))
      expect(rows).toEqual({ gone: Date.parse(gone), comment: Date.parse(gone), pulls: 0, commits: 0,
        reviews: 0, mergeUnknown: false, attempts: 3 })
    }))
})


describe("0049–0050 GitHub write upgrade", () => {
  test("retains old triage decisions and writes, adds unclaimed starts and removes only the obsolete merge flag", () =>
    emptySchema(async (url) => {
      const database = Database.layer(Effect.succeed(Redacted.make(url)))
      const on = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => runtime.runPromise(Effect.provide(effect, database))
      await on(through("0048"))
      const decision = crypto.randomUUID()
      const write = crypto.randomUUID()
      await on(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO triage_decisions (id, repo_id, item_id, number, via, decision)
          VALUES (${decision}::uuid, 'github/acme/widgets', 'github/acme/widgets#1', 1, 'flow', 'accept')`
        yield* sql`INSERT INTO github_writes (id, repo_id, actor_id, session_id, via, op, payload, payload_hash, attempts, merge_unknown)
          VALUES (${write}::uuid, 'github/acme/widgets', 'maya', ${crypto.randomUUID()}::uuid, 'person', 'pr/merge',
            ${JSON.stringify({ op: "pr/merge", number: 1, headSha: "a".repeat(40), baseSha: "b".repeat(40), method: "squash" })}::jsonb,
            ${"a".repeat(64)}, 3, true)`
      }))
      expect((await on(through("0049"))).map(([id, name]) => `${id}_${name}`)).toEqual(["49_triage_write_claims"])
      const claims = () => on(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
        SELECT decision, label_started_at AS label, comment_started_at AS comment FROM triage_decisions
        WHERE id = ${decision}::uuid`))
      expect(await claims()).toEqual([{ decision: "accept", label: null, comment: null }])
      await on(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
        UPDATE triage_decisions SET label_started_at = now(), comment_started_at = now() WHERE id = ${decision}::uuid`))
      const started = await claims()
      expect((await on(through("0050"))).map(([id, name]) => `${id}_${name}`)).toEqual(["50_drop_merge_unknown"])
      expect(await claims()).toEqual(started)
      expect(await on(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
        SELECT attempts, status, payload->>'op' AS op, to_jsonb(w) ? 'merge_unknown' AS obsolete
        FROM github_writes w WHERE id = ${write}::uuid`))).toEqual([
          { attempts: 3, status: "pending", op: "pr/merge", obsolete: false },
        ])
      expect(await on(through("0050"))).toEqual([])
    }))
})
