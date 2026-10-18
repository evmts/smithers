/**
 * `@smthrs/artifacts`' `ImmutableCache` over the browser's Cache Storage.
 *
 * Cache Storage belongs to the origin and outlives the tab and the browser,
 * so content read once at a commit SHA opens again without the network,
 * which is what the local-first read path wants. A window, a dedicated worker
 * and a service worker of the origin all reach the same named cache.
 *
 * - The browser may evict the origin's storage under pressure unless the
 *   origin has persistent storage (`StoragePersistence`); a `get` then misses.
 * - A `put` over the origin's quota fails with `QuotaExceededError` as its
 *   `errorName`; `ImmutableCache.readThrough` still answers the read.
 * - Cache Storage needs a secure context: `https:` or `localhost`.
 * - The layer reads the global `caches` unless `options.caches` injects one,
 *   which is how tests give it a cache that refuses.
 *
 * ```ts
 * import { ImmutableCache } from "@smthrs/artifacts"
 * import { BrowserCache } from "@smthrs/platform-browser"
 * import * as Effect from "effect/Effect"
 *
 * const tree = ImmutableCache.readThrough(ImmutableCache.key("repo.tree", repo, sha), fetchTree(repo, sha)).pipe(
 *   Effect.provide(BrowserCache.layer())
 * )
 * ```
 *
 * @since 1.0.0
 */

import { ImmutableCache } from "@smthrs/artifacts"
import type * as Layer from "effect/Layer"

/**
 * The slice of `CacheStorage` the layer uses.
 *
 * @category models
 * @since 1.0.0
 */
export interface CacheStorage {
  readonly open: (name: string) => Promise<ImmutableCache.WebCache>
}

/**
 * - `name`: the cache to open. Defaults to {@link defaultName}.
 * - `maxEntryBytes`: the largest entry stored. Defaults to
 *   `ImmutableCache.defaultMaxEntryBytes`, 8 MiB.
 * - `caches`: the `CacheStorage` to use instead of the global one.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
  readonly name?: string | undefined
  readonly maxEntryBytes?: number | undefined
  readonly caches?: CacheStorage | undefined
}

/**
 * The cache the layer opens when no name is given.
 *
 * @category constants
 * @since 1.0.0
 */
export const defaultName = "smithers-immutable-cache"

/**
 * Provides `ImmutableCache` over Cache Storage, labelled `browser`. A context
 * without `caches`, or one that refuses to open the cache, fails the layer
 * with `unavailable`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (
  options: Options = {}
): Layer.Layer<ImmutableCache.ImmutableCache, ImmutableCache.ImmutableCacheError> =>
  ImmutableCache.layerWebCache({
    backend: "browser",
    maxEntryBytes: options.maxEntryBytes,
    open: async () => {
      const storage = options.caches ?? (globalThis as { readonly caches?: CacheStorage }).caches
      return storage?.open(options.name ?? defaultName)
    }
  })
