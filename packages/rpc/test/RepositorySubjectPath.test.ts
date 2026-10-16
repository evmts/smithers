import { describe, expect, it } from "vitest"
import {
  parseRepositorySubject,
  REPOSITORY_LOCATION_MAX_SEGMENTS,
  REPOSITORY_SUBJECT_NUMBER_MAX,
  repositoryLocation,
  resolveRefLocation,
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

  it("reads a folder and a file path as one undivided location", () => {
    expect(splitRepositoryPath("/roninjin10/e2e-verify/tree/main/src")).toEqual({
      owner: "roninjin10",
      name: "e2e-verify",
      subject: { kind: "tree", location: "main/src" }
    })
    expect(splitRepositoryPath("/roninjin10/e2e-verify/blob/release/1.2/src/index.ts")).toEqual({
      owner: "roninjin10",
      name: "e2e-verify",
      subject: { kind: "blob", location: "release/1.2/src/index.ts" }
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
        "/owner/repo/tree",
        "/owner/repo/blob",
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

/*
 * A GitHub ref may hold slashes and so may the path below it. The grammar
 * carries the whole remainder; this is the half that divides it, and it
 * divides it against refs somebody read, never against a guess.
 */
describe("repositoryLocation", () => {
  it("carries the remainder exactly as written, in its own case and undecoded", () => {
    expect(repositoryLocation(["Main", "src", "App.tsx"])).toBe("Main/src/App.tsx")
    expect(repositoryLocation(["main", "a%20b", "c"])).toBe("main/a%20b/c")
  })

  it("refuses a traversal, an encoded separator, a double-encoded percent and a scheme", () => {
    for (
      const segments of [
        [],
        [""],
        ["main", ""],
        ["main", "."],
        ["main", ".."],
        ["..", "etc", "passwd"],
        ["main", "a%2Fb"],
        ["main", "a%2fb"],
        ["main", "a%5Cb"],
        ["main", "a%255Cb"],
        ["main", "a%25"],
        ["main", "a%2"],
        ["main", "a%zz"],
        ["main", "a\\b"],
        ["https:", "evil.example", "x"],
        ["http://evil.example", "x"]
      ]
    ) {
      expect(repositoryLocation(segments), JSON.stringify(segments)).toBeUndefined()
    }
  })

  it("bounds the location so a pathological URL is refused, not walked", () => {
    const deep = Array.from({ length: REPOSITORY_LOCATION_MAX_SEGMENTS }, () => "a")
    expect(repositoryLocation(deep)).toBe(deep.join("/"))
    expect(repositoryLocation([...deep, "a"])).toBeUndefined()
    expect(repositoryLocation(["main", "b".repeat(1024)])).toBeUndefined()
  })
})

describe("resolveRefLocation", () => {
  const refs = ["main", "release/1.2", "release/1.2/hotfix", "Main"]

  it("divides at the longest ref the authoritative list holds", () => {
    expect(resolveRefLocation("main/src/index.ts", refs)).toEqual({ ref: "main", path: "src/index.ts" })
    expect(resolveRefLocation("release/1.2/src/index.ts", refs)).toEqual({ ref: "release/1.2", path: "src/index.ts" })
    expect(resolveRefLocation("release/1.2/hotfix/src", refs)).toEqual({ ref: "release/1.2/hotfix", path: "src" })
  })

  it("names the ref's own root when the location is only the ref", () => {
    expect(resolveRefLocation("main", refs)).toEqual({ ref: "main", path: "" })
    expect(resolveRefLocation("release/1.2", refs)).toEqual({ ref: "release/1.2", path: "" })
  })

  it("is case-sensitive and whole-segment, so no ref is matched by resemblance", () => {
    expect(resolveRefLocation("Main/src", refs)).toEqual({ ref: "Main", path: "src" })
    expect(resolveRefLocation("MAIN/src", refs)).toBeUndefined()
    expect(resolveRefLocation("mainline/src", refs)).toBeUndefined()
    expect(resolveRefLocation("releases/1.2/src", refs)).toBeUndefined()
  })

  it("decodes each segment exactly once, and keeps the path's own case", () => {
    expect(resolveRefLocation("release%2F1.2/src", refs)).toBeUndefined()
    expect(resolveRefLocation("main/src/My%20File.md", refs)).toEqual({ ref: "main", path: "src/My File.md" })
    expect(resolveRefLocation("fix%2Fthing/src", ["fix/thing"])).toBeUndefined()
    expect(resolveRefLocation("fix/thing/src", ["fix/thing"])).toEqual({ ref: "fix/thing", path: "src" })
  })

  it("is nothing when no listed ref matches, rather than guessing a slash", () => {
    expect(resolveRefLocation("feature/login/src/index.ts", refs)).toBeUndefined()
    expect(resolveRefLocation("main/src", [])).toBeUndefined()
    expect(resolveRefLocation("main/src", [""])).toBeUndefined()
  })

  it("refuses a location whose decode would reintroduce a traversal", () => {
    expect(resolveRefLocation("main/%2E%2E/etc", refs)).toBeUndefined()
    expect(resolveRefLocation("main/%2E", refs)).toBeUndefined()
    expect(resolveRefLocation("main/%E0%A4%A", refs)).toBeUndefined()
  })
})
