import { expect } from "@effect/vitest"
import { Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Cause, Effect, Logger, References, Schema } from "effect"
import { FlowEngine } from "../src/index.ts"
import { effect } from "./Harness.ts"

effect("discarded lineage failures are logged with the execution identity", () =>
  Effect.scoped(Effect.gen(function*() {
    const failure = new Error("discarded body failed")
    const logs: Array<{ cause: unknown; annotations: Readonly<Record<string, unknown>> }> = []
    const logger = Logger.make((entry) =>
      logs.push({
        cause: Cause.squash(entry.cause),
        annotations: entry.fiber.getRef(References.CurrentLogAnnotations)
      })
    )
    const flow = Flow.make("discard-observer/flow", {
      payload: {},
      success: Schema.Void,
      body: () => Node.succeed(undefined)
    })
    const engine = yield* FlowRuntime.FlowRuntime
    yield* engine.register(flow, () => Effect.die(failure))
    yield* engine.execute(flow, { executionId: "discard-failure", payload: {}, discard: true })
      .pipe(Effect.provideService(Logger.CurrentLoggers, new Set([logger])))
    for (let turn = 0; turn < 100; turn++) yield* Effect.yieldNow
    expect(logs).toContainEqual({
      cause: failure,
      annotations: expect.objectContaining({
        flow: flow._tag,
        executionId: "discard-failure"
      })
    })
  })).pipe(Effect.provide(FlowEngine.layerMemory)))
