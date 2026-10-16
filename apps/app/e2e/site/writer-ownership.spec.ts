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
  await page.getByRole("link", { name: "Get started for free", exact: true }).focus()
  await page.keyboard.press("Enter")
  // Each writer restores the signed-out app.
  await expect(page.getByTestId("composer-input")).toBeAttached()

  const second = await context.newPage()
  await second.goto("/?tutorial")
  await expect(second.getByRole("heading", { name: "Smithers is open in another tab" })).toBeVisible()
  await second.getByRole("button", { name: "Use Smithers here" }).focus()
  await second.keyboard.press("Enter")
  await expect(second.getByTestId("composer-input")).toBeAttached()
  await expect(page.getByRole("heading", { name: "Smithers moved to another tab" })).toBeVisible()

  // This document was loaded with no query marker: its explicit request crossed
  // the landing boundary in place, and the app it mounted made that entry
  // addressable (#3861) without loading a second document.
  expect(await page.evaluate(() => new URL((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name).search)).toBe("")
  await expect(page).toHaveURL("/?tutorial")
  await page.getByRole("button", { name: "Use Smithers here" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(second.getByRole("heading", { name: "Smithers moved to another tab" })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem("smithers.writer-takeover"))).toBeNull()

  // An unmarked landing entry still shows the landing: taking over is a one-shot
  // action, never a stored one. (A reload of the addressable entry above
  // resumes the app by its own marker, which is #3861's behaviour, not this.)
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Get started for free", exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
