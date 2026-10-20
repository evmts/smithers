import { expect, SYNC_LOST, test } from "./fixtures"

test("landing: a first-time visitor sees the landing and clicks Get started for free", async ({ page }) => {
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

// The sync service is unreachable when the app opens: every shape request through ChatApi's proxy fails, as when
// Electric or the network to it is down. The app must say so and offer a retry, never spin on "Opening" forever, and
// the retry opens the conversation once sync is back. Aborting the route is the outage; nothing answers in its place.
test("sync down at boot: the app says it lost its connection, and Try again opens chat once sync is back", async ({ page, context }) => {
  const shapes = "**/api/shapes/**"
  await context.route(shapes, (route) => route.abort("connectionrefused"))
  await page.goto("/app")

  // Sync down at boot fails after 10 s with no successful shape request.
  await expect(page.getByRole("main", { name: "Lost connection" })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("alert")).toHaveText(SYNC_LOST)
  const retry = page.getByRole("button", { name: "Try again" })
  await expect(retry).toBeVisible()

  await context.unroute(shapes)
  await retry.click()
  await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})
