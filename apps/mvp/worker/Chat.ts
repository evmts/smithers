import { OtlpRelay } from "@smthrs/observability"
import { Clock, Context, Data, Effect, type Layer, Metric, Option, Schema, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse, HttpTraceContext } from "effect/http"
import { type SqlClient, SqlError } from "effect/sql"
import * as Answer from "./Answer.ts"
import * as ChatMetrics from "./ChatMetrics.ts"
import * as Messages from "./Messages.ts"
import * as ShapeProxy from "./ShapeProxy.ts"

// ChatApi's routes and sweep (docs/features/chat.md#contract). ChatApi.ts runs them on Cloudflare; the tests run them
// as they are.

/**
 * Runs work after the response, with the caller's services, and keeps the host alive until it ends: Workers'
 * `waitUntil` in ChatApi, a fiber set in the tests.
 */
export class Background extends Context.Service<
  Background,
  { readonly run: <R>(effect: Effect.Effect<void, never, R>) => Effect.Effect<void, never, R> }
>()("@smthrs/mvp/Background") {}

/** How a dispatch went: answering `started` in `Background`, or was already `running` in this isolate. */
export type Dispatched = "started" | "running"

/** What dispatched an answer: its question, a retry of the question while the answer streams, or the sweep. */
export type Trigger = "ask" | "retry" | "sweep"

/** The largest `POST /api/questions` body: 64 KiB. */
export const MAX_BODY_BYTES = 64 * 1024

/** The longest question, in characters after trimming. */
export const MAX_QUESTION_LENGTH = 8_000

const Question = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  answerId: Schema.String.check(Schema.isUUID()),
  text: Schema.Trim.check(Schema.isBetweenLength(1, MAX_QUESTION_LENGTH)),
}).check(Schema.makeFilter((question) => question.id.toLowerCase() !== question.answerId.toLowerCase()))

const decodeQuestion = Schema.decodeUnknownEffect(Schema.fromJsonString(Question))

const invalid = "Send JSON { id, answerId, text }: two different UUIDs and 1 to 8,000 characters of text."

/** A request answered with an error status, and `{ message: explanation }` when there is one, shown as written. */
class Refusal extends Data.TaggedError("Refusal")<{
  readonly status: number
  readonly explanation?: string
  readonly errorCode?: string
}> {}

/**
 * Reads the configuration (`ShapeProxy.make`, `Answer.make`) and returns ChatApi's `fetch` handler and its sweep.
 * `database` opens a Postgres client for the scope that builds it: one per request, and one each for loading,
 * streaming and settling an answer.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const start = yield* inBackground(database)
    const shape = yield* ShapeProxy.make
    const telemetry = OtlpRelay.serve()

    /** Starts answering and records how it went: a log line, a span and a metric. A failure is logged, not raised. */
    const dispatch = (answerId: string, trigger: Trigger) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis
        const outcome = yield* start(answerId).pipe(Effect.catchCause(() => Effect.succeed("error" as const)))
        yield* Metric.update(Metric.withAttributes(ChatMetrics.dispatches, { trigger, outcome }), 1)
        yield* Effect.annotateCurrentSpan({ "smithers.chat.dispatch.outcome": outcome })
        yield* Effect.logWithLevel(outcome === "error" ? "Error" : "Info")("chat.dispatch").pipe(
          Effect.annotateLogs({ answerId, trigger, outcome, durationMs: (yield* Clock.currentTimeMillis) - startedAt }),
        )
        return outcome
      }).pipe(
        Effect.withSpan("chat.dispatch", {
          attributes: { "smithers.chat.answer_id": answerId, "smithers.chat.dispatch.trigger": trigger },
        }),
      )

    const questions = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const startedAt = yield* Clock.currentTimeMillis
      const fields: Record<string, string | number | boolean> = {}
      const response = yield* Effect.gen(function* () {
        if (request.method !== "POST") return yield* new Refusal({ status: 405 })
        const body = yield* readBody(request, fields)
        const decoded = yield* decodeQuestion(body).pipe(
          Effect.mapError(() => new Refusal({ status: 400, explanation: invalid })),
        )
        // Lowercase, as Postgres prints a uuid: one answer has one id in rows, logs and dispatch.
        const question = { ...decoded, id: decoded.id.toLowerCase(), answerId: decoded.answerId.toLowerCase() }
        fields.questionId = question.id
        fields.answerId = question.answerId
        yield* Effect.annotateCurrentSpan({
          "smithers.chat.question_id": question.id,
          "smithers.chat.answer_id": question.answerId,
        })
        const asked = yield* Messages.ask(question).pipe(Effect.provide(database), Effect.mapError(refuseStore))
        if (asked.txid === null) fields.existing = true
        if (asked.txid !== null || asked.streaming) {
          fields.dispatch = yield* dispatch(question.answerId, asked.txid === null ? "retry" : "ask")
        }
        return asked.txid === null
          ? HttpServerResponse.jsonUnsafe({ txid: null, existing: true }, { status: 200, headers: noStore })
          : HttpServerResponse.jsonUnsafe({ txid: asked.txid }, { status: 202, headers: noStore })
      }).pipe(
        Effect.catchTag("Refusal", (refusal) => {
          if (refusal.errorCode !== undefined) fields.errorCode = refusal.errorCode
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
      )
      fields.status = response.status
      fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
      yield* Metric.update(Metric.withAttributes(ChatMetrics.questions, { status: String(response.status) }), 1)
      yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
      yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
        "chat.question",
      ).pipe(Effect.annotateLogs(fields))
      return response
    })

    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      const parent = Option.getOrUndefined(HttpTraceContext.fromHeaders(request.headers))
      if (path === "/api/questions") {
        return yield* questions.pipe(Effect.withSpan("chat.question", { kind: "server", parent }))
      }
      if (path === "/api/shapes/messages") return yield* shape
      if (path.startsWith("/api/telemetry/")) return yield* telemetry
      return HttpServerResponse.empty({ status: 404 })
    })

    /**
     * Settles stuck answers past their attempts or age as abandoned and dispatches the other stuck ones again, then
     * records both: metrics, span attributes, and a log line when there were any. A failure is logged, never raised.
     */
    const sweep = Effect.gen(function* () {
      const { abandoned, stuck } = yield* Messages.sweep.pipe(Effect.provide(database))
      yield* Metric.update(ChatMetrics.swept, abandoned.length)
      yield* Metric.update(
        Metric.withAttributes(ChatMetrics.answers, { outcome: "failed", failure: "abandoned" }),
        abandoned.length,
      )
      for (const answerId of stuck) yield* dispatch(answerId, "sweep")
      yield* Effect.annotateCurrentSpan({
        "smithers.chat.sweep.abandoned": abandoned.length,
        "smithers.chat.sweep.redispatched": stuck.length,
      })
      if (abandoned.length + stuck.length > 0) {
        yield* Effect.logWarning("chat.sweep").pipe(
          Effect.annotateLogs({
            abandoned: abandoned.length,
            answerIds: abandoned.join(","),
            redispatched: stuck.length,
          }),
        )
      }
    }).pipe(
      Effect.catchCause(() => Effect.logError("chat.sweep").pipe(Effect.annotateLogs({ outcome: "error" }))),
      Effect.withSpan("chat.sweep"),
    )

    return { fetch, sweep }
  })

/**
 * Starts answering in `Background`, once per answer at a time in this isolate: a dispatch while the answer runs here
 * is `running`. A run in another isolate is fenced out by the newer one's attempt (`Messages.claim`).
 */
const inBackground = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const answer = yield* Answer.make(database)
    const running = new Set<string>()
    return (answerId: string) =>
      Effect.gen(function* () {
        if (running.has(answerId)) return "running" as const
        running.add(answerId)
        const background = yield* Background
        yield* background.run(
          answer.run(answerId).pipe(Effect.ensuring(Effect.sync(() => running.delete(answerId)))),
        )
        return "started" as const
      })
  })

const noStore = { "cache-control": "no-store" }

/**
 * Reads at most `MAX_BODY_BYTES` as UTF-8, refusing a declared or streamed body that is larger before buffering it,
 * and refusing malformed UTF-8 (400), wherever it falls across chunks.
 */
const readBody = (request: HttpServerRequest.HttpServerRequest, fields: Record<string, string | number | boolean>) => {
  const tooLarge = new Refusal({ status: 413 })
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) return Effect.fail(tooLarge)
  return Effect.suspend(() => {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })
    const decode = (chunk?: Uint8Array) =>
      Effect.try({
        try: () => (chunk === undefined ? decoder.decode() : decoder.decode(chunk, { stream: true })),
        catch: () => new Refusal({ status: 400, explanation: invalid, errorCode: "utf8" }),
      })
    let bytes = 0
    let text = ""
    return request.stream.pipe(
      Stream.mapError(() => new Refusal({ status: 400, explanation: invalid })),
      Stream.runForEach((chunk) => {
        bytes += chunk.byteLength
        if (bytes > MAX_BODY_BYTES) return Effect.fail(tooLarge)
        return Effect.map(decode(chunk), (piece) => void (text += piece))
      }),
      Effect.flatMap(() => Effect.map(decode(), (rest) => text + rest)),
      Effect.ensuring(Effect.sync(() => (fields.bytes = bytes))),
    )
  })
}

/**
 * A Postgres failure: the question's id is another message's (409), the answer's id is (409), or Postgres can't be
 * used (503).
 */
const refuseStore = (error: unknown) => {
  if (error instanceof Messages.IdTaken) {
    return new Refusal({ status: 409, explanation: "id belongs to another message.", errorCode: "id_taken" })
  }
  return SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
    ? new Refusal({
      status: 409,
      explanation: "answerId belongs to another message.",
      errorCode: "sql:UniqueViolation",
    })
    : new Refusal({
      status: 503,
      explanation: "Smithers can't reach its database. Try again.",
      errorCode: SqlError.isSqlError(error) ? `sql:${error.reason._tag}` : "database",
    })
}
