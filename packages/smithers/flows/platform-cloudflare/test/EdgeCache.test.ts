/**
 * `EdgeCache.layer` from Node, over workerd's real Cache API: Miniflare's
 * `getCaches()` reaches the same caches a Worker's `caches` global does.
 * Faults are injected as a `CacheStorage` that has no default or refuses to
 * open. `EdgeCache.workerd.test.ts` runs the layer inside a Worker.
 */
import { ImmutableCache } from "@smthrs/artifacts"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { Miniflare } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { EdgeCache } from "../src/index.ts"

let worker: Miniflare
let caches: EdgeCache.CacheStorage

beforeAll(async () => {
  worker = new Miniflare({
    workers: [{
      config: {
        name: "edge-cache",
        compatibilityDate: "2026-10-01",
        manifest: {
          mainModule: "worker.js",
          modules: { "worker.js": { type: "esm", contents: "export default { fetch: () => new Response() }" } }
        }
      }
    }]
  })
  caches = (await worker.getCaches()) as unknown as EdgeCache.CacheStorage
}, 60_000)

afterAll(() => worker?.dispose())

const run = <A, E>(
  effect: Effect.Effect<A, E, ImmutableCache.ImmutableCache>,
  layer: Layer.Layer<ImmutableCache.ImmutableCache, ImmutableCache.ImmutableCacheError>
) => Effect.runPromise(Effect.exit(Effect.provide(effect, layer)))

const get = (key: ImmutableCache.Key) => Effect.flatMap(ImmutableCache.ImmutableCache, (cache) => cache.get(key))
const put = (key: ImmutableCache.Key, entry: ImmutableCache.Entry) =>
  Effect.flatMap(ImmutableCache.ImmutableCache, (cache) => cache.put(key, entry))

const every = Uint8Array.from({ length: 256 }, (_, index) => index)
const unique = () => ImmutableCache.key("repo.blob", "acme/widgets", crypto.randomUUID(), "src/index.ts")
const valueOf = <A>(exit: Exit.Exit<A, unknown>): A => {
  if (Exit.isFailure(exit)) throw new Error(`expected a success, got ${String(exit.cause)}`)
  return exit.value
}

describe("EdgeCache.layer over workerd's caches", () => {
  it("misses, stores, and answers the stored bytes and metadata from caches.default", async () => {
    const key = unique()
    const layer = EdgeCache.layer({ caches })
    const result = valueOf(
      await run(
        Effect.gen(function*() {
          const before = yield* get(key)
          const stored = yield* put(key, { bytes: every, metadata: { blobSha: "b".repeat(40) } })
          return { before, stored }
        }),
        layer
      )
    )
    expect(Option.isNone(result.before)).toBe(true)
    expect(result.stored).toBe("stored")
    // A layer built again reads what the first stored: the entry is in workerd's cache.
    const entry = Option.getOrThrow(valueOf(await run(get(key), EdgeCache.layer({ caches }))))
    expect([...entry.bytes]).toEqual([...every])
    expect(entry.metadata).toEqual({ blobSha: "b".repeat(40) })
  })

  it("keeps a named cache apart from caches.default", async () => {
    const key = unique()
    expect(valueOf(await run(put(key, { bytes: every, metadata: {} }), EdgeCache.layer({ caches, name: "repo" }))))
      .toBe("stored")
    expect(Option.isSome(valueOf(await run(get(key), EdgeCache.layer({ caches, name: "repo" }))))).toBe(true)
    expect(Option.isNone(valueOf(await run(get(key), EdgeCache.layer({ caches }))))).toBe(true)
  })

  it("refuses an entry over maxEntryBytes and stores nothing", async () => {
    const key = unique()
    const layer = EdgeCache.layer({ caches, maxEntryBytes: 255 })
    expect(valueOf(await run(put(key, { bytes: every, metadata: {} }), layer))).toBe("too_large")
    expect(Option.isNone(valueOf(await run(get(key), layer)))).toBe(true)
  })
})

describe("EdgeCache.layer without a cache", () => {
  const unavailable = (errorName?: string) =>
    new ImmutableCache.ImmutableCacheError({
      backend: "cloudflare",
      operation: "open",
      reason: "unavailable",
      ...(errorName === undefined ? {} : { errorName })
    })

  const failureOf = (exit: Exit.Exit<unknown, unknown>) => Option.getOrThrow(Exit.findErrorOption(exit))

  it("fails with unavailable where the runtime has no caches global, as Node has none", async () => {
    expect((globalThis as { caches?: unknown }).caches).toBeUndefined()
    expect(failureOf(await run(get(unique()), EdgeCache.layer()))).toEqual(unavailable())
  })

  it("fails with unavailable when caches has no default, as a browser's has none", async () => {
    const browserLike: EdgeCache.CacheStorage = { open: () => caches.open("unused") }
    expect(failureOf(await run(get(unique()), EdgeCache.layer({ caches: browserLike })))).toEqual(unavailable())
  })

  it("fails with unavailable and the error's name when opening a named cache rejects", async () => {
    const refusing: EdgeCache.CacheStorage = {
      default: caches.default,
      open: () => Promise.reject(new TypeError("refused"))
    }
    expect(failureOf(await run(get(unique()), EdgeCache.layer({ caches: refusing, name: "repo" }))))
      .toEqual(unavailable("TypeError"))
  })
})
