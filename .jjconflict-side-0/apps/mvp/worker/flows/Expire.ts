import { Action, Flow, Interpreter, RetryPolicy, Sleep } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Config, Duration, Effect, Layer, Metric, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ANSWER_SETTLE_WITHIN, ANSWER_TURN_WAIT } from "../../src/features/agent/contract.ts"
import { codeOf } from "../ErrorCode.ts"

// `chat/Expire { answerId }` (docs/features/remote-flows.md, docs/features/agent.md#settling): settles an answer whose
// run never did. A run belongs to the browser that asked (decision 0011), so an answer whose device never comes back,
// or whose run ended in a defect, would stream forever. ChatApi starts this flow when it takes a question, one
// execution per answer (`chat-expire-<answerId>`), without waiting for it. It sleeps on a durable timer until the
// answer is `ANSWER_EXPIRY` old, then settles it `failed`, `abandoned`, only if it is still `streaming`; an answer that
// settled is left as it is. A device that comes back later finds its writes refused as settled (`AnswerSettled`).
//
// It runs remotely because it must happen while every device is off (`devices-off`, `flows.local-first-placement` in
// docs/rules.md). It runs on any host; the host injects Postgres and the expiry through `registration`.

/**
 * How old a `streaming` answer gets before `chat/Expire` settles it, when `ANSWER_EXPIRY` is unset: 25 minutes.
 *
 * A live run must always settle first. One that has a device settles within its turn wait (`ANSWER_TURN_WAIT`, 10
 * minutes from its first start), then the agent's few model calls (each at most 3 s in ChatApi's dev logs of
 * 2026-10-20), then `chat/Settle`, which keeps trying for `ANSWER_SETTLE_WITHIN` (10 minutes) while the routes are
 * unreachable. Its run starts within seconds of the ask (16.4 s at most in the same logs). That is about 21 minutes at
 * worst; the other 4 cover an agent ten times slower than any observed.
 */
export const DEFAULT_EXPIRY = Duration.sum(
  Duration.sum(Duration.fromInputUnsafe(ANSWER_TURN_WAIT), Duration.fromInputUnsafe(ANSWER_SETTLE_WITHIN)),
  Duration.minutes(5),
)

/** `ANSWER_EXPIRY`: a duration such as `25 minutes`, {@link DEFAULT_EXPIRY} when unset. */
export const expiry = Config.Duration("ANSWER_EXPIRY").pipe(Config.withDefault(DEFAULT_EXPIRY))

/** The execution id of `chat/Expire` for one answer: one execution per answer, so starting it again is a no-op. */
export const executionId = (answerId: string) => `chat-expire-${answerId}`

/** What the flow did: settled a streaming answer, found it settled already, or found no such answer. */
const Expired = Schema.Struct({ outcome: Schema.Literals(["abandoned", "settled", "missing"]) })
type Expired = typeof Expired.Type

/** Postgres failed. The step retries it, and never gives up. */
export class ExpiryFailed extends Schema.TaggedError<ExpiryFailed>()("@smthrs/mvp/chat/ExpiryFailed", {
  reason: Schema.Literal("database"),
}) {}

/** Expiries, by `outcome`: `abandoned`, `settled`, `missing`, `failed` for one failed step, `not_started` (ChatApi). */
export const expiries = Metric.counter("smithers_answer_expiries", {
  description: "Answers chat/Expire settled or found settled, by outcome",
  incremental: true,
})

const payload = { answerId: Schema.String.check(Schema.isUUID()) }

/** Only Postgres can fail a step, and an answer must not stream forever, so its retries never give up. */
const retryPolicy = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 })

/**
 * When the answer expires, in epoch milliseconds: its `created_at` plus the expiry, so a start retried later doesn't
 * move it; 0, at once, for an answer Postgres doesn't hold. Sealed, so a resumed run keeps the time.
 */
export const ExpiresAt = Action.make("chat/ExpiresAt", {
  payload,
  success: Schema.Number,
  error: ExpiryFailed,
  capabilities: ["db:read:messages"],
  tier: "sealed",
  retryPolicy,
})

/** Settles the answer `failed`, `abandoned` if it still streams; otherwise changes nothing. */
export const Abandon = Action.make("chat/Abandon", {
  payload,
  success: Expired,
  error: ExpiryFailed,
  capabilities: ["db:write:messages"],
  retryPolicy,
})

/** `chat/Expire`: settles an answer still streaming once it is old enough. */
export const Expire = Flow.make("chat/Expire", {
  description: "Settle an answer as failed, abandoned, if it is still streaming once it is old enough.",
  capabilities: ["db:read:messages", "db:write:messages"],
  modelInvocable: false,
  payload,
  success: Expired,
  error: Schema.Union([ExpiryFailed, Sleep.SleepRequestInvalid]),
  body: Node.capture({}, ({ answerId }) =>
    ExpiresAt.call({ answerId }).pipe(
      Node.bindPlanned(Node.capture({}, (until) => Sleep.action.call({ until }))),
      Node.andThen(Abandon.call({ answerId })),
    )),
})

/** What the flow needs: Postgres, where the answers are, and how old an answer gets before it expires. */
export interface Services<E = never, R = never> {
  readonly database: Layer.Layer<SqlClient.SqlClient, E, R>
  readonly expiry: Duration.Duration
}

/** When `answerId` expires, against the `SqlClient` in context. */
export const expiresAt = (answerId: string, after: Duration.Duration) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly createdMs: number }>`
      SELECT (extract(epoch FROM created_at) * 1000)::float8 AS "createdMs"
      FROM messages WHERE id = ${answerId} AND role = 'assistant'`
    return row === undefined ? 0 : Math.ceil(row.createdMs + Duration.toMillis(after))
  })

/** Settles `answerId` as `abandoned` if it still streams, against the `SqlClient` in context. */
export const abandon = (answerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // One statement: the update, and whether the answer exists at all, read from the same snapshot.
    const [row] = yield* sql<{ readonly abandoned: number; readonly found: number }>`
      WITH settled AS (
        UPDATE messages SET status = 'failed', failure = 'abandoned', updated_at = now()
        WHERE id = ${answerId} AND role = 'assistant' AND status = 'streaming'
        RETURNING id
      )
      SELECT (SELECT count(*) FROM settled)::int AS abandoned,
        (SELECT count(*) FROM messages WHERE id = ${answerId} AND role = 'assistant')::int AS found`
    const outcome: Expired["outcome"] = row!.abandoned > 0 ? "abandoned" : row!.found > 0 ? "settled" : "missing"
    return { outcome } satisfies Expired
  })

/**
 * One step over `database`, with its records: a `chat.answer.expire` log line and span when it fails, and when it
 * decides an `outcome`, and `smithers_answer_expiries`. None carries the answer's text.
 */
const recorded = <A, E, R>(
  answerId: string,
  step: Effect.Effect<A, unknown, SqlClient.SqlClient>,
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
  outcome: (value: A) => string | undefined,
) =>
  step.pipe(
    Effect.provide(database),
    Effect.tapError((error) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(expiries, { outcome: "failed" }), 1),
        Effect.logWarning("chat.answer.expire").pipe(
          Effect.annotateLogs({ answerId, outcome: "failed", errorCode: codeOf(error) }),
        ),
      )
    ),
    Effect.mapError(() => new ExpiryFailed({ reason: "database" })),
    Effect.tap((value) => {
      const decided = outcome(value)
      return decided === undefined ? Effect.void : Effect.andThen(
        Metric.update(Metric.withAttributes(expiries, { outcome: decided }), 1),
        Effect.logInfo("chat.answer.expire").pipe(Effect.annotateLogs({ answerId, outcome: decided })),
      )
    }),
    Effect.withSpan("chat.answer.expire", { attributes: { "smithers.chat.answer_id": answerId } }),
  )

/** When `answerId` expires, over `database`, with its records. */
export const observedExpiresAt = <E, R>(answerId: string, services: Services<E, R>) =>
  recorded(answerId, expiresAt(answerId, services.expiry), services.database, () => undefined)

/** Settles `answerId` if it still streams, over `database`, with its records. */
export const observedAbandon = <E, R>(answerId: string, services: Services<E, R>) =>
  recorded(answerId, abandon(answerId), services.database, (expired) => expired.outcome)

/** Registers `chat/Expire` with its steps, reaching Postgres through `services.database`. */
export const registration = <E, R>(services: Services<E, R>) =>
  Interpreter.layerWithImplementations(
    Expire,
    Layer.merge(
      ExpiresAt.toLayer(({ answerId }) => observedExpiresAt(answerId, services)),
      Abandon.toLayer(({ answerId }) => observedAbandon(answerId, services)),
    ),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
