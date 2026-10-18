import { expect, test } from "./browserTest"
import { identityRoute } from "./identity"

test.beforeEach(async ({ page }) => {
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["agent", "identity", "cloud", "cloud.terminal"], authFlow: "native-handoff", sandbox: null,
  } }))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(null))
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "smithersai/smithers" }] } }))
  await page.route("**/api/repos/smithersai/smithers/contents", route => route.fulfill({ json: [] }))
})

test("Cmd+K opens the composer from a focused text input, and typing still works", async ({ page }) => {
  await page.goto("/smithersai/smithers/")
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
  await page.keyboard.press("Control+k")
  const composer = page.getByTestId("composer-input")
  await composer.fill("/file")
  await composer.press("Enter")
  const path = page.locator(".flow-form[data-flow-name='file']").getByTestId("flow-form-path")
  await expect(path).toBeFocused()
  await page.keyboard.type("abc")
  await expect(path).toHaveValue("abc")
  await page.keyboard.press("Meta+k")
  await expect(composer).toBeVisible()
  await expect(composer).toBeFocused()
})
