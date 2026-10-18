import { Context, Effect, Layer } from "effect"
import { load, pressSignIn, restore, signOut } from "./actions"
import type { AuthClient } from "./api"
import type { DeviceWipe } from "./device"
import { AuthStore } from "./store"

// Sign-in as a frontend sees it: a live query to read and plain functions to act, with no Effect in sight. React
// renders the query with `useLiveQuery` and calls the actions from event handlers.

type Store = AuthStore["Service"]

/**
 * What a frontend reads: who is signed in, as one live row, and the last session ChatApi confirmed on this device, so
 * a page reloaded offline still knows who asks (`composerAccess` in contract.ts reads both).
 */
export interface AuthQueries {
  readonly session: Store["sessionState"]["tanstack"]
  readonly confirmed: Store["confirmedState"]["tanstack"]
}

/** What a person does, as plain functions. Each returns at once. */
export interface AuthActions {
  /** "Sign in with GitHub" pressed: the link goes to GitHub; this records it. */
  readonly pressSignIn: () => void
  readonly signOut: () => void
  /** Asks ChatApi again who is signed in. */
  readonly reload: () => void
}

export class Auth extends Context.Service<Auth, { readonly queries: AuthQueries; readonly actions: AuthActions }>()(
  "@smthrs/mvp/auth/Auth",
) {
  /**
   * Binds the store's queries and actions for frontends, reads the device's confirmed session, and asks ChatApi who is
   * signed in as the app opens. Each action runs its Effect with the services this layer was built with
   * (`Effect.runSyncWith`). A sign-out ChatApi takes wipes the device through `DeviceWipe`.
   */
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const store = yield* AuthStore
      const run = Effect.runSyncWith(yield* Effect.context<AuthStore | AuthClient | DeviceWipe>())
      const reload = Effect.asVoid(Effect.forkIn(load, store.scope, { startImmediately: true }))
      yield* Effect.forkIn(restore, store.scope, { startImmediately: true })
      yield* reload
      return Auth.of({
        queries: { session: store.sessionState.tanstack, confirmed: store.confirmedState.tanstack },
        actions: {
          pressSignIn: () => run(pressSignIn),
          signOut: () => run(signOut),
          reload: () => run(reload),
        },
      })
    }),
  )
}

/** The sign-in layer's value: what frontends get. */
export type AuthView = Auth["Service"]
