import { Effect, Schema } from "effect"
import { expect, test } from "vitest"
import { Collection, LiveQuery, Query } from "../src/index.ts"
import { id } from "./fixtures.ts"

// Every re-exported expression, compiled by a real live query over an in-memory collection.

const Item = Schema.Struct({ id: Schema.String, n: Schema.Number, tag: Schema.NullOr(Schema.String) })
type Item = typeof Item.Type

const items: ReadonlyArray<Item> = [
  { id: "a", n: 1, tag: "x" },
  { id: "b", n: 2, tag: null },
  { id: "c", n: 3, tag: "y" }
]

test.each<[string, (item: any) => unknown, ReadonlyArray<string>]>([
  ["eq", (item) => Query.eq(item.n, 2), ["b"]],
  ["gt", (item) => Query.gt(item.n, 2), ["c"]],
  ["gte", (item) => Query.gte(item.n, 2), ["b", "c"]],
  ["lt", (item) => Query.lt(item.n, 2), ["a"]],
  ["lte", (item) => Query.lte(item.n, 2), ["a", "b"]],
  ["and", (item) => Query.and(Query.gt(item.n, 1), Query.lt(item.n, 3)), ["b"]],
  ["or", (item) => Query.or(Query.eq(item.n, 1), Query.eq(item.n, 3)), ["a", "c"]],
  ["not", (item) => Query.not(Query.eq(item.n, 1)), ["b", "c"]],
  ["isNull", (item) => Query.isNull(item.tag), ["b"]],
  ["isUndefined", (item) => Query.isUndefined(item.missing), ["a", "b", "c"]]
])("%s filters as SQL would", async (_, where, expected) => {
  const shown = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Collection.local({
      id: id("items"),
      schema: Item,
      getKey: (row) => row.id,
      initialData: items
    })
    const query = yield* LiveQuery.make((q) =>
      q.from({ item: source.tanstack }).where(({ item }) => where(item) as never).orderBy(({ item }) => item.id)
    )
    yield* query.preload
    return (yield* query.toArray).map(({ id }) => id)
  })))
  expect(shown).toEqual(expected)
})

test("caseWhen picks a value per row", async () => {
  const labels = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Collection.local({
      id: id("items"),
      schema: Item,
      getKey: (row) => row.id,
      initialData: items
    })
    const query = yield* LiveQuery.make((q) =>
      q.from({ item: source.tanstack }).orderBy(({ item }) => item.id).select(({ item }) => ({
        id: item.id,
        label: Query.caseWhen(Query.isNull(item.tag), "none", item.tag)
      }))
    )
    yield* query.preload
    return (yield* query.toArray).map(({ label }) => label)
  })))
  expect(labels).toEqual(["x", "none", "y"])
})

test("coalesce picks the first value that isn't null, typed as never null", async () => {
  const labels = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* Collection.local({
      id: id("items"),
      schema: Item,
      getKey: (row) => row.id,
      initialData: items
    })
    const query = yield* LiveQuery.make((q) =>
      q.from({ item: source.tanstack }).orderBy(({ item }) => item.id).select(({ item }) => ({
        id: item.id,
        label: Query.coalesce(item.tag, "none")
      }))
    )
    yield* query.preload
    const rows = yield* query.toArray
    const label: string = rows[0]!.label
    return [label, ...rows.slice(1).map(({ label }) => label)]
  })))
  expect(labels).toEqual(["x", "none", "y"])
})
