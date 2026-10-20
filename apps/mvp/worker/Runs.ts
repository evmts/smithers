import { ShapeProxy } from "@smthrs/effect-electric"
import { Cause, Clock, Effect, type Layer, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { LOCAL_ELECTRIC_URL } from "../src/features/chat/contract.ts"
import { MAX_RUN_BODY_BYTES, RUNS_TABLE } from "../src/features/status/contract.ts"
import { type Report, Report as ReportSchema, type RunAnswer, RunAnswer as RunAnswerSchema } from "../src/features/status/schema.ts"
import { canAsk, Sessions } from "./Actor.ts"
import { readBounded } from "./Body.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ShapeAccess from "./ShapeAccess.ts"

// Agent status in ChatApi (decision 0015, docs/features/agent-status.md#the-routes): the `runs` rows a run's own steps
// report its status to, the answer a person gives its open question, and Electric's `runs` shape.
//
// - `POST /api/runs/<id>`: a run reports. In this slice a run is an agent's answer, so `<id>` is an answer's id and only
//   the person who asked its question may report for it (an agent acting for them is them), while they may still ask.
//   A settled row (`done`, `failed`) never changes; a new question bumps `version` and clears the answer; a report
//   that changes nothing writes nothing.
// - `POST /api/runs/<id>/answer`: the person answers the open question `version` names. The first accepted answer
//   settles it; the same answer again is taken as landed; anything else is `409 not_open`.
// - `GET /api/shapes/runs`: the signed-in person's rows, without `launched_by`. Signed out, no rows.

/** Runs route requests, by `route` (`report`, `answer`) and `status`. */
export const requests = Metric.counter("smithers_run_requests", {
  description: "Requests to the runs routes, by route and status",
  incremental: true,
})

/** `GET /api/shapes/runs` requests, by `status` and `live`. */
export const shapes = Metric.counter("smithers_run_shape_requests", {
  description: "GET /api/shapes/runs requests, by status and live",
  incremental: true,
})

/** The `runs` columns a device syncs: all of them but `launched_by`, which the shape filters on. */
export const SYNCED_RUN_COLUMNS = [
  "id",
  "flow",
  "status",
  "waiting",
  "wait",
  "version",
  "answer",
  "answered_at",
  "created_at",
  "updated_at",
]

/** The flow of every run that reports in this slice: an agent's answer. */
const AGENT_RUN_FLOW = "chat/Answer"

/** No person's id: what a signed-out shape filters on, so it holds no rows. */
const NOBODY = ""

const decodeReport = Schema.decodeUnknownEffect(Schema.fromJsonString(ReportSchema))
const decodeAnswer = Schema.decodeUnknownEffect(Schema.fromJsonString(RunAnswerSchema))
const isUuid = Schema.is(Schema.String.check(Schema.isUUID()))

type Fields = Record<string, string | number | boolean>

const noStore = { "cache-control": "no-store" }
const refusal = (status: number, code: string) => HttpServerResponse.jsonUnsafe({ code }, { status, headers: noStore })
const ok = (txid: number | null) => HttpServerResponse.jsonUnsafe({ txid }, { headers: noStore })

/** Who asked the question of the answer `runId`: `undefined` when it isn't an answer, `null` for an unknown asker. */
const askerOf = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly askedBy: string | null }>`
      SELECT q.asked_by AS "askedBy" FROM messages a JOIN messages q ON q.id = a.question_id
      WHERE a.id = ${runId} AND a.role = 'assistant'`
    return row === undefined ? undefined : row.askedBy
  })

/**
 * Writes `report` to the run's row for `launchedBy`: its transaction, or `undefined` when the row is settled, belongs
 * to someone else, or already says exactly this. A question whose `execution` differs from the row's last one is a new
 * question: `version` goes up and the last answer is cleared. The same question reported again never reopens it.
 */
const applyReport = (runId: string, launchedBy: string, report: Report) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const waiting = report.status === "waiting" ? report.waiting : report.status === "needs_you"
      ? report.wait.kind === "approval" ? "approval" : "input"
      : null
    const wait = report.status === "needs_you" ? JSON.stringify(report.wait) : null
    const [row] = yield* sql<{ readonly txid: string }>`
      INSERT INTO runs AS r (id, flow, status, waiting, wait, version, launched_by)
      VALUES (${runId}, ${AGENT_RUN_FLOW}, ${report.status}, ${waiting}, ${wait}::jsonb,
        ${report.status === "needs_you" ? 1 : 0}, ${launchedBy})
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        waiting = EXCLUDED.waiting,
        wait = COALESCE(EXCLUDED.wait, r.wait),
        version = CASE WHEN EXCLUDED.wait IS NOT NULL AND r.wait->>'execution' IS DISTINCT FROM EXCLUDED.wait->>'execution'
          THEN r.version + 1 ELSE r.version END,
        answer = CASE WHEN EXCLUDED.wait IS NOT NULL AND r.wait->>'execution' IS DISTINCT FROM EXCLUDED.wait->>'execution'
          THEN NULL ELSE r.answer END,
        answered_at = CASE WHEN EXCLUDED.wait IS NOT NULL AND r.wait->>'execution' IS DISTINCT FROM EXCLUDED.wait->>'execution'
          THEN NULL ELSE r.answered_at END,
        updated_at = now()
      WHERE r.launched_by = EXCLUDED.launched_by AND r.status NOT IN ('done', 'failed')
        AND NOT (r.status = EXCLUDED.status AND r.waiting IS NOT DISTINCT FROM EXCLUDED.waiting
          AND (EXCLUDED.wait IS NULL OR r.wait = EXCLUDED.wait))
        AND NOT (EXCLUDED.wait IS NOT NULL AND r.wait->>'execution' = EXCLUDED.wait->>'execution' AND r.answer IS NOT NULL)
      RETURNING pg_current_xact_id()::xid::text AS txid`
    return row === undefined ? undefined : Number(row.txid)
  })

/** The run's row as the answer route reads it. */
const runOf = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly launchedBy: string
      readonly status: string
      readonly version: number
      readonly kind: string | null
      readonly answer: { readonly value: unknown } | null
    }>`
      SELECT launched_by AS "launchedBy", status, version, wait->>'kind' AS kind, answer FROM runs WHERE id = ${runId}`
    return row
  })

/** Whether `value` answers a question of `kind`: words for a question, a yes or no for an approval. */
const fits = (kind: string | null, value: RunAnswer["value"]) =>
  kind === "approval" ? typeof value === "boolean" : typeof value === "string" && value.trim() !== ""

/** Records the answer to the open question `version` names, for `launchedBy`: its transaction, or `undefined`. */
const applyAnswer = (runId: string, launchedBy: string, answer: RunAnswer) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const value = typeof answer.value === "string" ? answer.value.trim() : answer.value
    const [row] = yield* sql<{ readonly txid: string }>`
      UPDATE runs SET answer = jsonb_build_object('value', ${JSON.stringify(value)}::jsonb), answered_at = now(),
        updated_at = now()
      WHERE id = ${runId} AND launched_by = ${launchedBy} AND status = 'needs_you' AND version = ${answer.version}
        AND answer IS NULL
      RETURNING pg_current_xact_id()::xid::text AS txid`
    return row === undefined ? undefined : Number(row.txid)
  })


/**
 * Reads Electric's connection (`ShapeProxy.config`) and returns the runs routes: `route(rest)` for
 * `/api/runs/<rest>`, and `shape` for `GET /api/shapes/runs`. Each route request is a log line `agent.status.report`
 * or `agent.status.answer`, a span `agent.status.request` and a count; none carries a question or an answer.
 * `database` opens a Postgres client for the scope of each request.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const connection = yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })

    /** `POST /api/runs/<id>`: the run's step reports its status. */
    const report = (request: HttpServerRequest.HttpServerRequest, runId: string, actorId: string, fields: Fields) =>
      Effect.gen(function* () {
        const body = yield* readBounded(request, MAX_RUN_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(Effect.result)
        if (body._tag === "Failure") {
          return body.failure.reason === "too_large" ? refusal(413, "too_large") : refusal(400, "invalid")
        }
        const decoded = yield* decodeReport(body.success).pipe(Effect.option)
        if (Option.isNone(decoded)) return refusal(400, "invalid")
        fields.report = decoded.value.status
        const askedBy = yield* askerOf(runId)
        if (askedBy === undefined) return refusal(404, "not_found")
        if (askedBy !== actorId) {
          fields.errorCode = "not_launcher"
          return refusal(403, "forbidden")
        }
        const txid = yield* applyReport(runId, actorId, decoded.value)
        if (txid === undefined) fields.existing = true
        return ok(txid ?? null)
      })

    /** `POST /api/runs/<id>/answer`: the person answers the open question. */
    const answer = (request: HttpServerRequest.HttpServerRequest, runId: string, actorId: string, fields: Fields) =>
      Effect.gen(function* () {
        const body = yield* readBounded(request, MAX_RUN_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(Effect.result)
        if (body._tag === "Failure") {
          return body.failure.reason === "too_large" ? refusal(413, "too_large") : refusal(400, "invalid")
        }
        const decoded = yield* decodeAnswer(body.success).pipe(Effect.option)
        if (Option.isNone(decoded)) return refusal(400, "invalid")
        fields.version = decoded.value.version
        const row = yield* runOf(runId)
        if (row === undefined) return refusal(404, "not_found")
        if (row.launchedBy !== actorId) {
          fields.errorCode = "not_launcher"
          return refusal(403, "forbidden")
        }
        if (!fits(row.kind, decoded.value.value)) return refusal(400, "invalid")
        const txid = yield* applyAnswer(runId, actorId, decoded.value)
        if (txid !== undefined) return ok(txid)
        const value = typeof decoded.value.value === "string" ? decoded.value.value.trim() : decoded.value.value
        if (row.version === decoded.value.version && row.answer?.value === value) {
          fields.existing = true
          return ok(null)
        }
        return refusal(409, "not_open")
      })

    const route = (rest: string) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const [runId = "", tail, ...more] = rest.split("/")
        const kind = tail === undefined ? "report" : "answer"
        const startedAt = yield* Clock.currentTimeMillis
        const fields: Fields = { runId }
        const response = yield* Effect.gen(function* () {
          if ((tail !== undefined && tail !== "answer") || more.length > 0 || !isUuid(runId)) {
            return refusal(404, "not_found")
          }
          if (request.method !== "POST") return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
          const actor = yield* (yield* Sessions).resolve
          if (Option.isNone(actor)) return refusal(401, "authentication")
          // A Guest, or a person with no role, may not ask, so has no runs to report or answer.
          if (!canAsk(actor.value)) return refusal(403, "forbidden")
          const id = runId.toLowerCase()
          const handled = kind === "report"
            ? report(request, id, actor.value.subject.id, fields)
            : answer(request, id, actor.value.subject.id, fields)
          return yield* handled.pipe(Effect.provide(database))
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              fields.errorCode = codeOf(Cause.squash(cause))
              return refusal(503, "unavailable")
            })
          ),
        )
        fields.status = response.status
        fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
        yield* Metric.update(Metric.withAttributes(requests, { route: kind, status: String(response.status) }), 1)
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
        yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
          `agent.status.${kind}`,
        ).pipe(Effect.annotateLogs(fields))
        return response
      }).pipe(Effect.withSpan("agent.status.request", { kind: "server", attributes: { "smithers.run.id": rest.split("/")[0] } }))

    /** `GET /api/shapes/runs`: the signed-in person's rows; signed out, none; sessions unreadable, 503 (ShapeAccess). */
    const shape = ShapeProxy.make({
      ...connection,
      shape: Effect.map(ShapeAccess.actor, (actor) => ({
        table: RUNS_TABLE,
        where: "launched_by = $1",
        params: { "1": Option.match(actor, { onNone: () => NOBODY, onSome: (actor) => actor.subject.id }) },
        columns: SYNCED_RUN_COLUMNS,
      })),
      name: "agent.status.shape",
      metric: shapes,
    })

    return { route, shape }
  })
