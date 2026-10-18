/**
 * TanStack DB's browser persistence on `SharedSqlite` in real Chromium, as an
 * app composes it: several persisted collections on one persistence, TanStack's
 * tab coordinator, and the engine's leader running every statement. TanStack
 * adds a column and treats SQLite's own "duplicate column name" message as
 * "already there", so a refusal must carry that message.
 */
import type { BrowserContext, Page } from "playwright"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as Harness from "./Harness.ts"

interface Collection {
  readonly status: string
  readonly rows: ReadonlyArray<{ readonly id: string; readonly value: number }>
}

type Harnessed = {
  readonly tanstackHarness: {
    readonly read: () => Promise<ReadonlyArray<Collection>>
    readonly insert: (id: string) => Promise<void>
  }
}

let server: Awaited<ReturnType<typeof Harness.serve>>

beforeAll(async () => {
  server = await Harness.serve()
})

afterAll(() => server.close())

const open = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage()
  if (process.env.BROWSER_TEST_DEBUG) {
    page.on("console", (message) => process.stdout.write(`[tanstack] ${message.text()}\n`))
    page.on("pageerror", (error) => process.stdout.write(`[tanstack] pageerror ${error.message}\n`))
    page.on("requestfailed", (request) => process.stdout.write(`[tanstack] failed ${request.url()}\n`))
    page.on(
      "response",
      (response) =>
        response.status() >= 400 && process.stdout.write(`[tanstack] ${response.status()} ${response.url()}\n`)
    )
  }
  await page.goto(`${server.origin}/tanstack`)
  await page.waitForFunction(() => "tanstackHarness" in globalThis, undefined, { timeout: 30_000 })
  return page
}

const read = (page: Page) => page.evaluate(() => (globalThis as unknown as Harnessed).tanstackHarness.read())

describe("TanStack DB's persistence on SharedSqlite in Chromium", () => {
  it("opens every collection, keeps what one tab writes, and restores it in another tab and after a reload", async () => {
    const profile = Harness.profile()
    const context = await Harness.launch(profile.directory)
    try {
      const a = await open(context)
      expect((await read(a)).map((collection) => collection.status)).toEqual(["ready", "ready", "ready"])
      await a.evaluate(() => (globalThis as unknown as Harnessed).tanstackHarness.insert("one"))

      const b = await open(context)
      expect(await read(b)).toEqual([
        { status: "ready", rows: [{ id: "one", value: 0 }] },
        { status: "ready", rows: [{ id: "one", value: 1 }] },
        { status: "ready", rows: [{ id: "one", value: 2 }] }
      ])

      await a.close()
      await b.reload()
      await b.waitForFunction(() => "tanstackHarness" in globalThis, undefined, { timeout: 30_000 })
      expect((await read(b)).map((collection) => collection.rows.length)).toEqual([1, 1, 1])
    } finally {
      await context.close()
      profile.remove()
    }
  })
})
