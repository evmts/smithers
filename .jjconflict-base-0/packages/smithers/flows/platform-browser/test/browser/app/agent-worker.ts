/**
 * The engine worker the agent suite's page starts: `BrowserRuntime.run` over
 * `browser-test/Ask`, whose `AgentAction` sits on a scripted model. The
 * agent's cell loop makes each model call as a sealed `ModelStep`, so a
 * resumed run replays a sealed call instead of asking the model again.
 *
 * The scripted model answers in two cells. The first prints `cell-one-ran`;
 * once a request carries that output, the second finishes with the city.
 * Before it answers, the model posts `model:first` or `model:second` and this
 * worker's id on the `browser-test-log` channel. Under `?mode=block` the
 * second call never answers, so a suite can kill the browser in it.
 */
import { Agent, AgentAction, Budget, FlowEngineLike, QuotaPolicy, Seat, SeatResolver } from "@smthrs/agent"
import { Action, Interpreter } from "@smthrs/flow"
import { Evaluator, Model, ModelEvent, type ModelRequest, Route } from "@smthrs/model"
import { Registry } from "@smthrs/registry"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Result from "effect/Result"
import * as Stream from "effect/Stream"
import { BrowserRuntime } from "../../../src/index.ts"
import { Answerer, Ask } from "./agent-flow.ts"

const mode = new URLSearchParams(self.location.search).get("mode")
const worker = crypto.randomUUID()
const log = new BroadcastChannel("browser-test-log")

/** What the first cell prints. Only its output carries this text; its source does not. */
const printed = "cell-one-ran"
const firstCell = `console.log(["cell", "one", "ran"].join("-"))`
const secondCell = `ctx.done({ name: "Paris", population: 2102650 })`

const textOf = (request: ModelRequest.ModelRequest): string =>
  request.messages.flatMap((message) => message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])))
    .join("\n")

const reply = (cell: string): ReadonlyArray<ModelEvent.ModelEvent> => [
  ModelEvent.ModelEvent.TextStart({ type: "text-start", id: "cell" }),
  ModelEvent.ModelEvent.TextDelta({ type: "text-delta", id: "cell", text: "```cell\n" + cell + "\n```" }),
  ModelEvent.ModelEvent.TextEnd({ type: "text-end", id: "cell" }),
  ModelEvent.ModelEvent.Settle({ type: "settle", stopReason: "stop" })
]

/** Answers from the request alone, so a resumed run asks it the same question. */
const model = Model.make({
  stream: (request) =>
    Stream.suspend(() => {
      const second = textOf(request).includes(printed)
      log.postMessage({ label: second ? "model:second" : "model:first", worker })
      return second && mode === "block" ? Stream.never : Stream.fromIterable(reply(second ? secondCell : firstCell))
    })
})

/** The scripted seat's route: an OpenAI-compatible preparation the step's key digests. Nothing is sent. */
const route = FlowEngineLike.routeResolver(Result.getOrThrow(Route.openaiChatCompatible({
  id: "scripted",
  providerName: "scripted",
  baseUrl: "https://scripted.invalid",
  apiKey: Redacted.make("scripted")
})))

const seats = SeatResolver.layer({
  resolve: (id) => Effect.succeed(Seat.make({ id, modelId: id, model, route, contextWindowTokens: 200_000 }))
})

const host = AgentAction.layerHost({
  registry: Registry.makeNoop(),
  limits: { calls: 8 },
  capabilityEnvelope: [],
  maxFrames: 4
})

BrowserRuntime.run({
  name: "browser-test-agent",
  sqlite: {
    module: () => import("@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"),
    wasm: () => fetch("/wa-sqlite.wasm").then((response) => response.arrayBuffer())
  },
  flows: [Ask],
  registerFlows: Layer.mergeAll(Answerer.layer, Interpreter.layer(Ask, { callbackIdentity: "stable" })).pipe(
    Layer.provide(Layer.mergeAll(host, seats, Agent.layer, Agent.layerDefaults, Evaluator.layerUnavailable())),
    Layer.provide(Layer.mergeAll(QuotaPolicy.layerUnclassified(), Budget.layerUnbounded())),
    Layer.provideMerge(Action.layerImplementations)
  )
})
