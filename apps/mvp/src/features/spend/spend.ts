import { Context, Effect, Layer } from "effect"
import { hide } from "./actions"
import { SpendStore } from "./store"

// Spend alerts as a frontend sees them (docs/features/spend-alerts.md): a live query to read and a plain function to
// act, with no Effect in sight. The toast stack reads `open`.

type Store = SpendStore["Service"]

/** What a frontend reads live. */
export interface SpendQueries {
  readonly open: Store["open"]["tanstack"]
}

/** What an Admin does, as plain functions. Each returns at once. */
export interface SpendActions {
  /** Hides alert `id` and every earlier one on this device. */
  readonly hide: (id: string) => void
}

export class Spend extends Context.Service<Spend, { readonly queries: SpendQueries; readonly actions: SpendActions }>()(
  "@smthrs/mvp/spend/Spend",
) {
  /** Binds the store's query and the action for frontends, run with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Spend,
    Effect.gen(function* () {
      const store = yield* SpendStore
      const run = Effect.runSyncWith(yield* Effect.context<SpendStore>())
      return Spend.of({
        queries: { open: store.open.tanstack },
        actions: { hide: (id) => run(hide(id)) },
      })
    }),
  )
}

/** The spend layer's value: what frontends get. */
export type SpendView = Spend["Service"]
