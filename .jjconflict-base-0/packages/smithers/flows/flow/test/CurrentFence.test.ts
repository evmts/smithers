/**
 * `Action.CurrentFence` is supplied by a durable engine, never invented: an
 * implementation outside one reads `undefined` and must refuse to write
 * fenced state, while a supplied fence reaches the implementation unchanged.
 * The durable SQL engine's own supply is proved in `@smthrs/engine-store`.
 */
import { describe, expect, it } from "@effect/vitest"
import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Effect, Layer, Schema } from "effect"
import { effect } from "./Harness.ts"
import { layerWired } from "./MemoryFlowRuntime.ts"

const Observe = Action.make("Fence/Observe", {
  payload: { id: Schema.String },
  success: Schema.Boolean
})

const Host = Flow.make("Fence/Host", {
  payload: { id: Schema.String },
  success: Schema.Boolean,
  idempotencyKey: ({ id }) => id,
  body: (payload) => Observe.call(payload)
})

describe("Action.CurrentFence", () => {
  it.effect("is absent outside a runtime that supplies one", () =>
    Effect.gen(function*() {
      expect(yield* Action.CurrentFence).toBeUndefined()
      // Nothing re-runs an attempt outside a durable engine either.
      expect(yield* Action.CurrentRedispatch).toBe(false)
    }))

  effect("is absent inside an engine without durable ownership", () =>
    Effect.gen(function*() {
      const seen: Array<Action.Fence | undefined> = []
      const fenced = yield* Host.execute({ id: "memory" }, { executionId: "memory" }).pipe(
        Effect.provide(layerWired(Layer.mergeAll(
          Observe.toLayer(() =>
            Effect.map(Action.CurrentFence, (current) => {
              seen.push(current)
              return current !== undefined
            })
          ),
          Interpreter.layer(Host)
        ))),
        Effect.orDie
      )
      expect(fenced).toBe(false)
      expect(seen).toEqual([undefined])
    }))
})
