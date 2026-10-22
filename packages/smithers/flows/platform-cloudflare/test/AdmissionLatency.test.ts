import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { randomUUID } from "node:crypto"
import { ExecutionObject } from "../src/index.ts"
import { Answer, runtime } from "./fixtures/AnswerFlow.ts"
import * as MemoryStorage from "./fixtures/MemoryStorage.ts"
import * as Objects from "./fixtures/Objects.ts"
import * as Postgres from "./fixtures/Postgres.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

class CapacityUnavailable extends Schema.TaggedError<CapacityUnavailable>()("CapacityUnavailable", {}) {}

it.effect("a repeated caller failure cannot postpone the pending admission alarm", () =>
  Effect.gen(function*() {
    const memory = MemoryStorage.make()
    const value = yield* ExecutionObject.intent(Answer, {
      executionId: "replayed",
      payload: { question: "private", pauseMs: 0 }
    })
    yield* ExecutionObject.start(memory.storage, value, new CapacityUnavailable()).pipe(Effect.ignore)
    yield* TestClock.setTime(4_000)
    yield* ExecutionObject.start(memory.storage, value, new CapacityUnavailable()).pipe(Effect.ignore)
    expect(memory.alarm()).toBeLessThanOrEqual(4_000)
  }))

it.effect("startup retries explain the delay and retry available capacity within five seconds", () => {
  const t = Telemetry.make()
  return t.observed(Effect.gen(function*() {
    const memory = MemoryStorage.make()
    const value = yield* ExecutionObject.intent(Answer, {
      executionId: "recovering",
      payload: { question: "private", pauseMs: 0 }
    })
    yield* ExecutionObject.start(memory.storage, value, Effect.void)
    const unavailable = Layer.unwrap(Effect.fail(new CapacityUnavailable())) as Layer.Layer<
      ExecutionObject.Services,
      CapacityUnavailable
    >
    for (let attempt = 1; attempt <= 10; attempt++) {
      const now = memory.alarm()!
      yield* TestClock.setTime(now)
      const outcome = yield* ExecutionObject.alarm(memory.storage, {
        flows: [Answer],
        runtime: () => unavailable,
        router: Objects.unrouted
      })
      expect(outcome._tag).toBe("Retrying")
      const line = t.lines("cloudflare.execution.alarm").at(-1)!
      expect(line.annotations).toMatchObject({
        "smithers.execution.id": "recovering",
        "error.type": "CapacityUnavailable",
        "smithers.execution.attempt": attempt,
        retryAtMs: memory.alarm(),
        delayMs: memory.alarm()! - now
      })
      expect(memory.alarm()! - now).toBeLessThanOrEqual(5_000)
    }
    t.expectNoContent("private")
  }))
})

describe.skipIf(!Postgres.direct.available)("admission after capacity recovers on Postgres", () => {
  it.effect("creates and claims the run at the next bounded alarm", () => {
    const schema = Postgres.freshSchema()
    const executionId = randomUUID()
    const t = Telemetry.make()
    return t.observed(Effect.gen(function*() {
      const memory = MemoryStorage.make()
      const value = yield* ExecutionObject.intent(Answer, { executionId, payload: { question: "private", pauseMs: 0 } })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      yield* memory.storage.put(ExecutionObject.failuresKey, 8)
      const unavailable = Layer.unwrap(Effect.fail(new CapacityUnavailable())) as Layer.Layer<
        ExecutionObject.Services,
        CapacityUnavailable
      >
      yield* ExecutionObject.alarm(memory.storage, {
        flows: [Answer],
        runtime: () => unavailable,
        router: Objects.unrouted
      })
      const wakeAt = memory.alarm()!
      yield* TestClock.setTime(wakeAt)
      const recovered = yield* ExecutionObject.alarm(memory.storage, {
        flows: [Answer],
        runtime: runtime({ hostId: executionId, database: Postgres.database(schema), record: Effect.succeed }),
        router: Objects.unrouted
      })
      expect(recovered._tag, JSON.stringify(recovered)).toBe("Settled")
      expect(t.lines("flow.run.created")[0]?.annotations).toMatchObject({
        "smithers.execution.id": executionId,
        createdAtMs: wakeAt
      })
      expect(t.lines("flow.run.claimed")[0]?.annotations).toMatchObject({
        "smithers.execution.id": executionId,
        claimedAtMs: wakeAt
      })
      expect(wakeAt).toBeLessThanOrEqual(5_000)
    })).pipe(Effect.ensuring(Effect.promise(() => Postgres.dropSchema(schema))))
  })
})
