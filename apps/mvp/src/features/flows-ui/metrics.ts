import { Effect, Metric } from "effect"

// What your own flows count and log in the engine (docs/observability.md#your-own-flows, decision 0014 §7): one line,
// one count and the outcome on the span per draft round, per save, per write and per load. Ids, counts and codes only: never a
// request, a file, a question, an answer, a description or a flow's name.

/** Draft rounds, by `scope` and `outcome` (`ready`, `needs_you`, `failed`). */
export const authorRounds = Metric.counter("smithers_flow_author_rounds", {
  description: "Draft rounds flow/new finished, by scope and outcome",
  incremental: true,
})

/** Saves, by `outcome` (`saved`, or the refusal's code). */
export const saves = Metric.counter("smithers_flow_saves", {
  description: "Saves flow/save asked for, by outcome",
  incremental: true,
})

/** Code written to a flow, by `outcome` (`written`, or the refusal's code) and `placement`. */
export const writes = Metric.counter("smithers_flow_writes", {
  description: "Writes of a flow's code flow/write asked for, by outcome and placement",
  incremental: true,
})

/** One round's record. */
export interface Round {
  readonly draftId: string
  readonly round: number
  readonly outcome: "ready" | "needs_you" | "failed"
  readonly checks: ReadonlyArray<string>
  readonly questions: number
  readonly durationMs: number
}

/** Records a finished round: `flow.author`, Warn when it failed, and its count. */
export const recordRound = (round: Round) =>
  Effect.gen(function* () {
    yield* Metric.update(Metric.withAttributes(authorRounds, { scope: "person", outcome: round.outcome }), 1)
    yield* Effect.annotateCurrentSpan({ "smithers.flow.outcome": round.outcome })
    yield* Effect.logWithLevel(round.outcome === "failed" ? "Warn" : "Info")("flow.author").pipe(
      Effect.annotateLogs({
        feature: "flows",
        draftId: round.draftId,
        round: round.round,
        scope: "person",
        target: "flow",
        outcome: round.outcome,
        checks: round.checks.join(","),
        questions: round.questions,
        durationMs: round.durationMs,
      }),
    )
  })

/** Records a save: `flow.save` with its outcome, and its count. */
export const recordSave = (draftId: string, outcome: string) =>
  Effect.gen(function* () {
    yield* Metric.update(Metric.withAttributes(saves, { outcome }), 1)
    yield* Effect.logWithLevel(outcome === "saved" ? "Info" : "Warn")("flow.save").pipe(
      Effect.annotateLogs({ feature: "flows", draftId, outcome }),
    )
  })

/** Records a write of a flow's code: `flow.write` with its outcome and where the code runs, and its count. */
export const recordWrite = (outcome: string, placement: string) =>
  Effect.gen(function* () {
    yield* Metric.update(Metric.withAttributes(writes, { outcome, placement }), 1)
    yield* Effect.logWithLevel(outcome === "written" ? "Info" : "Warn")("flow.write").pipe(
      Effect.annotateLogs({ feature: "flows", outcome, placement }),
    )
  })

/** Records a load that refused a flow: `flow.run.load` with the failing check's code, or `sandbox`. */
export const recordLoad = (outcome: string) =>
  Effect.logWithLevel(outcome === "loaded" ? "Debug" : "Warn")("flow.run.load").pipe(
    Effect.annotateLogs({ feature: "flows", outcome }),
  )
