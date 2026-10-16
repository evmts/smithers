import { describe, expect, it } from "vitest"
import {
  parseRepositorySubject,
  REPOSITORY_SUBJECT_NUMBER_MAX,
  splitRepositoryPath
} from "../src/RepositorySubjectPath.ts"

/*
 * The one grammar the Worker edge and the app both route with (#4039). What is
 * pinned here is the agreement: a shape either is a subject for both hosts or
 * is a subject for neither.
 */
describe("splitRepositoryPath", () => {
  it("reads a bare repository path, with or without its trailing slash", () => {
    expect(splitRepositoryPath("/roninjin10/e2e-verify")).toEqual({ owner: "roninjin10", name: "e2e-verify" })
    expect(splitRepositoryPath("/roninjin10/e2e-verify/")).toEqual({ owner: "roninjin10", name: "e2e-verify" })
  })

  it("reads the pull request the reported production URL named, with its tab", () => {
    expect(splitRepositoryPath("/roninjin10/e2e-verify/pull/2/files")).toEqual({
      owner: "roninjin10",
      name: "e2e-verify",
      subject: { kind: "pull", number: 2, tab: "files" }
    })
  })

  it("keeps the owner and repository in the path's own spelling, validating neither", () => {
    expect(splitRepositoryPath("/Docs/Cli/pull/2")).toEqual({
      owner: "Docs",
      name: "Cli",
      subject: { kind: "pull", number: 2, tab: "conversation" }
    })
    expect(splitRepositoryPath("/a%20b/c/issues")).toEqual({ owner: "a%20b", name: "c", subject: { kind: "issues" } })
  })

  it("is nothing for a path that names no repository, and nothing for an unsupported subject", () => {
    for (
      const path of [
        "",
        "/",
        "/owner",
        "/owner/",
        "/owner//",
        "/owner/repo//",
        "owner/repo",
        "/w/ws-1/b/main/f/frame-1",
        "/owner/repo/tree/main/src",
        "/owner/repo/blob/main/src/index.ts",
        "/owner/repo/commit/abc123",
        "/owner/repo/pull/2/files/src/index.ts"
      ]
    ) {
      expect(splitRepositoryPath(path), path).toBeUndefined()
    }
  })
})

describe("parseRepositorySubject", () => {
  it("names the four pull request views GitHub's way: the bare path is the conversation", () => {
    expect(parseRepositorySubject(["pull", "2"])).toEqual({ kind: "pull", number: 2, tab: "conversation" })
    for (const tab of ["conversation", "commits", "checks", "files"] as const) {
      expect(parseRepositorySubject(["pull", "2", tab])).toEqual({ kind: "pull", number: 2, tab })
    }
  })

  it("names the lists and one issue", () => {
    expect(parseRepositorySubject(["pulls"])).toEqual({ kind: "pulls" })
    expect(parseRepositorySubject(["issues"])).toEqual({ kind: "issues" })
    expect(parseRepositorySubject(["issues", "6"])).toEqual({ kind: "issue", number: 6 })
  })

  it("refuses a number that is not a plain positive decimal, and never decodes a segment", () => {
    for (const segment of ["0", "-1", "+2", "02", "2x", "2.0", " 2", "2 ", "1e3", "%32", "٢", "2_000", ""]) {
      expect(parseRepositorySubject(["pull", segment]), segment).toBeUndefined()
      expect(parseRepositorySubject(["issues", segment]), segment).toBeUndefined()
    }
    expect(parseRepositorySubject(["pu%6Cl", "2"])).toBeUndefined()
    expect(parseRepositorySubject(["PULL", "2"])).toBeUndefined()
  })

  it("bounds the number, so an overflowing URL is refused rather than rounded", () => {
    expect(parseRepositorySubject(["pull", String(REPOSITORY_SUBJECT_NUMBER_MAX)]))
      .toEqual({ kind: "pull", number: REPOSITORY_SUBJECT_NUMBER_MAX, tab: "conversation" })
    expect(parseRepositorySubject(["pull", String(REPOSITORY_SUBJECT_NUMBER_MAX + 1)])).toBeUndefined()
    expect(parseRepositorySubject(["issues", "9".repeat(20)])).toBeUndefined()
    expect(parseRepositorySubject(["issues", "9007199254740993"])).toBeUndefined()
  })

  it("refuses an unknown head, an unknown view and any extra segment", () => {
    for (
      const segments of [
        [],
        ["pull"],
        ["pulls", "2"],
        ["issues", "6", "comments"],
        ["pull", "2", "rebase"],
        ["pull", "2", "files", "src"],
        ["issue", "6"],
        ["discussions", "6"],
        ["wiki"]
      ]
    ) {
      expect(parseRepositorySubject(segments), segments.join("/")).toBeUndefined()
    }
  })
})
