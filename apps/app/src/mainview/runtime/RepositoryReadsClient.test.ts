import { expect, test } from "bun:test"
import { listRepositoryCommits, getRepositoryCommit } from "./RepositoryReadsClient.ts"
import type { ApplicationClient } from "./ApplicationClient.ts"
const commit = { sha: "a".repeat(40), short_sha: "aaaaaaa", title: "Fix", body: "", author: "Ada", authored_at: "2026-10-18T10:00:00Z", committed_at: "2026-10-18T10:00:00Z", parents: [] }
test("history encodes repository, ref, path and cursor and validates the answer", async () => {
 const calls: string[] = []
 const client = { request: async (path: string) => { calls.push(path); return { items: [commit] } } } as unknown as ApplicationClient
 expect((await listRepositoryCommits(client, "alice", "demo", { ref: "feature/a", path: "a b.ts", cursor: "next", limit: 2 })).items[0]?.sha).toBe(commit.sha)
 expect(calls).toEqual(["/api/repos/alice/demo/commits?ref=feature%2Fa&path=a+b.ts&cursor=next&limit=2"])
})
test("one commit decodes files and forwards cancellation", async () => {
 const signal = new AbortController().signal
 const client = { request: async (path: string, init: RequestInit) => { expect(path).toBe(`/api/repos/alice/demo/commits/${commit.sha}`); expect(init.signal).toBe(signal); return { ...commit, files: [{ path: "a", status: "added", additions: 1, deletions: 0, patch: "+hello", binary: false, too_large: false }] } } } as unknown as ApplicationClient
 expect((await getRepositoryCommit(client, "alice", "demo", commit.sha, signal)).files[0]?.patch).toBe("+hello")
})

test("repository code search keeps the repository scope and cursor in the request", async () => {
 const { searchRepositoryCode } = await import("./RepositoryReadsClient.ts")
 const client = { request: async (path: string) => { expect(path).toBe("/api/repos/alice/demo/search/code?q=hello+world&cursor=2&limit=2"); return { items: [], total_count: 0, page: 2, per_page: 2 } } } as unknown as ApplicationClient
 expect((await searchRepositoryCode(client, "alice", "demo", "hello world", { cursor: "2", limit: 2 })).items).toEqual([])
})
test("repository issue search validates its result", async () => {
 const { searchRepositoryIssues } = await import("./RepositoryReadsClient.ts")
 const client = { request: async (path: string) => { expect(path).toBe("/api/repos/alice/demo/search/issues?q=bug"); return { items: [], total_count: 0, page: 1, per_page: 30 } } } as unknown as ApplicationClient
 expect((await searchRepositoryIssues(client, "alice", "demo", "bug")).total_count).toBe(0)
})

test("repository branches decode metadata and follow the existing bookmark cursor", async () => {
 const { listRepositoryBranches } = await import("./RepositoryReadsClient.ts")
 const signal = new AbortController().signal
 const client = { request: async (path: string, init: RequestInit) => { expect(path).toBe("/api/repos/alice/demo/branches?cursor=2&limit=2"); expect(init.signal).toBe(signal); return { items: [{ name: "main", head: commit.sha, author: "Ada", updated: commit.committed_at, title: "Fix", is_default: true }] } } } as unknown as ApplicationClient
 expect((await listRepositoryBranches(client, "alice", "demo", { cursor: "2", limit: 2, signal })).items[0]?.is_default).toBe(true)
})
