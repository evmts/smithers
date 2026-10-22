// Electric's container stays running between visits (infra/ElectricAwake.ts), over a host that records the gateway's
// object's calls to the container in order.
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { awake, type Host } from "./ElectricAwake.ts"

/** Cloudflare's bound on `setInactivityTimeout`: greater than 0 and at most 6 hours, or the call rejects. */
const PLATFORM_MAX_MS = 21_600_000

const host = () => {
  const calls: Array<string> = []
  const self: Host = {
    start: Effect.sync(() => void calls.push("start")),
    setInactivityTimeout: (ms) => Effect.sync(() => void calls.push(`hold ${ms}`)),
  }
  return { calls, self }
}

describe("awake", () => {
  test("starts Electric, then holds it through the longest idle time Cloudflare allows", () => {
    const { calls, self } = host()
    Effect.runSync(awake(self))
    expect(calls).toEqual(["start", `hold ${PLATFORM_MAX_MS}`])
  })

  test("holds it again on every request, since a restarted object starts without a timeout", () => {
    const { calls, self } = host()
    Effect.runSync(Effect.andThen(awake(self), awake(self)))
    expect(calls.filter((call) => call.startsWith("hold"))).toHaveLength(2)
  })

  test("a hold Cloudflare refuses still lets the request through", () => {
    const { calls, self } = host()
    const refusing: Host = { ...self, setInactivityTimeout: () => Effect.fail(new TypeError("timeout out of range")) }
    expect(Effect.runSyncExit(awake(refusing))._tag).toBe("Success")
    expect(calls).toEqual(["start"])
  })

  test("a container that fails to start isn't held, and the request fails as before", () => {
    const { calls, self } = host()
    const failing: Host = { ...self, start: Effect.fail(new Error("no container instance")) }
    expect(Effect.runSyncExit(awake(failing))._tag).toBe("Failure")
    expect(calls).toEqual([])
  })
})
