// The repository contract's pure helpers (src/features/repo/contract.ts): names, paths, routes and the text check
// RepoApi and the browser share.
import { describe, expect, test } from "vitest"
import {
  blobRoute,
  cloneExecutionId,
  isFilePath,
  isRepository,
  MAX_PATH_LENGTH,
  repoId,
  textOf,
  treeRoute,
} from "./contract"

describe("the repository contract", () => {
  test("a repository is a GitHub owner and name, outside the app's own first segments", () => {
    expect(isRepository("octocat", "Spoon-Knife")).toBe(true)
    expect(isRepository("smithersai", "repo.view_fixture-2")).toBe(true)
    for (const [owner, name] of [["-octocat", "x"], ["octocat", "."], ["octocat", ".."], ["octocat", "a/b"], ["App", "x"], ["api", "x"], ["assets", "x"], ["a".repeat(40), "x"], ["octocat", "x".repeat(101)]]) {
      expect(isRepository(owner!, name!)).toBe(false)
    }
    expect(repoId("OctoCat", "Spoon-Knife")).toBe("github/octocat/spoon-knife")
    const cloneId = "0b6c1d2e-3f40-4a51-8b62-7c83d94ea5f6"
    expect(cloneExecutionId("github/a/b", cloneId)).toBe(`repo-clone:github/a/b:${cloneId}`)
  })

  test("a file path is relative and bounded, with no empty or dot segments", () => {
    expect(isFilePath("docs/guide.md")).toBe(true)
    for (const path of ["", "/a", "a/", "a//b", "./a", "a/../b", "x".repeat(MAX_PATH_LENGTH + 1), "a/".repeat(64) + "b"]) {
      expect(isFilePath(path)).toBe(false)
    }
  })

  test("routes encode each part, keeping a path's slashes", () => {
    expect(treeRoute("o", "n", "a".repeat(40))).toBe(`/api/repos/o/n/tree/${"a".repeat(40)}`)
    expect(blobRoute("o", "n.x", "b".repeat(40), "docs/a b#.md")).toBe(`/api/repos/o/n.x/blob/${"b".repeat(40)}/docs/a%20b%23.md`)
  })

  test("text is UTF-8 with no NUL in its first 8 KiB; anything else is binary", () => {
    expect(textOf(new TextEncoder().encode("héllo"))).toBe("héllo")
    expect(textOf(new Uint8Array([0x68, 0x00, 0x69]))).toBeUndefined()
    expect(textOf(new Uint8Array([0xff, 0xfe, 0x41]))).toBeUndefined()
    const lateNul = new Uint8Array(9 * 1024).fill(0x61)
    lateNul[9 * 1024 - 1] = 0
    expect(textOf(lateNul)).toBe(new TextDecoder().decode(lateNul))
  })
})
