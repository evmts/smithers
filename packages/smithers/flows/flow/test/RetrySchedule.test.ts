/**
 * `RetryPolicy.schedule`: the engine's retry decision as an Effect `Schedule`,
 * for work no durable step holds. Delays run on TestClock.
 */
import { describe, expect, it } from "@effect/vitest"
import { RetryPolicy } from "@smthrs/flow"
import { Clock, Effect, Exit, Fiber, Schedule, Stream } from "effect"
import { TestClock } from "effect/testing"

class Dropped {
  readonly _tag = "test/Dropped"
  readonly attempt: number
  constructor(attempt: number) {
    this.attempt = attempt
  }
}

/** An effect that records when each attempt starts and fails until `succeedAt`. */
const attempts = (succeedAt = Number.POSITIVE_INFINITY) => {
  const times: Array<number> = []
  const effect = Effect.gen(function*() {
    times.push(yield* Clock.currentTimeMillis)
    return times.length === succeedAt ? "done" : yield* Effect.fail(new Dropped(times.length))
  })
  return { times, effect }
}

describe("RetryPolicy.schedule", () => {
  it.effect("retries after the policy's delays and fails with the last failure once it gives up", () =>
    Effect.gen(function*() {
      const { effect, times } = attempts()
      const policy = RetryPolicy.make({ initialMs: 100, factor: 2, maxMs: 1_000, maxAttempts: 4 })
      const fiber = yield* Effect.retry(effect, RetryPolicy.schedule(policy)).pipe(Effect.exit, Effect.forkChild)
      yield* TestClock.adjust(699)
      expect(times).toEqual([0, 100, 300])
      yield* TestClock.adjust(1)
      expect(yield* Fiber.join(fiber)).toEqual(Exit.fail(new Dropped(4)))
      expect(times).toEqual([0, 100, 300, 700])
    }))

  it.effect("outputs the attempt that just failed, one for the first", () =>
    Effect.gen(function*() {
      const { effect } = attempts(3)
      const outputs: Array<number> = []
      const policy = RetryPolicy.make({ initialMs: 10, factor: 1, maxMs: 10 })
      const schedule = RetryPolicy.schedule(policy).pipe(
        Schedule.tap(({ output }) => Effect.sync(() => outputs.push(output)))
      )
      const fiber = yield* Effect.retry(effect, schedule).pipe(Effect.forkChild)
      yield* TestClock.adjust(20)
      expect(yield* Fiber.join(fiber)).toBe("done")
      expect(outputs).toEqual([1, 2])
    }))

  it.effect("never retries a failure the policy names non-retryable", () =>
    Effect.gen(function*() {
      const { effect, times } = attempts()
      const policy = RetryPolicy.make({ initialMs: 10, factor: 1, maxMs: 10, nonRetryable: ["test/Dropped"] })
      expect(yield* Effect.exit(Effect.retry(effect, RetryPolicy.schedule(policy)))).toEqual(
        Exit.fail(new Dropped(1))
      )
      expect(times).toEqual([0])
    }))

  it.effect("waits a delay the failure carries instead of the backoff, capped by the policy", () =>
    Effect.gen(function*() {
      const times: Array<number> = []
      const effect = Effect.gen(function*() {
        times.push(yield* Clock.currentTimeMillis)
        return times.length === 3 ? "done" : yield* Effect.fail({ _tag: "test/Busy", retryAfterMillis: 5_000 })
      })
      const policy = RetryPolicy.make({ initialMs: 10, factor: 1, maxMs: 2_000 })
      const fiber = yield* Effect.retry(effect, RetryPolicy.schedule(policy)).pipe(Effect.forkChild)
      yield* TestClock.adjust(4_000)
      expect(yield* Fiber.join(fiber)).toBe("done")
      expect(times).toEqual([0, 2_000, 4_000])
    }))

  it.effect("gives up when the expiration leaves no room for another full delay", () =>
    Effect.gen(function*() {
      const { effect, times } = attempts()
      const policy = RetryPolicy.make({ initialMs: 100, factor: 1, maxMs: 100, expirationMs: 250 })
      const fiber = yield* Effect.retry(effect, RetryPolicy.schedule(policy)).pipe(Effect.exit, Effect.forkChild)
      yield* TestClock.adjust(1_000)
      expect(yield* Fiber.join(fiber)).toEqual(Exit.fail(new Dropped(3)))
      expect(times).toEqual([0, 100, 200])
    }))

  it.effect("starts over from the first delay under Stream.retry once the stream emits again", () =>
    Effect.gen(function*() {
      const times: Array<number> = []
      // Each run fails at once, except the third, which emits before it fails.
      const stream = Stream.unwrap(Effect.gen(function*() {
        times.push(yield* Clock.currentTimeMillis)
        const failure = Stream.fail(new Dropped(times.length))
        return times.length === 3 ? Stream.concat(Stream.make(times.length), failure) : failure
      }))
      const policy = RetryPolicy.make({ initialMs: 100, factor: 2, maxMs: 1_000, maxAttempts: 3 })
      const fiber = yield* stream.pipe(Stream.retry(RetryPolicy.schedule(policy)), Stream.runCollect, Effect.exit)
        .pipe(Effect.forkChild)
      yield* TestClock.adjust(1_000)
      expect(yield* Fiber.join(fiber)).toEqual(Exit.fail(new Dropped(5)))
      // 100 and 200 ms; the emit resets the count, so 100 and 200 ms again, then it gives up.
      expect(times).toEqual([0, 100, 300, 400, 600])
    }))
})
