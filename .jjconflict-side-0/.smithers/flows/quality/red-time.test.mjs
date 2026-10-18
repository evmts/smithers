import assert from "node:assert/strict"
import test from "node:test"
import { computeMainRedTime } from "./red-time.mjs"

const from = "2026-10-05T00:00:00Z", to = "2026-10-12T00:00:00Z"
const input = () => ({ from, to, sources: ["main_commits", "actions", "required_checks"].map((name) => ({ name, from, to, complete: true })),
  requiredVersions: [{ from, to, contexts: ["test"] }],
  commits: [{ sha: "a", landedAt: from }],
  runs: [{ context: "test", head_sha: "a", created_at: from, updated_at: from, status: "completed", conclusion: "failure" }]
})

test("fallback uses required-check failure hours and preserves the unknown denominator", () => {
  const data = input()
  assert.deepEqual(computeMainRedTime(data).weeks[0].value, { redShare: 1, failedHours: 168, knownHours: 168, unknownHours: 0, totalHours: 168 })
  data.commits.push({ sha: "b", landedAt: "2026-10-06T00:00:00Z" })
  const row = computeMainRedTime(data).weeks[0]
  assert.equal(row.status, "source_missing")
  assert.equal(row.value, null)
  assert.equal(row.coverage.failedHours, 24)
  assert.equal(row.coverage.unknownHours, 144)
  assert.ok(row.coverage.missingSources.includes("required_check_results"))
})

test("workflow names do not stand in for required job contexts; missing historical requirements suppress values", () => {
  const data = input()
  delete data.runs[0].context
  data.runs[0].name = "test"
  assert.equal(computeMainRedTime(data).weeks[0].status, "source_missing")
  data.requiredVersions = []
  assert.ok(computeMainRedTime(data).weeks[0].coverage.missingSources.includes("required_checks_history"))
})

test("a new landing, running/cancelled check or mid-hour state change keeps that hour unknown", () => {
  for (const patch of [{ status: "in_progress", conclusion: null }, { conclusion: "cancelled" }, { updated_at: "2026-10-05T00:30:00Z" }]) {
    const data = input()
    Object.assign(data.runs[0], patch)
    assert.ok(computeMainRedTime(data).weeks[0].coverage.unknownHours > 0)
  }
})
