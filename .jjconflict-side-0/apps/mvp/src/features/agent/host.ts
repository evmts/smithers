import { Agent, AgentAction, Budget, EventSink, QuotaPolicy, Seat, SeatResolver } from "@smthrs/agent"
import { Interpreter } from "@smthrs/flow"
import { Evaluator, ModelProxy } from "@smthrs/model"
import { Registry } from "@smthrs/registry"
import { Clock, Duration, Effect, Layer } from "effect"
import * as Catalog from "../../flows/catalog"
import { MODEL_ROUTE } from "../model/contract"
import { AnswerApi, type AnswersUnavailable, type NotYourTurn, TurnOutOfTime } from "./answers"
import { ANSWER_TURN_WAIT, MAX_FRAMES } from "./contract"
import { Answer, type Ending, LoadTurn, Respond, Settle, TurnDeadline } from "./flows"
import { AnswerProgress, failureOf, type Progress } from "./progress"
import type { AnswerWrite } from "./schema"

// What the agent's flow runs on (docs/features/agent.md#the-host): one composition for every host. The host supplies
// its engine (`FlowRuntime`), an Effect `HttpClient` and ChatApi's origin; this layer supplies the rest:
// - the `agent` seat: the server's model endpoint, read with `ModelProxy`'s client and keyed with its `prepare`, so
//   each model call is a sealed `ModelStep` and the key never reaches the device (decision 0011 §3);
// - the catalog: the app's own flows (src/flows/catalog.ts), and nothing else; no file system, no shell;
// - the policies: quota refusals park the step; the server holds the budget, so the device's is unbounded; no judge;
// - the sink: the agent's events become the answer's parts (progress.ts);
// - the turn wait: how long a run waits for its turn before it settles its answer `unfinished` (`ANSWER_TURN_WAIT`
//   unless set).

/** The seat `chat/Respond` declares: the model endpoint's `agent` role. */
export const AGENT_SEAT = "agent"

/**
 * The context window the agent compacts against. The endpoint picks the model, so the device can't ask it; this is a
 * floor every model the `agent` role may use is expected to meet.
 */
export const CONTEXT_WINDOW_TOKENS = 32_768

/** The most flow calls one cell may make. */
export const MAX_CALLS_PER_CELL = 8

/**
 * What the host gives the agent: ChatApi's origin, how often an answer's parts are written while it streams, and how
 * long one run waits for its turn from its first start (`ANSWER_TURN_WAIT` unless set).
 */
export interface HostOptions {
  readonly origin: string
  readonly partsEvery?: `${number} ${"millis" | "seconds"}`
  readonly turnWait?: Duration.Input
}

/** One seat, `agent`, answered by the model endpoint on `origin`; any other seat is unresolved. */
export const seats = (origin: string) =>
  Layer.effect(
    SeatResolver.SeatResolver,
    Effect.gen(function* () {
      const url = `${origin}${MODEL_ROUTE}/${AGENT_SEAT}`
      const model = yield* ModelProxy.makeClient({ url })
      const seat = Seat.make({
        id: AGENT_SEAT,
        modelId: AGENT_SEAT,
        model,
        route: { prepare: ModelProxy.prepare({ url }) },
        contextWindowTokens: CONTEXT_WINDOW_TOKENS,
      })
      return SeatResolver.make({
        resolve: (id) =>
          id === AGENT_SEAT
            ? Effect.succeed(seat)
            : Effect.fail(new Seat.SeatUnresolved({ seat: id, message: "The app's agent has one seat, agent." })),
      })
    }),
  )

/** The host every `chat/Respond` shares: the app's catalog, the frame cap and the sandbox's limits. */
export const agentHost = Layer.effect(
  AgentAction.Host,
  Effect.map(Catalog.source, (app) =>
    AgentAction.makeHost({
      registry: Registry.makeNoop(),
      flows: [app],
      limits: { calls: MAX_CALLS_PER_CELL },
      capabilityEnvelope: [],
      maxFrames: MAX_FRAMES,
    })),
)

/** The agent's events, recorded against the answer the run is for: its execution id. */
export const sink = Layer.effect(
  EventSink.EventSink,
  Effect.gen(function* () {
    const progress = yield* AnswerProgress
    return EventSink.make({
      emit: (event, step) => (step === undefined ? Effect.void : progress.record(step.executionId, event)),
    })
  }),
)

/**
 * What `chat/Settle` writes for how the run ended: `unfinished` when its turn wait ran out, else the text when there is
 * one, else why the agent didn't answer; with the parts it showed. Token counts are whole, as the routes take them: a
 * provider's fractional count is rounded rather than refused, which would kill the step and leave the answer streaming.
 */
export const settlement = (
  ending: Ending,
  progress: Progress | undefined,
): Exclude<AnswerWrite, { readonly status: "streaming" }> => {
  const shown = progress === undefined ? {} : { parts: progress.parts }
  const { text, timedOut } = ending
  if (timedOut) return { status: "failed", failure: "unfinished", ...shown }
  if (text !== null && text.trim() !== "") {
    return {
      status: "done",
      text,
      ...shown,
      ...(progress === undefined
        ? {}
        : { inputTokens: Math.round(progress.inputTokens), outputTokens: Math.round(progress.outputTokens) }),
    }
  }
  return { status: "failed", failure: text === null ? failureOf(progress) : "empty", ...shown }
}

/**
 * `chat/Answer` and its steps: the turn and the settle through `AnswerApi`, the agent through `Agent`, and a turn wait
 * of `turnWait` from the run's first start.
 */
export const registration = (turnWait: Duration.Input = ANSWER_TURN_WAIT) => {
  const turnWaitMs = Duration.toMillis(Duration.fromInputUnsafe(turnWait))
  return Interpreter.layerWithImplementations(
    Answer,
    Layer.mergeAll(
      TurnDeadline.toLayer(() => Effect.map(Clock.currentTimeMillis, (now) => now + turnWaitMs)),
      // A turn it must still wait for, or routes it can't reach, past `until`: the wait is over.
      LoadTurn.toLayer(({ answerId, until }) =>
        Effect.gen(function* () {
          return yield* (yield* AnswerApi).turn(answerId).pipe(
            Effect.catchIf(
              (error): error is NotYourTurn | AnswersUnavailable => error._tag !== "@smthrs/mvp/agent/AnswerSettled",
              (error) =>
                Effect.flatMap(
                  Clock.currentTimeMillis,
                  (now): Effect.Effect<never, NotYourTurn | AnswersUnavailable | TurnOutOfTime> =>
                    now >= until ? Effect.fail(new TurnOutOfTime()) : Effect.fail(error),
                ),
            ),
          )
        })
      ),
      Respond.layer,
      Settle.toLayer(({ answerId, ending }) =>
        Effect.gen(function* () {
          const api = yield* AnswerApi
          const progress = yield* AnswerProgress
          const write = settlement(ending, yield* progress.get(answerId))
          yield* api.write(answerId, write)
          yield* progress.forget(answerId)
          return { status: write.status }
        })
      ),
    ),
  )
}

/**
 * The agent's flows with everything they run on but the engine: needs the host's `FlowRuntime`, `Crypto` and
 * `HttpClient`, and whatever the catalog's flows need (the theme's `Preferences`).
 */
export const layer = (options: HostOptions) =>
  registration(options.turnWait).pipe(
    Layer.provide(Layer.mergeAll(agentHost, seats(options.origin), sink, Agent.layer)),
    Layer.provide(Layer.mergeAll(QuotaPolicy.layerDefault(), Budget.layerUnbounded())),
    Layer.provide(Layer.mergeAll(Agent.layerDefaults, Evaluator.layerUnavailable())),
    Layer.provideMerge(AnswerProgress.layer(options.partsEvery)),
    Layer.provideMerge(AnswerApi.layerHttp(options.origin)),
  )
