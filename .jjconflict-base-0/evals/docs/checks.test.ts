import { describe, expect, test } from "bun:test"
import { checks, images, steps } from "./checks.ts"
import { fixture, fixtures } from "./fixtures.ts"

describe("calibration deterministic score vectors", () => {
  for (const entry of fixtures) {
    test(entry.name, () => {
      const page = fixture(entry.name)
      expect([
        checks["images-resolve"](page).score,
        checks["steps-have-shots"](page).score,
        checks.anatomy(page).score,
        checks["fresh-captures"](page).score
      ]).toEqual([...entry.scores])
    })
  }
})
test("missing dark image", () => {
  const page = fixture("good-ui")
  page.files.pop()
  expect(checks["images-resolve"](page)).toEqual({ score: 0, reason: "home: missing dark image" })
})
test("missing manifest entry", () => {
  const page = fixture("good-ui")
  page.captures = []
  expect(checks["images-resolve"](page)).toEqual({ score: 0, reason: "home: missing manifest entry" })
})
test("empty alt", () => {
  const page = fixture("good-ui")
  page.markdown = page.markdown.replace("The repository home with the Files button", " ")
  expect(checks["images-resolve"](page).reason).toBe("home: empty alt")
})
test("terminal step is exempt only with a complete sh fence", () => {
  const page = fixture("good-terminal")
  expect(checks["steps-have-shots"](page).score).toBe(1)
  page.markdown = page.markdown.replace("```sh", "```text")
  expect(checks["steps-have-shots"](page).score).toBe(0)
})
test("no steps needs only opening purpose", () => {
  expect(steps(fixture("good-reference").markdown)).toEqual([])
  expect(checks.anatomy(fixture("good-reference")).score).toBe(1)
})
test("task anatomy failures name first missing element", () => {
  for (
    const [find, reason] of [
      ["You can open the repository's files.", "missing opening purpose sentence"],
      ["**Before you start:**", "missing prerequisites"],
      ["## Result", "missing Result"],
      ["## Next steps", "missing Next steps"]
    ]
  ) {
    const page = fixture("good-ui")
    page.markdown = page.markdown.replace(find!, "")
    expect(checks.anatomy(page).reason).toBe(reason!)
  }
  const page = fixture("good-ui")
  page.markdown = page.markdown.replace("## 1.", "## 2.")
  expect(checks.anatomy(page).reason).toBe("steps not sequential")
})
test("fresh, stale, missing and unknown builds", () => {
  const page = fixture("good-ui")
  expect(checks["fresh-captures"](page).score).toBe(1)
  page.build = "new-build"
  expect(checks["fresh-captures"](page).score).toBe(0)
  page.captures = []
  expect(checks["fresh-captures"](page).score).toBe(0)
  page.build = undefined
  expect(checks["fresh-captures"](page)).toEqual({ score: 1, reason: "build unknown" })
})
test("journeys require the two latest consecutive passes", () => {
  const page = fixture("good-ui")
  expect(checks.journey(page)).toEqual({ score: 0, reason: "no journey receipt" })
  const run = { agent: "reader", date: "2026-10-18", result: "pass" as const, receipt: "receipt.txt" }
  page.runs = [run]
  expect(checks.journey(page).score).toBe(0.5)
  page.runs.push(run, run)
  expect(checks.journey(page).score).toBe(1)
  page.runs.push({ ...run, result: "fail" })
  expect(checks.journey(page).score).toBe(0)
  page.runs.push(run)
  expect(checks.journey(page).score).toBe(0.5)
  page.runs.push({ ...run, receipt: "" })
  expect(checks.journey(page).score).toBe(0)
})
test("frontmatter and fenced examples are not prose", () => {
  const markdown =
    "---\ntitle: Test\n---\nYou can read this page.\n\n```md\n## 1. Fake step\n![fake](images/missing.webp)\n```\n"
  expect(images(markdown)).toEqual([])
  expect(steps(markdown)).toEqual([])
})

test("fenced duplicate headings do not split a real step", () => {
  const page = fixture("good-ui")
  page.markdown = page.markdown.replace(
    "Choose **Files**.",
    "```md\n## Result\n## 1. Open files\n```\n\nChoose **Files**."
  )
  expect(steps(page.markdown)).toHaveLength(1)
  expect(checks["steps-have-shots"](page).score).toBe(1)
})
