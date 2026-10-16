import { expect, test } from "@playwright/test"
import { signedOutVisitor } from "../playwright/identity"

test("the published entry link opens the same app in a new tab as the default root opens in place", async ({ page, context }, testInfo) => {
  await signedOutVisitor(page)
  /*
   * The default root mounts the app by itself (#4041), so the document's own
   * entry link is read while a failed import leaves the page on screen. The
   * link is still the href a middle-click or a new tab follows.
   */
  await page.route(/\/_astro\/AppIsland\.[^/]+\.js$/, route => route.abort())
  await page.goto("/")
  // Hidden, because the failed entry took it out of the page's own doors.
  const start = page.locator("#start")
  await expect(start).toContainText("Get started for free")
  await expect(start).toHaveAttribute("href", "/?tutorial")
  const entry = await start.getAttribute("href") ?? ""

  // Exercise the link's browser navigation path independently of the document
  // that mounts the app in place.
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

  /*
   * The same app in place at the default root, with no press. The address is
   * the root's own (#4041): it is the launcher, so it is not moved to the
   * addressable `/?tutorial` entry to stay reloadable.
   */
  const direct = await context.newPage()
  await signedOutVisitor(direct)
  await direct.goto("/")
  await expect(direct.getByTestId("composer-input")).toBeAttached()
  await expect(direct.getByTestId("repository-launcher")).toBeVisible()
  await expect(direct).toHaveURL("/")
  await direct.close()
})
