// The Runs page's flows summary (src/features/runs/summary.ts, docs/features/runs.md#flows): runs, success and p95 per
// flow, from this device's run index.
import { describe, expect, test } from "vitest"
import type { RunRow } from "./schema"
import { flowSummary, percentile } from "./summary"

let next = 0
const run = (flow: string, status: RunRow["status"], durationMs: number | null, createdAtMs = 1_000): RunRow => ({
  id: `run-${next++}`,
  flow,
  status,
  cancelRequested: false,
  createdAtMs,
  startedAtMs: createdAtMs,
  finishedAtMs: durationMs === null ? null : createdAtMs + durationMs,
  seq: 0,
})

describe("percentile", () => {
  test("is the nearest rank, and null for no values", () => {
    expect(percentile([], 0.95)).toBeNull()
    expect(percentile([7], 0.95)).toBe(7)
    expect(percentile([5, 1, 3], 0.5)).toBe(3)
    expect(percentile(Array.from({ length: 20 }, (_, index) => index + 1), 0.95)).toBe(19)
    expect(percentile(Array.from({ length: 100 }, (_, index) => 100 - index), 0.95)).toBe(95)
    expect(percentile([4, 2], 0)).toBe(2)
    expect(percentile([4, 2], 1)).toBe(4)
  })
})

describe("flowSummary", () => {
  test("counts each flow's runs, the share of its settled runs that succeeded, and their p95", () => {
    const rows = flowSummary([
      run("chat/Respond", "completed", 100),
      run("chat/Respond", "completed", 300),
      run("chat/Respond", "failed", 200),
      run("chat/Respond", "cancelled", 900),
      run("chat/Respond", "running", null),
      run("app/theme/set", "completed", 5),
    ])
    expect(rows).toEqual([
      { flow: "chat/Respond", runs: 5, settled: 4, succeeded: 2, successRate: 0.5, p95Ms: 900 },
      { flow: "app/theme/set", runs: 1, settled: 1, succeeded: 1, successRate: 1, p95Ms: 5 },
    ])
  })

  test("a flow with no settled run has no success rate or p95 yet", () => {
    expect(flowSummary([run("repo/clone", "pending", null), run("repo/clone", "suspended", null)])).toEqual([
      { flow: "repo/clone", runs: 2, settled: 0, succeeded: 0, successRate: null, p95Ms: null },
    ])
  })

  test("a failed draft round is not counted as success, and unread results do not claim a rate", () => {
    const failed = { ...run("flow/new", "completed", 10), outcome: "failed" as const }
    const ready = { ...run("flow/new", "completed", 20), outcome: "succeeded" as const }
    expect(flowSummary([failed, ready])).toEqual([
      { flow: "flow/new", runs: 2, settled: 2, succeeded: 1, successRate: 0.5, p95Ms: 20 },
    ])
    expect(flowSummary([failed, run("flow/new", "completed", 30)])[0]).toMatchObject({
      settled: 2, succeeded: 0, successRate: null,
    })
  })

  test("a failed answer is not counted as success, and an unread answer has no rate", () => {
    const failed = { ...run("chat/Answer", "completed", 10), outcome: "failed" as const }
    const done = { ...run("chat/Answer", "completed", 20), outcome: "succeeded" as const }
    expect(flowSummary([failed, done])).toEqual([
      { flow: "chat/Answer", runs: 2, settled: 2, succeeded: 1, successRate: 0.5, p95Ms: 20 },
    ])
    expect(flowSummary([failed, run("chat/Answer", "completed", 30)])[0]).toMatchObject({
      settled: 2, succeeded: 0, successRate: null,
    })
  })

  test("leaves out acts on runs, and ties sort by name", () => {
    const rows = flowSummary([
      run("run/retry", "completed", 10),
      run("b/flow", "completed", 10),
      run("a/flow", "completed", 10),
    ])
    expect(rows.map((row) => row.flow)).toEqual(["a/flow", "b/flow"])
  })

  test("a settled row the engine gave no end time counts as a run, not a settlement", () => {
    expect(flowSummary([{ ...run("x/flow", "completed", null) }])).toEqual([
      { flow: "x/flow", runs: 1, settled: 0, succeeded: 0, successRate: null, p95Ms: null },
    ])
  })

  test("no runs, no lines", () => {
    expect(flowSummary([])).toEqual([])
  })
})
