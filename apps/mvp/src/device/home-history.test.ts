import { Schema } from "effect"
import { expect, test } from "vitest"
import { CuratedRowV1, HomeRowV2 } from "./home-history"

// Exercise frozen validators through persisted rows: these remain live migration inputs.
const home = (block: unknown) => ({ key: "repo", state: "declared", sections: [{ audience: "everyone", blocks: [block] }], contributors: "role", skipped: 0, reason: null })
const accepts = (block: unknown) => Schema.is(HomeRowV2)(home(block))

test("historical homes preserve valid repository paths and refuse traversal, URL syntax and control characters", () => {
  expect(accepts({ type: "markdown", path: "docs/guide.md" })).toBe(true)
  for (const path of ["/root", "a\\b", "a//b", "./a", "../a", "a%20b", "a:b", "a?b", "a#b", "a/\u001fb"]) {
    expect(accepts({ type: "markdown", path }), path).toBe(false)
  }
})

test("historical home prose refuses markup while preserving plain text", () => {
  expect(accepts({ type: "text", text: "Use < 3 widgets", title: "Guide" })).toBe(true)
  expect(accepts({ type: "text", text: "<script>secret</script>" })).toBe(false)
})

test("historical releases require a calendar date, including leap years, in both stored home shapes", () => {
  for (const [date, valid] of [["2024-02-29", true], ["2023-02-29", false], ["2024-13-01", false], ["2024-01-32", false], ["yesterday", false]] as const) {
    const block = { type: "releases", releases: [{ name: "Launch", url: "https://example.com", date }] }
    expect(accepts(block), date).toBe(valid)
    expect(Schema.is(CuratedRowV1)({ key: "repo", state: "declared", defaultBranch: "main", sections: home(block).sections }), date).toBe(valid)
  }
})
