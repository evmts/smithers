import { expect, test } from "vitest"
import { answerCannotFinish } from "./answerEnd"

test("a confirmed engine cancellation closes its streaming answer", () => {
  expect(answerCannotFinish({ reason: "interrupted" })).toBe(true)
})

test("incompatible persisted runs close; loss of access to a live engine does not", () => {
  expect(answerCannotFinish({ reason: "defect", refusal: "plan_changed" })).toBe(true)
  expect(answerCannotFinish({ reason: "refused", refusal: "payload_changed" })).toBe(true)
  for (const reason of ["unavailable", "invalid", "refused", "defect"] as const) {
    expect(answerCannotFinish({ reason })).toBe(false)
  }
  expect(answerCannotFinish({ reason: "defect", refusal: "join_mismatch" })).toBe(false)
})
