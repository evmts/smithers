import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
import { checkRepositories, fetchWithRetry, rankedChecks, reviewTitle } from "../examples/runtime.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect))

describe("examples/runtime", () => {
  it("approves a short title in the first round", async () => {
    const result = await Effect.runPromise(reviewTitle("Fix login"))
    expect(result).toEqual({ _tag: "Approved", output: "Fix login" })
  })

  it("revises a long title once and approves the revision", async () => {
    const result = await Effect.runPromise(reviewTitle("Fix the login redirect loop on Safari"))
    expect(result).toEqual({ _tag: "Approved", output: "Fix the login redire" })
  })

  it("starts the highest priority checks first and keeps every result by name", async () => {
    const { order, results } = await Effect.runPromise(rankedChecks)
    expect(order).toEqual(["api", "web", "docs"])
    expect(results).toEqual({ api: "api: ok", web: "web: ok", docs: "docs: ok" })
  })

  it("settles every check when none fail", async () => {
    const result = await run(checkRepositories([]))
    expect(result).toMatchObject({ _tag: "Success", success: { api: "api: ok", web: "web: ok", docs: "docs: ok" } })
  })

  it("quarantines failed checks and names each one in the settled error", async () => {
    const result = await run(checkRepositories(["web", "api"]))
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        code: "quarantined",
        message: "Quarantined members: api, web",
        cause: [
          { member: "api", error: "api: tests failed" },
          { member: "web", error: "web: tests failed" }
        ]
      }
    })
  })

  it("retries a flaky call until it answers within the attempt budget", async () => {
    expect(await Effect.runPromise(fetchWithRetry(2))).toBe(3)
  })

  it("fails with the last error once the attempt budget is spent", async () => {
    const result = await run(fetchWithRetry(3))
    expect(result).toMatchObject({ _tag: "Failure", failure: "attempt 3 failed" })
  })
})
