import { describe, expect, test } from "bun:test"
import { parseLatestCommit, readLatestCommit } from "./LatestCommitSeam"

/*
 * Platform's P-1 commits contract (platform-lead f-tda4y7), coded against here
 * with a stub until the route is on this host: the Code home's latest-commit
 * row reads items[0].title, author and committed_at, with the sha behind it.
 */
const SHA = "a".repeat(40)
const ITEM = { sha: SHA, short_sha: "aaaaaaa", title: "Fix the parser", body: "Private body.", author: "Maya", authored_at: "2026-10-18T09:00:00Z", committed_at: "2026-10-18T10:00:00Z", parents: ["b".repeat(40)] }

const http = (status: number, body: unknown, seen: string[] = []) => async (input: string): Promise<Response> => {
  seen.push(input)
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("parseLatestCommit", () => {
  test("reads items[0]: message, author, committed time and the id", () => {
    expect(parseLatestCommit({ items: [ITEM, { ...ITEM, sha: "c".repeat(40), title: "Older" }], next_cursor: "x" }))
      .toEqual({ sha: SHA, shortSha: "aaaaaaa", title: "Fix the parser", author: "Maya", committedAt: "2026-10-18T10:00:00Z" })
  })
  test("a record without a short id, author or time stays honest about each", () => {
    expect(parseLatestCommit({ items: [{ sha: SHA, title: "One\nTwo" }] })).toEqual({ sha: SHA, shortSha: "aaaaaaa", title: "One", author: null, committedAt: null })
    expect(parseLatestCommit({ items: [{ sha: SHA, title: "T", authored_at: "2026-10-18T09:00:00Z" }] })?.committedAt).toBe("2026-10-18T09:00:00Z")
    expect(parseLatestCommit({ items: [{ sha: SHA, title: "T", committed_at: "yesterday" }] })?.committedAt).toBeNull()
  })
  test("an empty list, a malformed id or a malformed envelope is no commit", () => {
    expect(parseLatestCommit({ items: [] })).toBeNull()
    expect(parseLatestCommit({ items: [{ sha: "abc1234", title: "short id" }] })).toBeNull()
    expect(parseLatestCommit({ commits: [ITEM] })).toBeNull()
    expect(parseLatestCommit(null)).toBeNull()
  })
})

describe("readLatestCommit", () => {
  test("asks for one commit at the ref the home shows and lands the newest", async () => {
    const seen: string[] = []
    const read = await readLatestCommit({ http: http(200, { items: [ITEM] }, seen), baseUrl: "" }, "maya/tinyhttp", "release/1.2")
    expect(seen).toEqual(["/api/repos/maya/tinyhttp/commits?limit=1&ref=release%2F1.2"])
    expect(read).toMatchObject({ sha: SHA, title: "Fix the parser", author: "Maya" })
  })
  test("without a ref it asks for the repository's default", async () => {
    const seen: string[] = []
    await readLatestCommit({ http: http(200, { items: [ITEM] }, seen), baseUrl: "" }, "maya/tinyhttp")
    expect(seen).toEqual(["/api/repos/maya/tinyhttp/commits?limit=1"])
  })
  test("a refusal is the answer, in the server's words, never a stand-in", async () => {
    expect(await readLatestCommit({ http: http(404, { message: "no such route" }), baseUrl: "" }, "maya/tinyhttp", "main")).toEqual({ error: "no such route" })
    expect(await readLatestCommit({ http: http(200, { items: [] }), baseUrl: "" }, "maya/tinyhttp", "main")).toMatchObject({ error: expect.stringContaining("couldn't read") })
    expect(await readLatestCommit({ http: async () => { throw new Error("offline") }, baseUrl: "" }, "maya/tinyhttp", "main")).toMatchObject({ error: expect.stringContaining("didn't answer") })
  })
})
