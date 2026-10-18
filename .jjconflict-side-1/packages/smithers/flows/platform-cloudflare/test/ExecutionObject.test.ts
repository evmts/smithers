import { describe, expect, it } from "@effect/vitest"
import { DurableDeferred, Flow, FlowRuntime } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import { randomUUID } from "node:crypto"
import { CloudflareRuntime, ExecutionObject } from "../src/index.ts"
import { Answer, registration, runtime } from "./fixtures/AnswerFlow.ts"
import * as MemoryStorage from "./fixtures/MemoryStorage.ts"
import * as Objects from "./fixtures/Objects.ts"
import * as Postgres from "./fixtures/Postgres.ts"

class AskFailed extends Schema.TaggedError<AskFailed>()("AskFailed", {}) {}

/** A runtime whose construction fails, as one over an unreachable database does. */
const unbuildable = () => Layer.unwrap(Effect.fail(new AskFailed())) as Layer.Layer<ExecutionObject.Services, AskFailed>

/** A flow that waits for a reply no timer delivers; its body is the registered implementation. */
const Awaiting = Flow.make("cloudflare-test/Awaiting", {
  payload: {},
  success: Schema.String,
  body: Node.capture({}, (): Node.Node<never> => {
    throw new Error("Awaiting runs its registered implementation")
  })
})

const awaitingRegistration = Layer.effectDiscard(Effect.gen(function*() {
  const runtime = yield* FlowRuntime.FlowRuntime
  yield* runtime.register(
    Awaiting,
    () => DurableDeferred.await(DurableDeferred.make("reply", { success: Schema.String }))
  )
}))

/** A `Settled` outcome, whatever window it was armed to forget at. */
const settled = { _tag: "Settled", forgetAtMs: expect.any(Number) }

/** One Durable Object's worth of state: its storage, its schema and the steps its flow ran. */
const object = (target: Postgres.Target = Postgres.direct) => {
  const schema = Postgres.freshSchema()
  const memory = MemoryStorage.make()
  const steps: Array<string> = []
  const executionId = `answer-${randomUUID()}`
  const hostId = `object-${executionId}`
  const alarm = () =>
    ExecutionObject.alarm(memory.storage, {
      flows: [Answer],
      runtime: runtime({
        hostId,
        database: Postgres.database(schema, target.url),
        record: (label) => Effect.sync(() => steps.push(label)).pipe(Effect.as(label))
      }),
      router: Objects.unrouted
    })
  const intent = (payload: { readonly question: string; readonly pauseMs: number }) =>
    ExecutionObject.intent(Answer, { executionId, payload })
  const status = Effect.promise(() =>
    Postgres.admin(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ readonly status: string }>`
        SELECT status FROM ${sql(schema)}.flows_runs WHERE run_id = ${executionId}`
      return rows[0]?.status
    }))
  )
  return { schema, memory, steps, executionId, hostId, alarm, intent, status }
}

for (const target of Postgres.targets) {
  describe.skipIf(!target.available)(`ExecutionObject over ${target.label}`, () => {
    it.live("start stores the intent and moves the alarm to now; the alarm runs the flow and arms the forget alarm", () => {
      const o = object(target)
      return Effect.gen(function*() {
        const value = yield* o.intent({ question: "hi", pauseMs: 0 })
        const before = Date.now()
        expect(yield* ExecutionObject.start(o.memory.storage, value, Effect.succeed("asked"))).toBe("asked")
        expect(o.memory.values.get(ExecutionObject.intentKey)).toEqual(expect.any(String))
        expect(o.memory.alarm()).toBeGreaterThanOrEqual(before)
        expect(o.memory.alarm()).toBeLessThan(before + ExecutionObject.startGraceMs)

        const outcome = yield* o.alarm()
        expect(outcome).toEqual(settled)
        expect(o.steps).toEqual(["ask:hi", "answer"])
        // The object keeps the intent for the retention window, then forgets it.
        const settledAt = o.memory.values.get(ExecutionObject.settledKey) as number
        expect(settledAt).toBeGreaterThanOrEqual(before)
        expect(outcome).toEqual({ _tag: "Settled", forgetAtMs: settledAt + ExecutionObject.settledRetentionMs })
        expect(o.memory.alarm()).toBe(settledAt + ExecutionObject.settledRetentionMs)
        expect(o.memory.values.has(ExecutionObject.failuresKey)).toBe(false)
        expect(yield* o.status).toBe("completed")
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("a flow that fails has settled: the alarm waits to forget it, not to retry", () => {
      const o = object(target)
      return Effect.gen(function*() {
        // A negative pause is the flow's own declared failure, SleepRequestInvalid.
        const value = yield* o.intent({ question: "hi", pauseMs: -1 })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const outcome = yield* o.alarm()
        expect(outcome).toEqual(settled)
        expect(o.memory.alarm()).toBe((outcome as { readonly forgetAtMs: number }).forgetAtMs)
        expect(o.steps).toEqual(["ask:hi"])
        expect(yield* o.status).toBe("failed")
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("a duplicate start reruns the caller's effect and stores nothing new; another payload is a conflict", () => {
      const o = object(target)
      return Effect.gen(function*() {
        const value = yield* o.intent({ question: "hi", pauseMs: 0 })
        let asked = 0
        const ask = Effect.sync(() => ++asked)
        yield* ExecutionObject.start(o.memory.storage, value, ask)
        const stored = o.memory.values.get(ExecutionObject.intentKey)
        expect(yield* ExecutionObject.start(o.memory.storage, value, ask)).toBe(2)
        expect(o.memory.values.get(ExecutionObject.intentKey)).toBe(stored)

        const other = yield* o.intent({ question: "something else", pauseMs: 0 })
        const conflict = yield* Effect.flip(ExecutionObject.start(o.memory.storage, other, ask))
        expect(conflict).toBeInstanceOf(ExecutionObject.IntentConflict)
        expect(conflict.executionId).toBe(o.executionId)
        expect(asked).toBe(2)
        expect(o.memory.values.get(ExecutionObject.intentKey)).toBe(stored)

        expect(yield* o.alarm()).toEqual(settled)
        expect(o.steps).toEqual(["ask:hi", "answer"])
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("duplicate alarms and a start after settlement run no step twice", () => {
      const o = object(target)
      return Effect.gen(function*() {
        const value = yield* o.intent({ question: "hi", pauseMs: 0 })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const outcome = yield* o.alarm()
        expect(outcome).toEqual(settled)
        expect(yield* o.alarm()).toEqual(outcome)
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        expect(o.memory.alarm()).not.toBe((outcome as { readonly forgetAtMs: number }).forgetAtMs)
        expect(yield* o.alarm()).toEqual(outcome)
        expect(o.steps).toEqual(["ask:hi", "answer"])
        expect(o.memory.alarm()).toBe((outcome as { readonly forgetAtMs: number }).forgetAtMs)
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.effect("a settled object forgets its intent after the window; a late start runs no step and forgets again", () => {
      const o = object(target)
      return Effect.gen(function*() {
        yield* TestClock.setTime(Date.now())
        const value = yield* o.intent({ question: "hi", pauseMs: 0 })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const settledAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis)
        const forgetAtMs = settledAt + ExecutionObject.settledRetentionMs
        expect(yield* o.alarm()).toEqual({ _tag: "Settled", forgetAtMs })
        expect([...o.memory.values.keys()].sort()).toEqual([ExecutionObject.intentKey, ExecutionObject.settledKey])

        // Inside the window a duplicate start or a wake costs no drive: a
        // runtime that cannot even be built still answers the settlement.
        const settledOnly = { flows: [Answer], runtime: unbuildable, router: Objects.unrouted }
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        expect(yield* ExecutionObject.alarm(o.memory.storage, settledOnly)).toEqual({ _tag: "Settled", forgetAtMs })
        expect(yield* ExecutionObject.wake(o.memory.storage)).toBe(true)
        expect(yield* ExecutionObject.alarm(o.memory.storage, settledOnly)).toEqual({ _tag: "Settled", forgetAtMs })
        expect(o.memory.alarm()).toBe(forgetAtMs)
        // The intent still guards its id inside the window.
        const other = yield* o.intent({ question: "something else", pauseMs: 0 })
        expect(yield* Effect.flip(ExecutionObject.start(o.memory.storage, other, Effect.void))).toBeInstanceOf(
          ExecutionObject.IntentConflict
        )

        // The window passes: the final alarm empties the object and arms nothing.
        yield* TestClock.setTime(forgetAtMs)
        expect(yield* ExecutionObject.alarm(o.memory.storage, settledOnly)).toEqual({ _tag: "Forgotten" })
        expect(o.memory.values.size).toBe(0)
        expect(o.memory.alarm()).toBeNull()
        expect(yield* ExecutionObject.wake(o.memory.storage)).toBe(false)
        expect(o.memory.alarm()).toBeNull()

        // A late start of the same intent settles from the run the engine
        // stored, without running a step, and the object forgets it again.
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const later = forgetAtMs + ExecutionObject.settledRetentionMs
        expect(yield* o.alarm()).toEqual({ _tag: "Settled", forgetAtMs: later })
        expect(o.steps).toEqual(["ask:hi", "answer"])
        expect(yield* o.status).toBe("completed")
        yield* TestClock.setTime(later)
        expect(yield* o.alarm()).toEqual({ _tag: "Forgotten" })
        expect(o.memory.values.size).toBe(0)

        // Past the window the id no longer guards its payload: another one is
        // stored, and the engine answers it with the run it already holds.
        yield* ExecutionObject.start(o.memory.storage, other, Effect.void)
        expect(yield* o.alarm()).toEqual(settled)
        expect(o.steps).toEqual(["ask:hi", "answer"])
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("a start that dies before its effect leaves an alarm that still runs the flow", () => {
      const o = object(target)
      return Effect.gen(function*() {
        const value = yield* o.intent({ question: "hi", pauseMs: 0 })
        const before = Date.now()
        const failure = yield* Effect.flip(ExecutionObject.start(o.memory.storage, value, new AskFailed()))
        expect(failure).toEqual(new AskFailed())
        // The alarm stayed at the grace deadline: nothing moved it to now.
        expect(o.memory.alarm()).toBeGreaterThanOrEqual(before + ExecutionObject.startGraceMs)

        expect(yield* o.alarm()).toEqual(settled)
        expect(o.steps).toEqual(["ask:hi", "answer"])
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("a runtime configured for another execution leaves this one undriven, and the alarm backs off", () => {
      const o = object(target)
      return Effect.gen(function*() {
        const value = yield* o.intent({ question: "hi", pauseMs: 0 })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const options = {
          flows: [Answer],
          runtime: (intent: ExecutionObject.Intent) =>
            CloudflareRuntime.layer(
              { hostId: o.hostId, executionId: `not-${intent.executionId}` },
              registration((label) => Effect.sync(() => o.steps.push(label)).pipe(Effect.as(label)))
            ).pipe(Layer.provide(Postgres.database(o.schema, target.url))),
          router: Objects.unrouted
        }
        const first = yield* ExecutionObject.alarm(o.memory.storage, options)
        expect(first).toMatchObject({ _tag: "Retrying", attempt: 1, failure: "@smthrs/platform-cloudflare/Undriven" })
        expect(yield* ExecutionObject.alarm(o.memory.storage, options)).toMatchObject({ _tag: "Retrying", attempt: 2 })
        expect(o.steps).toEqual([])
        expect(yield* o.status).toBe("pending")
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("a deploy that dropped the flow's registration retries until a runtime registers it again", () => {
      const o = object(target)
      const unregistered = () =>
        ExecutionObject.alarm(o.memory.storage, {
          flows: [Answer],
          runtime: (intent) =>
            CloudflareRuntime.layer({ hostId: o.hostId, executionId: intent.executionId }, Layer.empty).pipe(
              Layer.provide(Postgres.database(o.schema, target.url))
            ),
          router: Objects.unrouted
        })
      return Effect.gen(function*() {
        const value = yield* o.intent({ question: "hi", pauseMs: 60_000 })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        expect(yield* unregistered()).toMatchObject({
          _tag: "Retrying",
          attempt: 1,
          failure: "@smthrs/engine/FlowNotRegistered"
        })
        expect(o.steps).toEqual([])
        // The next deploy registers it again; the count resets once an alarm makes progress.
        const parked = yield* o.alarm()
        expect(parked).toMatchObject({ _tag: "Parked" })
        expect(o.memory.values.has(ExecutionObject.failuresKey)).toBe(false)
        expect(o.steps).toEqual(["ask:hi"])
        // A run with nothing due is left parked without its flow, so an early alarm fails nothing.
        expect(yield* unregistered()).toEqual(parked)
        expect(yield* o.status).toBe("suspended")
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.live("an execution waiting on an event parks with no wake, and the alarm is deleted", () => {
      const o = object(target)
      return Effect.gen(function*() {
        const value = yield* ExecutionObject.intent(Awaiting, { executionId: o.executionId, payload: {} })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const outcome = yield* ExecutionObject.alarm(o.memory.storage, {
          flows: [Awaiting],
          runtime: (intent) =>
            CloudflareRuntime.layer({ hostId: o.hostId, executionId: intent.executionId }, awaitingRegistration).pipe(
              Layer.provide(Postgres.database(o.schema, target.url))
            ),
          router: Objects.unrouted
        })
        expect(outcome).toEqual({ _tag: "Parked", wakeAtMs: null })
        expect(o.memory.alarm()).toBeNull()
        expect(yield* o.status).toBe("suspended")
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })

    it.effect("a parked durable timer: the alarm returns its due time and a later alarm resumes the flow", () => {
      const o = object(target)
      return Effect.gen(function*() {
        yield* TestClock.setTime(Date.now())
        const value = yield* o.intent({ question: "hi", pauseMs: 60_000 })
        yield* ExecutionObject.start(o.memory.storage, value, Effect.void)
        const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis)

        const parked = yield* o.alarm()
        expect(parked).toEqual({ _tag: "Parked", wakeAtMs: expect.any(Number) })
        const wakeAtMs = (parked as { readonly wakeAtMs: number }).wakeAtMs
        expect(wakeAtMs).toBeGreaterThanOrEqual(startedAt + 60_000)
        expect(o.memory.alarm()).toBe(wakeAtMs)
        expect(o.steps).toEqual(["ask:hi"])
        expect(yield* o.status).toBe("suspended")

        // An early alarm, as a duplicate start causes, parks again on the same timer.
        expect(yield* o.alarm()).toEqual({ _tag: "Parked", wakeAtMs })
        expect(o.steps).toEqual(["ask:hi"])

        yield* TestClock.setTime(wakeAtMs)
        expect(yield* o.alarm()).toEqual({ _tag: "Settled", forgetAtMs: wakeAtMs + ExecutionObject.settledRetentionMs })
        expect(o.steps).toEqual(["ask:hi", "answer"])
        expect(o.memory.alarm()).toBe(wakeAtMs + ExecutionObject.settledRetentionMs)
      }).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(o.schema))))
    })
  })
}

describe("ExecutionObject without a database", () => {
  it.effect("an alarm with no intent stored is idle and deletes the alarm", () =>
    Effect.gen(function*() {
      const memory = MemoryStorage.make()
      const outcome = yield* ExecutionObject.alarm(memory.storage, {
        flows: [Answer],
        runtime: unbuildable,
        router: Objects.unrouted
      })
      expect(outcome).toEqual({ _tag: "Idle" })
      expect(memory.alarm()).toBeNull()
    }))

  it.effect("a settled object re-arms its forget alarm without a runtime, and empties itself once the window passes", () =>
    Effect.gen(function*() {
      const memory = MemoryStorage.make()
      const value = yield* ExecutionObject.intent(Answer, {
        executionId: "settled",
        payload: { question: "hi", pauseMs: 0 }
      })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      // What an earlier alarm left: a settlement at 1 s, and an attempt it counted.
      yield* memory.storage.put(ExecutionObject.settledKey, 1_000)
      yield* memory.storage.put(ExecutionObject.failuresKey, 1)
      const options = { flows: [Answer], runtime: unbuildable, router: Objects.unrouted, settledRetentionMs: 60_000 }

      yield* TestClock.setTime(60_999)
      expect(yield* ExecutionObject.alarm(memory.storage, options)).toEqual({ _tag: "Settled", forgetAtMs: 61_000 })
      expect(memory.alarm()).toBe(61_000)
      expect(memory.values.get(ExecutionObject.failuresKey)).toBe(1)

      yield* TestClock.setTime(61_000)
      expect(yield* ExecutionObject.alarm(memory.storage, options)).toEqual({ _tag: "Forgotten" })
      expect(memory.values.size).toBe(0)
      expect(memory.alarm()).toBeNull()
      // Forgotten for good: a late alarm is idle, and a late wake arms nothing.
      expect(yield* ExecutionObject.alarm(memory.storage, options)).toEqual({ _tag: "Idle" })
      expect(yield* ExecutionObject.wake(memory.storage)).toBe(false)
      expect(memory.alarm()).toBeNull()
    }))

  it.effect("a failing runtime re-arms with doubling backoff, and the count survives between alarms", () =>
    Effect.gen(function*() {
      const memory = MemoryStorage.make()
      const value = yield* ExecutionObject.intent(Answer, {
        executionId: "unreachable",
        payload: { question: "hi", pauseMs: 0 }
      })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      const options = { flows: [Answer], runtime: unbuildable, router: Objects.unrouted }
      expect(yield* ExecutionObject.alarm(memory.storage, options)).toEqual({
        _tag: "Retrying",
        attempt: 1,
        retryAtMs: 1_000,
        failure: "AskFailed"
      })
      expect(memory.alarm()).toBe(1_000)
      expect(yield* ExecutionObject.alarm(memory.storage, options)).toEqual({
        _tag: "Retrying",
        attempt: 2,
        retryAtMs: 2_000,
        failure: "AskFailed"
      })
      expect(memory.values.get(ExecutionObject.failuresKey)).toBe(2)
    }))

  it.effect("an alarm that dies mid-drive leaves its attempt counted and the next one armed after the backoff", () =>
    Effect.gen(function*() {
      const memory = MemoryStorage.make()
      const value = yield* ExecutionObject.intent(Answer, {
        executionId: "dies",
        payload: { question: "hi", pauseMs: 0 }
      })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      const building = yield* Deferred.make<void>()
      // The runtime never finishes building, and the fiber is then interrupted:
      // what an isolate reset does to an alarm in the middle of its drive.
      const hung = Layer.unwrap(
        Deferred.succeed(building, undefined).pipe(Effect.andThen(Effect.never))
      ) as Layer.Layer<
        ExecutionObject.Services
      >
      const fiber = yield* Effect.forkChild(
        ExecutionObject.alarm(memory.storage, { flows: [Answer], runtime: () => hung, router: Objects.unrouted })
      )
      yield* Deferred.await(building)
      yield* Fiber.interrupt(fiber)
      expect(memory.values.get(ExecutionObject.failuresKey)).toBe(1)
      expect(memory.alarm()).toBe(1_000)

      yield* TestClock.setTime(1_000)
      expect(
        yield* ExecutionObject.alarm(memory.storage, {
          flows: [Answer],
          runtime: unbuildable,
          router: Objects.unrouted
        })
      ).toEqual({
        _tag: "Retrying",
        attempt: 2,
        retryAtMs: 3_000,
        failure: "AskFailed"
      })
    }))

  it.effect("an intent naming a flow this object was not given retries rather than settling", () =>
    Effect.gen(function*() {
      const memory = MemoryStorage.make()
      const value = yield* ExecutionObject.intent(Answer, {
        executionId: "renamed",
        payload: { question: "hi", pauseMs: 0 }
      })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      const outcome = yield* ExecutionObject.alarm(memory.storage, {
        flows: [],
        runtime: unbuildable,
        router: Objects.unrouted
      })
      expect(outcome).toMatchObject({
        _tag: "Retrying",
        attempt: 1,
        failure: "@smthrs/platform-cloudflare/UnknownFlow"
      })
    }))

  it.effect("wake moves the alarm to now when an intent is stored, and leaves an empty object idle", () =>
    Effect.gen(function*() {
      const empty = MemoryStorage.make()
      expect(yield* ExecutionObject.wake(empty.storage)).toBe(false)
      expect(empty.alarm()).toBeNull()

      const memory = MemoryStorage.make()
      const value = yield* ExecutionObject.intent(Answer, {
        executionId: "woken",
        payload: { question: "hi", pauseMs: 0 }
      })
      yield* ExecutionObject.start(memory.storage, value, new AskFailed()).pipe(Effect.ignore)
      expect(memory.alarm()).toBe(ExecutionObject.startGraceMs)
      yield* TestClock.setTime(1_000)
      expect(yield* ExecutionObject.wake(memory.storage)).toBe(true)
      expect(memory.alarm()).toBe(1_000)
    }))

  it.effect("intent encodes the payload with the flow's codec and refuses one the schema rejects", () =>
    Effect.gen(function*() {
      expect(
        yield* ExecutionObject.intent(Answer, { executionId: "e", payload: { question: "q", pauseMs: 5 } })
      ).toEqual({ flow: "cloudflare-test/Answer", executionId: "e", payload: { question: "q", pauseMs: 5 } })
      const refused = yield* Effect.flip(
        ExecutionObject.intent(Answer, { executionId: "", payload: { question: "q", pauseMs: 5 } })
      )
      expect(refused).toBeInstanceOf(Schema.SchemaError)
    }))
})
