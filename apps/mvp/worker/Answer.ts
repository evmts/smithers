import { Model, ModelError, type ModelEvent, ModelRequest } from "@smthrs/model"
import { HostModel } from "@smthrs/model-host"
import { AgentInstructions } from "@smthrs/rpc"
import { Cause, Clock, Config, Data, Effect, type Layer, Metric, Option, Schema, Semaphore, Sink, Stream } from "effect"
import { type SqlClient, SqlError } from "effect/sql"
import * as ChatMetrics from "./ChatMetrics.ts"
import * as Messages from "./Messages.ts"

// Answering one question, in the background: load the question and history, stream the model's text into the
// answer a few times a second, then settle it. Each run is a new streaming attempt, and every write is fenced on the
// answer still streaming in that attempt, so a run the sweep starts again never appends to an earlier run's text.
// One run records one log line, one span and its metrics, never text.

/** Smithers' instructions: the first thing the model sees. */
export const INSTRUCTIONS = [AgentInstructions.AGENT_NAME_LINE, "Answer briefly and plainly."]

/** The answer's text is written when its first text arrives, then at most this often. */
export const APPEND_EVERY = "150 millis"

/** The output-token budget of one answer when `CHAT_MAX_OUTPUT_TOKENS` is unset. */
export const MAX_OUTPUT_TOKENS = 2_000

/** How many answers one isolate streams at once when `CHAT_MAX_CONCURRENT_ANSWERS` is unset; the rest wait. */
export const MAX_CONCURRENT_ANSWERS = 8

/**
 * How an answer's run ended. `fenced`: it had already settled, or a later attempt claimed it, so this run wrote
 * nothing more. `error`: Postgres failed, so nothing settled it.
 */
export type Outcome = "done" | "failed" | "fenced" | "error"

/** What one run reports: the fields of its log line, its span attributes and its metrics. Never text. */
export interface Report {
  readonly answerId: string
  questionId?: string
  outcome: Outcome
  failure?: Messages.Failure
  /** The model's failure code (`ModelError.code`), or the SQL failure's reason, or `defect`. */
  errorCode?: string
  httpStatus?: number
  modelId: string
  stopReason?: string
  inputTokens?: number
  outputTokens?: number
  /** Which streaming attempt this run's text came from: 1, or more after retries. */
  attempt?: number
  firstTextMs?: number
  durationMs?: number
  historyExchanges?: number
  /** The answer's length in characters. */
  characters: number
}

/** What `load` read: when answering started, the question and its history. */
interface Loaded {
  readonly startedAt: number
  readonly questionId: string
  readonly question: string
  readonly history: ReadonlyArray<Messages.Exchange>
}

/** How a streaming attempt went. `fenced`: the answer settled, or a later attempt claimed it, before it ended. */
interface Streamed {
  readonly fenced: boolean
  readonly attempt?: number
  readonly characters: number
  readonly firstTextMs?: number
  readonly failure?: "rate_limited" | "model_error" | "empty"
  readonly errorCode?: string
  readonly httpStatus?: number
  readonly stopReason?: string
  readonly inputTokens?: number
  readonly outputTokens?: number
}

/** The answer was written to after this attempt lost it. */
class Fenced extends Data.TaggedError("Fenced")<{}> {}

/**
 * The text a stream of deltas writes: the first text alone, at once, then everything that arrives within each
 * `APPEND_EVERY` window as one piece.
 */
export const batches = <E, R>(texts: Stream.Stream<string, E, R>): Stream.Stream<string, E, R> =>
  Stream.unwrap(
    Effect.map(Stream.peel(texts, Sink.head()), ([first, rest]) =>
      Option.match(first, {
        onNone: () => Stream.empty,
        onSome: (text) =>
          Stream.concat(
            Stream.succeed(text),
            rest.pipe(
              Stream.groupedWithin(Number.MAX_SAFE_INTEGER, APPEND_EVERY),
              Stream.map((pieces) => pieces.join("")),
            ),
          ),
      })),
  )

const positive = Schema.Int.check(Schema.isGreaterThan(0))

/**
 * Reads the model (`HostModel`), `CHAT_REASONING_EFFORT`, `CHAT_MAX_OUTPUT_TOKENS` and
 * `CHAT_MAX_CONCURRENT_ANSWERS`, and returns `run`, which answers one question by its answer id. Loading, streaming
 * and settling each open their own Postgres client from `database`. A run never fails: every outcome is recorded and
 * returned.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const { model, modelId } = yield* HostModel
    const reasoningEffort = yield* Config.schema(ModelRequest.ReasoningEffort, "CHAT_REASONING_EFFORT").pipe(
      Config.withDefault("low" as const),
    )
    const maxTokens = yield* Config.schema(positive, "CHAT_MAX_OUTPUT_TOKENS").pipe(
      Config.withDefault(MAX_OUTPUT_TOKENS),
    )
    const concurrency = yield* Config.schema(positive, "CHAT_MAX_CONCURRENT_ANSWERS").pipe(
      Config.withDefault(MAX_CONCURRENT_ANSWERS),
    )
    const permits = yield* Semaphore.make(concurrency)
    const system = INSTRUCTIONS.map((text) => ModelRequest.SystemPart.make({ text }))
    const params = ModelRequest.GenerationParams.make({ reasoningEffort, maxTokens })

    /** The question and its history, if the answer is still streaming. */
    const load = (answerId: string) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis
        const target = yield* Messages.answerTarget(answerId)
        if (target === undefined || target.status !== "streaming") return null
        const history = yield* Messages.history(answerId)
        return {
          startedAt,
          questionId: target.questionId,
          question: target.question,
          history: history.map(({ answer, question }) => ({ question, answer })),
        } satisfies Loaded
      }).pipe(Effect.provide(database))

    /**
     * One streaming attempt: claims the answer, which empties its text and fences out earlier attempts, then writes
     * the model's text into it. A model failure is a result; a Postgres failure fails it.
     */
    const stream = (answerId: string, loaded: Loaded) =>
      Effect.gen(function* () {
        const attempt = yield* Messages.claim(answerId)
        if (attempt === undefined) return { fenced: true, characters: 0 } satisfies Streamed
        const streamed: Mutable<Streamed> = { fenced: false, attempt, characters: 0 }
        const request = ModelRequest.ModelRequest.make({
          modelId,
          system,
          messages: [
            ...loaded.history.flatMap(({ question, answer }) => [
              ModelRequest.Message.user(question),
              ModelRequest.Message.assistant(answer),
            ]),
            ModelRequest.Message.user(loaded.question),
          ],
          tools: [],
          params,
        })
        const texts = model.stream(request).pipe(
          Model.withGenAiSpan(request, model.providerName),
          Stream.tap((event) => observe(event, streamed, loaded.startedAt)),
          Stream.filter((event): event is ModelEvent.TextDelta => event.type === "text-delta" && event.text.length > 0),
          Stream.map((event) => event.text),
        )
        const written = yield* batches(texts).pipe(
          Stream.runForEach((text) =>
            Effect.flatMap(Messages.append(answerId, attempt, text), (landed) => (landed ? Effect.void : new Fenced()))
          ),
          Effect.result,
        )
        if (written._tag === "Failure") {
          const error = written.failure
          if (error instanceof Fenced) return { ...streamed, fenced: true }
          if (SqlError.isSqlError(error)) return yield* error
          modelFailure(error, streamed)
        } else if (streamed.characters === 0) {
          streamed.failure = "empty"
        }
        return streamed
      }).pipe(Effect.provide(database), permits.withPermits(1))

    /** Settles the answer this attempt streamed. `false`: it had settled, or a later attempt claimed it. */
    const settle = (answerId: string, streamed: Streamed & { readonly attempt: number }) =>
      Messages.settle(answerId, streamed.attempt, {
        status: streamed.failure === undefined ? "done" : "failed",
        failure: streamed.failure,
        modelId,
        stopReason: streamed.stopReason,
        inputTokens: streamed.inputTokens,
        outputTokens: streamed.outputTokens,
      }).pipe(Effect.provide(database))

    /** Answers one question, then records the run: its log line, span attributes and metrics. */
    const run = (answerId: string) =>
      Effect.gen(function* () {
        let startedAt = yield* Clock.currentTimeMillis
        const report: Report = { answerId, outcome: "error", modelId, characters: 0 }
        yield* Effect.gen(function* () {
          const loaded = yield* load(answerId)
          if (loaded === null) {
            report.outcome = "fenced"
            return
          }
          startedAt = loaded.startedAt
          report.questionId = loaded.questionId
          report.historyExchanges = loaded.history.length
          const streamed = yield* stream(answerId, loaded)
          const { fenced, ...fields } = streamed
          Object.assign(report, fields)
          if (fenced || streamed.attempt === undefined) {
            report.outcome = "fenced"
            return
          }
          const landed = yield* settle(answerId, { ...streamed, attempt: streamed.attempt })
          report.outcome = !landed ? "fenced" : streamed.failure === undefined ? "done" : "failed"
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              report.outcome = "error"
              report.errorCode = causeCode(cause)
            })
          ),
        )
        report.durationMs = (yield* Clock.currentTimeMillis) - startedAt
        yield* record(report)
        return report
      }).pipe(Effect.withSpan("chat.answer", { attributes: { "smithers.chat.answer_id": answerId } }))

    return { run }
  })

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** Folds one model event into the attempt's result: first text, length, token counts and stop reason. */
const observe = (event: ModelEvent.ModelEvent, streamed: Mutable<Streamed>, startedAt: number) =>
  Effect.gen(function* () {
    switch (event.type) {
      case "text-delta":
        if (streamed.firstTextMs === undefined && event.text.length > 0) {
          streamed.firstTextMs = (yield* Clock.currentTimeMillis) - startedAt
        }
        streamed.characters += event.text.length
        return
      case "usage":
        if (event.inputTokens !== undefined) streamed.inputTokens = event.inputTokens
        if (event.outputTokens !== undefined) streamed.outputTokens = event.outputTokens
        return
      case "retry":
        delete streamed.inputTokens
        delete streamed.outputTokens
        return
      case "settle":
        streamed.stopReason = event.stopReason
        return
    }
  })

/** A model 429 is `rate_limited`; every other model failure is `model_error`. */
const modelFailure = (error: unknown, streamed: Mutable<Streamed>) => {
  if (!(error instanceof ModelError.ModelError)) {
    streamed.errorCode = typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "unknown"
    streamed.failure = "model_error"
    return
  }
  streamed.errorCode = error.code
  if (error.httpStatus !== undefined) streamed.httpStatus = error.httpStatus
  streamed.failure = error.code === "rate_limited" || error.httpStatus === 429 ? "rate_limited" : "model_error"
}

/** A failure's code for diagnostics: the SQL reason, `interrupted` or `defect`. Never its message. */
const causeCode = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.findErrorOption(cause)
  if (Option.isSome(error) && SqlError.isSqlError(error.value)) return `sql:${error.value.reason._tag}`
  return Cause.hasInterruptsOnly(cause) ? "interrupted" : "defect"
}

const levels = { done: "Info", failed: "Warn", fenced: "Warn", error: "Error" } as const

/** One log line, the span's attributes and the metrics for a run that ended. */
const record = (report: Report) =>
  Effect.gen(function* () {
    const fields = Object.fromEntries(Object.entries(report).filter(([, value]) => value !== undefined))
    yield* Effect.annotateCurrentSpan({
      ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`smithers.chat.${snake(key)}`, value])),
      ...(report.failure === undefined ? {} : { "error.type": report.failure }),
    })
    yield* Metric.update(
      Metric.withAttributes(ChatMetrics.answers, { outcome: report.outcome, failure: report.failure ?? "none" }),
      1,
    )
    yield* Metric.update(
      Metric.withAttributes(ChatMetrics.duration, { outcome: report.outcome }),
      report.durationMs ?? 0,
    )
    if (report.firstTextMs !== undefined) yield* Metric.update(ChatMetrics.firstText, report.firstTextMs)
    if (report.inputTokens !== undefined) {
      yield* Metric.update(Metric.withAttributes(ChatMetrics.tokens, { type: "input" }), report.inputTokens)
    }
    if (report.outputTokens !== undefined) {
      yield* Metric.update(Metric.withAttributes(ChatMetrics.tokens, { type: "output" }), report.outputTokens)
    }
    yield* Effect.logWithLevel(levels[report.outcome])("chat.answer").pipe(Effect.annotateLogs(fields))
  })

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
