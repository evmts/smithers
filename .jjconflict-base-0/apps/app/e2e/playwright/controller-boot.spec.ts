import { expect,test } from "./browserTest"
import { identityRoute } from "./identity"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"

for (const repo of ["nope/nope", "smithersai/smithres"]) {
  test(`a signed-out repository deep link names ${repo} and keeps a keyboard sign-in path`, async ({ page }) => {
    await page.route("**/api/bootstrap", route => route.fulfill({ json: {
      apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
      capabilities: ["identity"], authFlow: "redirect", sandbox: null,
    } }))
    await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(null))
    await page.route(url => url.pathname === `/api/repos/${repo}`, route => route.fulfill({ status: 404, json: { message: "Not found" } }))
    await page.route("**/api/auth/github*", route => route.fulfill({ contentType: "text/html", body: "<p>GitHub sign-in route reached</p>" }))
    await page.goto(`/${repo}/?design=off`)
    const welcome = page.locator(".smithers-chat-message").filter({ hasText: `${repo} isn't on Smithers yet.` })
    await expect(welcome).toContainText("Sign in with GitHub to open your own repositories.")
    await expect(welcome.getByRole("link")).toHaveCount(0)
    await page.reload()
    await expect(welcome).toBeVisible()
    const signIn = welcome.getByRole("button", { name: "Sign in with GitHub", exact: true })
    await signIn.focus()
    await page.keyboard.press("Enter")
    // ?design=off is the test-only fixture switch; since route.2 the page keeps it, so return_to carries it (#4367).
    await expect(page).toHaveURL(url => url.pathname === APPLICATION_SIGN_IN_PATH && url.searchParams.get("return_to")?.replace(/\?design=off$/, "") === `/${repo}/`)
  })
}
