import { Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import { Context, Effect, FiberHandle, Layer } from "effect"
import { CurrentRow, emptyCurrent, IndexRow, PageRow, SearchRow } from "./rows"

// The Docs tab's state (docs/features/docs.md#the-docs-tab): local rows only, read through one live query. Actions reach
// ChatApi's docs routes through `DocsClient`; nothing here does.

type Rows<A extends object> = Collection.Collection<A, string>

/** What the routed docs page shows: the current row, with its repository's index, its page and its search. */
export const docsQuery = (
  current: Rows<CurrentRow>,
  indexes: Rows<IndexRow>,
  pages: Rows<PageRow>,
  searches: Rows<SearchRow>,
) =>
  LiveQuery.make((q) =>
    q
      .from({ current: current.tanstack })
      .leftJoin({ index: indexes.tanstack }, ({ current, index }) => Query.eq(current.repoKey, index.key))
      .leftJoin({ page: pages.tanstack }, ({ current, page }) => Query.eq(current.pageKey, page.key))
      .leftJoin({ search: searches.tanstack }, ({ current, search }) => Query.eq(current.searchKey, search.key))
      .findOne()
  )

const make = Effect.gen(function* () {
  const current = yield* Collection.local<CurrentRow, string>({
    id: "docs-current",
    schema: CurrentRow,
    getKey: (row) => row.id,
    initialData: [emptyCurrent],
  })
  const indexes = yield* Collection.local<IndexRow, string>({ id: "docs-indexes", schema: IndexRow, getKey: (row) => row.key })
  const pages = yield* Collection.local<PageRow, string>({ id: "docs-pages", schema: PageRow, getKey: (row) => row.key })
  const searches = yield* Collection.local<SearchRow, string>({
    id: "docs-searches",
    schema: SearchRow,
    getKey: (row) => row.key,
  })
  return {
    current,
    indexes,
    pages,
    searches,
    docs: yield* docsQuery(current, indexes, pages, searches),
    /** The searchbox's search: typing again interrupts it. */
    searcher: yield* FiberHandle.make<void, never>(),
    /** Where loads run, closed with the store. */
    scope: yield* Effect.scope,
  }
})

/**
 * The Docs tab's state:
 * - `current`: which docs the routed page shows, one row;
 * - `indexes`, `pages`, `searches`: what this tab read, by repository, page and search;
 * - `docs`: the live query the page reads; `searcher` and `scope`.
 */
export class DocsStore extends Context.Service<DocsStore, Effect.Success<typeof make>>()("@smthrs/mvp/docs/DocsStore") {
  /** The store; its collections cleaned up and its loads interrupted with the scope. */
  static readonly layer = Layer.effect(DocsStore, make)
}
