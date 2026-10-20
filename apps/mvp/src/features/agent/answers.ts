import { Context, Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/http"
import { ANSWERS_ROUTE } from "./contract"
import { type AnswerWrite, AnswerWrite as AnswerWriteSchema, Turn } from "./schema"

// Where the agent reads its turn and writes its answer (docs/features/agent.md#the-answer-routes): ChatApi's answer
// routes, through Effect `HttpClient`. The agent's flow reaches them only through `AnswerApi`, so the same flow runs in
// the browser's engine, on the Node host and later in the native app, each with its own `HttpClient`.

/** An earlier answer is still streaming: this one waits its turn. The step's retry policy asks again. */
export class NotYourTurn extends Schema.TaggedError<NotYourTurn>()("@smthrs/mvp/agent/NotYourTurn", {}) {}

/**
 * The run's turn deadline passed while it still waited for its turn (`chat/LoadTurn`): the run settles the answer
 * `unfinished`, so this never ends a run.
 */
export class TurnOutOfTime extends Schema.TaggedError<TurnOutOfTime>()("@smthrs/mvp/agent/TurnOutOfTime", {}) {}

/** The answer has settled already, so nothing more is written to it. */
export class AnswerSettled extends Schema.TaggedError<AnswerSettled>()("@smthrs/mvp/agent/AnswerSettled", {}) {}

/** The answer routes refused or couldn't be reached: `status` is the HTTP status, absent when nothing answered. */
export class AnswersUnavailable extends Schema.TaggedError<AnswersUnavailable>()(
  "@smthrs/mvp/agent/AnswersUnavailable",
  { status: Schema.optional(Schema.Number) },
) {}

/** The answer routes, as the agent's flow reaches them. */
export class AnswerApi extends Context.Service<
  AnswerApi,
  {
    /** The question and its history, once every earlier answer has settled. */
    readonly turn: (answerId: string) => Effect.Effect<Turn, NotYourTurn | AnswerSettled | AnswersUnavailable>
    /** Writes the answer's parts, or settles it. A settle that already landed succeeds. */
    readonly write: (answerId: string, write: AnswerWrite) => Effect.Effect<void, AnswerSettled | AnswersUnavailable>
  }
>()("@smthrs/mvp/agent/AnswerApi") {
  /** ChatApi's answer routes on `origin`. */
  static readonly layerHttp = (origin: string) =>
    Layer.effect(
      AnswerApi,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const url = (answerId: string) => `${origin}${ANSWERS_ROUTE}/${answerId}`
        const send = (request: HttpClientRequest.HttpClientRequest) =>
          client.execute(request).pipe(Effect.mapError(() => new AnswersUnavailable({})))
        return AnswerApi.of({
          turn: (answerId) =>
            Effect.gen(function* () {
              const response = yield* send(HttpClientRequest.get(url(answerId)))
              if (response.status !== 200) return yield* refused(response)
              return yield* response.json.pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(Turn)),
                Effect.mapError(() => new AnswersUnavailable({ status: response.status })),
              )
            }),
          write: (answerId, write) =>
            Effect.gen(function* () {
              const body = Schema.encodeSync(AnswerWriteSchema)(write)
              const response = yield* send(
                HttpClientRequest.post(url(answerId)).pipe(HttpClientRequest.bodyJsonUnsafe(body)),
              )
              if (response.status !== 200) {
                return yield* refused(response).pipe(
                  Effect.catchTag("@smthrs/mvp/agent/NotYourTurn", () => new AnswersUnavailable({ status: 409 })),
                )
              }
            }),
        })
      }),
    )
}

/** A refusal as the agent handles it: its turn hasn't come, the answer settled, or the routes are unavailable. */
const refused = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function* () {
    if (response.status !== 409) return yield* new AnswersUnavailable({ status: response.status })
    const body = yield* response.json.pipe(Effect.orElseSucceed(() => null))
    const code = typeof body === "object" && body !== null && "code" in body ? body.code : undefined
    if (code === "not_your_turn") return yield* new NotYourTurn()
    if (code === "settled") return yield* new AnswerSettled()
    return yield* new AnswersUnavailable({ status: response.status })
  })
