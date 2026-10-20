import { FLOW_DRAFTS_TABLE, FLOWS_TABLE } from "../features/flows-ui/contract"
import { ImmutableCache } from "@smthrs/artifacts"
import { Model, ModelError, type ModelEvent, type ModelRequest } from "@smthrs/model"
import { ShapeSource } from "@smthrs/effect-electric"
import { HostModel } from "@smthrs/model-host"
import * as Pg from "@effect/sql-pg"
import { PostgresDatabase } from "@smthrs/database"
import {
  Cause,
  ConfigProvider,
  Context,
  Effect,
  Fiber,
  Layer,
  Logger,
  ManagedRuntime,
  Metric,
  Option,
  Queue,
  Redacted,
  Schedule,
  Stream,
  Tracer,
} from "effect"
import { FetchHttpClient, type HttpClient, HttpEffect, HttpServerRequest } from "effect/http"
import { SqlClient } from "effect/sql"
import * as TestDatabase from "../../db/TestDatabase.ts"
import * as Actor from "../../worker/Actor.ts"
import * as Chat from "../../worker/Chat.ts"
import * as Flows from "../../worker/Flows.ts"
import * as RepoApi from "../../worker/RepoApi.ts"
import * as BranchApi from "../../worker/branch/BranchApi.ts"
import { Forge } from "../../worker/branch/Forge.ts"
import { TerminalSockets } from "../../worker/branch/Sandboxes.ts"
import * as GitHubApi from "../../worker/github/Api.ts"
import { repositoryOf } from "../../worker/github/Config.ts"
import { type GitHost, gitHost, type Sockets, terminalSockets } from "../../worker/test/branch.ts"
import { Outbox } from "@smthrs/effect-tanstack-db"
import { BrowserCollectionCoordinator, createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"
import { BrowserEngine, BrowserRuntime, StoragePersistence, TabChannel, WebLock } from "@smthrs/platform-browser"
import { startOfflineExecutor } from "@tanstack/offline-transactions"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { type AppOptions, appLayer, type Host, realServices } from "../boot"
import { faultyServices } from "./faults"
import { LOCAL_ELECTRIC_URL, MESSAGES_TABLE, QUESTIONS_ROUTE, TELEMETRY_ROUTE } from "../features/chat/contract"
import { REPOS_ROUTE, REPOSITORIES_SHAPE_ROUTE, REPOSITORIES_TABLE } from "../features/repo/contract"
import { RUNS_TABLE } from "../features/status/contract"
import { COMMENTS_TABLE, ITEMS_TABLE, SYNC_TABLE, WRITES_TABLE } from "../features/issues/contract"
import type { IssuesClient } from "../features/issues/api"
import { VIEWS_TABLE } from "../features/views/contract"
import { TERMINALS_TABLE } from "../features/terminal/contract"
import type { ThemeMode } from "../features/theme/contract"
import { clientFlows } from "../flows/declarations"
import { workerRegistrations } from "../flows/registrations"
import type { Endpoint } from "../flows/tabPort"

// ChatApi's real handler (worker/Chat.ts, and RepoApi for repositories, as worker/ChatApi.ts routes them), as the
// browser reaches it, over the compose Postgres and Electric (`pnpm db:up`). Only the model is scripted: a test writes
// each answer, which the device's agent (`chat/Answer`, run by a device opened with `answers`) reads as its cell. Every
// request is signed in as a Member unless the ChatApi is opened signed out.
//
// Each instance gets its own schema (db/TestDatabase.ts), migrated by db/migrations and dropped when its scope closes,
// so tests never touch the dev conversation. ChatApi's SQL reaches it through the connection's search_path; its shape
// requests reach it because the fetch ChatApi calls Electric with names the schema in `table`, the one place the
// schema shows.
//
// The browser reaches ChatApi through `fetch`, which hands each request to the handler in this process. Faults are
// never injected here: a test of an unhappy path gives the browser faulty services instead (src/test/faults.ts).

/**
 * What a test writes into the answer to one question, as the model's reply to the agent: one cell that ends the run
 * with `ctx.done("<text>")`, the text streamed as it is said.
 */
export interface Reply {
  /** Streams `text` into the answer: the first time, the cell's opening and `ctx.done("` before it. */
  readonly say: (text: string) => void
  /** Closes the literal and the cell, reports usage and stops. */
  readonly done: () => void
  /** Ends the stream with a model error the agent doesn't retry: the answer settles failed, `model_error`. */
  readonly fail: () => void
  /** Answers with one whole cell of `source`, such as a flow call, then reports usage and stops. */
  readonly cell: (source: string) => void
}

/** Where a test ChatApi answers: the browser's origin in these tests. */
export const CHATAPI_ORIGIN = "http://chatapi.test"

/** A signed-in person with the Member role: who every request to a test ChatApi is, unless it is opened signed out. */
export const member: Actor.Actor = { subject: { kind: "person", id: "person-member" }, role: "member" }

/** The repository a test ChatApi's git loop syncs and writes to (`GITHUB_REPOSITORY`). */
export const TEST_REPOSITORY = "octo/hello"

/**
 * How a test ChatApi is opened: who every request is signed in as, `member` unless set, or nobody (`null`); and the
 * origin it answers on, `CHATAPI_ORIGIN` unless set. A test whose tab must reach a real local server at the app's
 * origin, such as a terminal's socket, sets that server's.
 */
export interface ChatApiOptions {
  readonly actor?: Actor.Actor | null
  readonly origin?: string
}

/** A remote flow a route started: the git loop's routes start them, and no remote host runs here. */
export interface Started {
  readonly flow: string
  readonly executionId: string
  readonly payload: unknown
}

/** The tables whose shapes the test's Electric reads from the ChatApi's own schema. */
const SCHEMA_TABLES: ReadonlySet<string> = new Set([
  MESSAGES_TABLE,
  REPOSITORIES_TABLE,
  VIEWS_TABLE,
  RUNS_TABLE,
  ITEMS_TABLE,
  COMMENTS_TABLE,
  WRITES_TABLE,
  SYNC_TABLE,
  FLOWS_TABLE,
  FLOW_DRAFTS_TABLE,
  TERMINALS_TABLE,
])

/** A Postgres schema for one device's engine store, and where the device keeps the engine's leaders. */
export interface EngineStore {
  readonly url: string
  readonly schema: string
  /** Keeps a leader so it is interrupted, at the latest, when the ChatApi closes. */
  readonly keep: (leader: Fiber.Fiber<never, unknown>) => void
}

export class TestChatApi extends Context.Service<
  TestChatApi,
  {
    readonly origin: string
    /** The browser's way to ChatApi: each request handed to the handler in this process. */
    readonly fetch: typeof globalThis.fetch
    /**
     * The scripted answer to the first model request whose prompt includes `question` (the `nth`, from 0, when set),
     * once the agent asks the model through ChatApi's model endpoint. The agent's prompt wraps the question with the
     * conversation before it.
     */
    readonly answerTo: (question: string, nth?: number) => Effect.Effect<Reply>
    /** How many model requests the agent made whose prompt includes `question`. */
    readonly modelRequests: (question: string) => number
    /** The status of every answer to `POST /api/questions` the browser got, in order. */
    readonly questionStatuses: () => ReadonlyArray<number>
    /** Asks as another device would, through ChatApi. */
    readonly askElsewhere: (text: string) => Effect.Effect<{ readonly questionId: string; readonly answerId: string }>
    /** The rows in Postgres, in order. */
    readonly rows: Effect.Effect<ReadonlyArray<{ readonly id: string; readonly text: string; readonly position: number }>>
    /** Every OTLP request the browser sent: its path and JSON body. */
    readonly telemetry: Array<{ readonly path: string; readonly body: string }>
    /** Every span ChatApi recorded. */
    readonly spans: Array<Tracer.NativeSpan>
    /** The page reload the app asks for: it counts, and reloads nothing. */
    readonly reload: () => void
    readonly reloads: () => number
    /**
     * A fresh schema on the compose Postgres for a device's engine store (in place of SQLite on OPFS). Each one, and
     * every leader kept on it, goes when this ChatApi closes.
     */
    readonly engineStore: () => EngineStore
    /**
     * The git loop (worker/github/Api.ts) for `TEST_REPOSITORY`, with a GitHub App configured: every remote flow its
     * routes started (`starts`), and its Postgres, where a test writes what a remote flow would (`run`).
     */
    readonly github: {
      readonly starts: ReadonlyArray<Started>
      readonly run: <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.Effect<A>
    }
    /**
     * The branch workspace's routes (worker/branch/BranchApi.ts), as ChatApi routes them: the forge is GitHub, read with
     * no credential (`Forge.gitHub`), and GitHub is the scripted git host `github` (worker/test/branch.ts). No remote host
     * runs here, so each `terminal/Open` a route starts is recorded in `starts`, never run, and a test settles the
     * terminal's row itself, as the remote flow does, through `run`. The branches' machines are a test
     * `TerminalSockets` (`sockets`), standing in for the Cloudflare Durable Object binding. `refuseStarts(n)` makes the
     * next `n` starts fail as unavailable, as a Durable Object ChatApi can't reach does.
     */
    readonly branches: {
      readonly github: GitHost
      readonly starts: ReadonlyArray<Started>
      readonly sockets: Sockets
      readonly refuseStarts: (count: number) => void
      readonly run: <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.Effect<A>
    }
  }
>()("@smthrs/mvp/test/TestChatApi") {
  /** ChatApi on a scratch schema, every request signed in as `options.actor`: `member` unless set. */
  static readonly layerWith = (options: ChatApiOptions) =>
    Layer.effect(
      TestChatApi,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const { name: schema, database } = yield* TestDatabase.Scratch
        const actor = options.actor === undefined ? member : options.actor
        const sessions = actor === null
          ? Actor.signedOut
          : Layer.succeed(Actor.Sessions, Actor.Sessions.of({ resolve: Effect.succeedSome(actor) }))

        // Device engine stores: dropped when this ChatApi closes, after their leaders stop and every connection a
        // leader left open (named for its store) is ended, so the drop never waits on a write.
        const server = (yield* Effect.orDie(TestDatabase.serverUrl)).toString()
        const stores: Array<string> = []
        const leaders: Array<Fiber.Fiber<never, unknown>> = []
        yield* Effect.addFinalizer(() =>
          Fiber.interruptAll(leaders).pipe(
            Effect.andThen(
              Effect.forEach(
                stores,
                (store) =>
                  sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = ${store}`.pipe(
                    Effect.andThen(sql`DROP SCHEMA IF EXISTS ${sql(store)} CASCADE`),
                  ),
                { discard: true },
              ),
            ),
            Effect.orDie,
          )
        )

        // The model: one queue of events per request, written by the test through `answerTo`.
        const requests: Array<{
          readonly question: string
          readonly events: Queue.Queue<ModelEvent.ModelEvent, Model.ModelFailure | Cause.Done>
        }> = []
        // The agent's task: the last part of its system prompt, the question wrapped with the conversation before it.
        const questionOf = (request: ModelRequest.ModelRequest) => request.system.at(-1)?.text ?? ""
        const model = Model.make({
          stream: (request) =>
            Stream.unwrap(
              Effect.map(Queue.unbounded<ModelEvent.ModelEvent, Model.ModelFailure | Cause.Done>(), (events) => {
              requests.push({ question: questionOf(request), events })
                return Stream.fromQueue(events)
              }),
            ),
        })

        const spans: Array<Tracer.NativeSpan> = []
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options)
            spans.push(span)
            return span
          },
        })
        const config = ConfigProvider.fromUnknown({ ELECTRIC_URL: LOCAL_ELECTRIC_URL })
        const chat = yield* Chat.make(database).pipe(
          Effect.provide(
            Layer.succeed(
              HostModel,
              HostModel.of({
                modelId: "test-model",
                model,
                // Answering doesn't seal its model calls as durable steps yet, so nothing prepares a request.
                route: { prepare: () => Effect.die(new Error("the scripted model has no route")) },
              }),
            ),
          ),
          Effect.provideService(ConfigProvider.ConfigProvider, config),
        )

        // Repositories, as ChatApi routes them to RepoApi (worker/ChatApi.ts): this deployment has no Code Storage
        // organization, so a clone answers 503 `not_configured`; the `repositories` shape syncs from this schema.
        const repos = yield* RepoApi.make(database, { codeStorage: Option.none() }).pipe(
          Effect.provideService(ConfigProvider.ConfigProvider, config),
        )
        const repoCache = yield* Layer.build(ImmutableCache.layerMemory())

        // The git loop, as ChatApi routes it (worker/ChatApi.ts), with a GitHub App configured: no remote host runs
        // here, so a write's `github/Write` and a stale read's `github/Reconcile` are recorded in `starts`, never run. A
        // test writes their rows itself, through `github.run`.
        const repository = repositoryOf(TEST_REPOSITORY)
        const github = yield* GitHubApi.make(database, {
          repository,
          app: Option.some({
            appId: "1",
            privateKey: Redacted.make("no key"),
            webhookSecret: Option.none(),
            repository,
            apiBaseUrl: "http://github.test",
          }),
        }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config))
        const starts: Array<Started> = []
        const recording = Flows.FlowStarter.of({
          start: (flow, { executionId, payload }) => Effect.sync(() => void starts.push({ flow: flow._tag, executionId, payload })),
        })

        // The branch workspace, as ChatApi routes it (worker/ChatApi.ts): branches read from the scripted GitHub, each
        // `terminal/Open` recorded and never run, and a test `TerminalSockets` for the branches' machines.
        const branchApi = yield* BranchApi.make(database).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config))
        const branchGitHub = gitHost()
        const sockets = terminalSockets()
        const branchStarts: Array<Started> = []
        let refusing = 0
        const branchStarter = Flows.FlowStarter.of({
          start: (flow, { executionId, payload }) =>
            Effect.suspend(() => {
              if (refusing > 0) {
                refusing -= 1
                return Effect.fail(new Flows.StartUnavailable({ errorCode: "no_remote_host" }))
              }
              branchStarts.push({ flow: flow._tag, executionId, payload })
              return Effect.void
            }),
        })

        // Electric, as ChatApi calls it: the table in this schema. The forge's reads go to the scripted GitHub.
        const electric: typeof globalThis.fetch = (input, init) => {
          const upstream = new URL(input instanceof Request ? input.url : String(input))
          if (upstream.hostname === "github.com") return branchGitHub.fetch(input, init)
          const table = upstream.searchParams.get("table")
          if (table !== null && SCHEMA_TABLES.has(table)) upstream.searchParams.set("table", `${schema}.${table}`)
          return globalThis.fetch(upstream, init)
        }

        // ChatApi acknowledges an ask only once its answer's expiry started, so the chat routes' host takes every start,
        // as a Durable Object would, and runs none: no answer here lives 25 minutes.
        const expiries = Flows.FlowStarter.of({ start: () => Effect.void })

        const routed = Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
          const path = request.url.split("?")[0]!
          if (BranchApi.handles(path)) {
            return branchApi.fetch.pipe(
              Effect.provideService(Flows.FlowStarter, branchStarter),
              Effect.provideService(TerminalSockets, sockets.service),
              Effect.provide(Forge.gitHub),
            )
          }
          if (GitHubApi.handles(path)) return github.fetch.pipe(Effect.provideService(Flows.FlowStarter, recording))
          return path === REPOS_ROUTE || path.startsWith(`${REPOS_ROUTE}/`) || path === REPOSITORIES_SHAPE_ROUTE
            ? Effect.provideContext(repos.fetch, repoCache)
            : chat.fetch.pipe(Effect.provideService(Flows.FlowStarter, expiries))
        })

        const handler = HttpEffect.toWebHandler(
          routed.pipe(
            // No remote host runs here: every other remote start (a clone) is refused as unavailable.
            Effect.provideService(Flows.FlowStarter, Flows.FlowStarter.of({
              start: () => Effect.fail(new Flows.StartUnavailable({ errorCode: "no_remote_host" })),
            })),
            Effect.provide(sessions),
            Effect.provide(FetchHttpClient.layer),
            Effect.provideService(FetchHttpClient.Fetch, electric),
            Effect.provideService(Tracer.Tracer, tracer),
            Effect.provideService(ConfigProvider.ConfigProvider, config),
          ),
        )

        let reloads = 0
        const telemetry: Array<{ path: string; body: string }> = []
        const origin = options.origin ?? CHATAPI_ORIGIN
        const postQuestion = (body: unknown) =>
          handler(
            new Request(`${origin}${QUESTIONS_ROUTE}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
          )
        const statuses: Array<number> = []
        // Every other request and its status, for a test that fails waiting: `GET /api/answers/<id> 200`.
        const seen: Array<string> = []
        const fetch: typeof globalThis.fetch = async (input, init) => {
          const request = new Request(input, init)
          const { pathname } = new URL(request.url)
          if (pathname.startsWith(`${TELEMETRY_ROUTE}/`)) {
            telemetry.push({ path: pathname, body: await request.clone().text() })
          }
          const response = await handler(request)
          if (pathname === QUESTIONS_ROUTE) statuses.push(response.status)
          if (!pathname.startsWith(`${TELEMETRY_ROUTE}/`)) seen.push(`${request.method} ${pathname} ${response.status}`)
          return response
        }

        const answerTo = (question: string, nth = 0) =>
          Effect.sync(() =>
            Option.fromUndefinedOr(requests.filter((request) => request.question.includes(question))[nth])
          ).pipe(
            Effect.flatMap(Option.match({ onNone: () => Effect.fail("not asked yet"), onSome: Effect.succeed })),
            // Up to 20 s: the agent asks once its engine leads and its turn comes, later on a loaded machine.
            Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 2_000 }),
            Effect.catch(() =>
              Effect.die(
                new Error(
                  `The model was never asked this question; ${requests.length} model requests. ` +
                    `Requests: ${seen.filter((line) => !line.startsWith("GET /api/shapes/")).join(", ")}`,
                ),
              )
            ),
            Effect.map(({ events }): Reply => {
              let opened = false
              const delta = (text: string) => void Queue.offerUnsafe(events, { type: "text-delta", id: "t", text })
              // The cell's opening, once: the agent reads the answer from the literal its reply passes to `ctx.done`.
              const open = () => {
                if (!opened) delta("```cell\nctx.done(\"")
                opened = true
              }
              return {
                say: (text) => {
                  open()
                  delta(JSON.stringify(text).slice(1, -1))
                },
                done: () => {
                  open()
                  delta("\")\n```")
                  Queue.offerUnsafe(events, { type: "usage", inputTokens: 10, outputTokens: 20 })
                  Queue.offerUnsafe(events, { type: "settle", stopReason: "stop" })
                  Queue.endUnsafe(events)
                },
                cell: (source) => {
                  delta("```cell\n" + source + "\n```")
                  Queue.offerUnsafe(events, { type: "usage", inputTokens: 10, outputTokens: 20 })
                  Queue.offerUnsafe(events, { type: "settle", stopReason: "stop" })
                  Queue.endUnsafe(events)
                },
                // A refusal, which the agent's model step doesn't retry.
                fail: () =>
                  void Queue.failCauseUnsafe(
                    events,
                    Cause.fail(new ModelError.ModelError({ code: "content_policy", message: "scripted failure" })),
                  ),
              }
            }),
          )

        return TestChatApi.of({
          origin,
          fetch,
          answerTo,
          modelRequests: (question) => requests.filter((request) => request.question.includes(question)).length,
          questionStatuses: () => [...statuses],
          askElsewhere: (text) =>
            Effect.promise(async () => {
              const ids = { questionId: crypto.randomUUID(), answerId: crypto.randomUUID() }
              const response = await postQuestion({ id: ids.questionId, answerId: ids.answerId, text })
              if (response.status !== 202) throw new Error(`ChatApi answered ${response.status}`)
              return ids
            }),
          rows: sql<{ id: string; text: string; position: bigint }>`
            select id, text, position from ${sql(`${schema}.${MESSAGES_TABLE}`)} order by position`.pipe(
            Effect.map((rows) => rows.map((row) => ({ ...row, position: Number(row.position) }))),
            Effect.orDie,
          ),
          telemetry,
          spans,
          reload: () => {
            reloads += 1
          },
          reloads: () => reloads,
          engineStore: () => {
            const store = `flows_${crypto.randomUUID().replaceAll("-", "")}`
            stores.push(store)
            return { url: server, schema: store, keep: (leader) => void leaders.push(leader) }
          },
          github: {
            starts,
            run: (effect) => effect.pipe(Effect.provide(database), Effect.orDie),
          },
          branches: {
            github: branchGitHub,
            starts: branchStarts,
            sockets,
            refuseStarts: (count) => {
              refusing = count
            },
            run: (effect) => effect.pipe(Effect.provide(database), Effect.orDie),
          },
        })
      }),
    )

  /** ChatApi on a scratch schema, every request signed in as a Member. */
  static readonly layer = TestChatApi.layerWith({})
}

// Each tab counts into its own registry, so one test's metrics never leak into another's.
const ownMetrics = () => Layer.succeed(Metric.MetricRegistry, new Map())

/**
 * What `nodeDevice` adds to a `Host`: what its device stored, what its theme painted, what it copied, and where its tabs
 * went.
 */
export interface NodeDevice extends Host {
  /** How many rows the device's SQLite file holds for `collection`. */
  readonly stored: (collection: string) => number
  /** Every mode the theme painted on this device's page, in order. */
  readonly painted: ReadonlyArray<ThemeMode>
  /** Every text written to this device's clipboard, in order. */
  readonly copied: ReadonlyArray<string>
  /** Every path this device's tabs navigated to, in order. */
  readonly navigated: ReadonlyArray<string>
}

/** A device's own overrides of the host, and `agent`: the ChatApi whose questions its engine answers. */
export type DeviceOptions = Partial<Host> & {
  /**
   * Runs the device's engine as the browser does: each tab's worker a leader in waiting over every client flow, the
   * agent among them, reaching ChatApi `agent` through its `fetch`. Without it, no tab's worker ever leads, so nothing
   * this device dispatches runs.
   */
  readonly agent?: TestChatApi["Service"]
}

/**
 * An engine worker whose module fails to load: it reports an error it didn't catch, once its tab listens, so the tab
 * has no engine, for good. The shape the tab's engine expects: a Worker's.
 */
export const failingWorker = (): BrowserEngine.WorkerLike & Endpoint =>
  ({
    postMessage: () => {},
    addEventListener: (type: string, listener: (event: ErrorEvent) => void) =>
      void (type === "error" && queueMicrotask(() => listener({} as ErrorEvent))),
    removeEventListener: () => {},
    terminate: () => {},
  }) as never

/** An engine worker that never leads: what a tab dispatches waits until its scope closes. */
export const idleWorker = (): BrowserEngine.WorkerLike & Endpoint => ({
  terminate: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  postMessage: () => {},
})

/**
 * Starts a tab's engine worker in Node, as src/flows/engine.worker.ts does in a browser: `BrowserRuntime.serve` over
 * every client flow, leading once it holds the engine's Web Lock, its store on the device's Postgres schema in place
 * of SQLite on OPFS, and its HTTP through ChatApi's `fetch`. The worker is a `MessageChannel`: the leader reaches its
 * tab through one port (`TabPort`), and the tab answers on the other. Terminating it stops its leader.
 */
const leaderWorker = (api: TestChatApi["Service"], name: string, store: EngineStore) => () => {
  const channel = new MessageChannel()
  channel.port1.start()
  channel.port2.start()
  const http = Layer.provide(FetchHttpClient.layer, Layer.succeed(FetchHttpClient.Fetch, api.fetch))
  const engine = BrowserRuntime.layer(
    // The flows' own schemas render their runs' values for the run page (decision 0014 §3), as the worker's do.
    { name, flows: clientFlows },
    workerRegistrations(channel.port1, { origin: api.origin, name, partsEvery: "20 millis" }).pipe(Layer.provide(http)),
  ).pipe(
    Layer.provide(
      PostgresDatabase.layer({
        url: store.url,
        driver: Pg,
        schema: store.schema,
        postgres: { applicationName: store.schema },
      }),
    ),
  )
  const leader = Effect.runFork(
    BrowserRuntime.serve({ name, flows: clientFlows }, engine).pipe(
      Effect.provide(Layer.mergeAll(WebLock.layer, TabChannel.layer)),
      // The engine's own log lines stay out of the test's output.
      Effect.provideService(Logger.CurrentLoggers, new Set()),
    ),
  )
  store.keep(leader)
  return {
    postMessage: (message: unknown) => channel.port2.postMessage(message),
    addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
      if (type === "message") channel.port2.addEventListener("message", listener)
    },
    removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
      if (type === "message") channel.port2.removeEventListener("message", listener)
    },
    terminate: () => {
      Effect.runFork(Fiber.interrupt(leader))
      channel.port1.close()
      channel.port2.close()
    },
  } as BrowserEngine.WorkerLike & Endpoint
}

/**
 * A device in Node, as main.tsx's host is a browser's: its store is a SQLite file through TanStack DB's own browser
 * persistence (node:sqlite in place of OPFS), its outbox's storage a map in memory (in place of IndexedDB), led
 * through @smthrs/platform-browser's Web Lock service over Node's own Web Locks, and always online. Its theme paints
 * into `painted`, and the system is light; its clipboard keeps what is copied in `copied`, and its tabs' navigations go to `navigated`. Its engine has a name of its own; its tabs' workers never lead unless the
 * device runs its `agent`. A tab opened again on the same device is a reload: it restores what the last one stored.
 * Each device has its own locks, as each browser has its own Web Locks.
 */
export const nodeDevice = ({ agent, ...overrides }: DeviceOptions = {}): NodeDevice => {
  const path = join(tmpdir(), `mvp-device-${crypto.randomUUID()}.sqlite`)
  const entries = new Map<string, string>()
  const storage = {
    get: async (key: string) => entries.get(key) ?? null,
    set: async (key: string, value: string) => void entries.set(key, value),
    delete: async (key: string) => void entries.delete(key),
    keys: async () => [...entries.keys()],
    clear: async () => entries.clear(),
  }
  const device = `mvp-device-${crypto.randomUUID()}`
  const locks = navigator.locks
  const painted: Array<ThemeMode> = []
  const copied: Array<string> = []
  const navigated: Array<string> = []
  const engineName = `${device}-engine`
  const turn = deviceTurn()
  return {
    // As main.tsx's: one database per device, shared by its tabs through TanStack DB's coordinator, which Node runs on
    // its own Web Locks and BroadcastChannel.
    persistence: {
      open: () => sqliteFile(path, turn),
      make: (database, coordinator) => createBrowserWASQLitePersistence({ database, ...(coordinator ? { coordinator } : {}) }),
      coordinator: () => new BrowserCollectionCoordinator({ dbName: device }),
    },
    outbox: {
      start: startOfflineExecutor,
      storage,
      get online() {
        return Outbox.Online.always()
      },
    },
    // One browser's Web Locks: this device's lock names, apart from every other device's in this process.
    lock: WebLock.make({ request: (name, options, callback) => locks.request(`${device}/${name}`, options, callback) }),
    isOnline: () => true,
    storage: StoragePersistence.make({ persist: () => Promise.resolve(true) }),
    theme: { paint: (mode) => void painted.push(mode), mirror: () => {}, system: () => "light", painted: () => painted.at(-1) },
    clipboard: async (text) => void copied.push(text),
    navigate: (path) => void navigated.push(path),
    // No person's click or key reaches a test device, so no tab opens from one; a test of the gesture gives its own.
    web: { policy: { localHttp: false, appOrigin: CHATAPI_ORIGIN }, openTab: () => false },
    engineWorker: agent === undefined ? idleWorker : leaderWorker(agent, engineName, agent.engineStore()),
    engineName,
    // Sign-out's wipe: the device's SQLite file goes, and its outbox empties. The browser's reloads and deletes its
    // databases at the next boot; a tab here keeps any connection it holds open, so `stored` reads the new, empty file.
    wipe: async () => {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${path}${suffix}`, { force: true })
      entries.clear()
    },
    ...overrides,
    stored: (collection) => storedRows(path, collection),
    painted,
    copied,
    navigated,
  }
}

/**
 * How many rows the device's SQLite file holds for `collection`, read on a connection of its own. A synced row is
 * stored a moment after it shows, so a test that reloads waits for this first.
 */
const storedRows = (path: string, collection: string): number => {
  const database = new DatabaseSync(path)
  try {
    const registered = database
      .prepare("select name from sqlite_master where type = 'table' and name = 'collection_registry'")
      .get()
    if (registered === undefined) return 0
    const row = database.prepare("select table_name from collection_registry where collection_id = ?").get(collection) as
      | { table_name: string }
      | undefined
    if (row === undefined) return 0
    return Number((database.prepare(`select count(*) as n from "${row.table_name}"`).get() as { n: number }).n)
  } finally {
    database.close()
  }
}

/**
 * One device's turn at its SQLite file, as a browser's tabs take turns at `SharedSqlite`'s leader: one statement at a
 * time, and a transaction a tab opens is the tab's alone until a statement ends it; another tab's statement waits. Without
 * it, two tabs' transactions on one file can deadlock, and SQLite answers one `database is locked` at once.
 */
const deviceTurn = () => {
  let holder: object | undefined
  let waiting: Array<() => void> = []
  return {
    take: async (tab: object) => {
      while (holder !== undefined && holder !== tab) await new Promise<void>((resume) => waiting.push(resume))
      holder = tab
    },
    give: (tab: object) => {
      if (holder !== tab) return
      holder = undefined
      const resumed = waiting
      waiting = []
      for (const resume of resumed) resume()
    },
  }
}

/**
 * A SQLite file in Node, as TanStack DB's browser persistence reads a database: each tab opens its own connection, and
 * takes the device's `turn` for each statement, holding it while its transaction is open.
 */
const sqliteFile = (path: string, turn: ReturnType<typeof deviceTurn>) => {
  const database = new DatabaseSync(path, { timeout: 5_000 })
  const tab = {}
  return {
    execute: async <T>(sql: string, params: ReadonlyArray<unknown> = []): Promise<ReadonlyArray<T>> => {
      await turn.take(tab)
      try {
        const statement = database.prepare(sql)
        if (statement.columns().length > 0) return statement.all(...(params as Array<SQLInputValue>)) as Array<T>
        statement.run(...(params as Array<SQLInputValue>))
        return []
      } finally {
        if (!database.isTransaction) turn.give(tab)
      }
    },
    close: () => {
      database.close()
      turn.give(tab)
    },
  }
}

/**
 * A tab's deadlines, sync policy, page size and device (`AppOptions`). Without `host`, a device of its own, which runs
 * its agent (`nodeDevice`'s `agent`), as a browser's leading engine worker does, unless `answers` is `false`: then its
 * engine never leads, so a question it sends waits for a run to be recorded and nothing after it is sent.
 */
export type TabOptions = Partial<Omit<AppOptions, "origin" | "reload" | "fetch">> & {
  readonly answers?: boolean
  /** A client in place of the real one, for an unhappy path: a faulty `IssuesClient` (test.faults-by-injection). */
  readonly replace?: Layer.Layer<IssuesClient, never, HttpClient.HttpClient>
}

/** Switches a faulty tab throws on its shape source before it syncs. */
export type StartFaults = (switches: ShapeSource.Switches) => Effect.Effect<void>

const app = (api: TestChatApi["Service"], { answers, host, replace: _replace, ...options }: TabOptions): AppOptions => ({
  ...options,
  origin: api.origin,
  fetch: api.fetch,
  reload: api.reload,
  host: host ?? nodeDevice(answers === false ? {} : { agent: api }),
})

/** The browser app on `api` (`appLayer`, as main.tsx's `start` builds it), with the real services. */
export const tabLayer = (api: TestChatApi["Service"], options: TabOptions = {}) => {
  const tab = app(api, options)
  return appLayer(tab, Layer.merge(realServices(tab), options.replace ?? Layer.empty))
}

/** The browser app on `api` with the faulty services and their switches (src/test/faults.ts). */
export const faultyTabLayer = (api: TestChatApi["Service"], options: TabOptions = {}, start?: StartFaults) => {
  const tab = app(api, options)
  return appLayer(tab, faultyServices(tab, start))
}

const withChatApi = <A, E>(tab: (api: TestChatApi["Service"]) => Layer.Layer<A, E>, chatApi: ChatApiOptions) =>
  Layer.unwrap(Effect.map(TestChatApi, tab)).pipe(
    Layer.provideMerge(TestChatApi.layerWith(chatApi)),
    Layer.provideMerge(TestDatabase.layer("test_chat")),
    Layer.provideMerge(ownMetrics()),
  )

/**
 * The browser app over a fresh ChatApi (`chatApi`: signed in as a Member unless set), on its own runtime. Dispose the
 * runtime to close everything; the browser's OTLP exporter flushes then.
 */
export const openTestApp = (options: TabOptions = {}, chatApi: ChatApiOptions = {}) =>
  ManagedRuntime.make(withChatApi((api) => tabLayer(api, options), chatApi))

/** The same with the faulty services, for a test of an unhappy path. */
export const openFaultyApp = (options: TabOptions = {}, start?: StartFaults, chatApi: ChatApiOptions = {}) =>
  ManagedRuntime.make(withChatApi((api) => faultyTabLayer(api, options, start), chatApi))

/** Another tab, or device, on the same ChatApi. Dispose it before the runtime that holds the ChatApi. */
export const openTab = (api: TestChatApi["Service"], options: TabOptions = {}) =>
  ManagedRuntime.make(tabLayer(api, options).pipe(Layer.provideMerge(ownMetrics())))

/** Another tab with the faulty services. */
export const openFaultyTab = (api: TestChatApi["Service"], options: TabOptions = {}, start?: StartFaults) =>
  ManagedRuntime.make(faultyTabLayer(api, options, start).pipe(Layer.provideMerge(ownMetrics())))
