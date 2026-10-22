import { Collection, LiveQuery, type Persistence } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, type Scope } from "effect"
import { Confirmed, Session } from "./schema"

// Sign-in's state on this tab: one local row saying who is signed in, the last session ChatApi confirmed, kept on the
// device, and their live queries. Nothing here reaches the network; actions.ts does, through `AuthClient`.

/** The key of the one session row, and of the one confirmed row. */
export const SESSION = "session"

const sessionQuery = (session: Collection.Collection<Session, string>) =>
  LiveQuery.make((q) => q.from({ session: session.tanstack }).findOne())

const confirmedQuery = (confirmed: Collection.Collection<Confirmed, string>) =>
  LiveQuery.make((q) => q.from({ confirmed: confirmed.tanstack }).findOne())

export class AuthStore extends Context.Service<
  AuthStore,
  {
    readonly session: Collection.Collection<Session, string>
    readonly sessionState: Effect.Success<ReturnType<typeof sessionQuery>>
    /** The last session ChatApi confirmed signed in, kept on the device through `Persistence`. */
    readonly confirmed: Collection.Collection<Confirmed, string>
    readonly confirmedState: Effect.Success<ReturnType<typeof confirmedQuery>>
    /** Where requests an action starts run, closed with the store. */
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/auth/AuthStore") {
  /**
   * The store, `loading` until ChatApi says who is signed in, over the device's `Persistence`; its collections cleaned
   * up when the scope closes.
   */
  static readonly layer: Layer.Layer<AuthStore, Collection.LoadFailed, Persistence.Persistence> = Layer.effect(
    AuthStore,
    Effect.gen(function* () {
      const session = yield* Collection.local<Session, string>({
        id: "auth-session",
        schema: Session,
        getKey: (row) => row.id,
        initialData: [
          {
            id: SESSION,
            status: "loading",
            login: null,
            role: null,
            available: false,
            signingOut: false,
            restored: false,
          },
        ],
      })
      const confirmed = yield* Collection.persisted<Confirmed, string>({
        id: "auth-confirmed",
        schema: Confirmed,
        getKey: (row) => row.id,
        schemaVersion: 2,
      })
      return {
        session,
        sessionState: yield* sessionQuery(session),
        confirmed,
        confirmedState: yield* confirmedQuery(confirmed),
        scope: yield* Effect.scope,
      }
    }),
  )
}
