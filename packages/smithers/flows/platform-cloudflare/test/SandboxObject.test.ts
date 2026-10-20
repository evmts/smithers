/**
 * `SandboxObject.wake` against a container client that records each call,
 * for order and faults. `ContainerTerminal.workerd.test.ts` wakes a real
 * container and reaches an intercepted host from inside it.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { SandboxObject } from "../src/index.ts"
import * as MemoryContainer from "./fixtures/MemoryContainer.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

const intercepts = [
  { host: "forge.smithers.internal", fetcher: "forge" },
  { host: "sandbox.smithers.internal:8080", fetcher: "lifecycle" }
]

describe("SandboxObject.wake", () => {
  it.effect("starts a stopped container offline, arms the timeout, then registers every intercept in order", () =>
    Effect.gen(function*() {
      const { calls, machine } = MemoryContainer.machine(false)
      expect(yield* SandboxObject.wake(machine, { intercepts })).toBe("started")
      expect(calls).toEqual([
        { _tag: "start", options: { enableInternet: false } },
        { _tag: "timeout", ms: 30 * 60 * 1000 },
        { _tag: "intercept", host: "forge.smithers.internal", fetcher: "forge" },
        { _tag: "intercept", host: "sandbox.smithers.internal:8080", fetcher: "lifecycle" }
      ])
    }))

  it.effect("a running container is not started again; its timeout and intercepts are set again", () =>
    Effect.gen(function*() {
      const { calls, machine } = MemoryContainer.machine(true)
      expect(yield* SandboxObject.wake(machine, { intercepts, inactivityTimeoutMs: 60_000 })).toBe("running")
      expect(calls).toEqual([
        { _tag: "timeout", ms: 60_000 },
        { _tag: "intercept", host: "forge.smithers.internal", fetcher: "forge" },
        { _tag: "intercept", host: "sandbox.smithers.internal:8080", fetcher: "lifecycle" }
      ])
    }))

  it.effect.each(["start", "timeout", "intercept"] as const)(
    "a failed %s fails the wake and stops there",
    (fail) =>
      Effect.gen(function*() {
        const { calls, machine } = MemoryContainer.machine(false, fail)
        const error = yield* Effect.flip(SandboxObject.wake(machine, { intercepts }))
        expect(error).toBeInstanceOf(MemoryContainer.ContainerFailure)
        expect(calls.at(-1)?._tag).toBe(fail)
        expect(calls.filter((call) => call._tag === "intercept").length).toBeLessThanOrEqual(1)
      })
  )

  it.effect("telemetry counts outcomes and records a failure's tag, never its text", () => {
    const t = Telemetry.make()
    return Effect.gen(function*() {
      yield* SandboxObject.wake(MemoryContainer.machine(false).machine, { intercepts })
      yield* SandboxObject.wake(MemoryContainer.machine(true).machine, { intercepts: [] })
      yield* Effect.exit(SandboxObject.wake(MemoryContainer.machine(false, "start").machine, { intercepts }))
    }).pipe(
      t.observed,
      Effect.andThen(Effect.sync(() => {
        expect(t.count(SandboxObject.wakes, { outcome: "started" })).toBe(1)
        expect(t.count(SandboxObject.wakes, { outcome: "running" })).toBe(1)
        expect(t.count(SandboxObject.wakes, { outcome: "failed" })).toBe(1)
        const spans = t.named("sandbox.wake")
        expect(spans.map((span) => Object.fromEntries(span.attributes))).toEqual([
          { "smithers.sandbox.intercepts": 2, "smithers.sandbox.wake": "started" },
          { "smithers.sandbox.intercepts": 0, "smithers.sandbox.wake": "running" },
          { "smithers.sandbox.intercepts": 2, "smithers.sandbox.wake": "failed", "error.type": "ContainerFailure" }
        ])
        for (const span of spans) expect(span.status).toMatchObject({ _tag: "Ended", exit: { _tag: "Success" } })
        expect(t.lines("cloudflare.sandbox.wake").map((line) => line.annotations)).toEqual(
          spans.map((span) =>
            expect.objectContaining({
              trace_id: span.traceId,
              span_id: span.spanId,
              outcome: span.attributes.get("smithers.sandbox.wake")
            })
          )
        )
        t.expectNoContent("start broke")
      }))
    )
  })

  it.effect("a failure with no tag is recorded as unknown, and still returned unchanged", () => {
    const t = Telemetry.make()
    const failing: SandboxObject.Machine<string, string | MemoryContainer.ContainerFailure> = {
      ...MemoryContainer.machine(false).machine,
      running: Effect.fail("no capacity in colo")
    }
    return SandboxObject.wake(failing, { intercepts }).pipe(
      Effect.flip,
      t.observed,
      Effect.map((error) => {
        expect(error).toBe("no capacity in colo")
        expect(Object.fromEntries(t.named("sandbox.wake")[0]!.attributes)).toMatchObject({ "error.type": "unknown" })
        t.expectNoContent("no capacity")
      })
    )
  })
})
