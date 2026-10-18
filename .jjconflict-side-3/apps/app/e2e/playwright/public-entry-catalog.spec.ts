import { expect, test } from "./browserTest"
import { signedOutVisitor } from "./identity"

// 68f1d894: a catalog listing grants no repository admission. The catalog and repository documents are explicit
// HTTP fixtures. These checks do not claim a hosted coding run executed.
test("a missing repository offers sign-in without catalog alternatives", async ({ page }) => {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [
    { name: "smithers-canary/smithers" },
    { name: "SMITHERS-CANARY/SMITHERS" },
    { name: "other/live" },
    { name: "../secret" },
    { name: "owner/." },
    { name: "owner/<script>" },
    { title: "No repository identity" }
  ] } }))
  await page.route("**/api/repos/smithersai/smithers", route => route.fulfill({ status: 404, json: { message: "Not found" } }))
  await page.goto("/smithersai/smithers/?design=off")
  await expect(page.getByText(/smithersai\/smithers isn't on Smithers yet/)).toBeVisible()
  await expect(page.getByRole("link", { name: "smithers-canary/smithers", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "other/live", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "smithersai/smithers", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "SMITHERS-CANARY/SMITHERS", exact: true })).toHaveCount(0)
  await expect(page.locator('a[href*="secret"], a[href*="script"], a[href="/owner/./"]')).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Sign in with GitHub", exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole("link", { name: "smithers-canary/smithers", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "smithersai/smithers", exact: true })).toHaveCount(0)
})

test("an empty catalog does not suggest an unavailable repository", async ({ page }) => {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [] } }))
  await page.route("**/api/repos/smithersai/smithers", route => route.fulfill({ status: 404, json: { message: "Not found" } }))
  await page.goto("/smithersai/smithers/?design=off")
  await expect(page.getByText(/smithersai\/smithers isn't on Smithers yet/)).toBeVisible()
  await expect(page.getByRole("link", { name: "smithersai/smithers", exact: true })).toHaveCount(0)
  await expect(page.getByText(/pick one below/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Sign in with GitHub", exact: true }).first()).toBeVisible()
})
