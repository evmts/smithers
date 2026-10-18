import { describe, expect, it } from "@effect/vitest"
import { MicrosandboxSandbox } from "@smthrs/sandbox"
import * as Effect from "effect/Effect"
import * as NodeGarbageCollector from "../src/NodeGarbageCollector.ts"

/** A reference to an object nothing else holds, made in an earlier job so V8 does not keep it alive for this one. */
const unreachable = async (): Promise<WeakRef<object>> => {
  const reference = new WeakRef({ payload: Array.from({ length: 1024 }, (_, index) => index) })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return reference
}

describe("NodeGarbageCollector", () => {
  it("collects the whole heap, without the process having been started with --expose-gc", async () => {
    expect(process.execArgv).not.toContain("--expose-gc")
    for (let round = 0; round < 2; round++) {
      const reference = await unreachable()
      await Effect.runPromise(NodeGarbageCollector.collector.collect)
      expect(reference.deref()).toBeUndefined()
    }
  })

  it.effect("provides the one process-wide collector, so every provider counts toward the same collections", () =>
    Effect.gen(function*() {
      expect(yield* MicrosandboxSandbox.GarbageCollector).toBe(NodeGarbageCollector.collector)
    }).pipe(Effect.provide(NodeGarbageCollector.layer)))
})
