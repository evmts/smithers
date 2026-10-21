// A TODO's run read from the browser (worker/RemoteRuns.ts, ruling TODO-3) through the real handler, on this file's
// schema of the compose Postgres and Electric (`pnpm db:up`), against a real engine on a schema of its own: the Node
// host's (worker/test/flowHost.ts), which keeps its runs, journal and change feed in the same tables the Cloudflare host
// does. The run is a small flow under a TODO attempt's execution id, `todo:<attempt id>`; its payload carries a
// `Redacted` sentinel and its first step answers more than 16 KiB, so the read proves what leaves the engine.
import * as Pg from "@effect/sql-pg"
import { PostgresDatabase } from "@smthrs/database"
import { Action, Flow, FlowRuntime, Interpreter, Sleep } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { Logger as StructuredLogger } from "@smthrs/observability"
import { Node } from "@smthrs/plan"
import { ConfigProvider, Context, Effect, Layer, Logger, Metric, Redacted, Schema, Tracer } from "effect"
import { FetchHttpClient, HttpEffect } from "effect/http"
import { SqlClient } from "effect/sql"
import { beforeEach, describe, expect, test } from "vitest"
import * as TestDatabase from "../db/TestDatabase.ts"
import { todoExecutionId } from "../src/features/pulls/contract.ts"
import { REMOTE_RUN_SHAPE_ROUTE, remoteRunRoute } from "../src/features/runs/contract.ts"
import * as Actor from "./Actor.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as RemoteRuns from "./RemoteRuns.ts"
import * as Stack from "./stack/Stack.ts"
import { build } from "./test/flowHost.ts"
import { eventually, recorded, signedIn, testFile, uuid } from "./test/harness.ts"

const runtime = testFile("remote_runs")
beforeEach(() =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`TRUNCATE stack_ops, todo_attempts, todo_requests, todos, stacks`))
)

const member: Actor.Actor = { subject: { kind: "person", id: "person-member" }, role: "member", login: "maya" }
const guest: Actor.Actor = { subject: { kind: "person", id: "person-guest" }, role: "guest", login: "gus" }

const SENTINEL = "sentinel-remote-run-4b7e-never-shown"

const Produce = Action.make("remote-runs-test/Produce", { payload: { size: Schema.Number }, success: Schema.String })

/** A run another starts: it produces `size` characters. */
const Child = Flow.make("remote-runs-test/Child", {
  description: "A run the watched run starts.",
  modelInvocable: false,
  payload: { size: Schema.Number },
  success: Schema.String,
  body: Node.capture({}, ({ size }) => Produce.call({ size })),
})

/** Produces `size` characters, waits `pauseMs` on a durable timer, then starts a child that produces more. */
const Watched = Flow.make("remote-runs-test/Watched", {
  description: "A run a person watches from another device.",
  modelInvocable: false,
  payload: { opaque: Schema.Redacted(Schema.String), size: Schema.Number, pauseMs: Schema.Number },
  success: Schema.String,
  error: Sleep.SleepRequestInvalid,
  body: Node.capture({}, ({ size, pauseMs }) =>
    Produce.call({ size }).pipe(
      Node.andThen(Sleep.action.call({ millis: pauseMs })),
      Node.andThen(Child.child({ size: 17_000 })),
    )),
})

const registration = Layer.mergeAll(
  Produce.toLayer(({ size }) => Effect.succeed("x".repeat(size))),
  Interpreter.layer(Child, { callbackIdentity: "stable" }),
  Interpreter.layer(Watched, { callbackIdentity: "stable" }),
).pipe(Layer.provideMerge(Action.layerImplementations))

/** A TODO committed on a host that runs TODOs: its first attempt, recorded by the writer. */
const attempt = () =>
  runtime.runPromise(
    Effect.map(
      Stack.apply({
        opId: uuid(),
        repoId: "github/octo/hello",
        actor: { id: member.subject.id, login: "maya" },
        via: "person",
        op: { kind: "commit", title: "Watch me", prompt: "Anything.", acceptance: [] },
      }, { runs: true }),
      (applied) => (applied.kind === "applied" ? applied.receipt.starts[0]! : undefined)!,
    ),
  )

/** The engine a test watches, on its own schema of the compose Postgres, until `body` settles. */
interface Engine {
  readonly schema: string
  readonly database: Layer.Layer<SqlClient.SqlClient>
  /** Runs `Watched` as `executionId` to its end. */
  readonly run: (executionId: string, pauseMs?: number) => Promise<void>
  /** Starts `Watched` as `executionId` and returns at once; the run goes on until the engine closes. */
  readonly start: (executionId: string, pauseMs: number) => Promise<void>
}

const withEngine = <A>(body: (engine: Engine) => Promise<A>): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { context, engine } = yield* build(registration)
        const scope = yield* Effect.scope
        const server = yield* TestDatabase.serverUrl
        const flows = Context.get(context, FlowRuntime.FlowRuntime)
        const execute = (executionId: string, pauseMs: number) =>
          flows.execute(Watched, {
            executionId,
            payload: { opaque: Redacted.make(SENTINEL), size: 20_000, pauseMs },
          }).pipe(Effect.provide(context))
        return yield* Effect.promise(() =>
          body({
            schema: engine.schema,
            // As ChatApi reads the deployed engine: read-only.
            database: ExecutionHost.readDatabase(server.toString(), engine.schema),
            run: (executionId, pauseMs = 0) => Effect.runPromise(Effect.asVoid(Effect.orDie(execute(executionId, pauseMs)))),
            start: (executionId, pauseMs) =>
              Effect.runPromise(Effect.asVoid(Effect.forkIn(Effect.ignore(execute(executionId, pauseMs)), scope))),
          })
        )
      }),
    ) as Effect.Effect<A>,
  )

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

/** The routes as ChatApi serves them, over this file's schema and `engine`, recording every log line, span and metric. */
const routes = async (
  engine: Pick<Engine, "schema" | "database">,
  options: {
    readonly actor?: Actor.Actor
    readonly sessions?: Layer.Layer<Actor.Sessions>
    /** The app's tables: the file's schema unless set. */
    readonly database?: Layer.Layer<SqlClient.SqlClient>
  } = {},
) => {
  const scratch = await runtime.runPromise(Effect.service(TestDatabase.Scratch))
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(spanOptions) {
      const span = new Tracer.NativeSpan(spanOptions)
      spans.push(span)
      return span
    },
  })
  const logs: Array<StructuredLog> = []
  const logger = Logger.make((logOptions) => void logs.push(StructuredLogger.formatStructured.log(logOptions)))
  const registry: Metric.MetricRegistry = new Map()
  /** Every request sent to Electric. */
  const electric: Array<URL> = []
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    electric.push(new URL(url))
    return globalThis.fetch(url, init)
  }
  const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
    )
  const api = await runtime.runPromise(
    observed(
      RemoteRuns.make(options.database ?? scratch.database, {
        database: engine.database,
        schema: engine.schema,
        flows: [Watched],
      }),
    ),
  )
  const handler = HttpEffect.toWebHandler(
    observed(
      api.fetch.pipe(
        Effect.provide(options.sessions ?? (options.actor === undefined ? Actor.signedOut : signedIn(options.actor))),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    ),
  )
  return {
    fetch: (path: string, init?: RequestInit) => handler(new Request(`http://chat.test${path}`, init)),
    electric,
    logs,
    spans,
    line: (message: string) => logs.filter((log) => log.message === message),
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      runtime.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
      ).count,
    snapshot: () => runtime.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry))),
  }
}

/**
 * A database whose tables aren't there: a real reader of a schema nobody made, so every statement on it fails as
 * Postgres fails it. Read-only, so opening it makes nothing.
 */
const missing = (schema: string) =>
  Layer.unwrap(
    Effect.map(TestDatabase.serverUrl, (server) =>
      PostgresDatabase.layer({ url: server.toString(), driver: Pg, schema, readOnly: true, postgres: { maxConnections: 1 } })),
  ).pipe(Layer.orDie)

/** A response's status and body: a run as the engine reads it, unless refused. */
const json = async (response: Response): Promise<readonly [number, EngineStore.RunInspection.Inspection]> => [
  response.status,
  await response.json(),
]

/** A shape request's first answer, and the rows it carried. */
const firstShape = async (h: Awaited<ReturnType<typeof routes>>, runId: string) => {
  const response = await h.fetch(`${REMOTE_RUN_SHAPE_ROUTE}?run=${encodeURIComponent(runId)}&offset=-1`)
  const body = response.status === 200 ? ((await response.json()) as Array<{ value?: Record<string, string> }>) : []
  return {
    status: response.status,
    handle: response.headers.get("electric-handle"),
    offset: response.headers.get("electric-offset"),
    rows: body.flatMap((message) => (message.value === undefined ? [] : [message.value])),
  }
}

describe("GET /api/remote-runs/<runId>", () => {
  test("a Member reads a TODO's run as the engine reads it: steps, a page of the journal, values redacted and cut", async () => {
    const start = await attempt()
    const runId = todoExecutionId(start.attemptId)
    await withEngine(async (engine) => {
      await engine.run(runId)
      const h = await routes(engine, { actor: member })
      const response = await h.fetch(remoteRunRoute(runId))
      expect([response.status, response.headers.get("cache-control"), response.headers.get("content-type")]).toEqual([
        200,
        "no-store",
        "application/json",
      ])
      const text = await response.text()
      expect(text).not.toContain(SENTINEL)
      const read = JSON.parse(text) as EngineStore.RunInspection.Inspection
      expect(read.run).toMatchObject({ runId, flowName: "remote-runs-test/Watched", status: "completed", parentRunId: null })
      expect(read.run.input.text).toContain("<redacted>")
      const produced = read.steps.filter((step) => step.action === "remote-runs-test/Produce")
      expect(produced.map((step) => step.output?.clipped)).toEqual([true])
      // The run it started: a summary with its input and result, as the engine reads them, the result cut.
      expect(read.children.map((child) => [child.flowName, child.status, child.result?.clipped])).toEqual([
        ["remote-runs-test/Child", "completed", true],
      ])
      expect(read.journal.hasMore).toBe(false)
      expect(read.run.lastSeq).toBe(read.journal.events.at(-1)!.seq)

      // Paged: the first two events, then the rest after them.
      const [, first] = await json(await h.fetch(`${remoteRunRoute(runId)}?limit=2`))
      expect([first.journal.events.length, first.journal.hasMore]).toEqual([2, true])
      const [, rest] = await json(await h.fetch(`${remoteRunRoute(runId)}?afterSeq=${first.journal.nextSeq}&limit=500`))
      expect([...first.journal.events, ...rest.journal.events].map((event) => event.seq)).toEqual(
        read.journal.events.map((event) => event.seq),
      )

      // One record per read, with sizes and the outcome: never a value.
      const lines = h.line("run.inspect").map((line) => line.annotations)
      expect(lines).toHaveLength(3)
      // Every value the read cut: the long step's output and attempt, the child's result, and the events carrying them.
      const cut = text.split(`"clipped":true`).length - 1
      expect(cut).toBeGreaterThanOrEqual(3)
      expect(lines[0]).toMatchObject({ host: "remote", outcome: "read", runId, status: 200, clipped: cut })
      expect(lines[0]!.events).toBe(read.journal.events.length)
      expect(lines[0]!.bytes).toBe(new TextEncoder().encode(text).length)
      expect(h.count(RemoteRuns.reads, { outcome: "read" })).toBe(3)
      expect(h.spans.filter((span) => span.name === "run.inspect")).toHaveLength(3)
      expect(recorded(h)).not.toContain(SENTINEL)
      expect(recorded(h)).not.toContain("xxxxxxxx")
    })
  })

  test("refuses who may not read it, a bad page, a run no TODO started and one the engine hasn't begun", async () => {
    const start = await attempt()
    const runId = todoExecutionId(start.attemptId)
    await withEngine(async (engine) => {
      const cases: ReadonlyArray<[Parameters<typeof routes>[1], string, number, string]> = [
        [{}, remoteRunRoute(runId), 401, "authentication"],
        [{ actor: guest }, remoteRunRoute(runId), 403, "forbidden"],
        [{ actor: member }, `${remoteRunRoute(runId)}?afterSeq=-2`, 400, "invalid"],
        [{ actor: member }, `${remoteRunRoute(runId)}?afterSeq=one`, 400, "invalid"],
        [{ actor: member }, `${remoteRunRoute(runId)}?limit=0`, 400, "invalid"],
        [{ actor: member }, `${remoteRunRoute(runId)}?limit=501`, 400, "invalid"],
        [{ actor: member }, `${remoteRunRoute(runId)}?limit=1.5`, 400, "invalid"],
        [{ actor: member }, remoteRunRoute(todoExecutionId(uuid())), 404, "not_found"],
        [{ actor: member }, remoteRunRoute("chat-expire-1"), 404, "not_found"],
        // Recorded by the writer, and not yet begun by the engine.
        [{ actor: member }, remoteRunRoute(runId), 404, "not_started"],
      ]
      for (const [options, path, status, code] of cases) {
        const h = await routes(engine, options)
        const response = await h.fetch(path)
        expect([path, response.status, await response.json(), response.headers.get("cache-control")]).toEqual([
          path,
          status,
          { code },
          "no-store",
        ])
        expect(h.line("run.inspect").map((line) => line.annotations.outcome)).toEqual([code])
        expect(h.count(RemoteRuns.reads, { outcome: code })).toBe(1)
      }
      const h = await routes(engine, { actor: member })
      expect((await h.fetch(remoteRunRoute(runId), { method: "POST" })).status).toBe(405)
      expect(h.line("run.inspect").map((line) => line.annotations.outcome)).toEqual(["method"])
    })
  })

  test("answers 503 when sessions, the app's database or the engine can't, and the device asks again", async () => {
    const start = await attempt()
    const runId = todoExecutionId(start.attemptId)
    const sessionsDown = Layer.succeed(Actor.Sessions, Actor.Sessions.of({ resolve: Effect.fail(new Actor.SessionsUnavailable()) }))
    await withEngine(async (engine) => {
      await engine.run(runId)
      const cases: ReadonlyArray<[Awaited<ReturnType<typeof routes>>, string | undefined]> = [
        [await routes(engine, { sessions: sessionsDown }), undefined],
        [await routes(engine, { actor: member, database: missing("remote_runs_no_app") }), "sql:"],
        [await routes({ schema: engine.schema, database: missing("remote_runs_no_engine") }, { actor: member }), "@smthrs/"],
      ]
      for (const [h, errorCode] of cases) {
        const response = await h.fetch(remoteRunRoute(runId))
        expect([response.status, await response.json(), response.headers.get("retry-after")]).toEqual([
          503,
          { code: "unavailable" },
          "5",
        ])
        const line = h.line("run.inspect")[0]!.annotations
        expect(line.outcome).toBe("unavailable")
        if (errorCode !== undefined) expect(String(line.errorCode)).toContain(errorCode)
      }
    })
  })
})

describe("GET /api/shapes/remote-runs", () => {
  test("a Member follows the run's row of the engine's change feed: its id and revision, from the engine's schema", async () => {
    const start = await attempt()
    const runId = todoExecutionId(start.attemptId)
    await withEngine(async (engine) => {
      await engine.run(runId)
      const h = await routes(engine, { actor: member })
      const first = await firstShape(h, runId)
      expect(first.status).toBe(200)
      expect(first.rows).toEqual([{ run_id: runId, revision: expect.any(String) }])
      expect(Object.fromEntries(h.electric[0]!.searchParams)).toMatchObject({
        table: `${engine.schema}.flows_run_changes`,
        where: "run_id = $1",
        "params[1]": runId,
        columns: "run_id,revision",
      })
      expect(h.count(RemoteRuns.shapeRequests, { status: "200", live: "false" })).toBe(1)
    })
  })

  test("the row moves while the run works: a live request answers when the run's next step begins", async () => {
    const start = await attempt()
    const runId = todoExecutionId(start.attemptId)
    await withEngine(async (engine) => {
      const h = await routes(engine, { actor: member })
      // Started, then caught in its durable sleep: the row exists and stands still.
      await engine.start(runId, 1_500)
      let first = await firstShape(h, runId)
      await eventually(async () => {
        first = await firstShape(h, runId)
        return first.rows.length === 1
      }, 10_000)
      const before = Number(first.rows[0]!.revision)
      // Follow it live until the revision moves on.
      let offset = first.offset!
      let moved: number | undefined
      for (let request = 0; request < 20 && moved === undefined; request++) {
        const response = await h.fetch(
          `${REMOTE_RUN_SHAPE_ROUTE}?run=${encodeURIComponent(runId)}&offset=${offset}&handle=${first.handle}&live=true`,
        )
        offset = response.headers.get("electric-offset") ?? offset
        const messages = (await response.json()) as Array<{ value?: { revision?: string } }>
        const revision = messages.find((message) => message.value?.revision !== undefined)?.value?.revision
        if (revision !== undefined && Number(revision) > before) moved = Number(revision)
      }
      expect(moved).toBeGreaterThan(before)
    })
  }, 60_000)

  test("refuses who may not follow it, and a run no TODO started", async () => {
    const start = await attempt()
    const runId = todoExecutionId(start.attemptId)
    const sessionsDown = Layer.succeed(Actor.Sessions, Actor.Sessions.of({ resolve: Effect.fail(new Actor.SessionsUnavailable()) }))
    await withEngine(async (engine) => {
      const cases: ReadonlyArray<[Parameters<typeof routes>[1], string, number]> = [
        [{}, runId, 401],
        [{ actor: guest }, runId, 403],
        [{ sessions: sessionsDown }, runId, 503],
        [{ actor: member }, todoExecutionId(uuid()), 403],
        [{ actor: member }, "chat-expire-1", 403],
      ]
      for (const [options, run, status] of cases) {
        const h = await routes(engine, options)
        expect([run, (await firstShape(h, run)).status]).toEqual([run, status])
        expect(h.electric).toEqual([])
      }
      // A request that names no run follows none.
      const none = await routes(engine, { actor: member })
      expect((await none.fetch(`${REMOTE_RUN_SHAPE_ROUTE}?offset=-1`)).status).toBe(403)
      expect(none.electric).toEqual([])
      // The app's tables can't be read: whose run it is can't be told, so the device keeps its rows and asks again.
      const h = await routes(engine, { actor: member, database: missing("remote_runs_no_app") })
      expect((await firstShape(h, runId)).status).toBe(503)
      expect(h.electric).toEqual([])
    })
  })
})

describe("the routes", () => {
  test("handle the run route and the shape, and nothing else", () => {
    const runId = todoExecutionId(uuid())
    expect(RemoteRuns.handles(remoteRunRoute(runId))).toBe(true)
    expect(RemoteRuns.handles(REMOTE_RUN_SHAPE_ROUTE)).toBe(true)
    for (const path of ["/api/remote-runs", "/api/remote-runs/", `/api/remote-runs/${runId}/steer`, "/api/runs/x", "/api/remote-runs/%E0%A4%A"]) {
      expect([path, RemoteRuns.handles(path)]).toEqual([path, false])
    }
    expect(RemoteRuns.parseRunPath(remoteRunRoute(runId))).toBe(runId)
  })

  test("a path the module doesn't serve is 404", async () => {
    await withEngine(async (engine) => {
      const h = await routes(engine, { actor: member })
      expect((await h.fetch("/api/remote-runs")).status).toBe(404)
    })
  })
})
