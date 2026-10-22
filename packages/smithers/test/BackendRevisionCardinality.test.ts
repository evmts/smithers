import { expect, it } from "vitest"
import { parseRevision } from "../src/internal/backend/Local.ts"

it("refuses multiple revision records instead of merging their descriptions", () => {
  expect(() => parseRevision("change1\tcommit1\tfirst\nchange2\tcommit2\tsecond", "@-")).toThrow(
    "Expected exactly one revision"
  )
})

it("preserves tabs in a single description and removes the record terminator", () => {
  expect(parseRevision("change\tcommit\twith\ttabs\n", "@")).toEqual({
    change_id: "change",
    commit_id: "commit",
    description: "with\ttabs"
  })
})

it("refuses an absent revision", () => {
  expect(() => parseRevision("", "missing")).toThrow("Unable to resolve revision missing")
})
