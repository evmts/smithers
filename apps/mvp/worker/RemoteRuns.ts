import { ShapeProxy } from "@smthrs/effect-electric"
import type { Flow } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { Cause, Clock, Effect, type Layer, Metric, Option, Predicate, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { LOCAL_ELECTRIC_URL } from "../src/features/chat/contract.ts"
import {
  isRemoteRun,
  JOURNAL_PAGE,
  REMOTE_RUN_SHAPE_ROUTE,
  type RemoteReadRefusal,
  REMOTE_RUNS_ROUTE,
  RUN_CHANGE_COLUMNS,
  RUN_CHANGES_TABLE,
} from "../src/features/runs/contract.ts"
import { Sessions } from "./Actor.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ShapeAccess from "./ShapeAccess.ts"
import { mayRead } from "./stack/Access.ts"

// Runs Smithers runs on Cloudflare, read from the browser (ruling TODO-3, docs/features/runs.md#a-run-on-cloudflare).
// A TODO's `todo` run lives in the engine's Postgres schema, not on any device, so a person watches it through two
// routes, both for a signed-in Member or above, as the TODO itself, and only for a run some TODO's attempt started:
//
// - `GET /api/remote-runs/<runId>?afterSeq=<n>&limit=<n>`: the run as the engine's own `RunInspection`
//   (`@smthrs/engine-store`) reads it, the same read a device's engine answers its run page with. Every value is
//   redacted, rendered through its flow's or step's schema (`<redacted>`, `<withheld>`), reduced to a code when it is
//   a failure, and cut to 16 KiB before it leaves the engine. Never cached.
// - `GET /api/shapes/remote-runs?run=<runId>`: Electric's row of that run in the engine's change feed
//   (`flows_run_changes`: the run id and its revision, which moves whenever the run's row does), so the page reads the
//   run again as it works, with no polling.
//
// Each read is a span and a log line `run.inspect` with the host (`remote`), its outcome, how many events and bytes it
// released, how many values were cut and how long it took, and one count by outcome: never a value of a run.

/** Remote run reads, by `outcome`: `read`, or the refusal's code. */
export const reads = Metric.counter("smithers_remote_run_reads", {
  description: "GET /api/remote-runs/<runId> requests, by outcome",
  incremental: true,
})

/** Change shape requests, by `status` and `live`. */
export const shapeRequests = Metric.counter("smithers_remote_run_shape_requests", {
  description: "GET /api/shapes/remote-runs requests, by status and live",
  incremental: true,
})

/** Where the runs are: the engine's own database, its schema (the shape's table lives there), and its flows. */
export interface Engine<E, R> {
  /** The engine's `SqlClient`, in its schema (worker/ExecutionHost.ts `database`). */
  readonly database: Layer.Layer<SqlClient.SqlClient, E, R>
  /** The engine's Postgres schema, `smithers_flows` when deployed (worker/ExecutionHost.ts `ENGINE_SCHEMA`). */
  readonly schema: string
  /** The flows whose runs render through their own schemas: the remote flows a TODO starts. */
  readonly flows: ReadonlyArray<Flow.Any>
}

/** A run route's run, from `/api/remote-runs/<runId>`: the id, as the path names it; none for any other path. */
export const parseRunPath = (path: string): string | undefined => {
  if (!path.startsWith(`${REMOTE_RUNS_ROUTE}/`)) return undefined
  const rest = path.slice(REMOTE_RUNS_ROUTE.length + 1)
  if (rest === "" || rest.includes("/")) return undefined
  try {
    return decodeURIComponent(rest)
  } catch {
    return undefined
  }
}

/** Whether a path is one of the remote runs' routes. */
export const handles = (path: string): boolean => path === REMOTE_RUN_SHAPE_ROUTE || parseRunPath(path) !== undefined

const AfterSeq = Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1))
const Limit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: JOURNAL_PAGE }))
const decodeAfterSeq = Schema.decodeUnknownOption(Schema.NumberFromString.pipe(Schema.decodeTo(AfterSeq)))
const decodeLimit = Schema.decodeUnknownOption(Schema.NumberFromString.pipe(Schema.decodeTo(Limit)))

/** A query parameter as a number within its bounds: its default when absent, none when it isn't one. */
const parameter = (
  query: URLSearchParams,
  name: string,
  decode: (text: string) => Option.Option<number>,
  fallback: number,
): Option.Option<number> => {
  const text = query.get(name)
  return text === null ? Option.some(fallback) : decode(text)
}

/** The TODO attempt whose run `runId` is, if a TODO's attempt started it: `todo:<attempt id>`. */
const attemptOf = (runId: string) =>
  Effect.gen(function* () {
    if (!isRemoteRun(runId)) return Option.none<string>()
    const sql = yield* SqlClient.SqlClient
    const attemptId = runId.slice("todo:".length)
    const rows = yield* sql<{ readonly id: string }>`SELECT id::text FROM todo_attempts WHERE id = ${attemptId}::uuid`
    return Option.map(Option.fromNullishOr(rows[0]), (row) => row.id)
  })

/** How many of an inspection's values were cut to their limit. */
const clippedValues = (inspection: EngineStore.RunInspection.Inspection): number =>
  [
    inspection.run.input,
    inspection.run.result,
    ...inspection.steps.flatMap((step) => [step.output, ...step.attempts.map((attempt) => attempt.outcome)]),
    ...inspection.children.flatMap((child) => [child.input, child.result]),
    ...inspection.journal.events.map((event) => event.payload),
  ].filter((value) => value?.clipped === true).length

const noStore = { "cache-control": "no-store" }

/**
 * Reads Electric's connection and returns the routes over `database`, the app's tables (`todo_attempts`), and `engine`.
 * They read who is asking from `Sessions`.
 */
export const make = <E, R, EE, ER>(database: Layer.Layer<SqlClient.SqlClient, E, R>, engine: Engine<EE, ER>) =>
  Effect.gen(function* () {
    const connection = yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })
    const inspection = EngineStore.RunInspection.layerWith({ flows: engine.flows })

    /** `GET /api/remote-runs/<runId>`. */
    const read = (runId: string) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const startedAt = yield* Clock.currentTimeMillis
        const fields: Record<string, string | number> = { host: "remote" }
        const refused = (status: number, code: RemoteReadRefusal) => {
          fields.outcome = code
          return HttpServerResponse.jsonUnsafe({ code }, {
            status,
            headers: status === 503 ? { ...noStore, "retry-after": String(ShapeAccess.RETRY_AFTER_SECONDS) } : noStore,
          })
        }
        const response = yield* Effect.gen(function* () {
          if (request.method !== "GET") {
            fields.outcome = "method"
            return HttpServerResponse.empty({ status: 405, headers: { allow: "GET" } })
          }
          const actor = yield* (yield* Sessions).resolve.pipe(Effect.option)
          if (Option.isNone(actor)) return refused(503, "unavailable")
          if (Option.isNone(actor.value)) return refused(401, "authentication")
          if (!mayRead(actor.value)) return refused(403, "forbidden")
          const query = new URL(request.url, "http://localhost").searchParams
          const afterSeq = parameter(query, "afterSeq", decodeAfterSeq, -1)
          const limit = parameter(query, "limit", decodeLimit, JOURNAL_PAGE)
          if (Option.isNone(afterSeq) || Option.isNone(limit)) return refused(400, "invalid")
          const attempt = yield* attemptOf(runId).pipe(Effect.provide(database))
          if (Option.isNone(attempt)) return refused(404, "not_found")
          fields.runId = runId
          const read = yield* Effect.flatMap(
            EngineStore.RunInspection.RunInspection,
            (reads) => reads.inspect(runId, { afterSeq: afterSeq.value, limit: limit.value }),
          ).pipe(Effect.provide(inspection), Effect.provide(engine.database), Effect.result)
          if (read._tag === "Failure") {
            if (Predicate.isTagged(read.failure, "@smthrs/engine-store/RunNotFound")) return refused(404, "not_started")
            fields.errorCode = codeOf(read.failure)
            return refused(503, "unavailable")
          }
          const body = JSON.stringify(read.success)
          fields.outcome = "read"
          fields.events = read.success.journal.events.length
          fields.bytes = new TextEncoder().encode(body).length
          fields.clipped = clippedValues(read.success)
          return HttpServerResponse.text(body, { contentType: "application/json", headers: noStore })
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              fields.errorCode = codeOf(Cause.squash(cause))
              return refused(503, "unavailable")
            })
          ),
        )
        const outcome = String(fields.outcome)
        fields.status = response.status
        fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
        yield* Metric.update(Metric.withAttributes(reads, { outcome }), 1)
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status, "smithers.run.host": "remote", outcome })
        yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
          "run.inspect",
        ).pipe(Effect.annotateLogs({ ...fields, outcome }))
        return response
      }).pipe(Effect.withSpan("run.inspect", { kind: "server" }))

    /** `GET /api/shapes/remote-runs?run=<runId>`: the run's row of the change feed, for a Member; refused otherwise. */
    const changes = ShapeProxy.make({
      ...connection,
      shape: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const actor = yield* ShapeAccess.actor
        if (Option.isNone(actor)) return yield* new ShapeProxy.Refused({ status: 401 })
        if (!mayRead(actor)) return yield* new ShapeProxy.Refused({ status: 403 })
        const runId = new URL(request.url, "http://localhost").searchParams.get("run") ?? ""
        const attempt = yield* attemptOf(runId).pipe(
          Effect.provide(database),
          Effect.mapError(() => ShapeAccess.unavailable),
        )
        // A run no TODO started is no Member's to follow.
        if (Option.isNone(attempt)) return yield* new ShapeProxy.Refused({ status: 403 })
        return {
          table: `${engine.schema}.${RUN_CHANGES_TABLE}`,
          where: "run_id = $1",
          params: { "1": runId },
          columns: RUN_CHANGE_COLUMNS,
        }
      }),
      name: "runs.shape.remote",
      metric: shapeRequests,
    })

    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      if (path === REMOTE_RUN_SHAPE_ROUTE) return yield* changes
      const runId = parseRunPath(path)
      return runId === undefined ? HttpServerResponse.empty({ status: 404 }) : yield* read(runId)
    })
    return { fetch }
  })
