import { Context, Effect, Metric, Option } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { retryActId, runPath } from "./contract"
import { retriesOf } from "./page"
import type { Inspection, RunTab, RunView } from "./schema"
import { VIEW } from "./schema"
import { RunsStore } from "./store"

// What a person does on runs (decision 0014 §2 and §5, docs/features/runs.md#acts): opening the list or a run, which
// read the engine; choosing a step or a tab, which only this tab sees; and Stop, Retry and Resume, which run the acts'
// flows through `FlowDispatch`, door `button`, the same declarations the agent calls. An act carries the journal
// sequence the page last read, so the engine refuses one on a run that moved since, and the page then reads it again.

/** Where this tab goes: the router's `navigate`, which the host gives. */
export class RunsNavigation extends Context.Service<RunsNavigation, { readonly navigate: (path: string) => void }>()(
  "@smthrs/mvp/runs/RunsNavigation",
) {}

/** Sets fields of the view's one row. */
const setView = (fields: Partial<Omit<RunView, "id">>) =>
  Effect.flatMap(RunsStore, ({ view }) => view.update(VIEW, (draft) => void Object.assign(draft, fields))).pipe(
    Effect.asVoid,
    // The view's row always exists, and its schema takes every field set here: a refusal is a bug.
    Effect.orDie,
  )

/** The list's route loader: shows the list, and reads it. */
export const openList = Effect.gen(function* () {
  yield* setView({ listOpen: true })
  yield* (yield* RunsStore).readList
})

/** A run's route loader: shows `runId` with nothing selected, reads it, and follows it when it runs on Cloudflare. */
export const openRun = (runId: string) =>
  Effect.gen(function* () {
    yield* setView({ runId, listOpen: false, selected: null, at: null, inspectorOpen: true, tab: "steps", acting: null, refusal: null })
    const store = yield* RunsStore
    yield* store.readRun(runId)
    yield* store.follow(runId)
  })

/** Selects a step. */
export const select = (stepId: string) => setView({ selected: stepId })

/** Shows a tab. */
export const showTab = (tab: RunTab) => setView({ tab })

/** More: reads the open run's journal past what the page has. */
export const more = Effect.gen(function* () {
  const store = yield* RunsStore
  const view = Option.getOrThrow(yield* store.view.get(VIEW))
  if (view.runId !== null) yield* store.readMore(view.runId)
})

/** The open run as the page last read it, or none. */
const openInspection = Effect.gen(function* () {
  const store = yield* RunsStore
  const view = Option.getOrThrow(yield* store.view.get(VIEW))
  if (view.runId === null) return Option.none()
  const page = yield* store.pages.get(view.runId)
  return Option.flatMap(page, (page) => Option.fromNullishOr(page.inspection as Inspection | null))
})

type Act = "stop" | "retry" | "resume"

/**
 * Runs `act` on the open run with `dispatch`, marking it in flight until its flow answers; a refusal's code stays on the
 * view (`refusal`). Then the run is read again.
 */
const acting = (
  act: Act,
  run: (inspection: Inspection) => Effect.Effect<Option.Option<string>, unknown, FlowDispatch | RunsStore | RunsNavigation>,
) =>
  Effect.gen(function* () {
    const inspection = yield* openInspection
    if (Option.isNone(inspection)) return
    yield* setView({ acting: act, refusal: null })
    const refused = yield* run(inspection.value).pipe(
      Effect.catch(() => Effect.succeed(Option.some("unavailable"))),
    )
    yield* setView({ acting: null, refusal: Option.getOrNull(refused) })
    yield* (yield* RunsStore).readRun(inspection.value.run.runId)
  })

/** What a dispatched act answers: nothing when it was done, its refusal's code when it was refused. */
const refusalOf = (dispatched: { readonly _tag: "Done" } | { readonly _tag: "Failed"; readonly error: { readonly code: string } }) =>
  dispatched._tag === "Done" ? Option.none() : Option.some(dispatched.error.code)

/** Stop: `run/cancel` on the open run. */
export const stop = acting("stop", (inspection) =>
  Effect.flatMap(FlowDispatch, (flows) =>
    flows.dispatch("run/cancel", { runId: inspection.run.runId, seq: inspection.run.lastSeq }, { door: "button" })).pipe(
      Effect.map(refusalOf),
    ))

/** Resume: `run/resume` on the open run. */
export const resume = acting("resume", (inspection) =>
  Effect.flatMap(FlowDispatch, (flows) =>
    flows.dispatch("run/resume", { runId: inspection.run.runId, seq: inspection.run.lastSeq }, { door: "button" })).pipe(
      Effect.map(refusalOf),
    ))

/**
 * Retry: `run/retry` on the open run, as the act `retry:<runId>:<n>` for its n-th retry from this device, so a second
 * press before the list moves starts no second run. Its new run's page opens.
 */
export const retry = (version: "pinned" | "current") =>
  acting("retry", (inspection) =>
    Effect.gen(function* () {
      const store = yield* RunsStore
      const runId = inspection.run.runId
      // The list holds this device's earlier retries of the run: read it now, so the act is the next one.
      yield* store.readList
      const n = retriesOf(yield* store.runs.toArray, runId) + 1
      const dispatched = yield* (yield* FlowDispatch).dispatch("run/retry", { runId, version }, {
        door: "button",
        executionId: retryActId(runId, n),
      })
      if (dispatched._tag === "Failed") return Option.some(dispatched.error.code)
      yield* store.readList
      ;(yield* RunsNavigation).navigate(runPath(dispatched.value.runId))
      return Option.none()
    }))

/** Read-only replay position and inspector visibility, local to this tab. */
export const replaySelections = Metric.counter("smithers_run_replay_selections", { description: "Read-only journal selections", incremental: true })
export const scrub = (at: number | null) => Effect.gen(function* () {
  yield* setView({ at })
  if (at === null) {
    const store = yield* RunsStore
    const current = Option.getOrThrow(yield* store.view.get(VIEW))
    if (current.runId !== null) yield* store.readRun(current.runId)
  }
  yield* Metric.update(Metric.withAttributes(replaySelections, { mode: at === null ? "live" : "replay" }), 1)
  yield* Effect.logDebug("run.replay.selected").pipe(Effect.annotateLogs({ mode: at === null ? "live" : "replay", sequence: at }))
}).pipe(Effect.withSpan("run.replay.select"))
export const inspectStep = (stepId: string) => setView({ selected: stepId, inspectorOpen: true })
export const showInspector = (inspectorOpen: boolean) => setView({ inspectorOpen })
