import { expect, test } from "./devices"

test("system theme: the button follows changes before a preference exists", { annotation: { type: "theme", description: "light" } }, async ({ devices }) => {
  const [a] = await devices.open("A")
  const page = a.page
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible()
  await page.emulateMedia({ colorScheme: "dark" })
  const button = page.getByRole("button", { name: "Switch to light mode" })
  await expect(button).toBeVisible()
  await expect(button.locator("circle")).toHaveCount(1)
  await expect(page.locator("html")).not.toHaveAttribute("data-theme")
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible()
})
