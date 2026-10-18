import { expect, test } from "./browserTest"
import { identityRoute } from "./identity"

test("the repo /convert door keeps Chat usable and reload retains the persisted result", async ({ page }) => {
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["agent", "identity", "cloud"], authFlow: "redirect", sandbox: null
  } }))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(null))
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [] } }))
  await page.route("**/api/repos/sponsor/public", route => route.fulfill({ json: { full_name: "sponsor/public", is_public: true, default_bookmark: "main" } }))
  await page.route("**/api/repos/sponsor/public/guest", route => route.fulfill({ json: {
    allowed: true, flow: "guest.chat", sessionId: "opaque-session", revision: "main-tip",
    landingId: "b0c8af15-f9cc-4325-b383-149c13144913"
  } }))
  await page.route(/\/api\/repos\/sponsor\/public\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => route.fulfill({ json: [] }))
  let calls = 0
  let release!: () => void
  const jobs = new Map<string, Promise<{ state: string; effeck: string; effeckVersion: string }>>()
  await page.route("**/api/repos/sponsor/public/guest/conversions", async route => {
    const body = route.request().postDataJSON()
    expect(body.input).toBe('import { Effect } from "effect"')
    expect(body.idempotencyKey).toBeTruthy()
    expect(body.tools).toBeUndefined()
    if (!jobs.has(body.idempotencyKey)) {
      calls++
      jobs.set(body.idempotencyKey, new Promise(resolve => { release = () => resolve({ state: "compiled", effeck: "const value = 1", effeckVersion: "0.0.1" }) }))
    }
    await route.fulfill({ json: await jobs.get(body.idempotencyKey) })
  })
  await page.goto("/sponsor/public?design=off")
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Ask", exact: true }).click()
  const composer = page.getByTestId("composer-input")
  await expect(composer).toBeVisible()
  await composer.fill('/convert import { Effect } from "effect"')
  await composer.press("Enter")
  await expect.poll(() => calls).toBe(1)
  if (!await composer.isVisible()) await page.keyboard.press("Control+k")
  await expect(composer).toBeVisible()
  await expect(composer).toBeEditable()
  await composer.fill("Chat remains available")
  release()
  await expect(page.getByText('"state":"compiled"', { exact: false })).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: "Ask", exact: true }).click()
  await expect(page.getByText('"state":"compiled"', { exact: false })).toBeVisible()
  expect(calls).toBe(1)
})
