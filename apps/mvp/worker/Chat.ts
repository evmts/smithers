import { ShapeProxy } from "@smthrs/effect-electric"
import type { Flow } from "@smthrs/flow"
import { OtlpRelay } from "@smthrs/observability"
import { Clock, Data, Effect, type Layer, Metric, Option, Schema, Tracer } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { type SqlClient, SqlError } from "effect/sql"
import {
  LOCAL_ELECTRIC_URL,
  MAX_QUESTION_LENGTH,
  MESSAGES_TABLE,
  QUESTIONS_ROUTE,
  SHAPE_ROUTE,
  TELEMETRY_ROUTE,
} from "../src/features/chat/contract.ts"
import { ANSWERS_ROUTE } from "../src/features/agent/contract.ts"
import { MODEL_ROLES, MODEL_ROUTE, type ModelRole } from "../src/features/model/contract.ts"
import { FLOWS_ROUTE } from "../src/flows/contract.ts"
import { remoteFlows } from "../src/flows/declarations.ts"
import { BROWSER_TELEMETRY } from "../src/telemetry.ts"
import { canAsk, Sessions } from "./Actor.ts"
import * as Answers from "./Answers.ts"
import { readBounded } from "./Body.ts"
import * as ChatMetrics from "./ChatMetrics.ts"
import { codeOf } from "./ErrorCode.ts"
import * as Flows from "./Flows.ts"
import * as Expire from "./flows/Expire.ts"
import * as Messages from "./Messages.ts"
import * as ModelEndpoint from "./ModelEndpoint.ts"

// ChatApi's routes (docs/features/chat.md#contract). ChatApi.ts runs them on Cloudflare; the tests run them as they
// are. ChatApi only stores a question and its empty `streaming` answer: the browser's agent answers it, through the
// model endpoint and the answer routes (docs/features/agent.md).

/** The largest `POST /api/questions` body: 64 KiB. */
const MAX_BODY_BYTES = 64 * 1024

/** The largest browser telemetry export ChatApi reads: 128 KiB. A larger one is answered 413 and not relayed. */
const TELEMETRY_MAX_BODY_BYTES = 128 * 1024

/** The most records one telemetry export relays; the rest are dropped and counted. */
const TELEMETRY_MAX_RECORDS = 200

/**
 * A W3C `traceparent` of version `00` as the spec writes it: 55 characters of lowercase hex, neither id all zeros.
 * Anything else, a `b3` header included, parents nothing.
 */
const TRACEPARENT = /^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-[0-9a-f]{2}$/

/**
 * The span a request's `traceparent` names, so ChatApi's spans join the browser's trace. The browser picks the ids
 * but not whether ChatApi records the request: its sampled flag is ignored.
 */
const parentOf = (header: string | undefined) =>
  header !== undefined && header.length === 55 && TRACEPARENT.test(header)
    ? Tracer.externalSpan({ traceId: header.slice(3, 35), spanId: header.slice(36, 52), sampled: true })
    : undefined

const Question = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  answerId: Schema.String.check(Schema.isUUID()),
  text: Schema.Trim.check(Schema.isBetweenLength(1, MAX_QUESTION_LENGTH)),
}).check(Schema.makeFilter((question) => question.id.toLowerCase() !== question.answerId.toLowerCase()))

const decodeQuestion = Schema.decodeUnknownEffect(Schema.fromJsonString(Question))

const invalid = `Send JSON { id, answerId, text }: two different UUIDs and 1 to ${
  MAX_QUESTION_LENGTH.toLocaleString("en-US")
} characters of text.`

/**
 * A request answered with an error `status` and `errorCode` in its log line, and `{ message: explanation }` when there
 * is one, shown as written.
 */
class Refusal extends Data.TaggedError("Refusal")<{
  readonly status: number
  readonly errorCode: string
  readonly explanation?: string
}> {}

/**
 * Reads the configuration (`ShapeProxy.config`, `ModelEndpoint.make`, `Answers.make`) and returns ChatApi's `fetch`
 * handler. `database` opens a Postgres client for the scope that builds it: one per request. `fetch` reads who is
 * asking from `Sessions`, and the remote door starts `remote`, the registry's remote flows unless a test sets them,
 * through `Flows.FlowStarter`.
 */
export const make = <E, R>(
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
  remote: ReadonlyArray<Flow.Any> = remoteFlows,
) =>
  Effect.gen(function* () {
    // POST /api/model/<role>: the metered model endpoint (docs/features/model-endpoint.md).
    const model = yield* ModelEndpoint.make(database)
    // GET and POST /api/answers/<id>: the write path for the browser's agent (docs/features/agent.md).
    const answers = yield* Answers.make(database)
    // POST /api/flows/<name>: the remote door (docs/features/flows.md).
    const door = Flows.make(remote)
    // GET /api/shapes/messages: Electric's `messages`, which the browser pages by `position` a window at a time.
    const shape = ShapeProxy.make({
      ...(yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })),
      shape: { table: MESSAGES_TABLE },
      name: "chat.shape",
      metric: ChatMetrics.shapes,
    })
    const telemetry = OtlpRelay.serve({
      maxBodyBytes: TELEMETRY_MAX_BODY_BYTES,
      maxRecords: TELEMETRY_MAX_RECORDS,
      // Exactly the records and fields the browser's features declare (src/telemetry.ts); the rest is dropped.
      allow: BROWSER_TELEMETRY,
    })

    const questions = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const startedAt = yield* Clock.currentTimeMillis
      const fields: Record<string, string | number | boolean> = {}
      const response = yield* Effect.gen(function* () {
        if (request.method !== "POST") return yield* new Refusal({ status: 405, errorCode: "method" })
        yield* mayAsk
        const body = yield* readBody(request, fields)
        const decoded = yield* decodeQuestion(body).pipe(
          Effect.mapError(() => new Refusal({ status: 400, errorCode: "invalid", explanation: invalid })),
        )
        // Lowercase, as Postgres prints a uuid: one answer has one id in rows, logs and the browser's agent.
        const question = { ...decoded, id: decoded.id.toLowerCase(), answerId: decoded.answerId.toLowerCase() }
        fields.questionId = question.id
        fields.answerId = question.answerId
        yield* Effect.annotateCurrentSpan({
          "smithers.chat.question_id": question.id,
          "smithers.chat.answer_id": question.answerId,
        })
        const asked = yield* Messages.ask(question).pipe(Effect.provide(database), Effect.mapError(refuseStore))
        if (asked.txid === null) fields.existing = true
        // A resend starts the same execution, a no-op, so an ask whose first start was lost still gets one.
        fields.expiry = yield* expire(question.answerId)
        return asked.txid === null
          ? HttpServerResponse.jsonUnsafe({ txid: null, existing: true }, { status: 200, headers: noStore })
          : HttpServerResponse.jsonUnsafe({ txid: asked.txid }, { status: 202, headers: noStore })
      }).pipe(
        Effect.catchTag("Refusal", (refusal) => {
          fields.errorCode = refusal.errorCode
          return Effect.succeed(
            refusal.explanation === undefined
              ? HttpServerResponse.empty({
                status: refusal.status,
                headers: refusal.status === 405 ? { allow: "POST" } : {},
              })
              : HttpServerResponse.jsonUnsafe(
                { message: refusal.explanation },
                { status: refusal.status, headers: noStore },
              ),
          )
        }),
        // A bug: 500, logged by the defect's name, and the span ends without the defect, whose message can quote
        // what someone wrote.
        Effect.catchDefect((defect) => {
          Object.assign(fields, { errorCode: "defect", defect: nameOf(defect) })
          return Effect.succeed(HttpServerResponse.empty({ status: 500 }))
        }),
      )
      fields.status = response.status
      fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
      yield* Metric.update(Metric.withAttributes(ChatMetrics.questions, { status: String(response.status) }), 1)
      yield* Effect.annotateCurrentSpan({
        "http.response.status_code": response.status,
        ...(response.status >= 500 ? { "error.type": fields.errorCode } : {}),
      })
      yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
        "chat.question",
      ).pipe(Effect.annotateLogs(fields))
      return response
    })

    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      if (path === QUESTIONS_ROUTE) {
        const parent = parentOf(request.headers.traceparent)
        return yield* questions.pipe(Effect.withSpan("chat.question", { kind: "server", parent }))
      }
      if (path === SHAPE_ROUTE) return yield* shape
      if (path.startsWith(`${TELEMETRY_ROUTE}/`)) return yield* telemetry
      if (path.startsWith(`${MODEL_ROUTE}/`)) {
        const role = path.slice(MODEL_ROUTE.length + 1)
        if (isModelRole(role)) return yield* model(role)
      }
      if (path.startsWith(`${ANSWERS_ROUTE}/`)) {
        return yield* answers(path.slice(ANSWERS_ROUTE.length + 1))
      }
      if (path.startsWith(`${FLOWS_ROUTE}/`)) return yield* door(path.slice(FLOWS_ROUTE.length + 1))
      return HttpServerResponse.empty({ status: 404 })
    })

    return { fetch }
  })

/**
 * Starts `chat/Expire` for an answer ChatApi took (worker/flows/Expire.ts), on the remote host through
 * `Flows.FlowStarter`, without waiting for it: one execution per answer, so starting it again is a no-op. It settles
 * the answer if no device ever does. It never fails the ask: a start the host can't record is a `chat.answer.expire`
 * line and a count, `not_started`, and the asking device's run still settles the answer as usual. Answers how it went.
 */
const expire = (answerId: string) =>
  Effect.flatMap(
    Flows.FlowStarter,
    (starter) => starter.start(Expire.Expire, { executionId: Expire.executionId(answerId), payload: { answerId } }),
  ).pipe(
    Effect.as("started"),
    Effect.catch((error) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(Expire.expiries, { outcome: "not_started" }), 1),
        Effect.logWarning("chat.answer.expire").pipe(
          Effect.annotateLogs({
            answerId,
            outcome: "not_started",
            errorCode: error._tag === "@smthrs/mvp/flows/StartUnavailable" ? error.errorCode : "conflict",
          }),
          Effect.as("not_started"),
        ),
      )
    ),
  )

/** The 503 message when Postgres, or the sessions in it, can't be read. */
const unreachable = "Smithers can't reach its database. Try again."

/**
 * Refuses a caller who may not ask Smithers (`repo:ask`, decision 0007): signed out (401), signed in without the Member
 * role or above (403), or whose session can't be read (503). Nothing is written for any of them: a Guest's question
 * would leave a `streaming` answer that no agent may answer, which holds up every later answer's turn.
 */
const mayAsk = Effect.gen(function* () {
  const actor = yield* (yield* Sessions).resolve.pipe(
    Effect.mapError((error) => new Refusal({ status: 503, errorCode: codeOf(error), explanation: unreachable })),
  )
  if (Option.isNone(actor)) {
    return yield* new Refusal({ status: 401, errorCode: "authentication", explanation: "Sign in to ask Smithers." })
  }
  if (!canAsk(actor.value)) {
    return yield* new Refusal({
      status: 403,
      errorCode: "forbidden",
      explanation: "Asking Smithers needs the Member role.",
    })
  }
})

const noStore = { "cache-control": "no-store" }

const isModelRole = (value: string): value is ModelRole => (MODEL_ROLES as ReadonlyArray<string>).includes(value)

/**
 * Reads at most `MAX_BODY_BYTES` as UTF-8 (`readBounded`): a larger body is 413, and malformed UTF-8 or a body that
 * breaks off is 400. Records how many bytes it read.
 */
const readBody = (request: HttpServerRequest.HttpServerRequest, fields: Record<string, string | number | boolean>) =>
  readBounded(request, MAX_BODY_BYTES, (bytes) => (fields.bytes = bytes)).pipe(
    Effect.mapError((refused) =>
      refused.reason === "too_large"
        ? new Refusal({ status: 413, errorCode: "too_large" })
        : new Refusal({ status: 400, errorCode: refused.reason, explanation: invalid })
    ),
  )

/**
 * A Postgres failure: the question's id is another message's (409), the answer's id is (409), or Postgres can't be
 * used (503): unreachable, or refusing the insert some other way, such as a position taken on a database missing
 * `0003_paired_positions`.
 */
const refuseStore = (error: unknown) => {
  if (error instanceof Messages.IdTaken) {
    return new Refusal({ status: 409, errorCode: "id_taken", explanation: "id belongs to another message." })
  }
  return SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation" &&
      error.reason.constraint === "messages_pkey"
    ? new Refusal({ status: 409, errorCode: "answer_id_taken", explanation: "answerId belongs to another message." })
    : new Refusal({
      status: 503,
      errorCode: SqlError.isSqlError(error) ? `sql:${error.reason._tag}` : "database",
      explanation: unreachable,
    })
}

/**
 * A thrown value's name: a tagged value's `_tag`, an error's `name`, otherwise its type. A name that isn't an
 * identifier of at most 64 characters is `unknown`, so no message rides in as a name.
 */
const nameOf = (value: unknown): string => {
  const name = typeof value === "object" && value !== null
    ? "_tag" in value ? String(value._tag) : value instanceof Error ? value.name : "object"
    : typeof value
  return /^[A-Za-z_$][\w$.]{0,63}$/.test(name) ? name : "unknown"
}
