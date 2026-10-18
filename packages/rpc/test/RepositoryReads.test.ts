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
