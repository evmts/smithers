import { expect, test } from "./fixtures"

// Clone a public GitHub repository and browse it (docs/features/repo.md, decision 0006), against the real app,
// Worker, Durable Object, Postgres, Electric, GitHub and Code Storage. The fixture is the tiny public
// `octocat/Spoon-Knife` (README.md, index.html, styles.css); nothing is created on GitHub. Cloning it is idempotent, so
// a second run finds it ready and browses it. Locally the run needs the Code Storage organization in the dev server's
// environment; against a deployment (`BASE_URL`), the deployment holds it.

const missing = ["CODE_STORAGE_ORG", "CODE_STORAGE_KEY"].filter((name) => process.env[name] === undefined)
test.skip(
  process.env.BASE_URL === undefined && missing.length > 0,
  `The repository tests need Code Storage: ${missing.join(" and ")} unset.`,
)

const REPO = "/octocat/Spoon-Knife"

/** Clones the fixture if it isn't there yet, and waits until the repository opens on its README. */
const openReady = async (page: import("@playwright/test").Page) => {
  await page.goto(REPO)
  // The repository's header: the screen's main landmark carries the same label.
  const header = page.locator('header[aria-label="Repository"]')
  await expect(header).toContainText("octocat / Spoon-Knife")
  const clone = header.getByRole("button", { name: "Clone" })
  if (await clone.isVisible()) await clone.click()
  await expect(page.getByText("Well hello there!")).toBeVisible({ timeout: 120_000 })
}

test("clone: two devices see the repository open on its README once Code Storage has it", async ({ browser }) => {
  const alice = await browser.newContext({ recordVideo: { dir: test.info().outputPath("alice") } })
  const bob = await browser.newContext({ recordVideo: { dir: test.info().outputPath("bob") } })
  const [a, b] = [await alice.newPage(), await bob.newPage()]
  await openReady(a)
  // The second device needs no clone of its own: Electric delivers the row Alice's clone settled.
  await b.goto(REPO)
  await expect(b.getByText("Well hello there!")).toBeVisible({ timeout: 60_000 })
  await expect(b.getByRole("button", { name: "Clone" })).toHaveCount(0)
  await alice.close()
  await bob.close()
})

test("browse: a file from the listing, its lines, a reload, and the permalink at the head commit", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await openReady(page)
  await page.getByRole("link", { name: "index.html" }).first().click()
  await expect(page).toHaveURL(/\/octocat\/Spoon-Knife\/blob\/main\/index\.html$/)
  await expect(page.getByText("<!DOCTYPE html>", { exact: false })).toBeVisible()
  // A line anchor survives a reload: the URL is the view's location.
  await page.goto(`${REPO}/blob/main/index.html?L=3`)
  await expect(page.getByText("<!DOCTYPE html>", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Copy permalink" }).click()
  const permalink = await page.evaluate(() => navigator.clipboard.readText())
  expect(permalink).toMatch(/\/octocat\/Spoon-Knife\/blob\/[0-9a-f]{40}\/index\.html\?L=3$/)
  await page.goto(new URL(permalink).pathname + new URL(permalink).search)
  await expect(page.getByText("<!DOCTYPE html>", { exact: false })).toBeVisible()
  // Up the path trail, back to the README.
  await page.getByRole("link", { name: "Spoon-Knife" }).first().click()
  await expect(page.getByText("Well hello there!")).toBeVisible()
})

test("refusals: a repository GitHub doesn't have says Not found, and so does a missing file", async ({ page }) => {
  const name = `no-such-repo-${Date.now().toString(36)}`
  await page.goto(`/octocat/${name}`)
  const header = page.locator('header[aria-label="Repository"]')
  await expect(header).toContainText(`octocat / ${name}`)
  await header.getByRole("button", { name: "Clone" }).click()
  await expect(header.getByRole("status").filter({ hasText: "Not found" })).toBeVisible({ timeout: 60_000 })
  await expect(header.getByRole("button", { name: "Try again" })).toBeVisible()
  await openReady(page)
  await page.goto(`${REPO}/blob/main/no-such-file.md`)
  await expect(page.getByText("Not found").first()).toBeVisible()
})
