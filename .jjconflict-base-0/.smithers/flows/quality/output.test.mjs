import assert from "node:assert/strict"
import test from "node:test"
import { auditSample, deliveredRequests, makeSnapshot, references, window26 } from "./metrics.mjs"
import { auditCsv, renderTrend } from "./output.mjs"

const fixture = () => {
  const from = "2026-09-01T00:00:00Z", to = "2026-10-12T00:00:00Z"
  return { from, to, generatedAt: to, repo: "smithersai/smithers", pulls: [], timelines: [],
    sources: ["issues", "issue_timeline", "pulls", "main_commits"].map((name) => ({ name, from, to, complete: true })),
    issues: Array.from({ length: 50 }, (_, i) => ({ number: i + 1, url: `https://example.test/${i}`, createdAt: `2026-10-${String(1 + i % 9).padStart(2, "0")}T00:00:00Z`, closedAt: `2026-10-${String(1 + i % 9).padStart(2, "0")}T00:05:00Z`, stateReason: "completed", firstCommentAt: i < 20 ? null : "2026-09-01T00:00:00Z" })),
    commits: Array.from({ length: 50 }, (_, i) => ({ sha: `${i}`, authoredAt: `2026-10-${String(1 + i % 9).padStart(2, "0")}T00:01:00Z`, landedAt: `2026-10-${String(1 + i % 9).padStart(2, "0")}T00:04:00Z`, message: `fix (#${i + 1})` })) }
}

test("the fallback cutoff is strictly above 40%, and the CEO rule is recorded without evaluation", () => {
  const input = fixture()
  let snapshot = makeSnapshot(input)
  assert.equal(snapshot.coverage.paperwork30Days.share, 0.4)
  assert.equal(snapshot.selectedMetric, "request_lead_time")
  input.issues[20].firstCommentAt = null
  snapshot = makeSnapshot(input)
  assert.equal(snapshot.selectedMetric, "main_red_time")
  assert.equal(snapshot.metrics.main_red_time.status, "source_missing")
  assert.equal(snapshot.definition.successRule.evaluated, false)
  assert.equal(snapshot.definition.successRule.publicClaimMinimumOptedInProjects, 5)
  input.sources[0].complete = false
  assert.equal(makeSnapshot(input).coverage.paperwork30Days.share, null)
  assert.equal(makeSnapshot(input).selectedMetric, "request_lead_time")
})

test("HTML embeds both percentiles, gap labels, coverage and definitions without external resources or executable data", () => {
  const snapshot = makeSnapshot(fixture())
  snapshot.repo = '<script>alert("x")</script>'
  const html = renderTrend(snapshot)
  assert.match(html, /<svg/)
  assert.match(html, /p50/)
  assert.match(html, /p85/)
  assert.match(html, /source_missing/)
  assert.match(html, /Coverage manifest/)
  assert.match(html, /change_failure_rate · pending/)
  assert.doesNotMatch(html, /<script|<link|<img|<iframe|https:\/\/cdn/i)
  assert.match(html, /&lt;script&gt;/)
})

test("audit is deterministic, includes paperwork and normal requests, spans weeks, and CSV quotes hostile strings", () => {
  const input = fixture()
  const requests = deliveredRequests(input).requests
  const rows = auditSample(requests, input.from, input.to)
  assert.equal(rows.length, 30)
  assert.ok(rows.some((r) => r.paperwork))
  assert.ok(rows.some((r) => !r.paperwork))
  assert.deepEqual(auditSample([...requests].reverse(), input.from, input.to), rows)
  assert.equal(new Set(rows.map((r) => r.number)).size, 30)
  const csv = auditCsv([{ ...rows[0], url: '=1+1,"\n' }])
  assert.match(csv, /"'=1\+1,""\n"/)
  assert.equal(auditSample([], input.from, input.to).length, 0)
})

test("references accept observed forms but exclude foreign repo references; UTC weeks cross DST correctly", () => {
  assert.deepEqual(references("(#1) Fixes #2 refs #3 smithersai/smithers#4 https://github.com/smithersai/smithers/issues/5 plue#99 other/repo#88"), [1, 2, 3, 4, 5])
  const window = window26("2026-11-01T23:30:00-08:00")
  assert.equal(window.to, "2026-11-02T07:30:00.000Z")
  assert.equal(window.from, "2026-05-11T00:00:00.000Z")
})

test("the cross-week audit retains a rare paperwork request even when its number is late", () => {
  const input = fixture()
  input.issues.forEach((r) => { r.firstCommentAt = "2026-09-01T00:00:00Z" })
  input.issues[49].firstCommentAt = null
  const sample = auditSample(deliveredRequests(input).requests, input.from, input.to)
  assert.ok(sample.some((r) => r.paperwork))
})

test("manifest's main-commit denominator uses the observation period while retaining older ancestry for links", () => {
  const input = fixture()
  input.commits.push({ sha: "older", message: "old", authoredAt: "2026-08-01T00:00:00Z", landedAt: "2026-08-01T00:00:00Z" })
  const snapshot = makeSnapshot(input)
  assert.equal(snapshot.coverage.counts.mainCommits, 50)
  assert.equal(snapshot.coverage.counts.mainAncestryLandings, 51)
})
