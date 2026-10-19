import { expect, test } from "@playwright/test"

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
