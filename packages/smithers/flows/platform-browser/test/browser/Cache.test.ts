/**
 * `BrowserCache.layer` in real Chromium, over the origin's real Cache
 * Storage: an entry reads back byte for byte, survives the browser being
 * killed, and lives in the default named cache; an entry over the bound and a
 * failed read are never stored.
 */
import type { Page } from "playwright"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as Harness from "./Harness.ts"

/** `window.cacheHarness` in `app/cache.ts`. */
interface CacheHarness {
  readonly put: (path: string, bytes: ReadonlyArray<number>, metadata: Record<string, string>) => Promise<string>
  readonly get: (path: string) => Promise<unknown>
  readonly through: (path: string, fail: boolean) => Promise<unknown>
  readonly names: () => Promise<ReadonlyArray<string>>
}

let server: Awaited<ReturnType<typeof Harness.serve>>

beforeAll(async () => {
  server = await Harness.serve()
})

afterAll(() => server.close())

const open = async (context: Awaited<ReturnType<typeof Harness.launch>>): Promise<Page> => {
  const page = await context.newPage()
  await page.goto(`${server.origin}/cache`)
  await page.waitForFunction(() => "cacheHarness" in globalThis)
  return page
}

/** Calls `method` of the page's cache harness with `args`. */
const call = <M extends keyof CacheHarness>(
  page: Page,
  method: M,
  ...args: Parameters<CacheHarness[M]>
): Promise<Awaited<ReturnType<CacheHarness[M]>>> =>
  page.evaluate(
    ([method, args]) =>
      ((globalThis as unknown as { cacheHarness: Record<string, (...args: Array<unknown>) => unknown> })
        .cacheHarness[method]!)(...args),
    [method, args] as const
  ) as Promise<Awaited<ReturnType<CacheHarness[M]>>>

const every = Array.from({ length: 256 }, (_, index) => index)

describe("BrowserCache in Chromium", () => {
  it("reads back exactly what it stored, in the default cache, after the browser is killed", async () => {
    const profile = Harness.profile()
    try {
      const first = await Harness.launch(profile.directory)
      const a = await open(first)
      expect(await call(a, "get", "a.bin")).toEqual({ hit: false })
      expect(await call(a, "put", "a.bin", every, { blobSha: "b" })).toBe("stored")
      expect(await call(a, "names")).toEqual(["smithers-immutable-cache"])
      Harness.kill(profile.directory)
      await first.close().catch(() => undefined)

      const second = await Harness.launch(profile.directory)
      try {
        const b = await open(second)
        expect(await call(b, "get", "a.bin")).toEqual({ hit: true, bytes: every, metadata: { blobSha: "b" } })
      } finally {
        await second.close()
      }
    } finally {
      profile.remove()
    }
  })

  it("stores nothing over the entry bound, and never stores a failed read", async () => {
    const profile = Harness.profile()
    const context = await Harness.launch(profile.directory)
    try {
      const page = await open(context)
      expect(await call(page, "put", "big.bin", Array.from({ length: 1025 }, () => 0), {})).toBe("too_large")
      expect(await call(page, "get", "big.bin")).toEqual({ hit: false })

      expect(await call(page, "through", "t.txt", true)).toEqual({ failed: true })
      expect(await call(page, "get", "t.txt")).toEqual({ hit: false })
      const first = await call(page, "through", "t.txt", false)
      // The source answers a new random value each time, so the same value means the cache answered.
      expect(await call(page, "through", "t.txt", false)).toEqual(first)
      expect(await call(page, "through", "t.txt", true)).toEqual(first)
    } finally {
      await context.close()
      profile.remove()
    }
  })
})
