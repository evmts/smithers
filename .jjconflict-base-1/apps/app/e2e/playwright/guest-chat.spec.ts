import { expect, test } from "./browserTest"
import { identityRoute } from "./identity"

test("a signed-out visitor chats on an allowlisted repository and gets sign-in at the spend limit", async ({ page }) => {
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["agent", "identity", "cloud"], authFlow: "redirect", sandbox: null
  } }))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(null))
  // The requested repository is absent from the first catalog page.
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [] } }))
  await page.route("**/api/repos/sponsor/public", route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
  await page.route("**/api/repos/sponsor/public/guest", route => route.fulfill({ json: {
    allowed: true, flow: "guest.chat", sessionId: "opaque-session", revision: "main-tip",
    landingId: "b0c8af15-f9cc-4325-b383-149c13144913"
  } }))
  await page.route(/\/api\/repos\/sponsor\/public\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => route.fulfill({ json: [] }))
  let calls = 0
  await page.route("**/api/repos/sponsor/public/guest/chat", async route => {
    const body = route.request().postDataJSON()
    expect(body.prompt).toBeTruthy()
    expect(body.tools).toBeUndefined()
    expect(body.model).toBeUndefined()
    calls++
    if (calls > 1) return route.fulfill({ status: 429, json: { code: "guest_daily_cap", signIn: true } })
    return route.fulfill({ contentType: "text/event-stream", body: 'data: {"choices":[{"delta":{"content":"A repository answer for this guest."}}]}\n\ndata: [DONE]\n\n' })
  })
  await page.goto("/sponsor/public")
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
  await page.keyboard.press("Control+k")
  const composer = page.getByTestId("composer-input")
  await expect(composer).toBeVisible()
  await composer.fill("How does this repository work?")
  await composer.press("Enter")
  await expect(page.getByText("A repository answer for this guest.", { exact: true })).toBeVisible()
  expect(calls).toBe(1)
  if (!await composer.isVisible()) await page.keyboard.press("Control+k")
  await composer.fill("Ask another question")
  await composer.press("Enter")
  await expect(page.getByRole("button", { name: "Sign in with GitHub", exact: true }).last()).toBeVisible()
  expect(calls).toBe(2)
})
