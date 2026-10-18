import { Context, Effect, Layer, Metric } from "effect"

// The page the app runs in, as an action may change it. main.tsx's start gives the window's; a test gives its own.

export class Page extends Context.Service<Page, { readonly reload: Effect.Effect<void> }>()("@smthrs/mvp/Page") {
  /** The page whose `reload` calls `reload`: `window.location.reload` in the browser. */
  static readonly layer = (reload: () => void) => Layer.succeed(Page, Page.of({ reload: Effect.sync(reload) }))
}

/** Times the app reloaded the page: a page restored from the back/forward cache. */
export const pageReloads = Metric.counter("smithers_web_page_reloads", {
  description: "Times the app reloaded the page",
  incremental: true,
})

/**
 * Reloads the page, which starts everything over: a page restored from the back/forward cache has lost its device
 * store's connections. Counted and logged first; the page then unloads, so those records reach ChatApi only if an
 * export runs before it does.
 */
export const reload = Effect.gen(function* () {
  yield* Metric.update(pageReloads, 1)
  yield* Effect.logInfo("page reloaded")
  yield* (yield* Page).reload
}).pipe(Effect.annotateLogs({ feature: "app" }))
