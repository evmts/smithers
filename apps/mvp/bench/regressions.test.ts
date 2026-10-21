import assert from "node:assert/strict"
import { test } from "node:test"
import { applyRepositories } from "./repo.ts"
import { baselineMetrics, summarize } from "./stats.ts"

test("repositories replay preserves unchanged columns and removes deleted rows", () => {
  const rows = new Map<string, Record<string, unknown>>()
  applyRepositories(rows, [
    { key: "a", value: { id: "a", status: "ready", head_sha: "sha" }, headers: { operation: "insert" } },
    { key: "b", value: { id: "b", status: "ready" }, headers: { operation: "insert" } },
    { key: "a", value: { id: "a", name: "renamed" }, headers: { operation: "update" } },
    { key: "b", value: { id: "b" }, headers: { operation: "delete" } },
    { headers: { control: "up-to-date" } },
  ])
  assert.deepEqual([...rows], [["a", { id: "a", status: "ready", head_sha: "sha", name: "renamed" }]])
})

test("a selected-suite baseline update retains omitted metrics and replaces measured metrics", () => {
  const previous = { "load.cold.ttfb": { p50: 10, p95: 20 }, "repo.tree.cached": { p50: 30, p95: 40 } }
  const current = { "repo.tree.cached": summarize([5, 10]) }
  assert.deepEqual(baselineMetrics(previous, current), { "load.cold.ttfb": previous["load.cold.ttfb"], "repo.tree.cached": { p50: 7.5, p95: 9.8 } })
  assert.deepEqual(baselineMetrics(undefined, current), { "repo.tree.cached": { p50: 7.5, p95: 9.8 } })
  assert.deepEqual(previous["repo.tree.cached"], { p50: 30, p95: 40 })
})

test("retained baseline metrics preserve their original source and machine across repeated partial updates", () => {
  const old = { source: "results/old.json", commit: "old", machine: "A", server: "built", n: 10 }
  const current = { source: "results/current.json", commit: "new", machine: "B", server: "vite-dev", n: 1 }
  const later = { ...current, source: "results/later.json" }
  const metrics = baselineMetrics({ "load.cold.ttfb": { p50: 10, p95: 20 } }, { "repo.tree.cached": summarize([5]) }, { previous: old, current })
  assert.deepEqual(metrics["load.cold.ttfb"]!.origin, old)
  assert.deepEqual(metrics["repo.tree.cached"]!.origin, current)
  const updated = baselineMetrics(metrics, { "repo.tree.cached": summarize([6]) }, { previous: current, current: later })
  assert.deepEqual(updated["load.cold.ttfb"]!.origin, old)
  assert.deepEqual(updated["repo.tree.cached"]!.origin, later)
})
