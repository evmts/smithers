import { Context, Effect, Layer } from "effect"
import type { FlowDispatch } from "../../flows/dispatch"
import type { StatusStore } from "../status/store"
import { dismiss, hide, open } from "./actions"
import type { Surface } from "./contract"
import { type AttentionNavigation, AttentionStore } from "./store"

// The personal feed as a frontend sees it (decision 0009): live queries to read and plain functions to act, with no
// Effect in sight. The stack reads `stack` and `list` on a page, and `stackHere` and `listHere` over a conversation.

type Store = AttentionStore["Service"]

/** What a frontend reads live. */
export interface AttentionQueries {
  readonly stack: Store["stack"]["tanstack"]
  readonly stackHere: Store["stackHere"]["tanstack"]
  readonly list: Store["list"]["tanstack"]
  readonly listHere: Store["listHere"]["tanstack"]
}

/** What a person does, as plain functions. Each returns at once. */
export interface AttentionActions {
  /** Opens entry `subject` from `surface`: Answer or Open. */
  readonly open: (subject: string, surface: Surface) => void
  /** Hides entry `subject`'s toast; it stays in the list. */
  readonly hide: (subject: string) => void
  /** Dismisses entry `subject`. */
  readonly dismiss: (subject: string) => void
}

export class Attention extends Context.Service<
  Attention,
  { readonly queries: AttentionQueries; readonly actions: AttentionActions }
>()("@smthrs/mvp/attention/Attention") {
  /** Binds the store's queries and the actions for frontends, run with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Attention,
    Effect.gen(function* () {
      const store = yield* AttentionStore
      const run = Effect.runSyncWith(
        yield* Effect.context<AttentionStore | AttentionNavigation | StatusStore | FlowDispatch>(),
      )
      return Attention.of({
        queries: {
          stack: store.stack.tanstack,
          stackHere: store.stackHere.tanstack,
          list: store.list.tanstack,
          listHere: store.listHere.tanstack,
        },
        actions: {
          open: (subject, surface) => run(open(subject, surface)),
          hide: (subject) => run(hide(subject)),
          dismiss: (subject) => run(dismiss(subject)),
        },
      })
    }),
  )
}

/** The feed layer's value: what frontends get. */
export type AttentionView = Attention["Service"]
