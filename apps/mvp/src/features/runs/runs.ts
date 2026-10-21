import { LiveQuery } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer } from "effect"
import type { FlowDispatch } from "../../flows/dispatch"
import {
  inspectStep,
  more,
  openList,
  openRun,
  resume,
  retry,
  RunsNavigation,
  scrub,
  select,
  setSteerDraft,
  showInspector,
  showTab,
  steer,
  stop,
} from "./actions"
import type { RunTab } from "./schema"
import { RunsStore } from "./store"
import { SteerWrites } from "./writes"

// Runs as a frontend sees them (docs/features/runs.md#the-browser): live queries to read and plain functions to act,
// with no Effect in sight. The routes' loaders call `openList` and `openRun`; the run page renders `page`.

type Store = RunsStore["Service"]

/** What a frontend reads live: the open run with its view, the view alone, and the list. */
export interface RunsQueries {
  readonly page: Store["page"]["tanstack"]
  readonly view: Store["viewRow"]["tanstack"]
  readonly runs: Store["list"]["tanstack"]
  /** This device's steers the outbox holds, and those the route answered (docs/features/runs.md#steering). */
  readonly steerSending: Effect.Success<ReturnType<typeof sendingQuery>>["tanstack"]
  readonly steerSent: Effect.Success<ReturnType<typeof sentQuery>>["tanstack"]
}

/** Every steer the outbox holds. */
const sendingQuery = (writes: SteerWrites["Service"]) => LiveQuery.make((q) => q.from({ row: writes.sending.tanstack }))

/** Every steer the route answered on this tab. */
const sentQuery = (writes: SteerWrites["Service"]) => LiveQuery.make((q) => q.from({ row: writes.sent.tanstack }))

/** What a person does, as plain functions. Each returns at once, or with a promise a route loader awaits. */
export interface RunsActions {
  readonly openList: () => Promise<void>
  readonly openRun: (runId: string) => Promise<void>
  readonly scrub: (at: number | null) => void
  readonly inspectStep: (stepId: string) => void
  readonly showInspector: (open: boolean) => void
  readonly select: (stepId: string) => void
  readonly showTab: (tab: RunTab) => void
  readonly more: () => void
  readonly stop: () => void
  readonly retry: (version: "pinned" | "current") => void
  readonly resume: () => void
  readonly setSteerDraft: (text: string) => void
  readonly steer: () => void
}

export class Runs extends Context.Service<Runs, { readonly queries: RunsQueries; readonly actions: RunsActions }>()(
  "@smthrs/mvp/runs/Runs",
) {
  /** Binds the store's queries and the actions, run with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Runs,
    Effect.gen(function* () {
      const store = yield* RunsStore
      const writes = yield* SteerWrites
      const steerSending = yield* sendingQuery(writes)
      const steerSent = yield* sentQuery(writes)
      const context = yield* Effect.context<RunsStore | FlowDispatch | RunsNavigation>()
      const promise = Effect.runPromiseWith(context)
      const fork = (effect: Effect.Effect<void, never, RunsStore | FlowDispatch | RunsNavigation>) =>
        void Effect.runForkWith(context)(effect)
      return Runs.of({
        queries: {
          page: store.page.tanstack,
          view: store.viewRow.tanstack,
          runs: store.list.tanstack,
          steerSending: steerSending.tanstack,
          steerSent: steerSent.tanstack,
        },
        actions: {
          openList: () => promise(openList),
          openRun: (runId) => promise(openRun(runId)),
          scrub: (at) => fork(scrub(at)),
          inspectStep: (stepId) => fork(inspectStep(stepId)),
          showInspector: (open) => fork(showInspector(open)),
          select: (stepId) => fork(select(stepId)),
          showTab: (tab) => fork(showTab(tab)),
          more: () => fork(more),
          stop: () => fork(stop),
          retry: (version) => fork(retry(version)),
          resume: () => fork(resume),
          setSteerDraft: (text) => fork(setSteerDraft(text)),
          steer: () => fork(steer),
        },
      })
    }),
  )
}

/** The runs layer's value: what frontends get. */
export type RunsView = Runs["Service"]
