// Statistics, the baseline comparison and the terminal summary. No browser, no I/O.

export type Summary = { n: number; p50: number; p95: number; min: number; max: number }
export type Baseline = { p50: number; p95: number }

// Metric keys in display order, with their labels. Every value is milliseconds.
export const METRICS: Record<string, string> = {
  "load.cold.ttfb": "Cold load: TTFB",
  "load.cold.fcp": "Cold load: FCP",
  "load.cold.lcp": "Cold load: LCP",
  "load.cold.usable": "Cold load: chat usable",
  "load.cold.newest": "Cold load: newest message shown",
  "load.warm.ttfb": "Warm load: TTFB",
  "load.warm.fcp": "Warm load: FCP",
  "load.warm.lcp": "Warm load: LCP",
  "load.warm.usable": "Warm load: chat usable",
  "load.warm.newest": "Warm load: newest message shown",
  "cmdk.focus": "⌘K to composer focused",
  "shape.initial_sync": "Shape initial sync, offset -1 to up-to-date",
  "question.accepted": "API: POST /api/questions to 202",
  "question.confirmed": "API: POST to the question's txid from Electric",
  "question.first_text": "API: POST to first answer text from Electric",
  "question.done": "API: POST to answer done from Electric",
  "answer.question": "UI: ask to question shown",
  "answer.first_text": "UI: ask to first answer text",
  "answer.done": "UI: ask to answer done",
  "sync.question": "Fan-out: ask on A to question on B",
  "sync.answer_done": "Fan-out: ask on A to answer done on B",
  "concurrent.accepted": "Concurrent asks: POST to 202",
  "concurrent.confirmed": "Concurrent asks: POST to txid from Electric",
  "concurrent.done": "Concurrent asks: POST to answer done",
}

// Linear interpolation between the closest ranks: R's type 7, NumPy's default. `sorted` is ascending.
export const percentile = (sorted: ReadonlyArray<number>, p: number): number => {
  if (sorted.length === 0) throw new Error("percentile of no samples")
  const rank = (sorted.length - 1) * p
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low)
}

const round = (ms: number) => Math.round(ms * 10) / 10

export const summarize = (samples: ReadonlyArray<number>): Summary => {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    min: round(sorted[0]!),
    max: round(sorted.at(-1)!),
  }
}

export type Regression = { metric: string; stat: "p50" | "p95"; baseline: number; current: number }

// A statistic regresses when it is more than `threshold` (a fraction) slower than the baseline and more than
// `floorMs` slower in absolute terms, so a 2 ms metric moving to 3 ms is not a regression.
export const regressions = (
  current: Record<string, Summary>,
  baseline: Record<string, Baseline>,
  { threshold, floorMs }: { threshold: number; floorMs: number },
): Array<Regression> =>
  Object.entries(current).flatMap(([metric, summary]) => {
    const base = baseline[metric]
    if (base === undefined) return []
    return (["p50", "p95"] as const)
      .filter((stat) => summary[stat] > base[stat] * (1 + threshold) && summary[stat] - base[stat] > floorMs)
      .map((stat) => ({ metric, stat, baseline: base[stat], current: summary[stat] }))
  })

const ms = (value: number) => (value >= 100 ? value.toFixed(0) : value.toFixed(1))

const change = (current: number, base: number | undefined, regressed: boolean) => {
  if (base === undefined || base === 0) return "new"
  const percent = ((current - base) / base) * 100
  const text = `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`
  return regressed ? `**${text}**` : text
}

export const table = (
  metrics: Record<string, Summary>,
  baseline: Record<string, Baseline> | undefined,
  flagged: ReadonlyArray<Regression>,
): string => {
  const isFlagged = (metric: string, stat: "p50" | "p95") => flagged.some((r) => r.metric === metric && r.stat === stat)
  const header = baseline
    ? ["| Metric (ms) | n | p50 | p95 | min | max | p50 vs baseline | p95 vs baseline |", "|---|--:|--:|--:|--:|--:|--:|--:|"]
    : ["| Metric (ms) | n | p50 | p95 | min | max |", "|---|--:|--:|--:|--:|--:|"]
  const rows = Object.keys(METRICS)
    .filter((metric) => metrics[metric] !== undefined)
    .map((metric) => {
      const s = metrics[metric]!
      const cells = [METRICS[metric], String(s.n), ms(s.p50), ms(s.p95), ms(s.min), ms(s.max)]
      if (baseline) {
        cells.push(change(s.p50, baseline[metric]?.p50, isFlagged(metric, "p50")))
        cells.push(change(s.p95, baseline[metric]?.p95, isFlagged(metric, "p95")))
      }
      return `| ${cells.join(" | ")} |`
    })
  return [...header, ...rows].join("\n")
}
