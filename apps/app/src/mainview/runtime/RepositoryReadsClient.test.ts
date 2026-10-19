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
 const client = { request: async (path: string, init: RequestInit) => { expect(path).toBe(`/api/repos/alice/demo/commits/${commit.sha}`); expect(init.signal).toBe(signal); return { ...commit, files: [] } } } as unknown as ApplicationClient
 expect((await getRepositoryCommit(client, "alice", "demo", commit.sha, signal)).files).toEqual([])
})
