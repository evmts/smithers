/**
 * `BrowserCache.layer` under Node, where `caches` does not exist: the cache
 * it opens is injected, either `ImmutableCache.makeMemoryWebCache` or a
 * `CacheStorage` that refuses. Real Cache Storage is exercised in Chromium
 * by `test/browser/Cache.test.ts`.
 */
import { describe, expect, it } from "@effect/vitest"
import { ImmutableCache } from "@smthrs/artifacts"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { BrowserCache } from "../src/index.ts"

const run = <A, E>(
  effect: Effect.Effect<A, E, ImmutableCache.ImmutableCache>,
  layer: Layer.Layer<ImmutableCache.ImmutableCache, ImmutableCache.ImmutableCacheError>
) => Effect.runPromise(Effect.exit(Effect.provide(effect, layer)))

const key = ImmutableCache.key("repo.tree", "acme/widgets", "a".repeat(40))
const get = Effect.flatMap(ImmutableCache.ImmutableCache, (cache) => cache.get(key))
const put = (bytes: Uint8Array) =>
  Effect.flatMap(ImmutableCache.ImmutableCache, (cache) => cache.put(key, { bytes, metadata: {} }))

/** A `CacheStorage` over memory caches, recording the names it opened. */
const storage = () => {
  const opened: Array<string> = []
  const caches = new Map<string, ImmutableCache.WebCache>()
  const open = async (name: string) => {
    opened.push(name)
    const cache = caches.get(name) ?? ImmutableCache.makeMemoryWebCache()
    caches.set(name, cache)
    return cache
  }
  return { opened, caches: { open } satisfies BrowserCache.CacheStorage }
}

const unavailable = (errorName?: string) =>
  new ImmutableCache.ImmutableCacheError({
    backend: "browser",
    operation: "open",
    reason: "unavailable",
    ...(errorName === undefined ? {} : { errorName })
  })

const failureOf = (exit: Exit.Exit<unknown, unknown>) => Option.getOrThrow(Exit.findErrorOption(exit))

describe("BrowserCache.layer", () => {
  it("opens the default cache, and a stored entry reads back from it", async () => {
    const { caches, opened } = storage()
    const exit = await run(
      Effect.gen(function*() {
        return { stored: yield* put(new Uint8Array([1, 2, 3])), got: yield* get }
      }),
      BrowserCache.layer({ caches })
    )
    const result = Exit.isSuccess(exit) ? exit.value : undefined
    expect(result?.stored).toBe("stored")
    expect([...Option.getOrThrow(result!.got).bytes]).toEqual([1, 2, 3])
    expect(opened).toEqual([BrowserCache.defaultName])
  })

  it("opens a named cache, bounded by maxEntryBytes", async () => {
    const { caches, opened } = storage()
    const exit = await run(put(new Uint8Array(3)), BrowserCache.layer({ caches, name: "repo", maxEntryBytes: 2 }))
    expect(Exit.isSuccess(exit) && exit.value).toBe("too_large")
    expect(opened).toEqual(["repo"])
  })

  it("fails with unavailable where there is no caches global, as in Node", async () => {
    expect((globalThis as { caches?: unknown }).caches).toBeUndefined()
    expect(failureOf(await run(get, BrowserCache.layer()))).toEqual(unavailable())
  })

  it("fails with unavailable and the error's name when the browser refuses to open the cache", async () => {
    const refusing: BrowserCache.CacheStorage = {
      open: () => Promise.reject(new DOMException("insecure context", "SecurityError"))
    }
    expect(failureOf(await run(get, BrowserCache.layer({ caches: refusing })))).toEqual(unavailable("SecurityError"))
  })
})
