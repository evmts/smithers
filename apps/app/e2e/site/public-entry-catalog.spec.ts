import { expect, test } from "@playwright/test"
import { signedOutVisitor } from "../playwright/identity"

test("opening Get started in a new tab opens the same app as an ordinary click", async ({ page, context }, testInfo) => {
  await signedOutVisitor(page)
  await page.goto("/")
  const start = page.getByRole("link", { name: "Get started for free", exact: true })
  await expect(start).toBeVisible()
  await expect(start).toHaveAttribute("href", "/?tutorial")
  const entry = await start.getAttribute("href") ?? ""

  // Exercise the link's browser navigation path independently of the click
  // handler that mounts the app in the existing document.
  const tab = await context.newPage()
  await signedOutVisitor(tab)
  let catalogs = 0
  await tab.route("**/api/public/repos", route => {
    catalogs++
    return route.fulfill({ status: 503, json: { message: "Catalog unavailable" } })
  })
  await tab.goto(entry)
  await expect(tab.getByTestId("composer-input")).toBeAttached()
  await expect(tab.getByText(/isn't on Smithers yet/)).toHaveCount(0)
  // The root launcher's Explore section reads the catalog (#4022): a 503 is its
  // own retryable refusal, read once, and never the repository deflection.
  await expect(tab.getByText("The public repositories couldn't be read.")).toBeVisible()
  expect(catalogs).toBe(1)
  await tab.screenshot({ path: testInfo.outputPath("new-tab-app.png"), fullPage: true })
  await tab.close()

  await start.click()
  await expect(page.getByTestId("composer-input")).toBeAttached()
  // The same app, at the same addressable entry the new tab opened (#3861).
  await expect(page).toHaveURL(entry)
})
