import { listed } from "./contract"
import type { RunRow } from "./schema"

// The Runs page's flows summary (docs/features/runs.md#flows): per flow, from this device's run index (`runs`), how many
// runs, the share of its settled runs that succeeded and the 95th percentile of their durations. Pure: the engine's
// usage metrics (`RunMetrics`, docs/observability.md#flow-usage) count the same things across devices.

/** One flow's line of the summary. */
export interface FlowSummary {
  readonly flow: string
  readonly runs: number
  /** Runs that settled: done, failed or stopped. */
  readonly settled: number
  /** Settled runs that succeeded (`completed`). */
  readonly succeeded: number
  /** Succeeded over settled, or `null` while none settled. */
  readonly successRate: number | null
  /** The 95th percentile, by nearest rank, of settled runs' time from admission to settlement; `null` while none. */
  readonly p95Ms: number | null
}

/** The `fraction` percentile of `values` by nearest rank, or `null` for none. */
export const percentile = (values: ReadonlyArray<number>, fraction: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(fraction * sorted.length))) - 1]!
}

/** Every listed flow of `runs`, the most runs first, then by name. Acts on runs (`run/*`) aren't listed. */
export const flowSummary = (runs: ReadonlyArray<RunRow>): ReadonlyArray<FlowSummary> => {
  const byFlow = new Map<string, Array<RunRow>>()
  for (const run of runs) {
    if (!listed(run.flow)) continue
    const group = byFlow.get(run.flow)
    if (group === undefined) byFlow.set(run.flow, [run])
    else group.push(run)
  }
  return [...byFlow].map(([flow, group]): FlowSummary => {
    const ended = group.filter((run) =>
      (run.status === "completed" || run.status === "failed" || run.status === "cancelled") && run.finishedAtMs !== null
    )
    const succeeded = ended.filter((run) => run.status === "completed").length
    return {
      flow,
      runs: group.length,
      settled: ended.length,
      succeeded,
      successRate: ended.length === 0 ? null : succeeded / ended.length,
      p95Ms: percentile(ended.map((run) => run.finishedAtMs! - run.createdAtMs), 0.95),
    }
  }).sort((left, right) => right.runs - left.runs || left.flow.localeCompare(right.flow))
}
