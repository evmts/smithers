import { describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { relative, resolve, sep } from "node:path"
import { isRepositoryPath, repositorySubjectRoot, RESERVED_SITE_SEGMENTS } from "./appDocument"

// Astro pages and Starlight's content collection both contribute site routes.
const sourceSegments = (root: string): string[] => readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(astro|md|mdx|html|[cm]?[jt]s)$/.test(entry.name))
  .map((entry) => relative(root, resolve(entry.parentPath, entry.name)).split(sep)[0]!.replace(/\.[^.]+$/, ""))
  .filter((segment) => segment !== "index" && !segment.startsWith("["))

describe("repository path ownership", () => {
  test("the reserved constant covers every first segment in Astro pages and Starlight content", () => {
    const pages = sourceSegments(resolve(import.meta.dir, "../../site/src/pages"))
    const docs = sourceSegments(resolve(import.meta.dir, "../../site/src/content/docs"))
    expect(pages).toContain("privacy")
    expect(docs).toContain("docs")
    expect([...new Set([...pages, ...docs])].filter((segment) => !RESERVED_SITE_SEGMENTS.includes(segment))).toEqual([])
  })

  test("site and infrastructure segments cannot be GitHub owners, in any case", () => {
    for (const segment of ["docs", "pricing", "changelogs", "demo", "blog", "download", "api", "w", "_astro", ...RESERVED_SITE_SEGMENTS]) {
      expect(isRepositoryPath(`/${segment}/nope/`)).toBe(false)
      expect(isRepositoryPath(`/${segment.toUpperCase()}/nope`)).toBe(false)
    }
  })

  // Regression (#3845 landed the guide 2026-10-13; the reservation followed in
  // 2e59146a): the migration guide is the first versioned site route, so
  // /migration/1.0 matches the owner/repo shape exactly. Without the
  // reservation the Worker — which runs first on every path — answers it with
  // the app document instead of the page, and the inventory walk above turns
  // red, which is what blocked every Deploy apps run from 38461530158 to
  // 38519005200. Assert the routing consequence, not only the inventory.
  test("a versioned site route is the site's, not an owner's", () => {
    expect(RESERVED_SITE_SEGMENTS).toContain("migration")
    for (const path of ["/migration/1.0", "/migration/1.0/", "/Migration/1.0"]) {
      expect(isRepositoryPath(path)).toBe(false)
    }
  })

  test("GitHub slug boundaries and exactly two segments are required", () => {
    for (const path of ["/a/b/", "/nope/nope", "/Some-Owner/repo_name.git", `/${"a".repeat(39)}/${"r".repeat(100)}`]) {
      expect(isRepositoryPath(path)).toBe(true)
    }
    for (const path of ["/", "/a/", "/a/b/c/", "/-a/b", "/a-/b", "/a--b/c", "/a_b/c", "/a/.", "/a/..", "/a/b%20c", "/a/b?x", `/${"a".repeat(40)}/b`, `/a/${"r".repeat(101)}`]) {
      expect(isRepositoryPath(path)).toBe(false)
    }
  })
})

/*
 * #4039: the subject paths below a repository root. The shape is the shared
 * grammar's (@smthrs/rpc RepositorySubjectPath); what this pins is the routing
 * decision this package owns — which roots may carry a subject at all.
 */
describe("repository subject paths", () => {
  test("the GitHub-shaped subjects of a repository resolve to that repository's root", () => {
    for (const [path, root] of [
      ["/roninjin10/e2e-verify/pull/2/files", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/pull/2", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/pull/2/", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/pull/2/commits", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/pull/2/checks", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/pull/2/conversation", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/pulls", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/issues", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/issues/6", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/tree/main", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/tree/main/apps/server/src", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/tree/release/1.2/apps", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/blob/main/apps/server/src/edge.ts", "/roninjin10/e2e-verify"],
      ["/roninjin10/e2e-verify/blob/main/docs/My%20Notes.md", "/roninjin10/e2e-verify"],
      ["/Some-Owner/repo_name.git/pull/7/files", "/Some-Owner/repo_name.git"]
    ] as const) {
      expect(repositorySubjectRoot(path)).toBe(root)
    }
  })

  test("a bare repository path carries no subject, so the two decisions stay separate", () => {
    for (const path of ["/roninjin10/e2e-verify", "/roninjin10/e2e-verify/", "/"]) {
      expect(repositorySubjectRoot(path)).toBeUndefined()
    }
  })

  test("the site's own routes cannot carry a subject, in any case", () => {
    for (const segment of ["docs", "api", "migration", "w", "_astro", ...RESERVED_SITE_SEGMENTS]) {
      expect(repositorySubjectRoot(`/${segment}/cli/pull/2`)).toBeUndefined()
      expect(repositorySubjectRoot(`/${segment.toUpperCase()}/cli/issues/2`)).toBeUndefined()
    }
    expect(repositorySubjectRoot("/w/ws-1/b/main/f/frame-1")).toBeUndefined()
  })

  test("a malformed number, an unknown view, an encoded segment or an extra segment is not a subject", () => {
    for (const path of [
      "/owner/repo/pull/0", "/owner/repo/pull/-1", "/owner/repo/pull/+2", "/owner/repo/pull/02",
      "/owner/repo/pull/2x", "/owner/repo/pull/2.0", "/owner/repo/pull/99999999999", "/owner/repo/pull/2147483648",
      "/owner/repo/pull/%32", "/owner/repo/pu%6Cl/2", "/owner/repo/pull", "/owner/repo/pull/",
      "/owner/repo/pull/2/rebase", "/owner/repo/pull/2/files/src/index.ts", "/owner/repo/pulls/2",
      "/owner/repo/issues/2/comments", "/owner/repo/issues//", "/owner/repo/tree", "/owner/repo/blob",
      "/owner/repo/commit/abc123", "/owner/repo//pull/2",
      "/owner/../pull/2", "/owner/./issues", "owner/repo/pull/2",
      // A file location is never divided by this host, so every shape whose
      // division could be widened by a decode stops at the grammar.
      "/owner/repo/tree/main/..", "/owner/repo/blob/main/../../etc/passwd",
      "/owner/repo/blob/main/src%2Findex.ts", "/owner/repo/blob/main/src%255C.ts",
      "/owner/repo/blob/https://evil.example/x", "/owner/repo/tree/main//src"
    ]) {
      expect({ path, root: repositorySubjectRoot(path) }).toEqual({ path, root: undefined })
    }
    // The largest number a tracker could reach IS a subject; the one past it is not.
    expect(repositorySubjectRoot("/owner/repo/pull/2147483647")).toBe("/owner/repo")
    // A subject root is exactly the repository paths this Worker already
    // serves, so a name `isRepositoryPath` accepts carries one too.
    expect(isRepositoryPath("/owner/.git")).toBe(true)
    expect(repositorySubjectRoot("/owner/.git/pull/2")).toBe("/owner/.git")
  })
})
