import { expect, test } from "vitest"
import { canUpdateBaseline } from "./baseline-update"

test("filtered runs cannot replace a complete baseline", () => {
  expect(canUpdateBaseline(0, 0, 1, 20)).toBe(false)
})
test("unsafe runs cannot replace a baseline", () => {
  expect(canUpdateBaseline(0, 1, 20, 20)).toBe(false)
})
test("only a complete, successful, safe run can replace a baseline", () => {
  expect(canUpdateBaseline(0, 0, 20, 20)).toBe(true)
  expect(canUpdateBaseline(1, 0, 20, 20)).toBe(false)
  expect(canUpdateBaseline(0, 0, 0, 20)).toBe(false)
})
