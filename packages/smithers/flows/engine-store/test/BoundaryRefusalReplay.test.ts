/**
 * Issue #4019: a boundary refusal settles the action with the refusal itself,
 * on the defect channel, whether the attempt failed in this process or is
 * replayed from its durable `failed` row after a crash.
 *
 * The refusal is the engine's verdict on the step, not a failure the action
 * declared. Decoded through the action's error schema (here none, so `Never`)
 * it used to become "SchemaError: Expected never" and lose the refused paths.
 */
import { describe, expect, it } from "@effect/vitest"
import * as TestDatabase from "@smthrs/database/test/TestDatabase"
import { Action, Flow } from "@smthrs/flow"
import { Journal } from "@smthrs/journal"
import * as Notifying from "@smthrs/journal/test/Notifying"
import { Jj } from "@smthrs/kernel"
import { RunStore } from "@smthrs/run-store"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { TestClock } from "effect/testing"
import * as DurableEngineState from "../src/DurableEngineState.ts"
import * as EngineStore from "../src/EngineStore.ts"
import * as StepBoundary from "../src/StepBoundary.ts"
import * as TestStores from "../src/test/TestStores.ts"
import { executeUntilParked } from "./ExecuteUntilParked.ts"
import { opaqueHandlerBody } from "./fixtures/OpaqueHandlerBody.ts"
import { withCrypto } from "./Sha256.ts"

const RefusedFlow = Flow.make("BoundaryRefusalReplay/Flow", {
  payload: {},
  success: Schema.String,
  body: opaqueHandlerBody
})

const jj = Jj.make({
  snapshot: () =>
    Effect.succeed({ commitId: "boundary-refusal-snapshot" as never, changeId: "boundary-refusal-snapshot" as never }),
  restore: () => Effect.void,
  diff: () => Effect.succeed(""),
  workspaceAdd: () => Effect.void,
  workspaceForget: () => Effect.void,
  status: () => Effect.succeed("")
})

const refusal = new StepBoundary.UndeclaredWrite({
  code: "undeclared_write",
  paths: ["stray.txt"],
  diffIdentity: "boundary-refusal-diff"
})

/** What the run settles with: the refusal's tagged fields as its one defect. */
const refused = [{
  _tag: "Die",
  defect: {
    _tag: "@smthrs/engine-store/UndeclaredWrite",
    code: "undeclared_write",
    paths: ["stray.txt"],
    diffIdentity: "boundary-refusal-diff"
  }
}]

/** A sealed step with no error schema whose settle the boundary refuses. */
const step = (dispatches: { count: number }) =>
  Action.make({
    name: "BoundaryRefusalReplay/step",
    success: Schema.String,
    tier: "sealed",
    idempotencyKey: "boundary-refusal-v1",
    fileBoundary: { readSet: [], writeSet: [], boundaryMode: "hard" },
    execute: Effect.sync(() => {
      dispatches.count++
      return "wrote"
    })
  })

const makeEngine = EngineStore.make({
  owner: { hostId: "boundary-refusal-host" },
  journalSource: "boundary-refusal-test",
  isAlive: () => Effect.succeed(false)
})

const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withCrypto(
    effect.pipe(
      Effect.provideService(DurableEngineState.DurableEngineState, DurableEngineState.makeMemory()),
      Effect.provideService(Jj.Jj, jj),
      Effect.provide(StepBoundary.layerTest({ failure: refusal })),
      Effect.provide(TestStores.layer()),
      Effect.provide(TestClock.layer()),
      Effect.provide(Action.layerCacheEnvironment({ layers: [], capabilities: {} }))
    ) as Effect.Effect<A, E, never>
  )

/** The settled run's recorded exit cause. */
const settledCause = (executionId: string) =>
  Effect.gen(function*() {
    const row = yield* (yield* RunStore.RunStore).get(executionId)
    return { status: row.status, cause: JSON.parse(row.stateJson).result.exit.cause as unknown }
  })

describe("a boundary refusal settles as the engine's own defect", () => {
  it.effect("fails the run with the refusal and its paths", () =>
    Effect.gen(function*() {
      const dispatches = { count: 0 }
      const settled = yield* provide(Effect.gen(function*() {
        yield* Effect.scoped(Effect.gen(function*() {
          const engine = yield* makeEngine
          yield* engine.register(RefusedFlow, () => step(dispatches))
          yield* executeUntilParked(engine, RefusedFlow, { executionId: "refused-run", payload: {}, discard: true })
        }))
        return yield* settledCause("refused-run")
      }))
      expect(dispatches.count).toBe(1)
      expect(settled).toEqual({ status: "failed", cause: refused })
    }))

  it.effect("replays a durably refused attempt after a crash as the same refusal", () =>
    Effect.gen(function*() {
      const dispatches = { count: 0 }
      const settled = yield* provide(Effect.gen(function*() {
        const journal = yield* Journal.Journal
        // First process: the refused attempt commits its `failed` row, then
        // the process dies before the refusal reaches the run.
        let terminal = false
        let parked = false
        yield* Effect.scoped(Effect.gen(function*() {
          const blocked = Notifying.wrap(journal, (op, order, args) => {
            if (
              op === "emitDurable" && order === "after" &&
              (args[0] as { readonly eventType: string }).eventType === "flows.engine.attempt-finished"
            ) {
              terminal = true
              return Effect.void
            }
            if (op !== "transact" || order !== "after" || !terminal || parked) return Effect.void
            parked = true
            return Effect.interruptible(Effect.never)
          })
          const engine = yield* Effect.provideService(makeEngine, Journal.Journal, blocked)
          yield* engine.register(RefusedFlow, () => step(dispatches))
          yield* executeUntilParked(engine, RefusedFlow, {
            executionId: "replayed-run",
            payload: {},
            discard: true
          }).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Effect.yieldNow
          // The park fires on the first transaction after the failed
          // attempt's durable finish.
          yield* TestDatabase.until(Effect.sync(() => parked))
        }))
        const before = yield* (yield* RunStore.RunStore).get("replayed-run")
        expect(before.status).not.toBe("failed")
        // Second process: the failed row answers the dispatch.
        yield* Effect.scoped(Effect.gen(function*() {
          const engine = yield* makeEngine
          yield* engine.register(RefusedFlow, () => step(dispatches))
          expect(Option.isNone(yield* engine.poll(RefusedFlow, "replayed-run"))).toBe(true)
          yield* executeUntilParked(engine, RefusedFlow, {
            executionId: "replayed-run",
            payload: {},
            discard: true
          }, ["failed"])
        }))
        return yield* settledCause("replayed-run")
      }))
      // The body ran once; the second process replayed the row.
      expect(dispatches.count).toBe(1)
      expect(settled).toEqual({ status: "failed", cause: refused })
    }))
})
