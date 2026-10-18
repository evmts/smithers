import { describe, expect, test } from "bun:test"
import { permalinkCommit, readSelection, sourceRoute } from "./RepositoryCodeView"
import { tokenize } from "./syntax"
describe("repository code routes", () => {
  test("encodes path segments and slash branches", () => {
    expect(sourceRoute("a/b", "blob", "feature/x", "src/a b.ts")).toBe("/a/b/blob/feature/x/src/a%20b.ts")
  })
  test("bounds and normalizes line ranges", () => {
    expect(readSelection("L=4-2", 5)).toEqual({ start: 2, end: 4 })
    for (const value of ["0", "6", "1-6", "NaN", "-1", "1.5"]) expect(readSelection(`L=${value}`, 5)).toBeNull()
    expect(readSelection("L=1", 0)).toBeNull()
  })
  test("retains all lines and token text across multiline comments", () => {
    const text = "export const x = 1\n/* comment\nend */ x()\n"
    expect(tokenize(text).map(line => line.map(t => t.text).join("")).join("\n")).toBe(text.trimEnd())
    expect(tokenize("/* a\nb */")[1]![0]!.kind).toBe("comment")
    expect(tokenize(Array.from({ length: 6000 }, () => "const x = 1").join("\n"))).toHaveLength(6000)
  })
})

test("read receipts from different admission requests cannot satisfy one another", async () => {
  const { codeReadKey, repositoryCodeReads, setCodeRead } = await import("./RepositoryCodeRead")
  const old = codeReadKey("alpha/one", "blob", "main/index.ts", "old")
  const next = codeReadKey("alpha/one", "blob", "main/index.ts", "next")
  setCodeRead(old, "ready")
  expect(repositoryCodeReads.get(next)).toBeUndefined()
  setCodeRead(next, "failed", "Path not found")
  setCodeRead(next, "loading")
  expect(repositoryCodeReads.get(next)?.error).toBeUndefined()
  expect(repositoryCodeReads.get(old)?.state).toBe("ready")
})

test("permalinks use resolved commits, full SHA routes, or read branch commits only", () => {
  const head = "a".repeat(40), resolved = "b".repeat(40)
  expect(permalinkCommit("main", resolved, { main: head })).toBe(resolved)
  expect(permalinkCommit("main", undefined, { main: head })).toBe(head)
  expect(permalinkCommit(head)).toBe(head)
  expect(permalinkCommit("main")).toBeUndefined()
  expect(permalinkCommit("main", null, { main: "not-a-commit" })).toBeUndefined()
})
