import assert from "node:assert/strict"
import test from "node:test"
import { computeLeadTime } from "./metrics.mjs"

const from = "2026-10-05T00:00:00Z"
const to = "2026-10-12T00:00:00Z"
const source = (name, complete = true) => ({ name, from, to, complete, count: 2 })
const fixture = () => ({
  from, to, generatedAt: to, repo: "smithersai/smithers",
  sources: ["issues", "issue_timeline", "pulls", "main_commits"].map((name) => source(name)),
  issues: [
    { number: 1, url: "https://github.com/smithersai/smithers/issues/1", createdAt: "2026-10-05T00:00:00Z", closedAt: "2026-10-06T00:00:00Z", stateReason: "completed", firstCommentAt: null },
    { number: 2, url: "https://github.com/smithersai/smithers/issues/2", createdAt: "2026-10-07T00:00:00Z", closedAt: "2026-10-07T00:05:00Z", stateReason: "completed", firstCommentAt: null }
  ],
  commits: [
    { sha: "normal", authoredAt: "2026-10-05T12:00:00Z", landedAt: "2026-10-06T00:00:00Z", message: "fix: normal (#1)" },
    { sha: "paper", authoredAt: "2026-10-07T00:01:00Z", landedAt: "2026-10-07T00:04:00Z", message: "Fixes #2" },
    { sha: "direct", authoredAt: "2026-10-08T00:00:00Z", landedAt: "2026-10-08T00:00:00Z", message: "unlinked direct-to-main" }
  ],
  pulls: [], timelines: []
})

test("normal requests alone determine percentiles; paperwork and direct landings remain visible", () => {
  const result = computeLeadTime(fixture())
  assert.deepEqual(result.weeks[0].value, { p50Hours: 24, p85Hours: 24, n: 1, paperwork: 1 })
  assert.equal(result.weeks[0].coverage.paperworkShare, 1 / 2)
  assert.equal(result.weeks[0].coverage.excludedDirectCommits, 1)
  assert.equal(result.weeks[0].coverage.excludedDirectShare, 1 / 3)
})

test("a source gap suppresses the entire week's number and names the source", () => {
  const input = fixture()
  input.sources[1].complete = false
  const row = computeLeadTime(input).weeks[0]
  assert.equal(row.status, "source_missing")
  assert.equal(row.value, null)
  assert.deepEqual(row.coverage.missingSources, ["issue_timeline"])
})

test("an unfinished UTC week is collecting, with no partial percentile", () => {
  const input = fixture()
  input.to = input.generatedAt = "2026-10-09T00:00:00Z"
  const row = computeLeadTime(input).weeks[0]
  assert.equal(row.status, "collecting")
  assert.equal(row.value, null)
})

export { fixture }

test("paperwork has strict timing boundaries and comments are evaluated at closure", () => {
  const input = fixture()
  input.issues[1].closedAt = "2026-10-07T00:10:00Z"
  assert.equal(computeLeadTime(input).weeks[0].value.n, 2)
  input.issues[1].closedAt = "2026-10-07T00:05:00Z"
  input.issues[1].firstCommentAt = "2026-10-07T00:04:00Z"
  assert.equal(computeLeadTime(input).weeks[0].value.n, 2)
  input.commits[1].authoredAt = "2026-10-06T23:59:59Z"
  assert.equal(computeLeadTime(input).weeks[0].value.paperwork, 1)
  input.commits[1].authoredAt = "2026-10-07T00:00:00Z"
  input.issues[1].firstCommentAt = "2026-10-07T00:06:00Z"
  assert.equal(computeLeadTime(input).weeks[0].value.paperwork, 1)
})

test("completed state and main reachability are both necessary; issue/PR links deduplicate", () => {
  const input = fixture()
  input.issues[1].stateReason = "not_planned"
  input.timelines = [{ number: 1, commitShas: ["not-on-main"], pullNumbers: [10] }]
  input.pulls = [{ number: 10, title: "Fixes #1", body: "", createdAt: from, mergedAt: "2026-10-06T00:00:00Z", mergeCommitSha: "normal" },
    { number: 11, title: "unlinked PR", body: "", url: "https://example.test/pull/11", createdAt: from, mergedAt: "2026-10-08T00:00:00Z", mergeCommitSha: "direct" }]
  const row = computeLeadTime(input).weeks[0]
  assert.deepEqual(row.value, { p50Hours: 24, p85Hours: 72, n: 2, paperwork: 0 })
  assert.equal(row.coverage.excludedDirectCommits, 0)
  input.commits = input.commits.filter((c) => c.sha !== "normal")
  assert.equal(computeLeadTime(input).weeks[0].value.n, 1)
})

test("missing source intervals affect only overlapping weeks, and empty cohorts stay pending", () => {
  const input = fixture()
  input.to = "2026-10-19T00:00:00Z"
  input.sources.forEach((s) => { s.to = input.to })
  input.sources[0].complete = false
  input.sources[0].gaps = [{ from: "2026-10-15T00:00:00Z", to: "2026-10-16T00:00:00Z" }]
  const weeks = computeLeadTime(input).weeks
  assert.equal(weeks[0].status, "ready")
  assert.equal(weeks[1].status, "source_missing")
  input.sources[0].complete = true
  assert.equal(computeLeadTime(input).weeks[1].status, "pending")
  input.sources.pop()
  assert.equal(computeLeadTime(input).weeks[0].value, null)
})

test("an issue referenced only by a merged ancestor is linked once to its main landing", () => {
  const input = fixture()
  input.commits[0].message = "Merge branch"
  input.commits[0].includedCommits = [
    { sha: "normal", authoredAt: "2026-10-05T12:00:00Z", message: "Merge branch" },
    { sha: "feature", authoredAt: "2026-10-05T12:00:00Z", message: "Fixes #1" }
  ]
  const row = computeLeadTime(input).weeks[0]
  assert.equal(row.value.n, 1)
  assert.equal(row.value.p50Hours, 24)
  assert.equal(row.coverage.excludedDirectCommits, 1)
})
