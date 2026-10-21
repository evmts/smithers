import { FlowRegistry } from "../../flows/registry"
import { Collection, Persistence } from "@smthrs/effect-tanstack-db"
import { Action } from "@smthrs/flow"
import { Model, type ModelEvent } from "@smthrs/model"
import { Context, Effect, Exit, Layer, Scope, Stream } from "effect"
import { expect, test, vi } from "vitest"
import { build } from "../../../worker/test/flowHost"
import { ClientEngine, FlowDispatch } from "../../flows/dispatch"
import { Message } from "../chat/schema"
import { Summarize } from "./flow"
import { registration, SummarySeat } from "./steps"
import { followSummaries, makeSummaries, revisionOf, summaryQuery } from "./store"

const row = (id: string, text: string): Message => ({
  id, text, role: "user", status: "done", questionId: null, failure: null, modelId: null, stopReason: null,
  inputTokens: null, outputTokens: null, position: 1, createdAt: "2026-10-20 18:00:00+00", updatedAt: "2026-10-20 18:00:00+00",
})

test("real durable summary results project once, refresh changed content and skip streaming or empty entries", async () => {
  const scope = Effect.runSync(Scope.make())
  let calls = 0
  const model = Model.make({ stream: () => {
    calls++
    return Stream.fromIterable<ModelEvent.ModelEvent>([{ type: "text-delta", id: "s", text: "Inspect both retry attempts" }, { type: "settle", stopReason: "stop" }])
  } })
  try {
    const { context: engine } = await Effect.runPromise(Scope.provide(scope)(build(registration.pipe(
      Layer.provide(SummarySeat.layer("https://summary.test", model)), Layer.provideMerge(Action.layerImplementations),
    ))))
    const context = await Effect.runPromise(Scope.provide(scope)(Layer.build(Layer.mergeAll(
      Persistence.memory,
      FlowDispatch.layer.pipe(Layer.provide(FlowRegistry.layer)).pipe(Layer.provide(ClientEngine.layerRuntime([Summarize])), Layer.provide(Layer.succeedContext(engine))),
    ))))
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.runPromise(Scope.provide(scope)(Effect.provide(effect, context)) as Effect.Effect<A, E>)
    const messages = await run(Collection.local<Message, Collection.Key>({ id: "test-timeline-messages", schema: Message, getKey: message => message.id }))
    const summaries = await run(makeSummaries)
    const query = await run(summaryQuery(summaries))
    expect(query.tanstack).toBeDefined()
    await run(Effect.forkIn(followSummaries(messages, summaries, Context.get(context, FlowDispatch)), scope, { startImmediately: true }))
    await run(messages.insert(row("a", "Inspect retries")))
    await vi.waitFor(async () => expect((await run(summaries.get("a")))._tag).toBe("Some"), { timeout: 15_000 })
    expect(calls).toBe(1)
    await run(messages.update("a", draft => { draft.updatedAt = "2026-10-20 18:00:01+00" }))
    await run(messages.insert({ ...row("stream", "partial"), status: "streaming" }))
    await run(messages.insert(row("empty", " ")))
    await run(messages.update("a", draft => { draft.text = "Inspect failures" }))
    await vi.waitFor(async () => {
      const value = await run(summaries.get("a"))
      expect(value._tag === "Some" && value.value.revision).toBe(revisionOf(row("a", "Inspect failures")))
    }, { timeout: 15_000 })
    expect(calls).toBe(2)
    expect((await run(summaries.get("stream")))._tag).toBe("None")
    expect((await run(summaries.get("empty")))._tag).toBe("None")
    await run(messages.delete("a"))
  } finally { await Effect.runPromise(Scope.close(scope, Exit.void)) }
})

test.each(["failed", "unavailable", "changed", "deleted"] as const)("does not publish a %s summary result", async scenario => {
  const scope = Effect.runSync(Scope.make())
  try {
    const context = await Effect.runPromise(Scope.provide(scope)(Layer.build(Persistence.memory)))
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.runPromise(Scope.provide(scope)(Effect.provide(effect, context)) as Effect.Effect<A, E>)
    const messages = await run(Collection.local<Message, Collection.Key>({ id: `fault-${scenario}`, schema: Message, getKey: message => message.id }))
    const summaries = await run(makeSummaries)
    let processed = false
    const dispatch = {
      dispatch: () => Effect.gen(function* () {
        if (processed) return { _tag: "Failed", error: { _tag: "timeline/SummaryFailed", code: "invalid" } }
        if (scenario === "changed") yield* messages.update("a", draft => { draft.text = "Changed while summarizing" })
        if (scenario === "deleted") yield* messages.delete("a")
        processed = true
        if (scenario === "unavailable") return yield* Effect.fail(new Error("provider is unavailable"))
        if (scenario === "failed") return { _tag: "Failed", error: { _tag: "timeline/SummaryFailed", code: "invalid" } }
        return { _tag: "Done", value: { summary: "Inspect both retry attempts" } }
      }),
    } as unknown as FlowDispatch["Service"]
    await run(Effect.forkIn(followSummaries(messages, summaries, dispatch), scope, { startImmediately: true }))
    await run(messages.insert(row("a", "Inspect retries")))
    await vi.waitFor(() => expect(processed).toBe(true))
    expect((await run(summaries.get("a")))._tag).toBe("None")
  } finally { await Effect.runPromise(Scope.close(scope, Exit.void)) }
})
