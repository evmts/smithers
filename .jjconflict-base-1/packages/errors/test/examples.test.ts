import { Effect } from "effect"
import { expect, it } from "vitest"
import { describeFailure, makeFailure, recoverFailure } from "../examples/handling.ts"

it("constructs a tagged failure with safe context and a separately retained cause", () => {
  const failure = makeFailure()
  expect(failure.code).toBe("INTEGRATION_ERROR")
  expect(failure._tag).toBe("SmithersError")
  expect(failure.summary).toBe("Provider unavailable")
  expect(failure.details).toEqual({ reason: "transport", retryable: true })
  expect(Object.isFrozen(failure.details)).toBe(true)
  expect(failure.cause).toEqual(new Error("Connection closed"))
  expect(JSON.parse(JSON.stringify(failure))).toEqual({
    code: "INTEGRATION_ERROR",
    summary: "Provider unavailable",
    docsUrl: failure.docsUrl,
    details: { reason: "transport", retryable: true }
  })
})

it("looks up a recognized failure and leaves unrelated values unclassified", () => {
  expect(describeFailure(makeFailure())).toContain("transport status")
  expect(describeFailure(new Error("unrelated"))).toBeUndefined()
  expect(describeFailure(null)).toBeUndefined()
})

it("recovers the tagged Effect through the public error code", () => {
  expect(Effect.runSync(recoverFailure())).toBe("Recovered INTEGRATION_ERROR")
})
