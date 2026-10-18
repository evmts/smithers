import { Duration, Effect, Schedule } from "effect"
import { expect, test } from "vitest"
import { SyncPolicy } from "../src/index.ts"

// The delays a policy waits, read step by step from the schedule.
const delays = (schedule: Schedule.Schedule<unknown>, steps: number) =>
  Effect.runPromise(Effect.gen(function*() {
    const step = yield* Schedule.toStep(schedule)
    const out: Array<number> = []
    for (let n = 0; n < steps; n++) out.push(Duration.toMillis((yield* step(0, undefined))[1]))
    return out
  }))

test("backoff doubles from initial to max, each delay jittered between 80% and 120%, and never ends", async () => {
  const waits = await delays(SyncPolicy.backoff({ initial: "100 millis", max: "1 second" }), 50)
  const ideal = [100, 200, 400, 800, ...Array.from({ length: 46 }, () => 1_000)]
  waits.forEach((wait, n) => {
    expect(wait).toBeGreaterThanOrEqual(ideal[n]! * 0.8)
    expect(wait).toBeLessThanOrEqual(ideal[n]! * 1.2)
  })
  expect(new Set(waits.slice(4)).size).toBeGreaterThan(1)
})

test("the default policy waits 1 second, doubling to 10 seconds", async () => {
  const waits = await delays(SyncPolicy.defaultPolicy, 6)
  ;[1_000, 2_000, 4_000, 8_000, 10_000, 10_000].forEach((ideal, n) => {
    expect(waits[n]).toBeGreaterThanOrEqual(ideal * 0.8)
    expect(waits[n]).toBeLessThanOrEqual(ideal * 1.2)
  })
})
