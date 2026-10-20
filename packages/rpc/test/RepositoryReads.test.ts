import { describe, expect, it } from "vitest"
import {
  RepositoryCommitDetailSchema,
  RepositoryCommitPageSchema,
  RepositoryCommitSchema
} from "../src/RepositoryReads.ts"
const commit = {
  sha: "a".repeat(40),
  short_sha: "aaaaaaa",
  title: "Fix",
  body: "Details",
  author: "Ada",
  authored_at: "2026-10-18T10:00:00Z",
  committed_at: "2026-10-18T11:00:00Z",
  parents: []
}
describe("repository commit reads", () => {
  it("decodes history, root parents and cursor", () => {
    expect(RepositoryCommitPageSchema.parse({ items: [commit], next_cursor: "opaque" }).items[0]).toEqual(commit)
    expect(RepositoryCommitPageSchema.parse({ items: [] }).next_cursor).toBeUndefined()
  })
  it("decodes changed paths and rejects malformed commits and negative counts", () => {
    expect(
      RepositoryCommitDetailSchema.parse({
        ...commit,
        files: [{ path: "a.ts", status: "added", additions: 2, deletions: 0 }]
      }).files
    ).toHaveLength(1)
    expect(RepositoryCommitSchema.safeParse({ ...commit, sha: "oops" }).success).toBe(false)
    expect(
      RepositoryCommitDetailSchema.safeParse({
        ...commit,
        files: [{ path: "a", status: "added", additions: -1, deletions: 0 }]
      }).success
    ).toBe(false)
  })
})

describe("repository search", () => {
  it("decodes each subject and rejects missing repository coordinates", async () => {
    const { RepositoryCodeSearchSchema, RepositoryIssueSearchSchema } = await import("../src/RepositoryReads.ts")
    expect(
      RepositoryCodeSearchSchema.parse({
        items: [{ repository_id: 1, repository_owner: "a", repository_name: "b", path: "x.ts", snippet: "hello" }],
        total_count: 1,
        page: 1,
        per_page: 30
      }).items
    ).toHaveLength(1)
    expect(
      RepositoryIssueSearchSchema.parse({
        items: [{
          id: 1,
          repository_id: 1,
          repository_owner: "a",
          repository_name: "b",
          number: 2,
          title: "Bug",
          state: "open"
        }],
        total_count: 1,
        page: 1,
        per_page: 30
      }).items[0]?.number
    ).toBe(2)
    expect(
      RepositoryCodeSearchSchema.safeParse({
        items: [{ path: "x.ts", snippet: "hello" }],
        total_count: 1,
        page: 1,
        per_page: 30
      }).success
    ).toBe(false)
  })
})

describe("repository branches", () => {
  it("decodes default flag and immutable head metadata", async () => {
    const { RepositoryBranchPageSchema } = await import("../src/RepositoryReads.ts")
    const branch = {
      name: "feature/a",
      head: "a".repeat(40),
      author: "Ada",
      updated: "2026-10-18T10:00:00Z",
      title: "Fix",
      is_default: false
    }
    expect(RepositoryBranchPageSchema.parse({ items: [branch], next_cursor: "2" }).items[0]).toEqual(branch)
    expect(RepositoryBranchPageSchema.safeParse({ items: [{ ...branch, head: "unknown" }] }).success).toBe(false)
  })
})

it("retains commit patches and omission markers", () => {
  for (const extra of [{ patch: "@@ -1 +1 @@\n-old\n+new\n" }, { binary: true }, { too_large: true }]) {
    const file = { path: "a", status: "modified", additions: 1, deletions: 1, ...extra }
    expect(RepositoryCommitDetailSchema.parse({ ...commit, files: [file] }).files[0]).toEqual(file)
  }
})
