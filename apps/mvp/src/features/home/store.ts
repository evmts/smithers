import { Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import { Context, Effect, FiberHandle, Layer, Option, type Schema } from "effect"
import { IssuesStore } from "../issues/store"
import { Item, SyncRow, syncKey } from "../issues/schema"
import { Run } from "../status/schema"
import { StatusStore } from "../status/store"
import { Access, Todo } from "../todos/schema"
import { CuratedRow, CurrentRow, emptyCurrent, FileRow, HomeRow } from "./rows"

// A repository's home on this tab (docs/features/home.md#the-browser): every home this device read, kept on the device
// because a home at a commit never changes; the curated homes ChatApi answered, kept until the next answer; the files
// a home's Markdown blocks read, in memory; and whose home the routed page shows. Actions reach RepoApi through the
// repository feature's `RepoClient` and ChatApi through `HomeClient`; nothing here does.

type Rows<A extends object> = Collection.Collection<A, string>

/** Identity shared by the tab's rows, including its empty fallback collections. */
const rowId = (row: { readonly id: string }): string => row.id

/** Whose home the page shows, with its declared home once this device has read it, and its curated one. */
export const homeQuery = (current: Rows<CurrentRow>, homes: Rows<HomeRow>, curated: Rows<CuratedRow>) =>
  LiveQuery.make((q) =>
    q
      .from({ current: current.tanstack })
      .leftJoin({ home: homes.tanstack }, ({ current, home }) => Query.eq(current.key, home.key))
      .leftJoin({ curated: curated.tanstack }, ({ current, curated }) => Query.eq(current.repoId, curated.key))
      .findOne()
  )

/** The files the shown home's Markdown blocks read. */
export const filesQuery = (current: Rows<CurrentRow>, files: Rows<FileRow>) =>
  LiveQuery.make((q) =>
    q
      .from({ file: files.tanstack })
      .innerJoin({ current: current.tanstack }, ({ file, current }) => Query.eq(file.home, current.key))
      .select(({ file }) => ({ path: file.path, state: file.state, text: file.text }))
  )

/** Every row of a collection, live. */
const rowsOf = <A extends object>(collection: { readonly tanstack: Collection.Collection<A, any>["tanstack"] }) =>
  LiveQuery.make((q) => q.from({ row: collection.tanstack }))

/**
 * Every row of `pick`'s collection from a store this tab may lack: none when it has no such store, as a test of the
 * home alone has none.
 */
const liveRows = <S, A extends object>(
  store: Option.Option<S>,
  pick: (store: S) => { readonly tanstack: Collection.Collection<A, any>["tanstack"] },
  empty: { readonly id: string; readonly schema: Schema.Codec<A, any>; readonly getKey: (row: A) => string },
) =>
  Effect.gen(function* () {
    if (Option.isSome(store)) return yield* rowsOf(pick(store.value))
    return yield* rowsOf(yield* Collection.local<A, string>(empty))
  })

const make = Effect.gen(function* () {
  // Version 2: `HomeRow` with sections (version 1 held a flat list of blocks).
  const homes = yield* Collection.persisted<HomeRow, string>({
    id: "homes",
    schema: HomeRow,
    getKey: (row) => row.key,
    schemaVersion: 2,
  })
  // Version 1: `CuratedRow` as rows.ts declares it.
  const curated = yield* Collection.persisted<CuratedRow, string>({
    id: "curated-homes",
    schema: CuratedRow,
    getKey: (row) => row.key,
    schemaVersion: 1,
  })
  const files = yield* Collection.local<FileRow, string>({ id: "home-files", schema: FileRow, getKey: (row) => row.key })
  const current = yield* Collection.local<CurrentRow, string>({
    id: "home-current",
    schema: CurrentRow,
    getKey: rowId,
    initialData: [emptyCurrent],
  })
  // The live blocks' rows, from the stores that sync them: the synced repository's issues and pull requests and its
  // sync, and this person's runs. A `stack` block's rows are the TODOs store's own (`TodosStore.opened`).
  const issues = yield* Effect.serviceOption(IssuesStore)
  const status = yield* Effect.serviceOption(StatusStore)
  const items = yield* liveRows(issues, (store) => store.items, { id: "home-no-items", schema: Item, getKey: rowId })
  const syncs = yield* liveRows(issues, (store) => store.sync, { id: "home-no-syncs", schema: SyncRow, getKey: syncKey })
  const runs = yield* liveRows(status, (store) => store.runs, { id: "home-no-runs", schema: Run, getKey: rowId })
  // What a `stack` block reads on a tab with no TODOs store: no TODOs, and no word on access.
  const noTodos = yield* rowsOf(yield* Collection.local<Todo, string>({ id: "home-no-todos", schema: Todo, getKey: rowId }))
  const noAccess = yield* rowsOf(
    yield* Collection.local<Access, string>({ id: "home-no-access", schema: Access, getKey: rowId }),
  )
  return {
    homes,
    curated,
    items,
    syncs,
    runs,
    noTodos,
    noAccess,
    files,
    current,
    homeState: yield* homeQuery(current, homes, curated),
    fileState: yield* filesQuery(current, files),
    /** The one load the routed page runs: opening another repository interrupts it. */
    loader: yield* FiberHandle.make<void, never>(),
    /** Where the loads an action starts run, closed with the store. */
    scope: yield* Effect.scope,
  }
})

/**
 * The home's state for one tab:
 * - `homes`: each home this device read, by repository and commit; kept on the device.
 * - `curated`: the curated home ChatApi last answered for each repository; kept on the device.
 * - `items`, `syncs`, `runs`: the live blocks' rows, from the issues' and agent status's stores when the tab has them.
 * - `files`: the files the Markdown blocks read, by home and path.
 * - `current`: whose home the routed page shows, one row.
 * - the live queries frontends read, `loader` and `scope`.
 */
export class HomeStore extends Context.Service<HomeStore, Effect.Success<typeof make>>()("@smthrs/mvp/home/HomeStore") {
  /** The store; its collections cleaned up and its load interrupted with the scope. */
  static readonly layer = Layer.effect(HomeStore, make)
}
