import { Action, FlowRuntime } from "@smthrs/flow"
import { Model, ModelError, ModelEvent } from "@smthrs/model"
import { Cause, Context, Effect, Exit, Layer, Logger, Scope, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, expect, test } from "vitest"
import { build } from "../../../worker/test/flowHost"
import { Summarize, SummaryFailed } from "./flow"
import { registration, SummarySeat } from "./steps"

const scopes: Scope.Closeable[] = []
afterEach(async () => { for (const scope of scopes.splice(0)) await Effect.runPromise(Scope.close(scope, Exit.void)) })
const payload = { id: "entry", revision: "r1", role: "user" as const, text: "Please check whether the release retried twice." }

test("sealed summary model step replays without a second provider call and logs no content", async () => {
  let calls = 0
  const requests: unknown[] = []
  const model = Model.make({ stream: request => {
    calls++; requests.push(request)
    return Stream.fromIterable<ModelEvent.ModelEvent>([{ type: "thinking-delta", id: "think", text: "internal" }, { type: "text-delta", id: "s", text: "Inspect both retry attempts" }, { type: "settle", stopReason: "stop" }])
  } })
  const scope = Effect.runSync(Scope.make()); scopes.push(scope)
  const lines: string[] = []
  const logger = Logger.make(options => { lines.push(JSON.stringify(Logger.formatStructured.log(options))) })
  const { context } = await Effect.runPromise(Scope.provide(scope)(build(registration.pipe(
    Layer.provide(SummarySeat.layer("https://summary.test", model)),
    Layer.provideMerge(Action.layerImplementations),
  ))).pipe(Effect.provideService(Logger.CurrentLoggers, new Set([logger]))))
  const runtime = Context.get(context, FlowRuntime.FlowRuntime)
  const execute = () => Effect.runPromise(runtime.execute(Summarize, { executionId: "summary-replay", payload }).pipe(
    Effect.provide(context), Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
  ))
  expect(await execute()).toEqual({ summary: "Inspect both retry attempts" })
  expect(await execute()).toEqual({ summary: "Inspect both retry attempts" })
  expect(calls).toBe(1)
  expect(requests).toHaveLength(1)
  expect(lines.some(line => line.includes("timeline.summary"))).toBe(true)
  expect(lines.join("\n")).not.toContain(payload.text)
  expect(lines.join("\n")).not.toContain("Inspect both retry attempts")
})

test.each(["two words", "one <two> three"])("invalid model output is a safe typed failure: %s", async text => {
  const model = Model.make({ stream: () => Stream.fromIterable<ModelEvent.ModelEvent>([{ type: "text-delta", id: "s", text }, { type: "settle", stopReason: "stop" }]) })
  const scope = Effect.runSync(Scope.make()); scopes.push(scope)
  const { context } = await Effect.runPromise(Scope.provide(scope)(build(registration.pipe(
    Layer.provide(SummarySeat.layer("https://summary.test", model)), Layer.provideMerge(Action.layerImplementations),
  ))))
  const runtime = Context.get(context, FlowRuntime.FlowRuntime)
  const exit = await Effect.runPromise(Effect.exit(runtime.execute(Summarize, { executionId: "invalid-summary", payload })).pipe(Effect.provide(context)))
  expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(new SummaryFailed({ code: "invalid" }))
})


test("provider refusal stays content-safe and does not invent a summary", async () => {
  const model = Model.make({ stream: () => Stream.fail(new ModelError.ModelError({ code: "content_policy", message: "private provider detail" })) })
  const scope = Effect.runSync(Scope.make()); scopes.push(scope)
  const { context } = await Effect.runPromise(Scope.provide(scope)(build(registration.pipe(
    Layer.provide(SummarySeat.layer("https://summary.test", model)), Layer.provideMerge(Action.layerImplementations),
  ))))
  const runtime = Context.get(context, FlowRuntime.FlowRuntime)
  const exit = await Effect.runPromise(Effect.exit(runtime.execute(Summarize, { executionId: "refused-summary", payload })).pipe(Effect.provide(context)))
  expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(new SummaryFailed({ code: "unavailable" }))
})


test("summary seat constructs the real proxy and preparation failures become safe failures", async () => {
  const scope = Effect.runSync(Scope.make()); scopes.push(scope)
  const seatContext = await Effect.runPromise(Scope.provide(scope)(Layer.build(SummarySeat.layer("https://summary.test").pipe(Layer.provide(FetchHttpClient.layer)))))
  const seat = Context.get(seatContext, SummarySeat)
  expect(seat.model).toBeDefined()
  const faulty = { ...seat, route: { prepare: () => Effect.fail(new ModelError.ModelError({ code: "content_policy", message: "private route detail" })) } }
  const { context } = await Effect.runPromise(Scope.provide(scope)(build(registration.pipe(
    Layer.provide(Layer.succeed(SummarySeat, faulty)), Layer.provideMerge(Action.layerImplementations),
  ))))
  const runtime = Context.get(context, FlowRuntime.FlowRuntime)
  const exit = await Effect.runPromise(Effect.exit(runtime.execute(Summarize, { executionId: "route-refusal", payload })).pipe(Effect.provide(context)))
  expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(new SummaryFailed({ code: "unavailable" }))
})
