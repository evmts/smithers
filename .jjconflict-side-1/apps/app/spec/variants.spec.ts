import { test, expect, type Page } from "@playwright/test"
import { resolve } from "node:path"
import { staticServer } from "./staticServer"
let host: Awaited<ReturnType<typeof staticServer>>
test.beforeAll(async () => { host = await staticServer(resolve("dist-spec")) })
test.afterAll(async () => { await host.close() })
test.afterEach(async ({ page }) => {
  expect(host.escapes).toEqual([])
  await page.evaluate(() => window.__spec.assertClean())
})
const command = async (page: Page, line: string) => {
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
  const input = page.getByTestId("composer-input")
  if (!await input.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).click()
  await input.fill(line)
  await input.press("Enter")
}
test("issue read errors stay visible and never become an empty list (L4)", async ({ page }) => {
  await page.goto(`${host.origin}/smithers-canary/smithers?as=out&data=full&net=error`)
  await command(page, "/issues.list open smithers-canary/smithers")
  const error = page.getByRole("region", { name: "Issues · smithers-canary/smithers", exact: true })
  await expect(error).toHaveAttribute("data-status", "error")
  await expect(error).toContainText("503")
  expect(await page.evaluate(() => window.__spec.requests)).toContain("GET /api/repos/smithers-canary/smithers/issues")
  await expect(page.getByText("No open issues", { exact: false })).toHaveCount(0)
})
test("Effeck home keeps the converter off and shows README (L3)", async ({ page }) => {
  await page.goto(`${host.origin}/effeck/effeck?as=out&data=full&net=ok`)
  const home = page.getByRole("region", { name: "effeck/effeck home", exact: true })
  await expect(home).toContainText("Install Effeck")
  await expect(home).toContainText("Compile effectful programs")
  await expect(home.getByRole("button", { name: "Convert", exact: true })).toHaveCount(0)
})
test("empty and slow data keep the selected member world", async ({ page }) => {
  await page.goto(`${host.origin}/maya/tinyhttp?as=member&data=empty&net=slow`)
  await command(page, "/files / maya/tinyhttp")
  await expect(page.locator('[data-kind="file-list"]').last()).toContainText("Nothing under /")
  expect(await page.evaluate(() => ({ viewer: window.__spec.world.viewer, variants: window.__spec.world.variants }))).toEqual({ viewer: { username: "maya" }, variants: { as: "member", data: "empty", net: "slow" } })
})
