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

  it.effect("starts a stopped container on the instance type it names; a running one keeps its own", () =>
    Effect.gen(function*() {
      const stopped = MemoryContainer.machine(false)
      expect(yield* SandboxObject.wake(stopped.machine, { intercepts: [], instance: "standard-1" })).toBe("started")
      expect(stopped.calls[0]).toEqual({ _tag: "start", options: { enableInternet: false, instance: "standard-1" } })
      const custom = MemoryContainer.machine(false)
      const resources = { vcpu: 2, memoryMib: 4096, diskMb: 8000 }
      yield* SandboxObject.wake(custom.machine, { intercepts: [], instance: resources })
      expect(custom.calls[0]).toEqual({ _tag: "start", options: { enableInternet: false, instance: resources } })
      const running = MemoryContainer.machine(true)
      yield* SandboxObject.wake(running.machine, { intercepts: [], instance: "standard-1" })
      expect(running.calls.map((call) => call._tag)).toEqual(["timeout"])
    }))

  it.live("a start that runs past startTimeoutMs fails StartTimedOut and is counted; a quick one is not bounded", () => {
    const t = Telemetry.make()
    return Effect.gen(function*() {
      const stuck: SandboxObject.Machine<string, MemoryContainer.ContainerFailure> = {
        ...MemoryContainer.machine(false).machine,
        start: () => Effect.never
      }
      const error = yield* Effect.flip(SandboxObject.wake(stuck, { intercepts, startTimeoutMs: 20 }))
      expect(error).toEqual(new SandboxObject.StartTimedOut({ timeoutMs: 20 }))
      const quick = MemoryContainer.machine(false)
      expect(yield* SandboxObject.wake(quick.machine, { intercepts: [], startTimeoutMs: 60_000 })).toBe("started")
      expect(quick.calls.map((call) => call._tag)).toEqual(["start", "timeout"])
    }).pipe(
      t.observed,
      Effect.andThen(Effect.sync(() => {
        expect(t.count(SandboxObject.startTimeouts, {})).toBe(1)
        expect(t.count(SandboxObject.wakes, { outcome: "failed" })).toBe(1)
        expect(Object.fromEntries(t.named("sandbox.wake")[0]!.attributes)).toMatchObject({
          "error.type": "@smthrs/platform-cloudflare/StartTimedOut"
        })
      }))
    )
  })

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

  it.effect("with an egress, every other HTTP and HTTPS request goes to it, after the hosts' own intercepts", () =>
    Effect.gen(function*() {
      const { calls, machine } = MemoryContainer.machine(true)
      expect(yield* SandboxObject.wake(machine, { intercepts, egress: "egress" })).toBe("running")
      expect(calls).toEqual([
        { _tag: "timeout", ms: 30 * 60 * 1000 },
        { _tag: "intercept", host: "forge.smithers.internal", fetcher: "forge" },
        { _tag: "intercept", host: "sandbox.smithers.internal:8080", fetcher: "lifecycle" },
        { _tag: "interceptAll", fetcher: "egress" },
        { _tag: "interceptHttps", host: "*", fetcher: "egress" }
      ])
    }))

  it.effect.each(["start", "timeout", "intercept", "interceptAll", "interceptHttps"] as const)(
    "a failed %s fails the wake and stops there",
    (fail) =>
      Effect.gen(function*() {
        const { calls, machine } = MemoryContainer.machine(false, fail)
        const error = yield* Effect.flip(SandboxObject.wake(machine, { intercepts, egress: "egress" }))
        expect(error).toBeInstanceOf(MemoryContainer.ContainerFailure)
        expect(calls.at(-1)?._tag).toBe(fail)
        // Nothing after the failed call: a failed intercept stops the hosts' and the egress's that follow it.
        const after = ["start", "timeout", "intercept", "interceptAll", "interceptHttps"].slice(
          ["start", "timeout", "intercept", "interceptAll", "interceptHttps"].indexOf(fail) + 1
        )
        expect(calls.filter((call) => after.includes(call._tag) && call._tag !== "intercept")).toEqual([])
        expect(calls.filter((call) => call._tag === "intercept").length).toBe(
          fail === "intercept" ? 1 : fail === "start" || fail === "timeout" ? 0 : 2
        )
      })
  )

  it.effect("telemetry counts outcomes and records a failure's tag, never its text", () => {
    const t = Telemetry.make()
    return Effect.gen(function*() {
      yield* SandboxObject.wake(MemoryContainer.machine(false).machine, { intercepts })
      yield* SandboxObject.wake(MemoryContainer.machine(true).machine, { intercepts: [], egress: "egress" })
      yield* Effect.exit(SandboxObject.wake(MemoryContainer.machine(false, "start").machine, { intercepts }))
    }).pipe(
      t.observed,
      Effect.andThen(Effect.sync(() => {
        expect(t.count(SandboxObject.wakes, { outcome: "started" })).toBe(1)
        expect(t.count(SandboxObject.wakes, { outcome: "running" })).toBe(1)
        expect(t.count(SandboxObject.wakes, { outcome: "failed" })).toBe(1)
        const spans = t.named("sandbox.wake")
        expect(spans.map((span) => Object.fromEntries(span.attributes))).toEqual([
          { "smithers.sandbox.intercepts": 2, "smithers.sandbox.egress": false, "smithers.sandbox.wake": "started" },
          { "smithers.sandbox.intercepts": 0, "smithers.sandbox.egress": true, "smithers.sandbox.wake": "running" },
          {
            "smithers.sandbox.intercepts": 2,
            "smithers.sandbox.egress": false,
            "smithers.sandbox.wake": "failed",
            "error.type": "ContainerFailure"
          }
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

describe("SandboxObject.rearm", () => {
  it.effect("re-arms a running container's timeout and starts nothing; a stopped one is left alone", () =>
    Effect.gen(function*() {
      const running = MemoryContainer.machine(true)
      expect(yield* SandboxObject.rearm(running.machine)).toBe("rearmed")
      expect(yield* SandboxObject.rearm(running.machine, 60_000)).toBe("rearmed")
      expect(running.calls).toEqual([{ _tag: "timeout", ms: 30 * 60 * 1000 }, { _tag: "timeout", ms: 60_000 }])
      const stopped = MemoryContainer.machine(false)
      expect(yield* SandboxObject.rearm(stopped.machine)).toBe("stopped")
      expect(stopped.calls).toEqual([])
    }))

  it.effect("a failed timeout fails unchanged; telemetry counts every outcome and records only the tag", () => {
    const t = Telemetry.make()
    return Effect.gen(function*() {
      yield* SandboxObject.rearm(MemoryContainer.machine(true).machine)
      yield* SandboxObject.rearm(MemoryContainer.machine(false).machine)
      const error = yield* Effect.flip(SandboxObject.rearm(MemoryContainer.machine(true, "timeout").machine))
      expect(error).toBeInstanceOf(MemoryContainer.ContainerFailure)
    }).pipe(
      t.observed,
      Effect.andThen(Effect.sync(() => {
        expect(t.count(SandboxObject.rearms, { outcome: "rearmed" })).toBe(1)
        expect(t.count(SandboxObject.rearms, { outcome: "stopped" })).toBe(1)
        expect(t.count(SandboxObject.rearms, { outcome: "failed" })).toBe(1)
        expect(t.named("sandbox.rearm").map((span) => Object.fromEntries(span.attributes))).toEqual([
          { "smithers.sandbox.inactivity_timeout_ms": 1_800_000, "smithers.sandbox.rearm": "rearmed" },
          { "smithers.sandbox.inactivity_timeout_ms": 1_800_000, "smithers.sandbox.rearm": "stopped" },
          {
            "smithers.sandbox.inactivity_timeout_ms": 1_800_000,
            "smithers.sandbox.rearm": "failed",
            "error.type": "ContainerFailure"
          }
        ])
        expect(t.lines("cloudflare.sandbox.rearm").map((line) => line.annotations.outcome)).toEqual([
          "rearmed",
          "stopped",
          "failed"
        ])
        t.expectNoContent("timeout broke")
      }))
    )
  })
})
