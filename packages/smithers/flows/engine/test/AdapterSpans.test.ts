/**
 * The adapter's deferred and clock members: each records its own span with
 * the identifying attributes, and hands the driver encoded exits carrying
 * exactly the fields the low-level contract names.
 */
import { describe, expect } from "@effect/vitest"
import { DurableClock, DurableDeferred, Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Exit, Option, Schema, Tracer } from "effect"
import { FlowEngine } from "../src/index.ts"
import { effect } from "./Harness.ts"
import { scriptedEngine } from "./ScriptedEngine.ts"

const flow = Flow.make("AdapterSpans/flow", {
  payload: { id: Schema.String },
  success: Schema.Number,
  body: () => Node.succeed(0)
})

const gate = DurableDeferred.make("AdapterSpans/gate", { success: Schema.NumberFromString })

const recordSpans = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  const named = (name: string) =>
    spans.filter((span) => span.name === name).map((span) => Object.fromEntries(span.attributes))
  return { tracer, named }
}

describe("adapter deferred and clock members", () => {
  effect("decodes a recorded deferred result, consumes the wait annotation, and spans the lookup", () => {
    const { tracer, named } = recordSpans()
    const engine = scriptedEngine({
      deferredResult: () => Effect.succeedSome(Exit.succeed("7"))
    })
    const instance = FlowEngine.makeInstance(flow, "deferred-result-run")
    instance.waiting = { reason: "approval" }
    return Effect.gen(function*() {
      const result = yield* engine.deferredResult(gate)
      expect(result).toEqual(Option.some(Exit.succeed(7)))
      expect(instance.waiting).toBeUndefined()
      expect(named("FlowEngine.deferredResult")).toEqual([{
        name: "AdapterSpans/gate",
        executionId: "deferred-result-run"
      }])
    }).pipe(
      Effect.provideService(FlowRuntime.FlowInstance, instance),
      Effect.provideService(Tracer.Tracer, tracer)
    )
  })

  effect("keeps the wait annotation while no deferred result is recorded", () => {
    const engine = scriptedEngine({ deferredResult: () => Effect.succeedNone })
    const instance = FlowEngine.makeInstance(flow, "deferred-pending-run")
    instance.waiting = { reason: "approval" }
    return Effect.gen(function*() {
      expect(yield* engine.deferredResult(gate)).toEqual(Option.none())
      expect(instance.waiting).toEqual({ reason: "approval" })
    }).pipe(Effect.provideService(FlowRuntime.FlowInstance, instance))
  })

  effect("hands the driver an encoded completion with only the contract's fields", () => {
    const { tracer, named } = recordSpans()
    const received: Array<unknown> = []
    const engine = scriptedEngine({
      deferredDone: (options) => Effect.sync(() => void received.push(options))
    })
    // A field outside the contract stays with the caller.
    const done = {
      flowName: flow._tag,
      executionId: "deferred-done-run",
      deferredName: gate.name,
      exit: Exit.succeed(7),
      extra: "dropped"
    }
    return Effect.gen(function*() {
      yield* engine.deferredDone(gate, done)
      expect(received).toEqual([{
        flowName: flow._tag,
        executionId: "deferred-done-run",
        deferredName: gate.name,
        exit: Exit.succeed("7")
      }])
      expect(named("FlowEngine.deferredDone")).toEqual([{ name: gate.name, executionId: "deferred-done-run" }])
    }).pipe(Effect.provideService(Tracer.Tracer, tracer))
  })

  effect("completes a waiting deferred through the driver, or reports it not waiting without one", () => {
    const { tracer, named } = recordSpans()
    const received: Array<unknown> = []
    const waiting = scriptedEngine({
      deferredDoneIfWaiting: (options) => Effect.sync(() => (received.push(options), "Completed" as const))
    })
    const absent = scriptedEngine({})
    const done = {
      flowName: flow._tag,
      executionId: "deferred-waiting-run",
      deferredName: gate.name,
      reason: "approval",
      token: "token-1",
      exit: Exit.succeed(7)
    }
    return Effect.gen(function*() {
      expect(yield* waiting.deferredDoneIfWaiting(gate, done)).toBe("Completed")
      expect(yield* absent.deferredDoneIfWaiting(gate, done)).toBe("NotWaiting")
      expect(received).toEqual([{ ...done, exit: Exit.succeed("7") }])
      const attributes = { name: gate.name, executionId: "deferred-waiting-run", reason: "approval" }
      expect(named("FlowEngine.deferredDoneIfWaiting")).toEqual([attributes, attributes])
    }).pipe(Effect.provideService(Tracer.Tracer, tracer))
  })

  effect("schedules a durable clock through the driver inside its own span", () => {
    const { tracer, named } = recordSpans()
    const scheduled: Array<string> = []
    const engine = scriptedEngine({
      scheduleClock: (scheduledFlow, options) =>
        Effect.sync(() => void scheduled.push(`${scheduledFlow._tag}:${options.executionId}:${options.clock.name}`))
    })
    const clock = DurableClock.make({ name: "AdapterSpans/clock", duration: "1 minute" })
    return Effect.gen(function*() {
      yield* engine.scheduleClock(flow, { executionId: "clock-run", clock })
      expect(scheduled).toEqual([`${flow._tag}:clock-run:AdapterSpans/clock`])
      expect(named("FlowEngine.scheduleClock")).toEqual([{ executionId: "clock-run", name: "AdapterSpans/clock" }])
    }).pipe(Effect.provideService(Tracer.Tracer, tracer))
  })
})
