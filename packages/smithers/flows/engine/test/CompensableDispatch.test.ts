/**
 * Compensable dispatch against a scripted driver: which attempts restore the
 * retry sequence's earliest snapshot, and that an attempt whose driver dies
 * of an expired attempt bound still reaches the retry decision.
 */
import { describe, expect } from "@effect/vitest"
import { Action, Flow, FlowRuntime, RetryPolicy } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Exit, Fiber, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { FlowEngine } from "../src/index.ts"
import { effect } from "./Harness.ts"
import { scriptedEngine } from "./ScriptedEngine.ts"

const flow = Flow.make("CompensableDispatch/flow", {
  payload: { id: Schema.String },
  success: Schema.Number,
  body: () => Node.succeed(0)
})

const recordingBoundary = (events: Array<string>) =>
  FlowEngine.SnapshotBoundary.of({
    snapshot: (options) => Effect.sync(() => (events.push(`snapshot:${options.attempt}`), `snap:${options.attempt}`)),
    restore: (snapshot, options) =>
      Effect.sync(() => void events.push(`restore:${String(snapshot)}:${options.attempt}`)),
    diff: (snapshot, options) =>
      Effect.sync(() => {
        events.push(`diff:${String(snapshot)}:${options.attempt}`)
        return Option.none()
      })
  })

describe("compensable dispatch", () => {
  effect("a first attempt never restores, even when its key already holds a snapshot", () => {
    const events: Array<string> = []
    const action = Action.make({
      name: "CompensableDispatch/first-attempt",
      tier: "compensable",
      success: Schema.Number,
      execute: Effect.die("scripted driver dispatches instead")
    })
    const engine = scriptedEngine({
      actionExecute: (input) =>
        Effect.sync(() => {
          events.push(`execute:${input.attempt}`)
          return new Flow.Complete({ exit: Exit.succeed(1) })
        })
    })
    // A shared retry slot pins the scope's ordinal, so both dispatches derive
    // the same invocation key in the same instance.
    const slot: Action.OrdinalSlot = { values: new Map(), cursors: new Map() }
    return Effect.gen(function*() {
      yield* engine.actionExecute(action, 1)
      slot.cursors.clear()
      yield* engine.actionExecute(action, 1)
      expect(events).toEqual([
        "snapshot:1",
        "execute:1",
        "diff:snap:1:1",
        "snapshot:1",
        "execute:1",
        "diff:snap:1:1"
      ])
    }).pipe(
      Effect.provideService(Action.CurrentOrdinal, slot),
      Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, "first-attempt-run")),
      Effect.provideService(FlowEngine.SnapshotBoundary, recordingBoundary(events))
    )
  })

  effect("retries a compensable attempt whose driver died of an expired attempt bound", () => {
    const events: Array<string> = []
    const action = Action.make({
      name: "CompensableDispatch/timed-out",
      tier: "compensable",
      success: Schema.Number,
      retryPolicy: RetryPolicy.make({ initialMs: 1, factor: 1, maxMs: 1, maxAttempts: 2 }),
      execute: Effect.die("scripted driver dispatches instead")
    })
    const engine = scriptedEngine({
      actionExecute: (input) =>
        Effect.suspend(() => {
          events.push(`execute:${input.attempt}`)
          return input.attempt === 1
            ? Effect.die(
              new Action.AttemptTimedOut({
                actionName: action.name,
                attempt: 1,
                bound: "attempt",
                timeoutMs: 100,
                message: "attempt 1 timed out"
              })
            )
            : Effect.succeed(new Flow.Complete({ exit: Exit.succeed(2) }))
        })
    })
    return Effect.gen(function*() {
      const fiber = yield* engine.actionExecute(action, 1).pipe(Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust("1 millis")
      const result = yield* Fiber.join(fiber)
      expect(result).toEqual(new Flow.Complete({ exit: Exit.succeed(2) }))
      expect(events).toEqual([
        "snapshot:1",
        "execute:1",
        "diff:snap:1:1",
        "restore:snap:1:2",
        "snapshot:2",
        "execute:2",
        "diff:snap:2:2"
      ])
    }).pipe(
      Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, "timed-out-run")),
      Effect.provideService(FlowEngine.SnapshotBoundary, recordingBoundary(events))
    )
  })
})
