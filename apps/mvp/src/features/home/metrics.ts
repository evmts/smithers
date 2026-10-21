import { Effect, Metric } from "effect"
import type { HomeRow } from "./rows"

// The home's records (docs/observability.md#a-repositorys-home): outcomes, counts, statuses and durations, never a block,
// a title, a text, a path or a link.

/** Homes resolved, by `outcome`: `declared`, `absent`, `invalid`, `unreadable`, or `cached` for one this device had. */
export const resolves = Metric.counter("smithers_web_home_resolves", {
  description: "Repository homes the app resolved, by outcome",
  incremental: true,
})

/** Records a resolve: `home.resolve` with its outcome, counts and duration, the span's attributes, and its count. */
export const recordResolve = (row: HomeRow, outcome: string, durationMs: number, status: number | undefined) =>
  Effect.gen(function* () {
    const blocks = row.blocks.length
    yield* Metric.update(Metric.withAttributes(resolves, { outcome }), 1)
    yield* Effect.annotateCurrentSpan({
      "smithers.home.outcome": outcome,
      "smithers.home.blocks": blocks,
      "smithers.home.skipped": row.skipped,
    })
    yield* Effect.logWithLevel(row.state === "unreadable" ? "Warn" : "Info")("home.resolve").pipe(
      Effect.annotateLogs({
        feature: "home",
        outcome,
        blocks,
        skipped: row.skipped,
        durationMs,
        ...(row.reason === null ? {} : { reason: row.reason }),
        ...(status === undefined ? {} : { status }),
      }),
    )
  })

/** Records a Markdown block's file read: `home.file.load` with its outcome, RepoApi's status and its duration. */
export const recordFile = (outcome: string, durationMs: number, status: number | undefined) =>
  Effect.logWithLevel(outcome === "failed" ? "Warn" : "Info")("home.file.load").pipe(
    Effect.annotateLogs({ feature: "home", outcome, durationMs, ...(status === undefined ? {} : { status }) }),
  )
