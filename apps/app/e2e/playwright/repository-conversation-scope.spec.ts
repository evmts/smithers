import { expect, test, type Page } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"

const A = "smithersai/vibelang", B = "smithers-canary/smithers"
const fixture = async (page: Page) => {
  await signedOutVisitor(page)
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
  await page.route("**/api/user/repos", route => route.fulfill({ json: [] }))
  await page.route("**/api/user/orgs", route => route.fulfill({ json: [] }))
  for (const repo of [A, B]) {
    await page.route(url => url.pathname === `/api/repos/${repo}`, route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
    await page.route(`**/api/repos/${repo}/home`, route => route.fulfill({ json: { kind: "none" } }))
    await page.route(`**/api/repos/${repo}/bookmarks**`, route => route.fulfill({ json: { items: [{ name: "main" }], next_cursor: "" } }))
    await page.route(url => url.pathname === `/api/repos/${repo}/contents`, route => route.fulfill({ json: [{ name: "package.json", path: "package.json", type: "file" }] }))
    await page.route(`**/api/repos/${repo}/contents/package.json`, route => route.fulfill({ json: { path: "package.json", content: JSON.stringify({ name: repo }), encoding: "utf-8", size: 50 } }))
  }
}

test("repository Ask retains the right file and form through another-tab writer takeover and return", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixture(page)
  await page.goto(`/${A}`)
  const ask = page.getByRole("complementary", { name: "Ask", exact: true })
  await expect(ask).toBeVisible()
  const composer = ask.getByTestId("composer-input")
  await composer.fill("/file"); await composer.press("Enter")
  const form = ask.locator('.flow-form[data-flow-name="file"]')
  await expect(form).toBeVisible()
  await form.getByTestId("flow-form-path").fill("package.json")
  // The form has the same native keyboard submission as the person uses.
  await form.getByTestId("flow-form-path").press("Enter")
  await expect(ask.locator('[data-kind="file"]')).toContainText(A)
  const second = await context.newPage()
  await second.setViewportSize({ width: 1440, height: 900 }); await fixture(second)
  await second.goto(`/${B}`)
  await expect(second.getByRole("heading", { name: "Smithers is open in another tab" })).toBeVisible()
  await second.getByRole("button", { name: "Use Smithers here" }).click()
  const secondAsk = second.getByRole("complementary", { name: "Ask", exact: true })
  await expect(secondAsk).toBeVisible()
  await expect(secondAsk.locator('.flow-form[data-flow-name="file"]')).toHaveCount(0)
  await expect(secondAsk.locator('[data-kind="file"]')).toHaveCount(0)
  await expect(secondAsk).not.toContainText(A)
  await second.reload()
  await expect(secondAsk).toBeVisible()
  await expect(secondAsk).not.toContainText(A)
  await second.goto(`/${A}`)
  await expect(secondAsk.locator('[data-kind="file"]')).toContainText(A)
  await expect(secondAsk.locator('.flow-form[data-flow-name="file"]')).toBeVisible()
  await expect(secondAsk).not.toContainText(B)
})
