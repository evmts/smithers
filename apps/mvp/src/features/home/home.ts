import { Context, Effect, Layer } from "effect"
import type { RepoClient } from "../repo/api"
import type { RepoStore } from "../repo/store"
import { open } from "./actions"
import { HomeStore } from "./store"

// A repository's home as a frontend sees it: live queries to read and a plain function to act, with no Effect in
// sight. React renders the queries with `useLiveQuery`, and a repository route's loader calls `open`.

type Store = HomeStore["Service"]

/** What a frontend reads live: whose home the page shows, with the home; and the files its Markdown blocks read. */
export interface HomeQueries {
  readonly home: Store["homeState"]["tanstack"]
  readonly files: Store["fileState"]["tanstack"]
}

/** What a route does. */
export interface HomeActions {
  /** A repository route's loader: reads `owner/name`'s home at its default branch's head. Returns at once. */
  readonly open: (owner: string, name: string) => void
}

export class Home extends Context.Service<Home, { readonly queries: HomeQueries; readonly actions: HomeActions }>()(
  "@smthrs/mvp/home/Home",
) {
  /** Binds the store's queries and the action, which runs with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Home,
    Effect.gen(function* () {
      const store = yield* HomeStore
      const run = Effect.runSyncWith(yield* Effect.context<HomeStore | RepoStore | RepoClient>())
      return Home.of({
        queries: { home: store.homeState.tanstack, files: store.fileState.tanstack },
        actions: { open: (owner, name) => run(open(owner, name)) },
      })
    }),
  )
}

/** The home layer's value: what frontends get. */
export type HomeView = Home["Service"]
