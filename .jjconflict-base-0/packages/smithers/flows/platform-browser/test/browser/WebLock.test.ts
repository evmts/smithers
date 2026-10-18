/**
 * `WebLock.hold` with `steal` in real Chromium, between two tabs of one
 * origin: the tab a person focuses takes the lock at once, and the tab that
 * held it learns it lost it (decision 0002's focused tab).
 */
import type { Page } from "playwright"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as Harness from "./Harness.ts"

type Harnessed = {
  readonly harness: {
    readonly hold: (name: string) => Promise<void>
    readonly steal: (name: string) => Promise<void>
    readonly lost: (name: string) => boolean | undefined
    readonly release: (name: string) => Promise<void>
  }
}

let server: Awaited<ReturnType<typeof Harness.serve>>

beforeAll(async () => {
  server = await Harness.serve()
})

afterAll(() => server.close())

const call = (page: Page, method: "hold" | "steal" | "release", name: string): Promise<void> =>
  page.evaluate(([method, name]) => (globalThis as unknown as Harnessed).harness[method](name), [method, name] as const)

const lost = (page: Page, name: string): Promise<boolean | undefined> =>
  page.evaluate((name) => (globalThis as unknown as Harnessed).harness.lost(name), name)

/** How many contexts hold `name` and wait for it. */
const holders = (page: Page, name: string) =>
  page.evaluate(
    (name) =>
      navigator.locks.query().then((state) => ({
        held: (state.held ?? []).filter((lock) => lock.name === name).length,
        pending: (state.pending ?? []).filter((lock) => lock.name === name).length
      })),
    name
  )

describe("WebLock in Chromium", () => {
  it("steals a lock another tab holds at once, and that tab learns it lost the lock", async () => {
    const profile = Harness.profile()
    const context = await Harness.launch(profile.directory)
    try {
      const a = await Harness.open(context, server.origin, "finish")
      const b = await Harness.open(context, server.origin, "finish")
      await call(a, "hold", "focus")
      expect(await lost(a, "focus")).toBe(false)
      await call(b, "steal", "focus")
      await a.waitForFunction(() => (globalThis as unknown as Harnessed).harness.lost("focus") === true)
      expect(await lost(b, "focus")).toBe(false)
      expect(await holders(b, "focus")).toEqual({ held: 1, pending: 0 })
      // A gives back nothing it no longer holds; B's lock stands until B lets go.
      await call(a, "release", "focus")
      expect(await holders(b, "focus")).toEqual({ held: 1, pending: 0 })
      await call(b, "release", "focus")
      expect(await holders(b, "focus")).toEqual({ held: 0, pending: 0 })
    } finally {
      await context.close()
      profile.remove()
    }
  })
})
