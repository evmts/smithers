import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection, LiveQuery, Persistence, Query } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, Scope } from "effect"
import { VIEWS_SHAPE_ROUTE } from "./contract"
import { SHOWING, Showing, View } from "./schema"

// The conversation's views on this tab (docs/features/web-pages.md#the-browser, decision 0004 §8): the views Postgres
// has, synced by Electric and kept on the device, like the messages; and which one this tab shows full screen. The
// conversation reads them beside its messages (src/features/chat/queries.ts); the full-screen route reads `shown`.

/** Where the views sync from: ChatApi's origin, the site's own. A failed request waits `SyncPolicy.defaultPolicy`. */
export interface ViewsConfig {
  readonly origin: string
}

/** The page this tab shows full screen, once the device has its view: only a `webpage` has a full size. */
export const shownQuery = (views: Collection.Collection<View>, showing: Collection.Collection<Showing, string>) =>
  LiveQuery.make((q) =>
    q
      .from({ showing: showing.tanstack })
      .innerJoin({ view: views.tanstack }, ({ showing, view }) => Query.eq(showing.viewId, view.id))
      .where(({ view }) => Query.eq(view.template, "webpage"))
      .select(({ view }) => ({ id: view.id, url: view.props.url }))
      .findOne()
  )

type Shown<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/**
 * The views' state for one tab:
 * - `views`: the conversation's views in Postgres, synced by Electric and kept on the device; read-only;
 * - `showing`: the view the full-screen route shows, in memory;
 * - `shown`: that view, once the device has it.
 */
export class ViewsStore extends Context.Service<
  ViewsStore,
  {
    readonly views: ElectricCollection.ElectricCollection<View>
    readonly showing: Collection.Collection<Showing, string>
    readonly shown: Shown<typeof shownQuery>
    /**
     * A branch conversation's views (decision 0013 §1), synced and kept on the device like the home conversation's
     * `views`: opened on first use, then the same collection for as long as the store lives.
     */
    readonly forConversation: (conversationId: string) => Effect.Effect<ElectricCollection.ElectricCollection<View>>
    /** The view this tab shows full screen from a branch conversation opened before, once the device has it. */
    readonly shownIn: (conversationId: string) => Shown<typeof shownQuery> | undefined
  }
>()("@smthrs/mvp/views/ViewsStore") {
  /** The store; its collections cleaned up and its Electric shape closed when the scope closes. */
  static readonly layer = (config: ViewsConfig) =>
    Layer.effect(
      ViewsStore,
      Effect.gen(function* () {
        const scope = yield* Effect.scope
        const persistence = yield* Persistence.Persistence
        const views = yield* ElectricCollection.make<View>({
          id: "views",
          schema: View,
          getKey: (row) => row.id,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: {
            url: `${config.origin}${VIEWS_SHAPE_ROUTE}`,
            columnMapper: ElectricCollection.snakeCamelMapper(),
            parser: { int8: (value: string) => Number(value) },
          },
        })
        const showing = yield* Collection.local<Showing, string>({
          id: "views-showing",
          schema: Showing,
          getKey: (row) => row.id,
          initialData: [{ id: SHOWING, viewId: null, conversationId: null }],
        })
        const shown = yield* shownQuery(views, showing)
        const opened = new Map<string, ElectricCollection.ElectricCollection<View>>()
        const shownBy = new Map<string, Shown<typeof shownQuery>>()
        const forConversation = (conversationId: string) =>
          Effect.suspend(() => {
            const known = opened.get(conversationId)
            if (known !== undefined) return Effect.succeed(known)
            return ElectricCollection.make<View>({
              id: `views:${conversationId}`,
              schema: View,
              getKey: (row) => row.id,
              syncMode: "eager",
              persist: { schemaVersion: 1 },
              shape: {
                url: `${config.origin}${VIEWS_SHAPE_ROUTE}?conversation=${encodeURIComponent(conversationId)}`,
                columnMapper: ElectricCollection.snakeCamelMapper(),
                parser: { int8: (value: string) => Number(value) },
              },
            }).pipe(
              Scope.provide(scope),
              Effect.provideService(Persistence.Persistence, persistence),
              Effect.tap((collection) =>
                Effect.flatMap(Scope.provide(shownQuery(collection, showing), scope), (query) =>
                  Effect.sync(() => {
                    opened.set(conversationId, collection)
                    shownBy.set(conversationId, query)
                  }))
              ),
              Effect.orDie,
            )
          })
        return ViewsStore.of({
          views,
          showing,
          shown,
          forConversation,
          shownIn: (conversationId) => shownBy.get(conversationId),
        })
      }),
    )
}
