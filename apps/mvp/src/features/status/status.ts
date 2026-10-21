import { Context, Effect, Layer } from "effect"
import type { FlowDispatch } from "../../flows/dispatch"
import { answer, focus, focusFirst, setDraft } from "./actions"
import type { AnswerValue } from "./schema"
import { StatusStore } from "./store"

// Agent status as a frontend sees it (decision 0015): live queries to read and plain functions to act, with no Effect
// in sight. The conversation renders each answer's state and question from `statuses`; the header and the tab title
// read `needs` and `latest`. The toast stack reads the feed (decision 0009, src/features/attention/).

type Store = StatusStore["Service"]

/** What a frontend reads live. */
export interface StatusQueries {
  readonly statuses: Store["statuses"]["tanstack"]
  readonly needs: Store["needs"]["tanstack"]
  readonly latest: Store["latest"]["tanstack"]
}

/** What a person does, as plain functions. Each returns at once. */
export interface StatusActions {
  /** Answers run `id`'s open question: words or an option, or `true` (Approve) or `false` (Deny). */
  readonly answer: (id: string, value: AnswerValue) => void
  readonly setDraft: (id: string, text: string) => void
  /** Brings run `id`'s question card into view and focuses it: a toast's Answer. */
  readonly focus: (id: string) => void
  /** The same for the oldest question that needs the person: the header's pill. */
  readonly focusFirst: () => void
}

export class Status extends Context.Service<Status, { readonly queries: StatusQueries; readonly actions: StatusActions }>()(
  "@smthrs/mvp/status/Status",
) {
  /** Binds the store's queries and the actions for frontends, run with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Status,
    Effect.gen(function* () {
      const store = yield* StatusStore
      const run = Effect.runSyncWith(yield* Effect.context<StatusStore | FlowDispatch>())
      return Status.of({
        queries: { statuses: store.statuses.tanstack, needs: store.needs.tanstack, latest: store.latest.tanstack },
        actions: {
          answer: (id, value) => run(answer(id, value)),
          setDraft: (id, text) => run(setDraft(id, text)),
          focus: (id) => run(focus(id)),
          focusFirst: () => run(focusFirst),
        },
      })
    }),
  )
}

/** The status layer's value: what frontends get. */
export type StatusView = Status["Service"]
