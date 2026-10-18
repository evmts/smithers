import { test, expect } from "@playwright/test"
import { resolve } from "node:path"
import { staticServer } from "./staticServer"
let host: Awaited<ReturnType<typeof staticServer>>
test.beforeAll(async () => { host = await staticServer(resolve("dist-spec")) })
test.afterAll(async () => { await host.close() })
test.afterEach(() => { expect(host.escapes).toEqual([]) })
test("unknown routes fail visibly and remain in the harness log", async ({ page }) => {
  await page.goto(`${host.origin}/maya/tinyhttp`)
  await page.waitForFunction(() => window.__spec !== undefined)
  const status = await page.evaluate(async () => (await fetch("/api/spec-unknown", { method: "PATCH" })).status)
  expect(status).toBe(599)
  await expect(page.getByRole("alert").filter({ hasText: "Fixture failure: PATCH /api/spec-unknown" })).toBeVisible()
  expect(await page.evaluate(() => window.__spec.failures)).toContain("Fixture failure: PATCH /api/spec-unknown")
})
