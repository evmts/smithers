/**
 * Durable Objects of one class, in memory: each is named by an execution id
 * and has its own storage and alarm, and they reach each other through a
 * `Router` the way an app's object class reaches its namespace binding.
 * `run` stands in for Cloudflare's alarm scheduler: it fires due alarms, one
 * handler at a time, until none is due.
 */
import type { Flow } from "@smthrs/flow"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import { ExecutionObject } from "../../src/index.ts"
import * as MemoryStorage from "./MemoryStorage.ts"

/** A router for a suite that runs one execution and expects nothing routed: any call is a defect. */
export const unrouted: ExecutionObject.Router = {
  start: (intent) => Effect.die(new Error(`unexpected start of ${intent.executionId}`)),
  wake: (executionId) => Effect.die(new Error(`unexpected wake of ${executionId}`))
}

export interface Objects {
  /** Every object addressed so far, by execution id. */
  readonly objects: Map<string, MemoryStorage.MemoryStorage>
  /** The outcomes of every alarm each object ran, in order. */
  readonly outcomes: Map<string, Array<ExecutionObject.Outcome>>
  /** The object named `executionId`, created empty on first use, as a namespace's `get` does. */
  readonly object: (executionId: string) => MemoryStorage.MemoryStorage
  /** Starts and wakes objects of this namespace: what an object class supplies to `alarm`. */
  readonly router: ExecutionObject.Router<ExecutionObject.IntentConflict>
  /** Runs one alarm of the object named `executionId` and records its outcome. */
  readonly alarm: (executionId: string) => Effect.Effect<ExecutionObject.Outcome>
  /**
   * Fires the earliest armed alarm that is due, then the next, until none is
   * due. With `advance`, an alarm armed for later is due too, once `advance`
   * has moved the clock to it.
   */
  readonly run: (advance?: (toMs: number) => Effect.Effect<void>) => Effect.Effect<void>
}

export const make = <E>(options: {
  readonly flows: ReadonlyArray<Flow.Any>
  readonly runtime: (intent: ExecutionObject.Intent) => Layer.Layer<ExecutionObject.Services, E>
  /** Wraps the namespace's router, to interpose on what an alarm routes. */
  readonly router?: (objects: Objects) => ExecutionObject.Router<unknown>
}): Objects => {
  const objects = new Map<string, MemoryStorage.MemoryStorage>()
  const outcomes = new Map<string, Array<ExecutionObject.Outcome>>()
  const object = (executionId: string) => {
    const existing = objects.get(executionId)
    if (existing !== undefined) return existing
    const created = MemoryStorage.make()
    objects.set(executionId, created)
    return created
  }
  const self: Objects = {
    objects,
    outcomes,
    object,
    router: {
      start: (intent) => ExecutionObject.start(object(intent.executionId).storage, intent, Effect.void),
      wake: (executionId) => Effect.asVoid(ExecutionObject.wake(object(executionId).storage))
    },
    alarm: (executionId) =>
      ExecutionObject.alarm(object(executionId).storage, {
        flows: options.flows,
        runtime: options.runtime,
        router: options.router === undefined ? self.router : options.router(self)
      }).pipe(
        Effect.tap((outcome) =>
          Effect.sync(() => {
            outcomes.set(executionId, [...(outcomes.get(executionId) ?? []), outcome])
          })
        )
      ),
    run: (advance) =>
      Effect.gen(function*() {
        for (let fired = 0; fired < 100; fired++) {
          const armed = [...objects]
            .flatMap(([id, storage]) => {
              const at = storage.alarm()
              return at === null ? [] : [{ id, at }]
            })
            .sort((left, right) => left.at - right.at)[0]
          if (armed === undefined) return
          if (armed.at > (yield* Clock.currentTimeMillis)) {
            if (advance === undefined) return
            yield* advance(armed.at)
          }
          yield* self.alarm(armed.id)
        }
        return yield* Effect.die(new Error("alarms were still due after 100 firings"))
      })
  }
  return self
}
