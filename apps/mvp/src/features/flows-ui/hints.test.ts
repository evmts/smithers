import { expect, test } from "vitest"
import { MAX_REQUEST_CHARS, NAME_PATTERN } from "./contract"
import { nameHint, requestHint } from "./hints"

test("New flow names explain the actual boundary that keeps Draft unavailable", () => {
  expect(nameHint("")).toBeUndefined()
  expect(nameHint("bug-bash-status")).toBeUndefined()
  expect(nameHint("a".repeat(64))).toBeUndefined()
  expect(nameHint("a".repeat(65))).toBe("64 characters max")
  expect(nameHint("Bug bash status")).toBe("Use lowercase letters, numbers and hyphens")
  expect(nameHint("1-release")).toBe("Start with a lowercase letter")
  expect(nameHint("release-")).toBe("No trailing or repeated hyphens")
  expect(nameHint("release--notes")).toBe("No trailing or repeated hyphens")
  expect(nameHint("theme")).toBe("Name unavailable")
  for (const name of ["bug-bash-status", "a".repeat(64)]) expect(NAME_PATTERN.test(name)).toBe(true)
  for (const name of ["a".repeat(65), "Bug bash status", "1-release", "release-", "release--notes"])
    expect(NAME_PATTERN.test(name)).toBe(false)
})

test("New flow requests show a hint only after the maximum", () => {
  expect(requestHint("")).toBeUndefined()
  expect(requestHint("x".repeat(MAX_REQUEST_CHARS))).toBeUndefined()
  expect(requestHint("x".repeat(MAX_REQUEST_CHARS + 1))).toContain(MAX_REQUEST_CHARS.toLocaleString())
})
