import { Effect } from "effect"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { ControlRuntime } from "../src/ControlRuntime.ts"
import * as TestControl from "../src/test/TestControl.ts"

const observe = () =>
  Effect.runPromise(
    Effect.gen(function*() {
      const runtime = yield* ControlRuntime
      const first = yield* runtime.plan({ flowId: "test/digest", input: { value: "π" } })
      const second = yield* runtime.plan({ flowId: "test/digest", input: { value: "π" } })
      return { first, second, stored: yield* runtime.getPlan(first.card.planId) }
    }).pipe(
      Effect.provide(TestControl.layer({
        flows: [{
          flowId: "test/digest",
          description: "Digest boundary",
          deployClass: false,
          envelope: { capabilities: [], flows: [], budget: {} }
        }]
      })),
      Effect.scoped
    )
  )

describe("TestControl deterministic planning", () => {
  it("binds approval and stored input to independent SHA256 canonical bytes", async () => {
    const result = await observe()
    const expected = createHash("sha256").update(
      "{\"deployClass\":false,\"envelope\":{\"budget\":{},\"capabilities\":[],\"flows\":[]},\"flowId\":\"test/digest\",\"input\":{\"value\":\"π\"},\"persistedPlan\":null}"
    ).digest("hex")
    expect(result.first.card.digest).toBe(expected)
    expect(result.first.card.approval.target.digest).toBe(expected)
    expect(result.stored.card.digest).toBe(expected)
    expect(result.stored.decodedInput).toEqual({ value: "π" })
    expect(result.second.card.digest).toBe(expected)
    expect(result.first.card.planId).toBe("plan-1")
    expect(result.second.card.planId).toBe("plan-2")
  })

  it("isolates deterministic counters and hashes between fresh stacks", async () => {
    const left = await observe()
    const right = await observe()
    expect(right).toEqual(left)
    expect(right.first.card.planId).toBe("plan-1")
    expect(right.second.card.planId).toBe("plan-2")
  })
})
