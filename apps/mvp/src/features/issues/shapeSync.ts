import { type ElectricCollection } from "@smthrs/effect-electric"
import { Clock, Effect, Metric, Ref, Stream } from "effect"

type Event = ElectricCollection.SyncEvent
type Phase = "starting" | "sent" | "ready" | "failed" | "stopped"
interface Snapshot {
  readonly phase: Phase
  readonly status?: number
}

/** The first request, a changed status, or a recovery is recorded; identical live polls are suppressed. */
export const snapshotAfter = (current: Snapshot, event: Event): Snapshot | undefined => {
  const next: Snapshot = event._tag === "Sent"
    ? current.phase === "starting" ? { phase: "sent" } : current
    : event._tag === "Succeeded" ? { phase: "ready" }
    : event._tag === "Failed" ? { phase: "failed", status: event.status }
    : { phase: "stopped", status: event.error.status }
  return next.phase === current.phase && next.status === current.status ? undefined : next
}

/** First answer and later failures or recoveries of the issue item shape, without repository or row content. */
export const shapeTransitions = Metric.counter("smithers_issue_shape_transitions", {
  description: "Meaningful browser issue shape states, by phase",
  incremental: true,
})

/** A page stuck on Loading can be matched to its shape's first request and last observed outcome. */
export const observeIssueShape = (events: Stream.Stream<Event>) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const snapshot = yield* Ref.make<Snapshot>({ phase: "starting" })
    yield* events.pipe(Stream.runForEach((event) => Effect.gen(function* () {
      const next = snapshotAfter(yield* Ref.get(snapshot), event)
      if (next === undefined) return
      yield* Ref.set(snapshot, next)
      const fields = {
        phase: next.phase,
        durationMs: (yield* Clock.currentTimeMillis) - startedAt,
        ...(next.status === undefined ? {} : { status: next.status }),
      }
      yield* Effect.gen(function* () {
        yield* Metric.update(Metric.withAttributes(shapeTransitions, { phase: next.phase }), 1)
        yield* Effect.annotateCurrentSpan(fields)
        yield* Effect.logWithLevel(next.phase === "failed" || next.phase === "stopped" ? "Warn" : "Info")(
          "issues.shape.sync",
        ).pipe(Effect.annotateLogs(fields))
      }).pipe(Effect.withSpan("issues.shape.sync"))
    })))
  })
