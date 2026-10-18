import { expect, test } from "@playwright/test"
import { signedOutVisitor } from "../playwright/identity"

// 88068440 replaces the old Get started link with the static install action.
test("the static landing keeps sign-in and an explicit app entry retains catalog retry", async ({ page, context }, testInfo) => {
  await signedOutVisitor(page)
  await page.goto("/")
  await expect(page.locator(".landing-command")).toContainText("npm i -g smthrs@next")
  await expect(page.getByRole("link", { name: "Sign in", exact: true }))
    .toHaveAttribute("href", "/api/auth/github?return_to=%2F%3Fsigned-in%3Dgithub")
  await expect(page.getByTestId("composer-input")).toHaveCount(0)

  const tab = await context.newPage()
  await signedOutVisitor(tab)
  let catalogs = 0
  await tab.route("**/api/public/repos", route => {
    catalogs++
    return route.fulfill({ status: 503, json: { message: "Catalog unavailable" } })
  })
  await tab.goto("/?tutorial")
  await expect(tab.getByTestId("composer-input")).toBeAttached()
  await expect(tab.getByText(/isn't on Smithers yet/)).toHaveCount(0)
  // The root launcher's Explore section reads the catalog (#4022): a 503 is its
  // own retryable refusal, read once, and never the repository deflection.
  await expect(tab.getByText("The public repositories couldn't be read.")).toBeVisible()
  expect(catalogs).toBe(1)
  await tab.screenshot({ path: testInfo.outputPath("new-tab-app.png"), fullPage: true })
  await tab.close()

  await expect(page.locator("#landing")).toBeVisible()
  await expect(page).toHaveURL("/")
})
