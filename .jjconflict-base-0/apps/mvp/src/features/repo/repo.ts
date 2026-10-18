import { Context, Effect, Layer, Option } from "effect"
import { clone, copyPermalink, open, retryClone } from "./actions"
import type { RepoClient } from "./api"
import type { Clipboard } from "./clipboard"
import { type RouteParams, type Target, targetOf } from "./paths"
import { reads } from "./queries"
import type { BlobRow, TreeRow } from "./rows"
import type { Repository } from "./schema"
import { RepoStore } from "./store"

// The repository feature as a frontend sees it: live queries to read and plain functions to act, with no Effect in
// sight. React renders the queries with `useLiveQuery`, and a route's loader calls `openRoute`.

type Store = RepoStore["Service"]

/** What a frontend reads live: the routed view with its repository and clone request, its file list, file and README. */
export interface RepoQueries {
  readonly view: Store["viewState"]["tanstack"]
  readonly tree: Store["treeState"]["tanstack"]
  readonly file: Store["fileState"]["tanstack"]
  readonly readme: Store["readmeState"]["tanstack"]
}

/** What the device has of any repository now, by id and commit; `undefined` until it has it. */
export interface RepoLookups {
  readonly repository: (id: string) => Repository | undefined
  readonly tree: (id: string, sha: string) => TreeRow | undefined
  readonly file: (id: string, sha: string, path: string) => BlobRow | undefined
  readonly readme: (id: string, sha: string, dir: string) => BlobRow | undefined
}

/** What a person does, as plain functions. Each returns at once. */
export interface RepoActions {
  /** Clone pressed; `false` when `owner/name` isn't a GitHub repository. */
  readonly clone: (owner: string, name: string) => boolean
  /** Try again on a failed or refused clone. */
  readonly retryClone: (owner: string, name: string) => boolean
  /** Opens a location in the routed view. */
  readonly open: (target: Target) => void
  /** What a route's loader calls: opens the route's location. */
  readonly openRoute: (kind: "tree" | "blob", params: RouteParams, search: { readonly L?: unknown }) => void
  readonly copyPermalink: () => void
}

export class Repo extends Context.Service<
  Repo,
  { readonly queries: RepoQueries; readonly lookups: RepoLookups; readonly actions: RepoActions }
>()("@smthrs/mvp/repo/Repo") {
  /**
   * Binds the store's queries and the actions for frontends. Each action runs its Effect with the services this layer
   * was built with (`Effect.runSyncWith`).
   */
  static readonly layer = Layer.effect(
    Repo,
    Effect.gen(function* () {
      const store = yield* RepoStore
      const run = Effect.runSyncWith(yield* Effect.context<RepoStore | RepoClient | Clipboard>())
      const now = <A>(read: Effect.Effect<Option.Option<A>>) => Option.getOrUndefined(run(read))
      const device = reads(store)
      return Repo.of({
        queries: {
          view: store.viewState.tanstack,
          tree: store.treeState.tanstack,
          file: store.fileState.tanstack,
          readme: store.readmeState.tanstack,
        },
        lookups: {
          repository: (id) => now(device.repository(id)),
          tree: (id, sha) => now(device.tree(id, sha)),
          file: (id, sha, path) => now(device.file(id, sha, path)),
          readme: (id, sha, dir) => now(device.readme(id, sha, dir)),
        },
        actions: {
          clone: (owner, name) => run(clone(owner, name)),
          retryClone: (owner, name) => run(retryClone(owner, name)),
          open: (target) => run(open(target)),
          openRoute: (kind, params, search) => run(open(targetOf(kind, params, search))),
          copyPermalink: () => run(Effect.asVoid(Effect.forkIn(copyPermalink, store.scope))),
        },
      })
    }),
  )
}

/** The repository layer's value: what frontends get. */
export type RepoView = Repo["Service"]
