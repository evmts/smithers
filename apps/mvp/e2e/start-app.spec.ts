import { expect, test } from "./fixtures"

test("a first-time visitor sees the landing and clicks Get started for free", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Smithers" })).toBeVisible()
  await expect(page.getByText("Automate maintaining your codebase")).toBeVisible()
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/smithersai/smithers")

  await page.getByRole("link", { name: "Get started for free" }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole("main", { name: "App" })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole("link", { name: "Get started for free" })).toBeVisible()
})

// A browser that offers no site storage, as some locked-down browsers do: the app says so and offers a retry
// instead of a blank page.
test("a browser without site storage sees why chat can't open and can try again", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "storage", { get: () => undefined }))
  await page.goto("/app")
  await expect(page.getByRole("alert")).toHaveText("Smithers couldn't open your conversations.", { timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
})
