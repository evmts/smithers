/** Known product gaps. Run SPEC_PRODUCT_GAPS=1; failures are retained, never inverted or skipped. */
import { test, expect } from "@playwright/test"
import { resolve } from "node:path"
import { staticServer } from "./staticServer"
let host: Awaited<ReturnType<typeof staticServer>>
test.beforeAll(async () => { host = await staticServer(resolve("dist-spec")) })
test.afterAll(async () => { await host.close() })
for (const [repo, path] of [["effeck/effeck", "docs/user/src/001-onboarding.md"], ["smithers-canary/smithers", "src/runtime.ts"]]) {
  test(`${repo} shows the whole ${path} (L3/L4)`, async ({ page }) => {
    await page.goto(`${host.origin}/${repo}`)
    await page.getByRole("button", { name: "Chat", exact: true }).click()
    const input = page.getByTestId("composer-input")
    await input.fill(`/file ${path} ${repo}`)
    await input.press("Enter")
    const card = page.getByRole("region", { name: `File · ${repo} · ${path}`, exact: true })
    await expect(card).toBeVisible()
    await expect(card.getByText("Truncated", { exact: true })).toHaveCount(0)
    await expect.poll(async () => {
      await card.locator(".cm-scroller").evaluate(node => { node.scrollTop = node.scrollHeight })
      return card.textContent()
    }).toContain(repo === "effeck/effeck" ? "END OF EFFECK ONBOARDING" : "END OF LONG TYPESCRIPT FILE")
    await page.evaluate(() => window.__spec.assertClean())
    expect(host.escapes).toEqual([])
  })
}
test("README headings retain their accessible role", async ({ page }) => {
  await page.goto(`${host.origin}/maya/tinyhttp`)
  const home = page.getByRole("region", { name: "maya/tinyhttp home", exact: true })
  await expect(home).toContainText("A small HTTP server")
  await expect(home.getByRole("heading", { level: 1, name: "tinyhttp", exact: true })).toBeVisible()
})
