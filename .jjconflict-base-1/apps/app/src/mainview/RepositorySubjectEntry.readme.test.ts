import { describe, expect, test } from "bun:test"
import { readmeToRead } from "./RepositorySubjectEntry"

/*
 * The Code home owes a README below Files on every repository that has one
 * (repo-ui-spec view 1: blocks, then Files, then README). The server answers
 * it for a repository with no declared home (`readme`); a declared home that
 * carries no README block leaves the tree's own README to this read.
 */
const tree = [{ name: "src", kind: "dir" as const }, { name: "README.md", kind: "file" as const }, { name: "readme.markdown", kind: "file" as const }]
const blocks = (...extra: ReadonlyArray<{ readonly type: "markdown"; readonly path: string; readonly markdown: string }>) =>
  ({ kind: "blocks" as const, blocks: [{ type: "text" as const, text: "Intro" }, ...extra] })

describe("readmeToRead", () => {
  test("a declared home without a README block reads the tree's README.md first", () => {
    expect(readmeToRead(blocks(), tree)).toBe("README.md")
    expect(readmeToRead(blocks(), [{ name: "readme.markdown", kind: "file" }, { name: "README", kind: "file" }])).toBe("readme.markdown")
    expect(readmeToRead(blocks(), [{ name: "README", kind: "file" }])).toBe("README")
  })
  test("a declared home with its own README block, the server's README answer, and no home read nothing", () => {
    expect(readmeToRead(blocks({ type: "markdown", path: "docs/README.md", markdown: "# Docs" }), tree)).toBeUndefined()
    expect(readmeToRead({ kind: "readme", markdown: "# Served" }, tree)).toBeUndefined()
    expect(readmeToRead({ kind: "none" }, tree)).toBeUndefined()
    expect(readmeToRead({ kind: "error", message: "Homepage unavailable" }, tree)).toBeUndefined()
    expect(readmeToRead(undefined, tree)).toBeUndefined()
  })
  test("a repository without a README shows nothing: a folder or a README.txt is not one", () => {
    expect(readmeToRead(blocks(), [{ name: "README.md", kind: "dir" }, { name: "README.txt", kind: "file" }, { name: "src", kind: "dir" }])).toBeUndefined()
    expect(readmeToRead(blocks(), [])).toBeUndefined()
  })
})
