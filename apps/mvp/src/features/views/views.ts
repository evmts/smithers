import { Context, Effect, Layer } from "effect"
import { SHOWING } from "./schema"
import { ViewsStore } from "./store"

// The conversation's views as a frontend sees them: a live query to read and a plain function to act, with no Effect in
// sight. The conversation renders each view from its own row (src/features/chat/queries.ts); the full-screen route's
// loader calls `show`, and its screen renders `shown`.

type Store = ViewsStore["Service"]

/** What a frontend reads live: the view this tab shows full screen, once the device has it. */
export interface ViewsQueries {
  readonly shown: Store["shown"]["tanstack"]
  /** The view shown full screen from branch conversation `conversationId`; the home one's for none or one not open. */
  readonly shownIn: (conversationId: string | undefined) => Store["shown"]["tanstack"]
}

/** What a person does, as plain functions. Each returns at once. */
export interface ViewsActions {
  /**
   * What the full-screen route's loader calls: shows the view with this id, of branch conversation `conversationId`
   * when given (decision 0013 §1). Resolves once that conversation's views are open.
   */
  readonly show: (viewId: string, conversationId?: string) => Promise<void>
}

/** Shows the view with `viewId` full screen in this tab: the one row of `showing`. */
export const show = (viewId: string, conversationId?: string) =>
  Effect.gen(function* () {
    const { showing, forConversation } = yield* ViewsStore
    if (conversationId !== undefined) yield* forConversation(conversationId)
    yield* showing.update(SHOWING, (draft) => {
      draft.viewId = viewId
      draft.conversationId = conversationId ?? null
    })
  }).pipe(
    // A local collection refuses only a row its own schema rejects, which an id never is: a bug, not a state.
    Effect.orDie,
  )

export class Views extends Context.Service<Views, { readonly queries: ViewsQueries; readonly actions: ViewsActions }>()(
  "@smthrs/mvp/views/Views",
) {
  /** Binds the store's query and the action for frontends, run with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Views,
    Effect.gen(function* () {
      const store = yield* ViewsStore
      const run = Effect.runPromiseWith(yield* Effect.context<ViewsStore>())
      return Views.of({
        queries: {
          shown: store.shown.tanstack,
          shownIn: (conversationId) =>
            (conversationId === undefined ? undefined : store.shownIn(conversationId))?.tanstack ?? store.shown.tanstack,
        },
        actions: { show: (viewId, conversationId) => run(Effect.asVoid(show(viewId, conversationId))) },
      })
    }),
  )
}

/** The views layer's value: what frontends get. */
export type ViewsView = Views["Service"]
