import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GitHubReader, firstParentCommits } from "./github.mjs"

const from = "2026-10-05T00:00:00Z"
const to = "2026-10-12T00:00:00Z"
const issue = { number: 1, node_id: "I_1", html_url: "https://github.com/smithersai/smithers/issues/1", created_at: from, closed_at: "2026-10-06T00:00:00Z", state_reason: "completed", comments: 0 }

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), "quality-reader-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test("reader follows REST pages and GraphQL timeline cursors, and replays cached raw pages without a network", async (t) => {
  const cacheDir = await sandbox(t)
  const calls = []
  const transport = async (url, options) => {
    calls.push(url)
    if (url.includes("/issues?")) return new Response(JSON.stringify(url.includes("page=2") ? [] : [issue]), { headers: url.includes("page=2") ? {} : { link: '<https://api.github.com/repos/smithersai/smithers/issues?state=all&per_page=100&page=2>; rel="next"' } })
    if (url.includes("/pulls?")) return Response.json([])
    const { query } = JSON.parse(options.body)
    const second = query.includes('after: "cursor"')
    return Response.json({ data: { nodes: [{ __typename: "Issue", id: "I_1", number: 1, comments: { nodes: [] }, timelineItems: {
      nodes: second ? [{ __typename: "ReferencedEvent", commit: { oid: "landed" } }] : [{ __typename: "ReopenedEvent", createdAt: from }],
      pageInfo: { hasNextPage: !second, endCursor: second ? null : "cursor" }
    } }] } })
  }
  const reader = new GitHubReader({ repo: "smithersai/smithers", from, to, cacheDir, token: "never-cache-this", transport })
  const result = await reader.readRequests()
  assert.equal(result.issues.length, 1)
  assert.deepEqual(result.timelines[0].commitShas, ["landed"])
  assert.equal(result.sources.every((s) => s.complete), true)
  assert.equal(calls.length, 5)
  const replay = new GitHubReader({ repo: "smithersai/smithers", from, to, cacheDir, token: "", transport: () => { throw Error("network forbidden") } })
  assert.deepEqual(await replay.readRequests(), result)
  assert.doesNotMatch(await readFile(join(cacheDir, "manifest.json"), "utf8"), /never-cache-this/)
})

test("HTTP and GraphQL partial failures name the missing source, without leaking error bodies", async (t) => {
  const cacheDir = await sandbox(t)
  const transport = async (url) => url.includes("/pulls?") ? new Response("secret error", { status: 403 }) : url.includes("/issues?") ? Response.json([issue]) : Response.json({ data: { nodes: [] }, errors: [{ message: "secret error" }] })
  const result = await new GitHubReader({ repo: "smithersai/smithers", from, to, cacheDir, token: "secret", transport }).readRequests()
  assert.equal(result.sources.find((s) => s.name === "pulls").complete, false)
  assert.equal(result.sources.find((s) => s.name === "issue_timeline").complete, false)
  assert.doesNotMatch(JSON.stringify(result.sources), /secret error/)
})

test("main history uses first-parent landings, preserving authored and committed timestamps", () => {
  const records = [
    { commit_id: "merge", parents: ["base", "feature"], author: { timestamp: from }, committer: { timestamp: to }, description: "Merge (#5)" },
    { commit_id: "feature", parents: ["base"], author: { timestamp: from }, committer: { timestamp: from }, description: "feature" },
    { commit_id: "base", parents: [], author: { timestamp: from }, committer: { timestamp: from }, description: "base" }
  ]
  assert.deepEqual(firstParentCommits(records, "merge").map((c) => c.sha), ["merge", "base"])
  assert.equal(firstParentCommits(records, "merge")[0].authoredAt, from)
  assert.equal(firstParentCommits(records, "merge")[0].landedAt, to)
  assert.deepEqual(firstParentCommits(records, "merge")[0].includedCommits.map((c) => c.sha), ["merge", "feature"])
  assert.throws(() => firstParentCommits(records.slice(0, 1), "merge"), /incomplete main history/)
})

test("reader consumes a recorded public issue/timeline response through its wire boundary", async (t) => {
  const record = JSON.parse(await readFile(new URL("./fixtures/github-pages.json", import.meta.url), "utf8"))
  const transport = async (url) => url.endsWith("/graphql") ? Response.json({ data: { nodes: [record.node] } })
    : url.includes("/issues?") ? Response.json([record.issue]) : Response.json([])
  const result = await new GitHubReader({ repo: record.repo, from: "2026-04-01T00:00:00Z", to: "2026-10-19T00:00:00Z", cacheDir: await sandbox(t), token: "fixture", transport }).readRequests()
  assert.equal(result.issues[0].number, record.issue.number)
  assert.equal(result.issues[0].firstCommentAt, record.node.comments.nodes[0]?.createdAt ?? null)
  assert.equal(result.timelines[0].number, record.issue.number)
  assert.ok(result.sources.every((s) => s.complete))
})

test("reader refuses mutation queries and foreign pagination before a token can leave the GitHub host", async (t) => {
  let calls = 0
  const reader = new GitHubReader({ repo: "smithersai/smithers", from, to, cacheDir: await sandbox(t), token: "private", transport: async () => { calls++; throw Error("should not reach network") } })
  await assert.rejects(reader.page("https://attacker.invalid/page"), /pagination host/)
  await assert.rejects(reader.page("/graphql", "mutation { dangerous }"), /only GraphQL queries/)
  assert.equal(calls, 0)
})

test("a fresh observation window cannot replay an older issues page as fresh coverage", async (t) => {
  const cacheDir = await sandbox(t)
  const reader = new GitHubReader({ repo: "smithersai/smithers", from, to, cacheDir, token: "fixture", transport: async () => Response.json([]) })
  await reader.page("/repos/smithersai/smithers/issues")
  const later = new GitHubReader({ repo: "smithersai/smithers", from, to: "2026-10-13T00:00:00Z", cacheDir, token: "" })
  await assert.rejects(later.page("/repos/smithersai/smithers/issues"), /GITHUB_TOKEN is required/)
})

test("Actions reader splits capped date queries and versions observed requirements without inventing their history", async (t) => {
  let actionCalls = 0
  const transport = async (url) => {
    if (url.includes("/actions/runs?")) { actionCalls++; return Response.json({ total_count: actionCalls === 1 ? 1001 : 0, workflow_runs: [] }) }
    if (url.includes("/rules/")) return Response.json([])
    return Response.json({ contexts: ["required-test"], checks: [] })
  }
  const reader = new GitHubReader({ repo: "smithersai/smithers", from, to, cacheDir: await sandbox(t), token: "fixture", transport })
  const result = await reader.readActions()
  assert.equal(actionCalls, 3)
  assert.equal(result.sources[0].complete, true)
  assert.equal(result.sources[1].complete, false)
  assert.deepEqual(result.sources[1].contexts, ["required-test"])
  assert.equal(result.sources[1].definitionVersion, 1)
  assert.match(result.sources[1].reason, /historical required-check/)
})
