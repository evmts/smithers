import { expect, test } from "vitest"
import { shouldResumeApp } from "../src/AppEntry.ts"

test("an ordinary visit stays on the landing page, and the tutorial link enters the app", () => {
  expect(shouldResumeApp("")).toBe(false)
  expect(shouldResumeApp("?unrelated=1")).toBe(false)
  expect(shouldResumeApp("?tutorial")).toBe(true)
})

test("authentication returns enter the app immediately, and no other auth value does", () => {
  for (const search of ["?signed-in=github", "?auth=failed", "?auth=error"]) expect(shouldResumeApp(search)).toBe(true)
  expect(shouldResumeApp("?auth=ok")).toBe(false)
})

test("an explicit writer takeover enters the app without a tutorial or auth marker", () => {
  expect(shouldResumeApp("", true)).toBe(true)
  expect(shouldResumeApp("?unrelated=1", true)).toBe(true)
  expect(shouldResumeApp("", false)).toBe(false)
})
