import { Cause, Clock, Effect, type Layer, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { MAX_ANSWER_BODY_BYTES } from "../src/features/agent/contract.ts"
import { AnswerWrite, type Turn } from "../src/features/agent/schema.ts"
import { agentLiveSeconds } from "../src/features/model/contract.ts"
import { type Actor, canAsk, Sessions } from "./Actor.ts"
import { branchAccess, canEdit } from "./branch/Access.ts"
import { readBounded } from "./Body.ts"
import { codeOf } from "./ErrorCode.ts"
import * as Notifications from "./Notifications.ts"
import * as Messages from "./Messages.ts"

// The answer routes (docs/features/agent.md#the-answer-routes): the server's write path for the answers the browser's
// agent gives (decision 0011). The agent reads its turn here, then writes its parts while it streams and its text or
// failure when it settles. Only the person who asked the question may (`asked_by`, recorded from their session when
// they asked), and only while they may still ask (Member or above, decision 0007) and edit the conversation's branch
// (worker/branch/Access.ts), like the model endpoint: another Member, or an asker whose access to the branch was taken
// away, can't read the turn, write, settle or learn whether a settle landed. An answer changes only while it is
// `streaming`; a settle sent again after it landed is answered as landed, so a replayed step is harmless. How long an earlier answer holds up later turns is the `agent` role's
// liveness bound (`agentLiveSeconds`, src/features/model/contract.ts): a live run writes within it, and an answer
// waiting its turn is touched by its turn requests, at most once a third of the bound.

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

/** A person who didn't ask the question: `403 forbidden`, as for a role that may not ask, logged as `not_asker`. */
const notAsker = (fields: Fields) => {
  fields.errorCode = "not_asker"
  return refusal(403, "forbidden")
}

/**
 * The answer's row, who asked its question (`null` for a question asked before askers were recorded), and whether it
 * must wait: an earlier answer in its own conversation still streams and was written in the last `liveSeconds`. Two
 * conversations' turns never wait for each other (decision 0013 §1). An earlier answer whose device went away keeps streaming but stops holding up later turns once it
 * is that old. This only reads liveness: nothing here runs, retries or settles that answer; `chat/Expire` settles it
 * (worker/flows/Expire.ts). `waitedMs` is how long its turn has waited since the queue before it last moved: since the
 * latest earlier answer settled, or since it was asked if that is later, on Postgres' clock.
 */
const target = (answerId: string, liveSeconds: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly status: string
      readonly question: string
      readonly text: string
      readonly failure: string | null
      readonly askedBy: string | null
      readonly waiting: boolean
      readonly waitedMs: number
    }>`
      SELECT a.status, q.text AS question, a.text, a.failure, q.asked_by AS "askedBy",
        EXISTS (
          SELECT 1 FROM messages e
          WHERE e.conversation_id = a.conversation_id AND e.role = 'assistant' AND e.status = 'streaming'
            AND e.position < a.position AND e.updated_at > now() - make_interval(secs => ${liveSeconds})
        ) AS waiting,
        GREATEST(0, floor(extract(epoch FROM now() - GREATEST(a.created_at, (
          SELECT e.updated_at FROM messages e
          WHERE e.conversation_id = a.conversation_id AND e.role = 'assistant' AND e.status <> 'streaming'
            AND e.position < a.position
          ORDER BY e.position DESC LIMIT 1
        ))) * 1000))::float8 AS "waitedMs"
      FROM messages a JOIN messages q ON q.id = a.question_id
      WHERE a.id = ${answerId}`
    return row
  })

/**
 * Marks a streaming answer that is waiting its turn as live, so it keeps the answers after it in order: only once a
 * third of `liveSeconds` has passed since its last write. Every write reaches every device through Electric, and an
 * answer asked again at most every 4 s (`TURN_RETRY`) stays live with these alone.
 */
const touch = (answerId: string, liveSeconds: number) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) =>
      sql`UPDATE messages SET updated_at = now()
        WHERE id = ${answerId} AND status = 'streaming' AND updated_at < now() - make_interval(secs => ${liveSeconds / 3})`,
  )

/**
 * Writes `write` to a streaming answer whose question `askedBy` asked: whether it landed, and its transaction. The
 * asker is checked in the same statement as the write, so no other person's write lands.
 */
const apply = (answerId: string, askedBy: string, write: AnswerWrite) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parts = write.parts === undefined ? null : JSON.stringify(write.parts)
    const rows = write.status === "streaming"
      ? yield* sql<{ readonly txid: string }>`
        UPDATE messages a SET parts = ${parts}::jsonb, text = COALESCE(${write.text ?? null}, a.text), updated_at = now()
        FROM messages q
        WHERE a.id = ${answerId} AND a.role = 'assistant' AND a.status = 'streaming'
          AND q.id = a.question_id AND q.asked_by = ${askedBy}
        RETURNING pg_current_xact_id()::xid::text AS txid`
      : write.status === "done"
      ? yield* sql<{ readonly txid: string }>`
        UPDATE messages a SET status = 'done', text = ${write.text}, parts = COALESCE(${parts}::jsonb, a.parts),
          input_tokens = ${write.inputTokens ?? null}, output_tokens = ${write.outputTokens ?? null}, updated_at = now()
        FROM messages q
        WHERE a.id = ${answerId} AND a.role = 'assistant' AND a.status = 'streaming'
          AND q.id = a.question_id AND q.asked_by = ${askedBy}
        RETURNING pg_current_xact_id()::xid::text AS txid`
      : yield* sql<{ readonly txid: string }>`
        UPDATE messages a SET status = 'failed', failure = ${write.failure}, parts = COALESCE(${parts}::jsonb, a.parts),
          updated_at = now()
        FROM messages q
        WHERE a.id = ${answerId} AND a.role = 'assistant' AND a.status = 'streaming'
          AND q.id = a.question_id AND q.asked_by = ${askedBy}
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
 * Whether `actor` may still edit the branch of answer `answerId`'s conversation: `true` when there is no such message,
 * which the turn and write answer 404 themselves.
 */
const mayEdit = (actor: Actor, answerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly conversationId: string }>`
      SELECT conversation_id AS "conversationId" FROM messages WHERE id = ${answerId}`
    if (row === undefined) return true
    // Every message's conversation has its branch (the foreign keys).
    const branch = yield* branchAccess(Option.some(actor), row.conversationId, "conversation")
    return canEdit(branch!.access)
  })

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
     * waits, a request from the asker marks this answer live (`touch`) and says how long its turn has waited.
     */
    const turn = (answerId: string, actorId: string, fields: Fields) =>
      Effect.gen(function* () {
        const row = yield* target(answerId, liveSeconds)
        if (row === undefined) return refusal(404, "not_found")
        if (row.askedBy !== actorId) return notAsker(fields)
        if (row.status !== "streaming") return refusal(409, "settled")
        if (row.waiting) {
          yield* touch(answerId, liveSeconds)
          fields.waitedMs = row.waitedMs
          return HttpServerResponse.jsonUnsafe(
            { code: "not_your_turn", waitedMs: row.waitedMs },
            { status: 409, headers: { "cache-control": "no-store" } },
          )
        }
        const history = yield* Messages.history(answerId)
        fields.historyExchanges = history.length
        return ok({ question: row.question, history } satisfies Turn)
      })

    /** `POST /api/answers/<id>`: the answer's parts while it streams, then how it settled. */
    const write = (request: HttpServerRequest.HttpServerRequest, answerId: string, actorId: string, fields: Fields) =>
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
        // A settle folds into the feed in its own transaction (worker/Notifications.ts): the answer's status is its
        // run's.
        const settles = decoded.value.status !== "streaming"
        const txid = yield* (yield* SqlClient.SqlClient).withTransaction(
          Effect.tap(apply(answerId, actorId, decoded.value), (landed) =>
            landed !== undefined && settles ? Notifications.foldRun(answerId, undefined) : Effect.void),
        )
        if (txid !== undefined) return ok({ txid })
        const row = yield* target(answerId, liveSeconds)
        if (row === undefined) return refusal(404, "not_found")
        if (row.askedBy !== actorId) return notAsker(fields)
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
          if (!(yield* mayEdit(actor.value, answerId).pipe(Effect.provide(database)))) {
            fields.errorCode = "view_only"
            return refusal(403, "forbidden")
          }
          // Only the asker, or an agent acting for them, writes their answer.
          const actorId = actor.value.subject.id
          const handled = route === "turn" ? turn(answerId, actorId, fields) : write(request, answerId, actorId, fields)
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
