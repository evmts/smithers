import { Cause, Clock, Effect, type Layer, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { MAX_ANSWER_BODY_BYTES } from "../src/features/agent/contract.ts"
import { AnswerWrite, type Turn } from "../src/features/agent/schema.ts"
import { agentLiveSeconds } from "../src/features/model/contract.ts"
import { canAsk, Sessions } from "./Actor.ts"
import { readBounded } from "./Body.ts"
import { codeOf } from "./ErrorCode.ts"
import * as Messages from "./Messages.ts"

// The answer routes (docs/features/agent.md#the-answer-routes): the server's write path for the answers the browser's
// agent gives (decision 0011). The agent reads its turn here, then writes its parts while it streams and its text or
// failure when it settles. Only the browser of a person who may ask (Member or above, decision 0007) may, like the
// model endpoint. An answer changes only while it is `streaming`; a settle sent again after it landed is answered as
// landed, so a replayed step is harmless. How long an earlier answer holds up later turns is the `agent` role's
// liveness bound (`agentLiveSeconds`, src/features/model/contract.ts): a live run writes within it, and an answer
// waiting its turn is touched by each turn request.

/** Answer route requests, by `route` (`turn`, `write`) and `status`. */
export const requests = Metric.counter("smithers_answer_requests", {
  description: "Requests to the answer routes, by route and status",
  incremental: true,
})

const decodeWrite = Schema.decodeUnknownEffect(Schema.fromJsonString(AnswerWrite))

type Fields = Record<string, string | number | boolean>

/** A refusal: its status and code, logged and answered as `{ code }`. */
const refusal = (status: number, code: string) =>
  HttpServerResponse.jsonUnsafe({ code }, { status, headers: { "cache-control": "no-store" } })

const ok = (body: unknown) => HttpServerResponse.jsonUnsafe(body, { headers: { "cache-control": "no-store" } })

/**
 * The answer's row and whether it must wait: an earlier answer still streams and was written in the last
 * `liveSeconds`. An earlier answer whose device went away keeps streaming but stops holding up later turns once it
 * is that old. This only reads liveness: nothing here runs, retries or settles that answer; `chat/Expire` settles it
 * (worker/flows/Expire.ts).
 */
const target = (answerId: string, liveSeconds: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly status: string
      readonly question: string
      readonly text: string
      readonly failure: string | null
      readonly waiting: boolean
    }>`
      SELECT a.status, q.text AS question, a.text, a.failure,
        EXISTS (
          SELECT 1 FROM messages e
          WHERE e.role = 'assistant' AND e.status = 'streaming' AND e.position < a.position
            AND e.updated_at > now() - make_interval(secs => ${liveSeconds})
        ) AS waiting
      FROM messages a JOIN messages q ON q.id = a.question_id
      WHERE a.id = ${answerId}`
    return row
  })

/** Marks a streaming answer that is waiting its turn as live, so it keeps the answers after it in order. */
const touch = (answerId: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`UPDATE messages SET updated_at = now() WHERE id = ${answerId} AND status = 'streaming'`,
  )

/** Writes `write` to a streaming answer: whether it landed, and its transaction. */
const apply = (answerId: string, write: AnswerWrite) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parts = write.parts === undefined ? null : JSON.stringify(write.parts)
    const rows = write.status === "streaming"
      ? yield* sql<{ readonly txid: string }>`
        UPDATE messages SET parts = ${parts}::jsonb, text = COALESCE(${write.text ?? null}, text), updated_at = now()
        WHERE id = ${answerId} AND role = 'assistant' AND status = 'streaming'
        RETURNING pg_current_xact_id()::xid::text AS txid`
      : write.status === "done"
      ? yield* sql<{ readonly txid: string }>`
        UPDATE messages SET status = 'done', text = ${write.text}, parts = COALESCE(${parts}::jsonb, parts),
          input_tokens = ${write.inputTokens ?? null}, output_tokens = ${write.outputTokens ?? null}, updated_at = now()
        WHERE id = ${answerId} AND role = 'assistant' AND status = 'streaming'
        RETURNING pg_current_xact_id()::xid::text AS txid`
      : yield* sql<{ readonly txid: string }>`
        UPDATE messages SET status = 'failed', failure = ${write.failure}, parts = COALESCE(${parts}::jsonb, parts),
          updated_at = now()
        WHERE id = ${answerId} AND role = 'assistant' AND status = 'streaming'
        RETURNING pg_current_xact_id()::xid::text AS txid`
    return rows[0] === undefined ? undefined : Number(rows[0].txid)
  })

/** Whether a settled answer already holds what `write` settles it as: the same write, landed before. */
const landed = (
  row: { readonly status: string; readonly text: string; readonly failure: string | null },
  write: AnswerWrite,
) =>
  write.status === "done"
    ? row.status === "done" && row.text === write.text
    : write.status === "failed" && row.status === "failed" && row.failure === write.failure

/**
 * Reads `ANSWER_TURN_LIVE_SECONDS` and returns the answer routes' handler for one answer id: `GET` reads its turn,
 * `POST` writes it. Each request is a log line `chat.answer.turn` or `chat.answer.write`, a span
 * `chat.answer.request` and a count. `database` opens a Postgres client for the scope of each request.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const liveSeconds = yield* agentLiveSeconds

    /**
     * `GET /api/answers/<id>`: the question and its history, once every earlier live answer has settled. While it
     * waits, each request marks this answer live.
     */
    const turn = (answerId: string, fields: Fields) =>
      Effect.gen(function* () {
        const row = yield* target(answerId, liveSeconds)
        if (row === undefined) return refusal(404, "not_found")
        if (row.status !== "streaming") return refusal(409, "settled")
        if (row.waiting) {
          yield* touch(answerId)
          return refusal(409, "not_your_turn")
        }
        const history = yield* Messages.history(answerId)
        fields.historyExchanges = history.length
        return ok({ question: row.question, history } satisfies Turn)
      })

    /** `POST /api/answers/<id>`: the answer's parts while it streams, then how it settled. */
    const write = (request: HttpServerRequest.HttpServerRequest, answerId: string, fields: Fields) =>
      Effect.gen(function* () {
        const body = yield* readBounded(request, MAX_ANSWER_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(
          Effect.result,
        )
        if (body._tag === "Failure") {
          return body.failure.reason === "too_large" ? refusal(413, "too_large") : refusal(400, "invalid")
        }
        const decoded = yield* decodeWrite(body.success).pipe(Effect.option)
        if (Option.isNone(decoded)) return refusal(400, "invalid")
        fields.write = decoded.value.status
        fields.parts = decoded.value.parts?.length ?? -1
        const txid = yield* apply(answerId, decoded.value)
        if (txid !== undefined) return ok({ txid })
        const row = yield* target(answerId, liveSeconds)
        if (row === undefined) return refusal(404, "not_found")
        if (landed(row, decoded.value)) {
          fields.existing = true
          return ok({ txid: null })
        }
        return refusal(409, "settled")
      })

    return (answerId: string) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const route = request.method === "GET" ? "turn" : "write"
        const startedAt = yield* Clock.currentTimeMillis
        const fields: Fields = { answerId }
        const response = yield* Effect.gen(function* () {
          if (request.method !== "GET" && request.method !== "POST") {
            return HttpServerResponse.empty({ status: 405, headers: { allow: "GET, POST" } })
          }
          if (!Schema.is(Schema.String.check(Schema.isUUID()))(answerId)) return refusal(404, "not_found")
          const actor = yield* (yield* Sessions).resolve
          if (Option.isNone(actor)) return refusal(401, "authentication")
          // A Guest, or a person with no role, may not ask, so may not write an answer either.
          if (!canAsk(actor.value)) return refusal(403, "forbidden")
          return yield* (route === "turn" ? turn(answerId, fields) : write(request, answerId, fields)).pipe(
            Effect.provide(database),
          )
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
        yield* Metric.update(Metric.withAttributes(requests, { route, status: String(response.status) }), 1)
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
        yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
          `chat.answer.${route}`,
        ).pipe(Effect.annotateLogs(fields))
        return response
      }).pipe(
        Effect.withSpan("chat.answer.request", { kind: "server", attributes: { "smithers.chat.answer_id": answerId } }),
      )
  })
