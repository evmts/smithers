/**
 * The cache suite's page: `BrowserCache.layer` over this origin's real Cache
 * Storage, exposed to Playwright as `window.cacheHarness`. Each call builds
 * the layer again, so it reads only what Cache Storage kept. Entries are
 * bounded at 1,024 bytes.
 */
import { ImmutableCache } from "@smthrs/artifacts"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { BrowserCache } from "../../../src/index.ts"

const key = (path: string) => ImmutableCache.key("repo.blob", "acme/widgets", "a".repeat(40), path)

const run = <A>(effect: Effect.Effect<A, ImmutableCache.ImmutableCacheError, ImmutableCache.ImmutableCache>) =>
  Effect.runPromise(Effect.provide(effect, BrowserCache.layer({ maxEntryBytes: 1024 })))

const cache = ImmutableCache.ImmutableCache

Object.assign(globalThis, {
  cacheHarness: {
    put: (path: string, bytes: ReadonlyArray<number>, metadata: Record<string, string>) =>
      run(Effect.flatMap(cache, (c) => c.put(key(path), { bytes: Uint8Array.from(bytes), metadata }))),
    get: (path: string) =>
      run(Effect.flatMap(cache, (c) => c.get(key(path)))).then(Option.match({
        onNone: () => ({ hit: false }),
        onSome: (entry) => ({ hit: true, bytes: [...entry.bytes], metadata: entry.metadata })
      })),
    through: (path: string, fail: boolean) =>
      run(Effect.exit(ImmutableCache.readThrough(
        key(path),
        fail
          ? Effect.fail("source unavailable" as const)
          : Effect.sync(() => ({ bytes: new TextEncoder().encode(crypto.randomUUID()), metadata: {} }))
      ))).then((exit) =>
        Exit.isSuccess(exit) ? { value: new TextDecoder().decode(exit.value.bytes) } : { failed: true }
      ),
    names: () => caches.keys()
  }
})
