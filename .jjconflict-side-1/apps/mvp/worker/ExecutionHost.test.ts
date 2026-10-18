// worker/ExecutionHost.ts in Node: the Durable Object's start and alarm handlers over the compose Postgres
// (`pnpm db:up`), with an in-memory stand-in for the object's storage, the one Cloudflare binding they take. The real
// object runs them in local workerd in worker/ExecutionHost.workerd.test.ts.
import * as Pg from "@effect/sql-pg"
import { Logger as StructuredLogger } from "@smthrs/observability"
import { ExecutionObject } from "@smthrs/platform-cloudflare"
import { Context, Duration, Effect, Layer, Logger, Metric, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { describe, expect, test } from "vitest"
import * as TestDatabase from "../db/TestDatabase.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Expire from "./flows/Expire.ts"
import * as Pause from "./flows/Pause.ts"
import * as RecheckRole from "./flows/RecheckRole.ts"
import * as RepoClone from "./flows/RepoClone.ts"
import * as RevokeGitHubToken from "./flows/RevokeGitHubToken.ts"
import * as SessionKeys from "./SessionKeys.ts"
import { cloneExecutionId } from "../src/features/repo/contract.ts"
import * as Repos from "./Repos.ts"
import { scripted } from "./test/codeStorage.ts"
import { answers, harness, row, testFile } from "./test/harness.ts"
import { repositoryRow, resetRepos } from "./test/repos.ts"
import { cookie, SECRET, signInHarness } from "./test/signIn.ts"

// The app's own tables, for sign-in's role check (`auth/RecheckRole`) and `chat/Expire`, on a schema of this file's.
const app = testFile("execution_host")

/** The deployed flows' services over the app's tables on this file's schema, with answers expiring after `expiry`. */
const appServices = async (expiry: Duration.Input = Expire.DEFAULT_EXPIRY): Promise<Expire.Services<unknown>> => ({
  database: (await app.runPromise(Effect.service(TestDatabase.Scratch))).database,
  expiry: Duration.fromInputUnsafe(expiry),
})


/** A Durable Object's storage in memory: values cross it by structured clone, and it holds one alarm. */
const memory = () => {
  const values = new Map<string, unknown>()
  let alarm: number | null = null
  const storage: ExecutionHost.Storage = {
    get: <A>(key: string) => Effect.sync(() => structuredClone(values.get(key)) as A | undefined),
    put: (key, value) => Effect.sync(() => void values.set(key, structuredClone(value))),
    delete: (key) => Effect.sync(() => values.delete(key)),
    setAlarm: (at) => Effect.sync(() => void (alarm = at)),
    deleteAlarm: () => Effect.sync(() => void (alarm = null)),
  }
  return { storage, values, alarm: () => alarm }
}

/** A router that only records what it was handed: `probe/Pause` starts no child and wakes no parent. */
const recording = () => {
  const routed: Array<string> = []
  return {
    routed,
    router: {
      start: (intent: { readonly executionId: string }) =>
        Effect.sync(() => void routed.push(`start ${intent.executionId}`)),
      wake: (executionId: string) => Effect.sync(() => void routed.push(`wake ${executionId}`)),
    },
  }
}

/** Runs `use` with a fresh engine schema on the compose Postgres, dropped afterwards, and a client outside it. */
const withSchema = <A, E>(
  use: (schema: { readonly url: string; readonly name: string; readonly sql: SqlClient.SqlClient }) => Effect.Effect<
    A,
    E
  >,
) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function* () {
      const url = (yield* TestDatabase.serverUrl).toString()
      const admin = yield* Layer.build(Pg.PgClient.layer({ url: Redacted.make(url), maxConnections: 1 }))
      const sql = Context.get(admin, SqlClient.SqlClient)
      const name = `flows_${crypto.randomUUID().replaceAll("-", "")}`
      yield* Effect.addFinalizer(() => Effect.orDie(sql`DROP SCHEMA IF EXISTS ${sql(name)} CASCADE`))
      return yield* use({ url, name, sql })
    })),
  )

const status = (sql: SqlClient.SqlClient, schema: string, executionId: string) =>
  Effect.orDie(
    sql<{ readonly status: string }>`SELECT status FROM ${sql(schema)}.flows_runs WHERE run_id = ${executionId}`,
  ).pipe(Effect.map((rows) => rows[0]?.status))

describe("ExecutionHost over the compose Postgres", () => {
  test("start wakes the object at once; alarms drive probe/Pause through its durable sleep to the end", () =>
    withSchema(({ name, sql, url }) =>
      Effect.gen(function* () {
        const object = memory()
        const routes = recording()
        const marks: Array<string> = []
        const executionId = crypto.randomUUID()
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows: {
            flows: [Pause.Pause],
            registration: Pause.registration((label) => Effect.sync(() => marks.push(label)).pipe(Effect.as(label))),
          },
          router: routes.router,
        })
        const before = Date.now()
        // Longer than any first drive, migrations included, takes under a loaded suite: a timer that comes due during
        // the drive leaves work due now, and the alarm answers Retrying instead of Parked.
        const payload = { label: "x", pauseMs: 5_000 }
        yield* host.start(yield* ExecutionHost.intent(Pause.Pause, { executionId, payload }))
        expect(object.alarm()).toBeGreaterThanOrEqual(before)
        expect(object.alarm()).toBeLessThanOrEqual(Date.now())

        // The first alarm runs the first step and parks on the timer, with the alarm armed for it.
        const parked = yield* host.alarm()
        expect(parked._tag).toBe("Parked")
        expect(marks).toEqual(["x:before"])
        const wakeAt = parked._tag === "Parked" ? parked.wakeAtMs : null
        expect(wakeAt).toBeGreaterThanOrEqual(before + 5_000)
        expect(object.alarm()).toBe(wakeAt)
        expect(yield* status(sql, name, executionId)).toBe("suspended")

        // The wake-up at the armed time, as Cloudflare fires it: the second step, then the run settles and the alarm
        // waits out the object's retention window.
        yield* Effect.sleep(Math.max(0, wakeAt! - Date.now()))
        const settled = yield* host.alarm()
        expect(settled).toEqual({ _tag: "Settled", forgetAtMs: expect.any(Number) })
        const forgetAtMs = settled._tag === "Settled" ? settled.forgetAtMs : null
        expect(forgetAtMs! - Date.now()).toBeGreaterThan(ExecutionObject.settledRetentionMs - 60_000)
        expect(object.alarm()).toBe(forgetAtMs)
        expect(marks).toEqual(["x:before", "x:after"])
        expect(yield* status(sql, name, executionId)).toBe("completed")
        expect(routes.routed).toEqual([])

        // The final alarm, a day later, forgets the execution: the object's storage is empty and no alarm is armed.
        // The run and its result stay in the engine's schema.
        const forgotten = yield* Effect.gen(function* () {
          yield* TestClock.setTime(forgetAtMs!)
          return yield* host.alarm()
        }).pipe(Effect.provide(TestClock.layer()))
        expect(forgotten).toEqual({ _tag: "Forgotten" })
        expect(object.values.size).toBe(0)
        expect(object.alarm()).toBeNull()
        expect(yield* host.wake()).toBe(false)
        expect(yield* status(sql, name, executionId)).toBe("completed")
      })
    ))

  test("every start and alarm is one log line and one count by outcome, never the payload", () =>
    withSchema(({ name, url }) =>
      Effect.gen(function* () {
        const lines: Array<ReturnType<typeof StructuredLogger.formatStructured.log>> = []
        const logger = Logger.make((options) => void lines.push(StructuredLogger.formatStructured.log(options)))
        const registry: Metric.MetricRegistry = new Map()
        const object = memory()
        const executionId = crypto.randomUUID()
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows: { flows: [Pause.Pause], registration: Pause.registration(Effect.succeed) },
          router: recording().router,
        })
        const sentinel = "SENTINEL-payload-text"
        const value = yield* ExecutionHost.intent(Pause.Pause, {
          executionId,
          payload: { label: sentinel, pauseMs: 0 },
        })
        yield* Effect.gen(function* () {
          yield* host.start(value)
          yield* host.start(value)
          yield* host.alarm()
        }).pipe(
          Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
          Effect.provideService(Metric.MetricRegistry, registry),
        )
        const records = lines.filter((line) => String(line.message).startsWith("cloudflare.execution."))
        expect(records.map((line) => [line.message, line.annotations.outcome])).toEqual([
          ["cloudflare.execution.start", "accepted"],
          ["cloudflare.execution.start", "duplicate"],
          ["cloudflare.execution.alarm", "settled"],
        ])
        expect(JSON.stringify(records)).not.toContain(sentinel)
        const snapshot = Effect.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)))
        const count = (metric: string, outcome: string) =>
          snapshot.filter((entry) => entry.id === metric && entry.attributes?.outcome === outcome)
            .map((entry) => (entry.state as { readonly count: number }).count)[0]
        expect(count("smithers_cloudflare_execution_starts", "accepted")).toBe(1)
        expect(count("smithers_cloudflare_execution_starts", "duplicate")).toBe(1)
        expect(count("smithers_cloudflare_execution_alarms", "settled")).toBe(1)
      })
    ))

  test("wake makes a held execution due at once, and leaves an object without one idle", async () => {
    const services = await appServices()
    await withSchema(({ name, url }) =>
      Effect.gen(function* () {
        const object = memory()
        const executionId = crypto.randomUUID()
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows: ExecutionHost.remote(services),
          router: recording().router,
        })
        expect(yield* host.wake()).toBe(false)
        expect(object.alarm()).toBeNull()
        const payload = { label: "z", pauseMs: 60_000 }
        yield* host.start(yield* ExecutionHost.intent(Pause.Pause, { executionId, payload }))
        expect((yield* host.alarm())._tag).toBe("Parked")
        expect(object.alarm()).toBeGreaterThan(Date.now() + 30_000)
        const before = Date.now()
        expect(yield* host.wake()).toBe(true)
        expect(object.alarm()).toBeGreaterThanOrEqual(before)
        expect(object.alarm()).toBeLessThanOrEqual(Date.now())
      })
    )
  })

  test("the deployed flows run probe/Pause with logging steps, in the engine's schema", async () => {
    const services = await appServices()
    await withSchema(({ name, sql, url }) =>
      Effect.gen(function* () {
        const flows = ExecutionHost.remote(services)
        expect(flows.flows).toEqual([Pause.Pause, Expire.Expire])
        const object = memory()
        const executionId = crypto.randomUUID()
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows,
          router: recording().router,
        })
        const payload = { label: "y", pauseMs: 0 }
        yield* host.start(yield* ExecutionHost.intent(Pause.Pause, { executionId, payload }))
        expect(yield* host.alarm()).toMatchObject({ _tag: "Settled" })
        expect(yield* status(sql, name, executionId)).toBe("completed")
      })
    )
  })

  test("the deployed flows run chat/Expire: it parks on its timer, then settles the answer abandoned", async () => {
    const h = await harness(app, answers("never"), {
      actor: { subject: { kind: "person", id: "person-member" }, role: "member" },
    })
    const answerId = crypto.randomUUID()
    const asked = await h.ask({ id: crypto.randomUUID(), answerId, text: "Asked, then the phone was shut" })
    expect(asked.status).toBe(202)
    // ChatApi started the expiry, as it asks the Durable Object to: one execution per answer.
    const executionId = Expire.executionId(answerId)
    expect(h.starts).toEqual([{ flow: "chat/Expire", executionId, payload: { answerId } }])
    // Long enough that the first alarm, which migrates the engine's schema, still finds the answer young under a loaded
    // suite (5 seconds was not, once).
    const services = await appServices("10 seconds")
    await withSchema(({ name, sql, url }) =>
      Effect.gen(function* () {
        const object = memory()
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows: ExecutionHost.remote(services),
          router: recording().router,
        })
        yield* host.start(yield* ExecutionHost.intent(Expire.Expire, { executionId, payload: { answerId } }))

        // The first alarm finds the answer young and parks on the durable timer, with the alarm armed for it.
        const parked = yield* host.alarm()
        expect(parked._tag).toBe("Parked")
        const wakeAt = parked._tag === "Parked" ? parked.wakeAtMs : null
        expect(object.alarm()).toBe(wakeAt)
        expect(yield* status(sql, name, executionId)).toBe("suspended")

        // Cloudflare's wake-up at the armed time settles the answer and the run.
        yield* Effect.sleep(Math.max(0, wakeAt! - Date.now()))
        const settled = yield* host.alarm()
        expect(settled).toMatchObject({ _tag: "Settled" })
        expect(object.alarm()).toBe(settled._tag === "Settled" ? settled.forgetAtMs : null)
        expect(yield* status(sql, name, executionId)).toBe("completed")
      })
    )
    expect(await row(app, answerId)).toMatchObject({ status: "failed", failure: "abandoned" })
  })

  test("with sign-in configured, the deployed flows run auth/RecheckRole and auth/RevokeGitHubToken over the app's tables", async () => {
    const signIn = await signInHarness(app)
    const { cookies } = await signIn.signInAs()
    expect(await signIn.session(cookies)).toMatchObject({ role: "member" })
    signIn.github.permission = "admin"
    const { sessionId, database } = await app.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const [row] = yield* sql<{ readonly id: string }>`SELECT id FROM sessions`
      return { sessionId: row!.id, database: (yield* TestDatabase.Scratch).database }
    }))
    const keys = await Effect.runPromise(SessionKeys.make(Redacted.make(SECRET)))
    const flows = ExecutionHost.remoteWithSignIn({ database, expiry: Expire.DEFAULT_EXPIRY }, {
      keys,
      github: signIn.github.service,
      repository: "smithersai/smithers",
    })
    expect(flows.flows).toEqual([
      Pause.Pause,
      Expire.Expire,
      RecheckRole.RecheckRole,
      RevokeGitHubToken.RevokeGitHubToken,
    ])
    await withSchema(({ name, sql, url }) =>
      Effect.gen(function* () {
        const object = memory()
        const executionId = `auth-recheck-${sessionId}-1`
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows,
          router: recording().router,
        })
        yield* host.start(yield* ExecutionHost.intent(RecheckRole.RecheckRole, { executionId, payload: { sessionId } }))
        expect(yield* host.alarm()).toMatchObject({ _tag: "Settled" })
        expect(yield* status(sql, name, executionId)).toBe("completed")
      })
    )
    expect(await signIn.session(cookies)).toMatchObject({ role: "admin" })
    // Signing out starts the revocation, which the same deployed flows run.
    await signIn.fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { origin: "http://smithers.test", cookie: cookie(cookies) },
    })
    expect(signIn.revocations).toEqual([sessionId])
    const [issued] = signIn.github.issued
    await withSchema(({ name, sql, url }) =>
      Effect.gen(function* () {
        const object = memory()
        const executionId = `auth-revoke-${sessionId}`
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows,
          router: recording().router,
        })
        yield* host.start(
          yield* ExecutionHost.intent(RevokeGitHubToken.RevokeGitHubToken, { executionId, payload: { sessionId } }),
        )
        expect(yield* host.alarm()).toMatchObject({ _tag: "Settled" })
        expect(yield* status(sql, name, executionId)).toBe("completed")
      })
    )
    expect(signIn.github.accepts(issued!.accessToken)).toBe(false)
    const [forgotten] = await app.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql<{ readonly forgotten: boolean }>`SELECT github_access IS NULL AS forgotten FROM sessions`))
    expect(forgotten!.forgotten).toBe(true)
  })

  test("with Code Storage configured, the deployed flows run repo/Clone over the app's tables", async () => {
    await resetRepos(app)
    const provider = scripted()
    provider.publish("octocat", "Spoon-Knife")
    const database = (await app.runPromise(Effect.service(TestDatabase.Scratch))).database
    const budgets = { maxRepositories: 100, maxStoredBytes: 3e9, maxReadBytes: 40e9, maxRepositoryBytes: 1e9, budgetUsd: 20 }
    const requested = await app.runPromise(
      Repos.request({ id: "github/octocat/spoon-knife", owner: "octocat", name: "Spoon-Knife" }, budgets),
    )
    if (requested.kind !== "started") throw new Error(`requested ${requested.kind}`)
    const flows = ExecutionHost.withRepoClone(ExecutionHost.remote({ database, expiry: Expire.DEFAULT_EXPIRY }), {
      database,
      codeStorage: provider.client,
      upstream: provider.upstream,
      budgets,
      deadline: Duration.minutes(10),
    })
    expect(flows.flows).toEqual([Pause.Pause, Expire.Expire, RepoClone.Clone])
    await withSchema(({ name, sql, url }) =>
      Effect.gen(function* () {
        const object = memory()
        const executionId = cloneExecutionId("github/octocat/spoon-knife", requested.cloneId)
        const host = ExecutionHost.make(object.storage, {
          hostId: `object-${executionId}`,
          database: ExecutionHost.database(url, name),
          flows,
          router: recording().router,
        })
        const { owner, name: repo, cloneId, requestedAt } = requested
        yield* host.start(
          yield* ExecutionHost.intent(RepoClone.Clone, {
            executionId,
            payload: { id: "github/octocat/spoon-knife", owner, name: repo, cloneId, requestedAt },
          }),
        )
        // The sync answers sync_in_progress once, so the first drive may park on the retry; drive until it settles.
        let driven = yield* host.alarm()
        for (let drives = 1; driven._tag !== "Settled" && drives < 20; drives++) driven = yield* host.alarm()
        expect(driven).toMatchObject({ _tag: "Settled" })
        expect(yield* status(sql, name, executionId)).toBe("completed")
      })
    )
    expect(await repositoryRow(app, "github/octocat/spoon-knife")).toMatchObject({ status: "ready" })
  })
})
