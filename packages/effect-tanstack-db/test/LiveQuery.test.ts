import { LimitOffsetRequireOrderByError } from "@tanstack/db"
import { Effect, Exit, Fiber, Scope, Stream } from "effect"
import { describe, expect, test } from "vitest"
import { Collection, LiveQuery, Query } from "../src/index.ts"
import { id, Note, note } from "./fixtures.ts"

const run = <A, E>(program: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Effect.scoped(program))

const notes = (initialData: ReadonlyArray<Note>) =>
  Collection.local({ id: id("notes"), schema: Note, getKey: (row) => row.id, initialData })

const ids = (rows: ReadonlyArray<{ readonly id: string }>) => rows.map(({ id }) => id)

/**
 * An on-demand source: it loads nothing until a query asks, then serves `rows` once `serve` says how. A load that
 * fails rejects with `failure`.
 */
const onDemand = (rows: ReadonlyArray<Note>, serve: () => "rows" | "fail" = () => "rows") =>
  Collection.make(Note, {
    id: id("on-demand"),
    getKey: (row: Note) => row.id,
    syncMode: "on-demand",
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        markReady()
        return {
          loadSubset: async () => {
            await Promise.resolve()
            if (serve() === "fail") throw new Error("source refused")
            begin()
            for (const value of rows) write({ type: "insert", value })
            commit()
          }
        }
      }
    }
  })

describe("make", () => {
  test("reports invalid query construction through the typed error channel", async () => {
    const error = await run(Effect.gen(function*() {
      const collection = yield* notes([note("a", 1)])
      return yield* Effect.flip(LiveQuery.make((q) => q.from({ note: collection.tanstack }).limit(1)))
    }))
    expect(error).toBeInstanceOf(Collection.LoadFailed)
    expect(error.cause).toBeInstanceOf(LimitOffsetRequireOrderByError)
  })

  test("keeps a typed, ordered view of its sources, and is cleaned up with its scope", async () => {
    const result = await Effect.runPromise(Effect.gen(function*() {
      const scope = yield* Scope.make()
      const collection = yield* Scope.provide(notes([note("a", 2), note("b", 1)]), scope)
      const ordered = yield* Scope.provide(
        LiveQuery.make((q) =>
          q.from({ note: collection.tanstack }).orderBy(({ note }) => note.n).select(({ note }) => ({
            id: note.id,
            n: note.n
          }))
        ),
        scope
      )
      yield* ordered.preload
      const before = ids(yield* ordered.toArray)
      yield* collection.insert(note("c", 0))
      const after = ids(yield* ordered.toArray)
      yield* Scope.close(scope, Exit.void)
      return { before, after, status: ordered.tanstack.status }
    }))
    expect(result).toEqual({ before: ["b", "a"], after: ["c", "b", "a"], status: "cleaned-up" })
  })

  test("findOne reads one row", async () => {
    const found = await run(Effect.gen(function*() {
      const collection = yield* notes([note("a", 1), note("b", 2)])
      const one = yield* LiveQuery.make((q) =>
        q.from({ note: collection.tanstack }).where(({ note }) => Query.eq(note.id, "b")).findOne()
      )
      yield* one.preload
      return yield* one.toArray
    }))
    expect(found).toEqual([expect.objectContaining(note("b", 2))])
  })

  test("preload fails with LoadFailed when a source can't load", async () => {
    const error = await run(Effect.gen(function*() {
      const source = yield* onDemand([note("a", 1)], () => "fail")
      const query = yield* LiveQuery.make((q) => q.from({ note: source.tanstack }))
      return yield* Effect.flip(query.preload)
    }))
    expect(error._tag).toBe("LoadFailed")
  })
})

describe("streams", () => {
  test("rows coalesces a burst while the consumer is paused and keeps listening afterwards", async () => {
    const result = await run(Effect.gen(function*() {
      const collection = yield* notes([note("a", 0)])
      const query = yield* LiveQuery.make((q) => q.from({ note: collection.tanstack }))
      yield* query.preload
      const pull = yield* Stream.toPull(query.rows.pipe(Stream.map((rows) => rows.map(({ n }) => n))))
      const initial = yield* pull
      for (let n = 1; n <= 256; n++) {
        yield* collection.update("a", (row) => {
          row.n = n
        })
      }
      const latest = yield* pull
      yield* collection.update("a", (row) => {
        row.n = 257
      })
      const next = yield* pull
      return { initial, latest, next }
    }))
    expect(result).toEqual({ initial: [[0]], latest: [[256]], next: [[257]] })
  })

  test("rows emits the current result, then the result after each change", async () => {
    const results = await run(Effect.gen(function*() {
      const collection = yield* notes([note("a", 1)])
      const query = yield* LiveQuery.make((q) => q.from({ note: collection.tanstack }).orderBy(({ note }) => note.n))
      yield* query.preload
      const fiber = yield* query.rows.pipe(
        Stream.map(ids),
        Stream.takeUntil((rows) => rows.join() === "b"),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true })
      )
      yield* collection.insert(note("b", 2))
      yield* Effect.yieldNow
      yield* collection.delete("a")
      return yield* Fiber.join(fiber)
    }))
    expect(results[0]).toEqual(["a"])
    expect(results).toContainEqual(["a", "b"])
    expect(results.at(-1)).toEqual(["b"])
  })

  test("changes streams the query's own changes, with its rows first when asked", async () => {
    const batches = await run(Effect.gen(function*() {
      const collection = yield* notes([note("a", 1)])
      const query = yield* LiveQuery.make((q) =>
        q.from({ note: collection.tanstack }).where(({ note }) => Query.gt(note.n, 0))
      )
      yield* query.preload
      const fiber = yield* query.changes({ initial: true }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true })
      )
      yield* collection.insert(note("b", 0))
      yield* collection.insert(note("c", 5))
      return yield* Fiber.join(fiber)
    }))
    expect(batches.map((batch) => batch.map(({ type, key }) => `${type}:${key}`))).toEqual([["insert:a"], ["insert:c"]])
  })
})

describe("setWindow", () => {
  const newest = (source: Collection.Collection<Note, string>, limit: number) =>
    LiveQuery.make((q) => q.from({ note: source.tanstack }).orderBy(({ note }) => note.n, "desc").limit(limit))

  test("widens and narrows the window over rows already loaded", async () => {
    const shown = await run(Effect.gen(function*() {
      const query = yield* Effect.flatMap(
        notes([note("a", 1), note("b", 2), note("c", 3)]),
        (source) => newest(source, 1)
      )
      yield* query.preload
      yield* query.setWindow({ limit: 3 })
      const wide = ids(yield* query.toArray)
      yield* query.setWindow({ limit: 2 })
      return { wide, narrow: ids(yield* query.toArray) }
    }))
    expect(shown).toEqual({ wide: ["c", "b", "a"], narrow: ["c", "b"] })
  })

  test("waits for an on-demand source to load the rows the window needs", async () => {
    const shown = await run(Effect.gen(function*() {
      const query = yield* Effect.flatMap(
        onDemand([note("a", 1), note("b", 2), note("c", 3)]),
        (source) => newest(source, 1)
      )
      yield* query.preload
      const first = ids(yield* query.toArray)
      yield* query.setWindow({ limit: 2 })
      return { first, then: ids(yield* query.toArray) }
    }))
    expect(shown).toEqual({ first: ["c"], then: ["c", "b"] })
  })

  test("fails with LoadFailed when the rows don't load, and keeps the window", async () => {
    const result = await run(Effect.gen(function*() {
      let serve: "rows" | "fail" = "rows"
      const source = yield* onDemand([note("a", 1), note("b", 2)], () => serve)
      const query = yield* newest(source, 1)
      yield* query.preload
      serve = "fail"
      const error = yield* Effect.flip(query.setWindow({ limit: 2 }))
      return { error: error._tag, window: query.tanstack.utils.getWindow() }
    }))
    expect(result).toEqual({ error: "LoadFailed", window: { offset: 0, limit: 1 } })
  })

  test("fails with LoadFailed on a query with no window", async () => {
    const error = await run(Effect.gen(function*() {
      const collection = yield* notes([note("a", 1)])
      const query = yield* LiveQuery.make((q) => q.from({ note: collection.tanstack }))
      yield* query.preload
      return yield* Effect.flip(query.setWindow({ limit: 1 }))
    }))
    expect(error._tag).toBe("LoadFailed")
  })
})
