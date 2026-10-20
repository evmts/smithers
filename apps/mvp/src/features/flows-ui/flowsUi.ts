import { Context, Effect, Layer } from "effect"
import type { FlowDispatch } from "../../flows/dispatch"
import type { RunsNavigation } from "../runs/actions"
import {
  answer,
  edit,
  openDraft,
  openNew,
  remove,
  run,
  save,
  setAnswer,
  setForm,
  startDraft,
} from "./actions"
import { FlowsUiStore } from "./store"

// Your own flows as a frontend sees them (docs/features/flows.md#the-browser): live queries to read and plain functions
// to act, with no Effect in sight. The routes' loaders call `openNew` and `openDraft`.

type Store = FlowsUiStore["Service"]

/** What a frontend reads live: the person's flows and drafts, the form, the shown draft and the unsent answers. */
export interface FlowsUiQueries {
  readonly flows: Store["flowList"]["tanstack"]
  readonly drafts: Store["draftList"]["tanstack"]
  readonly form: Store["formRow"]["tanstack"]
  readonly draft: Store["draft"]["tanstack"]
  readonly answers: Store["answerList"]["tanstack"]
}

/** What a person does, as plain functions. Each returns at once, or with a promise a route loader awaits. */
export interface FlowsUiActions {
  readonly openNew: (name: string | undefined) => Promise<void>
  readonly openDraft: (draftId: string) => Promise<void>
  readonly setName: (name: string) => void
  readonly setRequest: (request: string) => void
  readonly startDraft: () => void
  readonly setAnswer: (draftId: string, questionId: string, value: string) => void
  readonly answer: () => void
  readonly save: () => void
  readonly run: (name: string, revision: number) => void
  readonly edit: (name: string) => void
  readonly remove: (flowId: string) => void
}

type Services = FlowsUiStore | FlowDispatch | RunsNavigation

export class FlowsUi extends Context.Service<
  FlowsUi,
  { readonly queries: FlowsUiQueries; readonly actions: FlowsUiActions }
>()("@smthrs/mvp/flows/FlowsUi") {
  /** Binds the store's queries and the actions, run with the services this layer was built with. */
  static readonly layer = Layer.effect(
    FlowsUi,
    Effect.gen(function* () {
      const store = yield* FlowsUiStore
      const context = yield* Effect.context<Services>()
      const promise = Effect.runPromiseWith(context)
      const fork = (effect: Effect.Effect<void, never, Services>) => void Effect.runForkWith(context)(effect)
      return FlowsUi.of({
        queries: {
          flows: store.flowList.tanstack,
          drafts: store.draftList.tanstack,
          form: store.formRow.tanstack,
          draft: store.draft.tanstack,
          answers: store.answerList.tanstack,
        },
        actions: {
          openNew: (name) => promise(openNew(name)),
          openDraft: (draftId) => promise(openDraft(draftId)),
          setName: (name) => fork(setForm({ name })),
          setRequest: (request) => fork(setForm({ request })),
          startDraft: () => fork(startDraft),
          setAnswer: (draftId, questionId, value) => fork(setAnswer(draftId, questionId, value)),
          answer: () => fork(answer),
          save: () => fork(save),
          run: (name, revision) => fork(run(name, revision)),
          edit: (name) => fork(edit(name)),
          remove: (flowId) => fork(remove(flowId)),
        },
      })
    }),
  )
}

/** The flows layer's value: what frontends get. */
export type FlowsUiView = FlowsUi["Service"]
