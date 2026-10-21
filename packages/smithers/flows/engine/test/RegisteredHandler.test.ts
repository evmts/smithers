/**
 * The handler `register` hands a driver: it runs the body under the flow's
 * declared capability ceiling, and with the registration's services but not
 * the admission that was in progress when it registered.
 */
import { describe, expect } from "@effect/vitest"
import * as CapabilitySet from "@smthrs/capability/CapabilitySet"
import { Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Layer, Schema } from "effect"
import { FlowEngine } from "../src/index.ts"
import { effect } from "./Harness.ts"
import { scriptedEngine } from "./ScriptedEngine.ts"

type Handler = Parameters<FlowEngine.Encoded["register"]>[1]

// The registered bodies below replace these declarations' own.
const countFlow = (name: string) =>
  Flow.make(`RegisteredHandler/${name}`, { payload: {}, success: Schema.Number, body: () => Node.succeed(0) })

const textFlow = (name: string) =>
  Flow.make(`RegisteredHandler/${name}`, { payload: {}, success: Schema.String, body: () => Node.succeed("") })

/** A driver that keeps each registered handler so the test can run it. */
const capturing = (onRegister: (flow: Flow.Any) => Effect.Effect<void> = () => Effect.void) => {
  const handlers = new Map<string, Handler>()
  const runtime = scriptedEngine({
    register: (flow, handler) =>
      Effect.suspend(() => {
        handlers.set(flow._tag, handler)
        return onRegister(flow)
      })
  })
  const run = (flow: Flow.Any, executionId: string) =>
    Effect.suspend(() => handlers.get(flow._tag)!({}, executionId)).pipe(
      Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, executionId)),
      Effect.provide(Layer.succeed(FlowRuntime.FlowRuntime)(runtime))
    )
  return { runtime, run }
}

describe("registered handler", () => {
  effect("runs the body under the flow's declared capability ceiling", () => {
    const Open = countFlow("open")
    const Ceiled = countFlow("ceiled").annotate(Flow.Capabilities, ["fs:read:src/**"])
    const { run, runtime } = capturing()
    const authority = () => Effect.map(CapabilitySet.current, (set) => set.groups.length)
    return Effect.scoped(Effect.gen(function*() {
      yield* runtime.register(Open, authority)
      yield* runtime.register(Ceiled, authority)
      const open = yield* run(Open, "open-run")
      expect(yield* run(Ceiled, "ceiled-run")).toBe(Number(open) + 1)
    }))
  })

  effect("does not carry an in-progress admission into a handler registered during it", () => {
    const Parent = textFlow("parent")
    const Child = textFlow("child")
    const { run, runtime } = capturing((flow) =>
      flow._tag === Parent._tag
        ? Effect.scoped(runtime.register(Child, () => Effect.scoped(registerParent).pipe(Effect.as("child"))))
        : Effect.void
    )
    const registerParent = Effect.suspend(() =>
      runtime.register(Parent, () => Effect.succeed("parent"), { ifAbsent: true })
    )
    return Effect.scoped(Effect.gen(function*() {
      yield* registerParent
      // The child registered while the parent's admission held its gate. Its
      // handler runs afterwards, so registering the parent again is not
      // recursive admission.
      expect(yield* run(Child, "child-run")).toBe("child")
    }))
  })
})
