import { expect, test } from "@playwright/test"
import { identityRoute } from "../playwright/identity"

test("keyboard takeover at the Astro root consumes its intent and restores the saved app", async ({ context, page }) => {
  const errors: string[] = []
  context.on("page", tab => tab.on("pageerror", error => errors.push(error.message)))
  page.on("pageerror", error => errors.push(error.message))
  await context.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity"], authFlow: "redirect", sandbox: null,
  } }))
  await context.route("**/api/user", identityRoute(null))
  await page.goto("/")
  // The default root is the app (#4041); each writer restores the signed-out app.
  await expect(page.getByTestId("composer-input")).toBeAttached()

  const second = await context.newPage()
  await second.goto("/?tutorial")
  await expect(second.getByRole("heading", { name: "Smithers is open in another tab" })).toBeVisible()
  await second.getByRole("button", { name: "Use Smithers here" }).focus()
  await second.keyboard.press("Enter")
  await expect(second.getByTestId("composer-input")).toBeAttached()
  await expect(page.getByRole("heading", { name: "Smithers moved to another tab" })).toBeVisible()

  /*
   * This document was loaded with no query marker: its explicit request
   * crossed the landing boundary in place, without loading a second document.
   * The address is still the root's own, because the root IS the launcher
   * (#4041) and remounts the app on its own — the entry no longer has to
   * become the addressable `/?tutorial` to stay reloadable (#3861).
   */
  expect(await page.evaluate(() => new URL((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name).search)).toBe("")
  await expect(page).toHaveURL("/")
  await page.getByRole("button", { name: "Use Smithers here" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(second.getByRole("heading", { name: "Smithers moved to another tab" })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem("smithers.writer-takeover"))).toBeNull()

  /*
   * Taking over is a one-shot action, never a stored one: a fresh unmarked
   * entry opens the app because that is what `/` is, and it asks for no
   * takeover of its own — the consumed request was not replayed out of
   * storage.
   */
  await page.goto("/")
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(page.getByRole("heading", { name: "Smithers is open in another tab" })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem("smithers.writer-takeover"))).toBeNull()
  expect(errors).toEqual([])
})
