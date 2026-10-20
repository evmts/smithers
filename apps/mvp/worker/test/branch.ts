// The branch workspace's real routes (worker/branch/BranchApi.ts) for the worker tests, on a test file's own schema of
// the compose Postgres and through the compose Electric (`pnpm db:up`, db/TestDatabase.ts). GitHub is scripted at the
// network, as the model is: a git host that answers the two smart HTTP requests a forge read sends, `GET
// <repo>.git/info/refs?service=git-upload-pack` (protocol v0) and `POST <repo>.git/git-upload-pack` with protocol
// v2's `ls-refs`. The forge is the production one, `Forge.layerConfig`, over Effect's `FetchHttpClient`. Flow starts
// are recorded, and the branch's machine is a test `TerminalSockets`, standing in for the Cloudflare Durable Object
// binding (worker/BranchSandboxes.ts). Every log line, span and metric the routes record is kept.
import { Logger as StructuredLogger } from "@smthrs/observability"
import { ConfigProvider, Effect, Layer, Logger, Metric, Tracer } from "effect"
import { FetchHttpClient, HttpEffect, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { TERMINALS_TABLE } from "../../src/features/terminal/contract.ts"
import * as Actor from "../Actor.ts"
import * as BranchApi from "../branch/BranchApi.ts"
import * as Conversations from "../branch/Conversations.ts"
import { Forge } from "../branch/Forge.ts"
import { type Attachment, TerminalSockets } from "../branch/Sandboxes.ts"
import * as Flows from "../Flows.ts"
import { signedIn, type testFile } from "./harness.ts"

type Runtime = ReturnType<typeof testFile>

const encoder = new TextEncoder()

/** One pkt-line: four hex digits of length, counting themselves, then the payload's UTF-8 bytes. */
const pkt = (line: string): Uint8Array => {
  const payload = encoder.encode(line)
  const framed = new Uint8Array(payload.length + 4)
  framed.set(encoder.encode((payload.length + 4).toString(16).padStart(4, "0")), 0)
  framed.set(payload, 4)
  return framed
}

const FLUSH = encoder.encode("0000")

const concat = (parts: ReadonlyArray<Uint8Array>) => {
  const body = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.length
  }
  return body
}

/** A 40-hex SHA made from `seed`. */
export const shaOf = (seed: string): string => {
  let hex = ""
  for (let index = 0; hex.length < 40; index++) {
    hex += ((seed.charCodeAt(index % seed.length) * (index + 11)) % 256).toString(16).padStart(2, "0")
  }
  return hex.slice(0, 40)
}

/** A repository on the scripted GitHub: its default branch and each branch's head, by name. */
export interface GitHubRepository {
  readonly defaultBranch: string
  readonly branches: Readonly<Record<string, string>>
  /** A private repository answers only a request that carries a credential; without one, 401, as GitHub does. */
  readonly private?: boolean
}

/** What the scripted GitHub saw of one request. */
export interface Seen {
  readonly method: string
  readonly path: string
  readonly authorization: string | null
  readonly gitProtocol: string | null
  /** For `git-upload-pack`: the ref prefixes `ls-refs` asked for. */
  readonly prefixes: ReadonlyArray<string>
}

/**
 * A scripted GitHub git host on `https://github.com`: repositories by `owner/name` (any case), every request it saw,
 * and a queue of one-shot faults per method (a `Response` to answer instead, or `"throw"` for no answer at all): `GET`
 * is the HEAD read (`info/refs`), `POST` the branch read (`ls-refs`). `hold` keeps every answer back until the function
 * it returns is called.
 */
export const gitHost = () => {
  const repositories = new Map<string, GitHubRepository>()
  const seen: Array<Seen> = []
  const faults = { GET: [] as Array<Response | "throw">, POST: [] as Array<Response | "throw"> }
  let held: Promise<void> | undefined

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const body = request.method === "POST" ? new TextDecoder().decode(await request.arrayBuffer()) : ""
    const prefixes = [...body.matchAll(/ref-prefix ([^\n]+)\n/g)].map((match) => match[1]!)
    seen.push({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      authorization: request.headers.get("authorization"),
      gitProtocol: request.headers.get("git-protocol"),
      prefixes,
    })
    if (held !== undefined) await held
    const fault = faults[request.method === "POST" ? "POST" : "GET"].shift()
    if (fault === "throw") throw new TypeError("fetch failed")
    if (fault !== undefined) return fault
    const route = /^\/([^/]+)\/([^/]+)\.git\/(info\/refs|git-upload-pack)$/.exec(url.pathname)
    const repository = route === null ? undefined : repositories.get(`${route[1]}/${route[2]}`.toLowerCase())
    if (route === null || repository === undefined) return new Response("Repository not found.", { status: 404 })
    if (repository.private === true && request.headers.get("authorization") === null) {
      return new Response("", { status: 401, headers: { "www-authenticate": 'Basic realm="GitHub"' } })
    }
    const refs = Object.entries(repository.branches).sort(([a], [b]) => a.localeCompare(b))
    if (route[3] === "info/refs") {
      if (request.method !== "GET" || url.searchParams.get("service") !== "git-upload-pack") {
        return new Response("", { status: 403 })
      }
      const head = repository.branches[repository.defaultBranch]!
      const advertisement = concat([
        pkt("# service=git-upload-pack\n"),
        FLUSH,
        pkt(`${head} HEAD\0multi_ack thin-pack symref=HEAD:refs/heads/${repository.defaultBranch} agent=git/github\n`),
        ...refs.map(([name, sha]) => pkt(`${sha} refs/heads/${name}\n`)),
        FLUSH,
      ])
      return new Response(advertisement, {
        headers: { "content-type": "application/x-git-upload-pack-advertisement" },
      })
    }
    if (request.headers.get("git-protocol") !== "version=2" || !body.includes("command=ls-refs\n")) {
      return new Response("", { status: 400 })
    }
    const answered = refs.filter(([name]) => prefixes.some((prefix) => `refs/heads/${name}`.startsWith(prefix)))
    return new Response(concat([...answered.map(([name, sha]) => pkt(`${sha} refs/heads/${name}\n`)), FLUSH]), {
      headers: { "content-type": "application/x-git-upload-pack-result" },
    })
  }

  return {
    fetch,
    seen,
    /** Puts `repository` on GitHub as `owner/name`. */
    publish: (owner: string, name: string, repository: GitHubRepository) =>
      void repositories.set(`${owner}/${name}`.toLowerCase(), repository),
    /** The next `method` requests get these answers, one each, instead of the repository's. */
    fail: (method: "GET" | "POST", ...answers: ReadonlyArray<Response | "throw">) => void faults[method].push(...answers),
    hold: () => {
      let release = () => {}
      held = new Promise<void>((resolve) => (release = resolve))
      return () => {
        held = undefined
        release()
      }
    },
  }
}

export type GitHost = ReturnType<typeof gitHost>

/**
 * A branch's machine as the terminal routes reach it: every `attach` and `alive` call, in order. `alive` answers
 * `true` unless set. `attach` answers 200 with the attachment, as the host's 101 can't be a web `Response` here.
 */
export const terminalSockets = () => {
  const state = { alive: true }
  const attached: Array<{ readonly branchId: string; readonly attachment: Attachment }> = []
  const checked: Array<{ readonly branchId: string; readonly terminalId: string; readonly ownerId: string }> = []
  const service = TerminalSockets.of({
    attach: (branchId, attachment) =>
      Effect.sync(() => {
        attached.push({ branchId, attachment })
        return HttpServerResponse.jsonUnsafe({ attached: attachment })
      }),
    alive: (branchId, terminalId, ownerId) =>
      Effect.sync(() => {
        checked.push({ branchId, terminalId, ownerId })
        return state.alive
      }),
  })
  return {
    service,
    attached,
    checked,
    set alive(value: boolean) {
      state.alive = value
    },
  }
}

export type Sockets = ReturnType<typeof terminalSockets>

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

interface BranchOptions {
  /** Who is signed in on every request: nobody unless set. */
  readonly actor?: Actor.Actor
  /** Sessions in place of `actor`. */
  readonly sessions?: Layer.Layer<Actor.Sessions>
  /** The database the routes connect to: the file's schema unless set. */
  readonly database?: Layer.Layer<SqlClient.SqlClient, unknown>
  /** Where a route starts a remote flow: one that records each start in `starts` unless set. */
  readonly starter?: Flows.FlowStarter["Service"]
  /** The routes' configuration, in place of the environment. */
  readonly config?: Record<string, string>
  /** The scripted GitHub: a fresh one unless set. */
  readonly github?: GitHost
  /** The branch machines' sockets: a fresh `terminalSockets()` unless set. */
  readonly sockets?: TerminalSockets["Service"]
}

/** The branch workspace's routes on the file's schema, recording every log line, span, metric and Electric request. */
export const branchHarness = async (runtime: Runtime, options: BranchOptions = {}) => {
  const scratch = await runtime.runPromise(Effect.service(TestDatabase.Scratch))
  const database = options.database ?? scratch.database
  const github = options.github ?? gitHost()
  const sockets = terminalSockets()
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
  const starts: Array<{ readonly flow: string; readonly executionId: string; readonly payload: unknown }> = []
  /** Every request sent to Electric, as sent, before the table is pointed at the file's schema. */
  const electric: Array<URL> = []
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === "github.com") return github.fetch(input, init)
    electric.push(new URL(url))
    if (url.searchParams.get("table") === TERMINALS_TABLE) {
      url.searchParams.set("table", `${scratch.name}.${TERMINALS_TABLE}`)
    }
    return globalThis.fetch(url, init)
  }
  const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(options.config ?? {})),
    )
  const api = await runtime.runPromise(observed(BranchApi.make(database)))
  const starter = options.starter ?? Flows.FlowStarter.of({
    start: (flow, { executionId, payload }) =>
      Effect.sync(() => void starts.push({ flow: flow._tag, executionId, payload })),
  })
  const handler = HttpEffect.toWebHandler(
    observed(
      api.fetch.pipe(
        Effect.provideService(Flows.FlowStarter, starter),
        Effect.provideService(TerminalSockets, options.sockets ?? sockets.service),
        Effect.provide(options.sessions ?? (options.actor === undefined ? Actor.signedOut : signedIn(options.actor))),
        Effect.provide(Forge.layerConfig.pipe(Layer.provideMerge(FetchHttpClient.layer))),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    ),
  )
  const line = (message: string) => logs.filter((log) => log.message === message)
  return {
    fetch: (path: string, init?: RequestInit) => handler(new Request(`http://chat.test${path}`, init)),
    github,
    sockets,
    starts,
    electric,
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      runtime.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(
          Effect.provideService(Metric.MetricRegistry, registry),
        ),
      ).count,
    snapshot: () => runtime.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry))),
    line,
    /** The one line logged with this message. */
    only: (message: string) => {
      const lines = line(message)
      if (lines.length !== 1) throw new Error(`expected one ${message} line, got ${lines.length}`)
      return lines[0]!
    },
    span: (name: string) => spans.filter((span) => span.name === name),
    spans,
    logs,
  }
}

export type BranchHarness = Awaited<ReturnType<typeof branchHarness>>

/**
 * Empties the branch workspace's tables but the home branch and its conversation, which 0014_branch_workspace made and
 * every ask that names no conversation needs. Runs after `testFile`'s own `beforeEach`, which empties messages and views.
 */
export const resetBranches = (runtime: Runtime) =>
  runtime.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const home = yield* Conversations.home
    yield* sql`DELETE FROM terminal_sessions`
    yield* sql`DELETE FROM conversations WHERE id <> ${home!}`
    yield* sql`DELETE FROM branches WHERE id NOT IN (SELECT branch_id FROM conversations)`
  }))

/** Records branch `name` of `repo` with its conversation, as `POST /api/branches` does: its ids. */
export const tracked = (runtime: Runtime, repo: string, name: string, mode: "locked" | "open" | "restricted" = "open") =>
  runtime.runPromise(
    Effect.map(Conversations.track(repo, name, mode, shaOf(`${repo}:${name}`)), (result) => result.branch),
  )

/** A terminal's row as Postgres holds it. */
export interface TerminalRow {
  readonly id: string
  readonly branchId: string
  readonly ownerId: string
  readonly ownerLogin: string
  readonly status: string
  readonly generation: string | null
  readonly failure: string | null
  readonly endedReason: string | null
  readonly ended: boolean
}

/** Every terminal of branch `branchId`, oldest first. */
export const terminalRows = (runtime: Runtime, branchId: string) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql<TerminalRow>`
      SELECT id, branch_id AS "branchId", owner_id AS "ownerId", owner_login AS "ownerLogin", status,
        generation::text AS generation, failure, ended_reason AS "endedReason", ended_at IS NOT NULL AS ended
      FROM terminal_sessions WHERE branch_id = ${branchId} ORDER BY created_at, id`))

/** Inserts terminal `id` of `ownerId` on `branchId` as it stands after an open: `status`, created `ageSeconds` ago. */
export const terminal = (
  runtime: Runtime,
  row: {
    readonly id: string
    readonly branchId: string
    readonly ownerId: string
    readonly status: "opening" | "open" | "ended" | "failed"
    readonly ageSeconds?: number
  },
) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`
      INSERT INTO terminal_sessions (id, branch_id, owner_id, owner_login, status, generation, ended_reason, failure,
        created_at)
      VALUES (${row.id}, ${row.branchId}, ${row.ownerId}, ${row.ownerId}, ${row.status},
        ${row.status === "open" ? 1 : null}, ${row.status === "ended" ? "closed" : null},
        ${row.status === "failed" ? "unavailable" : null}, now() - make_interval(secs => ${row.ageSeconds ?? 0}))`))
