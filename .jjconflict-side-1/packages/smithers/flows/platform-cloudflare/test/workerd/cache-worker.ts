/**
 * The edge cache suite's Worker: `EdgeCache.layer` over the real `caches`
 * global, one cache call per request, so each request reads what an earlier
 * one stored.
 *
 * - `POST /put?path=&cache=`: stores the body, with the `x-metadata` header's
 *   JSON as metadata, under a fixed repository and commit and `path`.
 * - `GET /get?path=&cache=`: what that key holds.
 * - `GET /through?path=&cache=&fail=`: `ImmutableCache.readThrough` over a
 *   source that answers a new random value, or fails when `fail` is set.
 *
 * `cache` names a cache; omitted, the Worker uses `caches.default`. Entries
 * are bounded at 1,024 bytes. Effects run here, at the program boundary.
 */
import { ImmutableCache } from "@smthrs/artifacts"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { EdgeCache } from "../../src/index.ts"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const handle = (request: Request) =>
  Effect.gen(function*() {
    const url = new URL(request.url)
    const key = ImmutableCache.key("repo.blob", "acme/widgets", "a".repeat(40), url.searchParams.get("path") ?? "")
    const cache = yield* ImmutableCache.ImmutableCache
    switch (url.pathname) {
      case "/put": {
        const bytes = new Uint8Array(yield* Effect.promise(() => request.arrayBuffer()))
        const metadata = JSON.parse(request.headers.get("x-metadata") ?? "{}") as Record<string, string>
        return { outcome: yield* cache.put(key, { bytes, metadata }) }
      }
      case "/get":
        return Option.match(yield* cache.get(key), {
          onNone: () => ({ hit: false }),
          onSome: (entry) => ({ hit: true, bytes: [...entry.bytes], metadata: entry.metadata })
        })
      default: {
        const source = url.searchParams.has("fail")
          ? Effect.fail("source unavailable" as const)
          : Effect.sync(() => ({ bytes: encoder.encode(crypto.randomUUID()), metadata: {} }))
        const exit = yield* Effect.exit(ImmutableCache.readThrough(key, source))
        return Exit.isSuccess(exit) ? { value: decoder.decode(exit.value.bytes) } : { failed: true }
      }
    }
  })

export default {
  async fetch(request: Request): Promise<Response> {
    const name = new URL(request.url).searchParams.get("cache") ?? undefined
    const exit = await Effect.runPromiseExit(
      Effect.provide(handle(request), EdgeCache.layer({ name, maxEntryBytes: 1024 }))
    )
    return Exit.isSuccess(exit)
      ? Response.json(exit.value)
      : Response.json({ error: String(Exit.findErrorOption(exit).pipe(Option.getOrUndefined)) }, { status: 500 })
  }
}
