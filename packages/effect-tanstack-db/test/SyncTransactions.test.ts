import { BrowserCollectionCoordinator, createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"
import { Effect, Exit, Layer, Metric, Scope } from "effect"
import { afterEach, describe, expect, test } from "vitest"
import { Collection, Persistence } from "../src/index.ts"
import { databaseFile, id, Note, note, sqlite } from "./fixtures.ts"

// A synced collection made with persist hands each of its source's transactions to TanStack DB's persisted core whole,
// at its commit (src/internal/wholeTransactions.ts). The source here is a test's own: it keeps the sync params TanStack
// DB gives it, and the test drives begin, write and commit as Electric does across the batches of a shape. Two tabs
// share one SQLite file through TanStack DB's coordinator, as a browser's do.

type Params = {
  readonly begin: () => void
  readonly write: (message: { readonly type: "insert" | "delete"; readonly value: Note }) => void
  readonly commit: () => unknown
  readonly truncate: () => void
  readonly markReady: () => void
  readonly metadata: {
    readonly row: {
      readonly get: (key: string) => unknown
      readonly set: (key: string, value: unknown) => void
      readonly delete: (key: string) => void
    }
    readonly collection: {
      readonly get: (key: string) => unknown
      readonly set: (key: string, value: unknown) => void
      readonly delete: (key: string) => void
      readonly list: (prefix?: string) => ReadonlyArray<{ readonly key: string; readonly value: unknown }>
    }
    readonly persistence: {
      readonly protocol: string
      readonly reserveCommitTurn: () => void
      readonly resumeSnapshot: {
        readonly expectCurrentCommit: () => void
        readonly getKeySetEvidence: () => unknown
      }
    }
  }
}

const scopes: Array<Scope.Closeable> = []
afterEach(async () => {
  for (const scope of scopes.splice(0).reverse()) await Effect.runPromise(Scope.close(scope, Exit.void))
})

/** A tab: a persisted synced collection on the device's SQLite file, and the params its source was given. */
const tab = async (path: string, device: string, collection: string) => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  const source: { params?: Params } = {}
  const layer = Persistence.layer({
    open: () => sqlite(path),
    make: (database, coordinator) =>
      createBrowserWASQLitePersistence({ database, ...(coordinator ? { coordinator } : {}) }),
    coordinator: () => new BrowserCollectionCoordinator({ dbName: device })
  }).pipe(Layer.provideMerge(Layer.succeed(Metric.MetricRegistry, new Map())))
  const context = await Effect.runPromise(Scope.provide(scope)(Layer.build(layer)))
  const notes = await Effect.runPromise(
    Effect.tap(
      Collection.make(
        Note,
        {
          id: collection,
          getKey: (row: Note) => row.id,
          sync: { sync: (params: Params) => void (source.params = params) }
        } as never,
        { persist: { schemaVersion: 1 } }
      ) as Effect.Effect<Collection.Collection<Note, string>, never, Scope.Scope | Persistence.Persistence>,
      (made) => made.restored
    ).pipe(Effect.provide(context), Scope.provide(scope))
  )
  return { notes, source: source.params! }
}

/** Polls until `check` holds: a condition, never a fixed wait. */
const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("condition never held")
}

const ids = (notes: Collection.Collection<Note, string>) => [...notes.tanstack.keys()].sort()

describe("a source's transaction on a persisted synced collection", () => {
  test("commits after a peer tab's commit read the device's rows again in between", async () => {
    const path = databaseFile()
    const device = id("device")
    const collection = id("notes")
    const first = await tab(path, device, collection)
    const second = await tab(path, device, collection)

    // The second tab's source opens a transaction and leaves it open, as Electric does over a fresh snapshot's first
    // batch (`snapshot-end` alone) until the next batch's `up-to-date`.
    second.source.begin()
    second.source.truncate()
    second.source.write({ type: "insert", value: note("b", 2) })
    // Meanwhile the first tab commits; the second reads the device's rows again, a new hydration cycle.
    first.source.begin()
    first.source.truncate()
    first.source.write({ type: "insert", value: note("a", 1) })
    await first.source.commit()
    first.source.markReady()
    await until(() => second.notes.tanstack.has("a"))

    // TanStack DB's persisted core refused this commit, uncaught, with "a persisted sync transaction cannot cross a
    // hydration cycle", and every later batch with "No pending sync transaction to write to".
    expect(() => second.source.commit()).not.toThrow()
    await until(() => ids(second.notes).join() === "b")
    second.source.begin()
    second.source.write({ type: "insert", value: note("c", 3) })
    second.source.commit()
    await until(() => ids(second.notes).join() === "b,c")
  })

  test("a read of the sync metadata inside a transaction sees its own writes; the commit lands them", async () => {
    const { notes, source } = await tab(databaseFile(), id("device"), id("notes"))
    const { metadata } = source

    source.begin()
    metadata.collection.set("cursor", 1)
    metadata.row.set("a", { tag: "x" })
    expect(metadata.collection.list("cur")).toEqual([{ key: "cursor", value: 1 }])
    expect(metadata.collection.get("cursor")).toBe(1)
    // The transaction is open in the core from the first read on, and takes the rest as it comes.
    source.write({ type: "insert", value: note("a", 1) })
    expect(metadata.row.get("a")).toEqual({ tag: "x" })
    metadata.row.delete("a")
    metadata.collection.delete("cursor")
    source.commit()

    await until(() => notes.tanstack.has("a"))
    expect(metadata.collection.get("cursor")).toBeUndefined()
    expect(metadata.row.get("a")).toBeUndefined()
  })

  test("a nested transaction lands at its own commit, before the one around it", async () => {
    const { notes, source } = await tab(databaseFile(), id("device"), id("notes"))
    const { metadata } = source

    source.begin()
    source.write({ type: "insert", value: note("outer", 1) })
    metadata.persistence.reserveCommitTurn()
    source.begin()
    metadata.collection.set("resume", "reset")
    metadata.persistence.resumeSnapshot.expectCurrentCommit()
    source.commit()

    expect(metadata.collection.get("resume")).toBe("reset")
    expect(notes.tanstack.has("outer")).toBe(false)
    source.commit()
    await until(() => notes.tanstack.has("outer"))
  })

  test("the core's own answers outside a transaction, and its capability's other members, are unchanged", async () => {
    const { source } = await tab(databaseFile(), id("device"), id("notes"))
    const { metadata } = source

    expect(() => source.write({ type: "insert", value: note("a", 1) })).toThrow(
      "No pending sync transaction to write to"
    )
    expect(() => source.commit()).toThrow("No pending sync transaction to commit")
    expect(() => metadata.collection.set("k", 1)).toThrow("must be called within an open sync transaction")
    expect(() => metadata.persistence.resumeSnapshot.expectCurrentCommit()).toThrow(
      "must be called within an open sync transaction"
    )
    metadata.persistence.reserveCommitTurn()
    expect(metadata.persistence.protocol).toBe("@tanstack/db/sync-persistence")
    expect(metadata.persistence.resumeSnapshot.getKeySetEvidence()).toBeDefined()
  })
})
