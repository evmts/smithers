import { describe, expect, it } from "vitest"
import { decodeFilePage, FilePageRejected } from "../src/FileRead.ts"

const wire = {
  type: "file",
  content: "hello",
  size: 5,
  encoding: "utf-8",
  commit_sha: "a".repeat(40),
  raw_url: "/api/repos/a/b/contents/x?raw=1"
}

describe("decodeFilePage refusals", () => {
  it.each([
    ["a response that is not an object", null, "invalid_response"],
    ["a branch name where the commit sha belongs", { ...wire, commit_sha: "main" }, "invalid_response"],
    ["a raw URL outside the repository API", { ...wire, raw_url: "https://example.com/x" }, "invalid_response"],
    ["an encoding it cannot decode", { ...wire, encoding: "latin1" }, "invalid_encoding"]
  ])("refuses %s with a tagged FilePageRejected", (_, value, code) => {
    let thrown: unknown
    try {
      decodeFilePage(value)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(FilePageRejected)
    expect(thrown).toMatchObject({ _tag: "FilePageRejected", code })
  })
})
