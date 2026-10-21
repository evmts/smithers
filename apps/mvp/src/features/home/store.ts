import { Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import { Context, Effect, FiberHandle, Layer } from "effect"
import { CurrentRow, emptyCurrent, FileRow, HomeRow } from "./rows"

// A repository's home on this tab (docs/features/home.md#the-browser): every home this device read, kept on the device
// because a home at a commit never changes; the files its Markdown blocks read, in memory; and whose home the routed
// page shows. Actions reach RepoApi through the repository feature's `RepoClient`; nothing here does.

type Rows<A extends object> = Collection.Collection<A, string>

/** Whose home the page shows, with that home once this device has read it. */
export const homeQuery = (current: Rows<CurrentRow>, homes: Rows<HomeRow>) =>
  LiveQuery.make((q) =>
    q
      .from({ current: current.tanstack })
      .leftJoin({ home: homes.tanstack }, ({ current, home }) => Query.eq(current.key, home.key))
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

const make = Effect.gen(function* () {
  // Version 1: `HomeRow` as rows.ts declares it.
  const homes = yield* Collection.persisted<HomeRow, string>({
    id: "homes",
    schema: HomeRow,
    getKey: (row) => row.key,
    schemaVersion: 1,
  })
  const files = yield* Collection.local<FileRow, string>({ id: "home-files", schema: FileRow, getKey: (row) => row.key })
  const current = yield* Collection.local<CurrentRow, string>({
    id: "home-current",
    schema: CurrentRow,
    getKey: (row) => row.id,
    initialData: [emptyCurrent],
  })
  return {
    homes,
    files,
    current,
    homeState: yield* homeQuery(current, homes),
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
 * - `files`: the files the Markdown blocks read, by home and path.
 * - `current`: whose home the routed page shows, one row.
 * - the live queries frontends read, `loader` and `scope`.
 */
export class HomeStore extends Context.Service<HomeStore, Effect.Success<typeof make>>()("@smthrs/mvp/home/HomeStore") {
  /** The store; its collections cleaned up and its load interrupted with the scope. */
  static readonly layer = Layer.effect(HomeStore, make)
}
