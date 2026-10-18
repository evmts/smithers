import { describe, expect, test } from "bun:test"
import { readSelection, sourceRoute } from "./RepositoryCodeView"
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
