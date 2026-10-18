/**
 * A tab whose engine worker cannot run, in real Chromium: a worker that
 * throws while it loads makes the tab's requests fail promptly with
 * `EngineUnavailable` instead of waiting forever, and the tab reports why.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as Harness from "./Harness.ts"

type Harnessed = {
  readonly harness: {
    readonly attempt: (flow: string, executionId: string, payload: unknown) => Promise<unknown>
    readonly unavailable: () => Promise<unknown>
  }
}

let server: Awaited<ReturnType<typeof Harness.serve>>

beforeAll(async () => {
  server = await Harness.serve()
})

afterAll(() => server.close())

describe("a tab whose engine worker fails to load", () => {
  it("fails a start promptly with EngineUnavailable, and reports the worker failed", async () => {
    const profile = Harness.profile()
    const context = await Harness.launch(profile.directory)
    try {
      const page = await context.newPage()
      await page.goto(`${server.origin}/?mode=finish&worker=broken`)
      await page.waitForFunction(() => "harness" in globalThis)
      const started = Date.now()
      const attempt = await page.evaluate(() =>
        (globalThis as unknown as Harnessed).harness.attempt("browser-test/Steps", "broken-1", { prefix: "b" })
      )
      expect(attempt).toEqual({ ok: false, tag: "@smthrs/platform-browser/EngineUnavailable", reason: "worker-failed" })
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(await page.evaluate(() => (globalThis as unknown as Harnessed).harness.unavailable())).toEqual({
        _tag: "@smthrs/platform-browser/EngineUnavailable",
        reason: "worker-failed",
        error: "ErrorEvent"
      })
    } finally {
      await context.close()
      profile.remove()
    }
  }, 60_000)
})
