import { Effect, Fiber, Metric } from "effect"
import { TestClock } from "effect/testing"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { expect, it } from "vitest"
import * as Detached from "../src/Detached.ts"

it("owns process cleanup in Effect and escalates using its injected clock", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "process.on('SIGTERM', () => process.stdout.write('term')); process.stdout.write('ready'); process.stdin.resume()"
  ], { stdio: ["pipe", "pipe", "ignore"] })
  try {
    await once(child.stdout, "data")
    const operation = Detached.terminate(child, 60_000, "win32")
    expect(Effect.isEffect(operation)).toBe(true)
    const term = once(child.stdout, "data")
    const exited = once(child, "exit")
    await Effect.runPromise(
      Effect.gen(function*() {
        const metric = Metric.counter("smithers.cli.detached.terminations")
        const before = yield* Metric.value(metric)
        const fiber = yield* Effect.forkChild(operation)
        yield* Effect.promise(() => term)
        yield* TestClock.adjust(60_000)
        yield* Effect.promise(() => exited)
        yield* TestClock.adjust(50)
        expect(yield* Fiber.join(fiber)).toBe(true)
        expect((yield* Metric.value(metric)).count - before.count).toBe(1)
      }).pipe(Effect.provide(TestClock.layer()))
    )
    expect(child.signalCode).toBe("SIGKILL")
  } finally {
    child.kill("SIGKILL")
    child.stdin.destroy()
    child.stdout.destroy()
  }
})
