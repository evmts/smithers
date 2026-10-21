import { expect } from "@effect/vitest"
import { DurableDeferred, Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Exit, Option, Schema } from "effect"
import { FlowEngine } from "../src/index.ts"
import { effect, pollUntil } from "./Harness.ts"

effect("completion wakes every parent that joined the child", () => {
  const child = Flow.make("joined-wake/child", { payload: {}, success: Schema.Number, body: () => Node.succeed(0) })
  const parent = Flow.make("joined-wake/parent", { payload: {}, success: Schema.Number, body: () => Node.succeed(0) })
  const gate = DurableDeferred.make("joined-wake/gate", { success: Schema.Number })
  return Effect.scoped(Effect.gen(function*() {
    const engine = yield* FlowRuntime.FlowRuntime
    yield* engine.register(child, () => DurableDeferred.await(gate))
    yield* engine.register(parent, () => Effect.orDie(child.execute({}, { executionId: "shared-child" })))
    for (const id of ["parent-one", "parent-two"]) {
      yield* engine.execute(parent, { executionId: id, payload: {}, discard: true })
      const parked = yield* pollUntil(parent.poll(id), (result) => result._tag === "Suspended", { turns: 200 })
      expect(Option.isSome(parked) && parked.value._tag).toBe("Suspended")
    }
    yield* DurableDeferred.succeed(gate, {
      token: DurableDeferred.tokenFromExecutionId(gate, { flow: child, executionId: "shared-child" }),
      value: 42
    })
    for (const id of ["parent-one", "parent-two"]) {
      const done = yield* pollUntil(parent.poll(id), (result) => result._tag === "Complete", { turns: 200 })
      expect(
        Option.isSome(done) && done.value._tag === "Complete" && Exit.isSuccess(done.value.exit) &&
          done.value.exit.value
      )
        .toBe(42)
    }
  })).pipe(Effect.provide(FlowEngine.layerMemory))
})
