import { describe, expect } from "@effect/vitest"
import { DurableDeferred, Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Scope } from "effect"
import { FlowEngine } from "../src/index.ts"
import { effect, pollUntil } from "./Harness.ts"

// Constructors may suspend even when they require no services. Yielding here
// makes admission races deterministic without relying on wall-clock timing.
const YieldingNumber = Schema.declareConstructor<number>()(
  [],
  () => (input) => Effect.yieldNow.pipe(Effect.as(input as number))
)

const makeFlow = (name: string) =>
  Flow.make(name, {
    payload: { value: YieldingNumber },
    success: Schema.Number,
    body: () => Node.succeed(0)
  })

describe("memory execution admission with asynchronous constructors", () => {
  effect("concurrent duplicate submissions execute one body", () => {
    const flow = makeFlow("MemoryAdmission/duplicate")
    let executions = 0
    return Effect.scoped(Effect.gen(function*() {
      const engine = yield* FlowRuntime.FlowRuntime
      yield* engine.register(flow, () => Effect.sync(() => ++executions))
      const values = yield* Effect.all([
        flow.execute({ value: 1 }, { executionId: "duplicate" }),
        flow.execute({ value: 1 }, { executionId: "duplicate" })
      ], { concurrency: "unbounded" })
      expect(values).toEqual([1, 1])
      expect(executions).toBe(1)
    })).pipe(Effect.provide(FlowEngine.layerMemory))
  })

  effect("concurrent conflicting submissions cannot replace the admitted payload", () => {
    const flow = makeFlow("MemoryAdmission/conflict")
    const executed: Array<number> = []
    return Effect.scoped(Effect.gen(function*() {
      const engine = yield* FlowRuntime.FlowRuntime
      yield* engine.register(flow, (payload) =>
        Effect.sync(() => {
          const value = (payload as { value: number }).value
          executed.push(value)
          return value
        }))
      const exits = yield* Effect.all(
        [1, 2].map((value) => Effect.exit(flow.execute({ value }, { executionId: "conflict" }))),
        { concurrency: "unbounded" }
      )
      expect(exits.filter(Exit.isSuccess)).toHaveLength(1)
      expect(exits.filter(Exit.isFailure)).toHaveLength(1)
      expect(executed).toHaveLength(1)
    })).pipe(Effect.provide(FlowEngine.layerMemory))
  })

  effect("simultaneous resume requests drive a parked body once", () => {
    const flow = makeFlow("MemoryAdmission/resume")
    const gate = DurableDeferred.make("MemoryAdmission/gate", { success: Schema.Number })
    let executions = 0
    return Effect.scoped(Effect.gen(function*() {
      const engine = yield* FlowRuntime.FlowRuntime
      yield* engine.register(flow, () =>
        Effect.suspend(() => {
          executions++
          return DurableDeferred.await(gate)
        }))
      yield* flow.execute({ value: 1 }, { executionId: "resume", discard: true })
      const parked = yield* pollUntil(flow.poll("resume"), (result) => result._tag === "Suspended", { turns: 100 })
      expect(Option.isSome(parked) && parked.value._tag).toBe("Suspended")
      yield* Effect.all([flow.resume("resume"), flow.resume("resume")], { concurrency: "unbounded" })
      yield* pollUntil(flow.poll("resume"), (result) => result._tag === "Suspended", { turns: 100 })
      expect(executions).toBe(2)
    })).pipe(Effect.provide(FlowEngine.layerMemory))
  })

  effect(
    "a cancelled blocked admission releases its lock and does not block another id",
    () =>
      Effect.scoped(Effect.gen(function*() {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const number = Schema.declareConstructor<number>()([], () => (input) =>
          input === 1
            ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(1))
            : Effect.succeed(input as number))
        const flow = Flow.make("MemoryAdmission/cancelled", {
          payload: { value: number },
          success: Schema.Number,
          body: () => Node.succeed(0)
        })
        const engine = yield* FlowRuntime.FlowRuntime
        let calls = 0
        yield* engine.register(flow, () => Effect.sync(() => ++calls))
        const pending = yield* engine.execute(flow, { payload: { value: 1 }, executionId: "blocked" })
          .pipe(Effect.forkScoped)
        yield* Deferred.await(entered)
        expect(yield* engine.execute(flow, { payload: { value: 2 }, executionId: "independent" })).toBe(1)
        yield* Fiber.interrupt(pending)
        yield* Deferred.succeed(release, undefined)
        expect(yield* engine.execute(flow, { payload: { value: 1 }, executionId: "blocked" })).toBe(2)
        expect(calls).toBe(2)
      })).pipe(Effect.provide(FlowEngine.layerMemory))
  )

  effect("a cancelled parent can join and cancel a parked child without holding its admission lock", () => {
    const flow = makeFlow("MemoryAdmission/cancelled-join")
    const gate = DurableDeferred.make("MemoryAdmission/cancelled-gate", { success: Schema.Number })
    return Effect.scoped(Effect.gen(function*() {
      const engine = yield* FlowRuntime.FlowRuntime
      yield* engine.register(flow, () => DurableDeferred.await(gate))
      yield* flow.execute({ value: 1 }, { executionId: "child", discard: true })
      yield* pollUntil(flow.poll("child"), (result) => result._tag === "Suspended", { turns: 100 })
      const parent = FlowEngine.makeInstance(flow, "cancelled-parent")
      parent.interrupted = true
      yield* engine.execute(flow, { payload: { value: 1 }, executionId: "child", discard: true })
        .pipe(Effect.provideService(FlowRuntime.FlowInstance, parent))
      const done = yield* pollUntil(flow.poll("child"), (result) => result._tag === "Complete", { turns: 100 })
      expect(Option.isSome(done) && done.value._tag === "Complete" && Exit.isFailure(done.value.exit)).toBe(true)
    })).pipe(Effect.provide(FlowEngine.layerMemory))
  })

  effect(
    "cancelling an admission waiter preserves the lock for remaining callers",
    () =>
      Effect.scoped(Effect.gen(function*() {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const number = Schema.declareConstructor<number>()([], () => (input) =>
          input === 1
            ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(1))
            : Effect.succeed(input as number))
        const flow = Flow.make("MemoryAdmission/cancelled-waiter", {
          payload: { value: number },
          success: Schema.Number,
          body: () => Node.succeed(0)
        })
        const engine = yield* FlowRuntime.FlowRuntime
        const values: Array<number> = []
        yield* engine.register(flow, ({ value }) =>
          Effect.sync(() => {
            values.push(value)
            return value
          }))
        const request = (value: number) => engine.execute(flow, { payload: { value }, executionId: "one-id" })
        const owner = yield* request(1).pipe(Effect.forkScoped)
        yield* Deferred.await(entered)
        const waiter = yield* request(2).pipe(Effect.forkScoped)
        yield* Effect.yieldNow
        yield* Fiber.interrupt(waiter)
        const remaining = yield* request(3).pipe(Effect.exit, Effect.forkScoped)
        for (let turn = 0; turn < 10; turn++) yield* Effect.yieldNow
        expect(remaining.pollUnsafe()).toBeUndefined()
        expect(values).toEqual([])
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(owner)).toBe(1)
        expect(Exit.isFailure(yield* Fiber.join(remaining))).toBe(true)
        expect(values).toEqual([1])
      })).pipe(Effect.provide(FlowEngine.layerMemory))
  )
})

effect(
  "closing the last registration during admission rejects without publishing a fiberless run",
  () =>
    Effect.scoped(Effect.gen(function*() {
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const value = Schema.declareConstructor<number>()(
        [],
        () => (input) =>
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(input as number))
      )
      const flow = Flow.make("MemoryAdmission/closed", {
        payload: { value },
        success: Schema.Number,
        body: () => Node.succeed(0)
      })
      const engine = yield* FlowRuntime.FlowRuntime
      const registration = yield* Scope.make()
      yield* engine.register(flow, () => Effect.succeed(1)).pipe(Scope.provide(registration))
      const pending = yield* engine.execute(flow, { executionId: "closed", payload: { value: 1 } })
        .pipe(Effect.exit, Effect.forkScoped)
      yield* Deferred.await(entered)
      yield* Scope.close(registration, Exit.void)
      yield* Deferred.succeed(release, undefined)
      const exit = yield* Fiber.join(pending)
      expect(Exit.isFailure(exit) && exit.cause.reasons.find(Cause.isDieReason)?.defect)
        .toBeInstanceOf(FlowEngine.FlowNotRegistered)
      const polled = yield* Effect.exit(flow.poll("closed"))
      expect(Exit.isFailure(polled)).toBe(true)
      yield* engine.interrupt(flow, "closed")
      yield* engine.interruptUnsafe(flow, "closed")
    })).pipe(Effect.provide(FlowEngine.layerMemory))
)

effect(
  "interrupted admission leaves no parent edge that rejects a later reverse edge",
  () =>
    Effect.scoped(Effect.gen(function*() {
      const entered = yield* Deferred.make<void>()
      const value = Schema.declareConstructor<number>()([], () => (input) =>
        input === 1
          ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
          : Effect.succeed(input as number))
      const flow = Flow.make("MemoryAdmission/orphan-edge", {
        payload: { value },
        success: Schema.Number,
        body: () => Node.succeed(0)
      })
      const engine = yield* FlowRuntime.FlowRuntime
      yield* engine.register(flow, () => Effect.succeed(42))
      const pending = yield* engine.execute(flow, { executionId: "child", payload: { value: 1 } }).pipe(
        Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, "parent")),
        Effect.forkScoped
      )
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(pending)
      const exit = yield* engine.execute(flow, { executionId: "parent", payload: { value: 2 } }).pipe(
        Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, "child")),
        Effect.exit
      )
      expect(Exit.isSuccess(exit) && exit.value).toBe(42)
    })).pipe(Effect.provide(FlowEngine.layerMemory))
)

effect(
  "failed admission leaves no parent edge that rejects a later reverse edge",
  () =>
    Effect.scoped(Effect.gen(function*() {
      const value = Schema.declareConstructor<number>()([], () => (input) =>
        input === 1
          ? Effect.die("rejected payload")
          : Effect.succeed(input as number))
      const flow = Flow.make("MemoryAdmission/failed-edge", {
        payload: { value },
        success: Schema.Number,
        body: () => Node.succeed(0)
      })
      const engine = yield* FlowRuntime.FlowRuntime
      yield* engine.register(flow, () => Effect.succeed(42))
      const failed = yield* engine.execute(flow, { executionId: "child", payload: { value: 1 } }).pipe(
        Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, "parent")),
        Effect.exit
      )
      expect(Exit.isFailure(failed)).toBe(true)
      const exit = yield* engine.execute(flow, { executionId: "parent", payload: { value: 2 } }).pipe(
        Effect.provideService(FlowRuntime.FlowInstance, FlowEngine.makeInstance(flow, "child")),
        Effect.exit
      )
      expect(Exit.isSuccess(exit) && exit.value).toBe(42)
    })).pipe(Effect.provide(FlowEngine.layerMemory))
)
