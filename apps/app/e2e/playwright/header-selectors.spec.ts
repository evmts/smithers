import { expect, test } from "./browserTest"
import type { Page } from "./browserTest"
import { say } from "./composer"
import { installCloudFixture } from "./cloudFixture.ts"

/*
 * The header's repository and branch selectors on a hosted page. Every other
 * spec in this tier runs with the seeded design fixture, which draws its own
 * crumbs; `?design=off` renders what production renders, so this spec is the
 * tier's one look at the real header.
 *
 * The server is a double (cloudFixture.ts): the bootstrap, the identity, the
 * repository inventory and each repository's bookmarks.
 */

const head = { change_id: "kxyzqrpv", commit_id: "c0ffee123456" }
const repos = [
  { owner: "zeta", name: "web", full_name: "zeta/web", default_bookmark: "develop", owner_type: "Organization" as const, default_bookmark_head: head },
  { owner: "acme", name: "api", full_name: "acme/api", default_bookmark: "trunk", owner_type: "Organization" as const, default_bookmark_head: head }
]
const bookmark = (name: string) => ({ name, target_change_id: `change-${name}`, target_commit_id: `commit-${name}`, is_tracking_remote: true })
const bookmarks = {
  "acme/api": [bookmark("retry-webhooks"), bookmark("docs"), bookmark("trunk")],
  "zeta/web": [bookmark("develop"), bookmark("docs")]
}

const repository = (page: Page) => page.locator('.session-navigation [data-header-select="repo.select"]')
const branch = (page: Page) => page.locator('.session-navigation [data-header-select="branch"]')

test.beforeEach(async ({ page }) => {
  // A persisted store from an earlier test must not carry state across tests.
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("header-selectors-started") !== null) return
    window.sessionStorage.setItem("header-selectors-started", "1")
    try { window.localStorage.clear() } catch { /* Storage the browser refuses is the empty store already. */ }
  })
})

test("a hosted page names no repository or branch until one is selected, then the keyboard selects both and they survive a reload", async ({ page }) => {
  await installCloudFixture(page, { repos, bookmarks, orgs: [{ name: "acme" }, { name: "zeta" }] })
  await page.goto("/?design=off")

  // Nothing is selected: the repository selector alone, and no branch of any name.
  await expect(repository(page).locator(".crumb-here")).toHaveText("Repository")
  await expect(branch(page)).toHaveCount(0)
  await expect(page.locator(".session-navigation .crumb-repo")).toHaveCount(0)
  await expect(page.locator(".session-navigation .crumbs-host")).not.toContainText("main")

  // Keyboard only: open the list, arrow to the first repository, choose it.
  await repository(page).locator(".crumb-here").focus()
  await page.keyboard.press("Enter")
  await expect(repository(page).getByRole("navigation", { name: "Repositories" }).locator(".tree-row")).toHaveText(["acme/api", "zeta/web"])
  await page.keyboard.press("ArrowDown")
  await expect(repository(page).locator(".tree-row").first()).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(repository(page).locator(".crumb-here")).toHaveText("acme/api")
  await expect(repository(page).locator(".crumb-here")).toBeFocused()
  // The branch is the repository's own default, read from the inventory.
  await expect(branch(page).locator(".crumb-here")).toHaveText("trunk")

  // The branch list is the repository's bookmarks, default first.
  await branch(page).locator(".crumb-here").focus()
  await page.keyboard.press("Enter")
  await expect(branch(page).getByRole("navigation", { name: "Branches" }).locator(".tree-row")).toHaveText(["trunk", "docs", "retry-webhooks"])
  await expect(branch(page).locator('.tree-row[aria-current="true"]')).toHaveText("trunk")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect(branch(page).locator(".tree-row").nth(1)).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(branch(page).locator(".crumb-here")).toHaveText("docs")
  await expect(branch(page).locator(".tree")).toHaveCount(0)

  // Escape closes an open list without choosing.
  await page.keyboard.press("Enter")
  await expect(branch(page).locator(".tree")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(branch(page).locator(".tree")).toHaveCount(0)
  await expect(branch(page).locator(".crumb-here")).toBeFocused()

  // Both selections are saved state, not view state. The app owns the address bar, so the opt-out is asked for again.
  await page.goto("/?design=off")
  await expect(repository(page).locator(".crumb-here")).toHaveText("acme/api")
  await expect(branch(page).locator(".crumb-here")).toHaveText("docs")
})

test("the slash door and the pointer reach the same selection, each repository keeps its own, and the chat keeps addressing main", async ({ page }) => {
  await installCloudFixture(page, { repos, bookmarks, orgs: [{ name: "acme" }, { name: "zeta" }] })
  // A hosted account has one conversation, `main`: no pick may change the conversation the page addresses.
  const conversations = new Set<string>()
  page.on("request", request => {
    const match = /\/api\/conversations\/([^/?]*)/.exec(new URL(request.url()).pathname)
    if (match) conversations.add(decodeURIComponent(match[1] ?? ""))
  })
  await page.goto("/?design=off")
  await repository(page).locator(".crumb-here").click()
  await repository(page).locator(".tree-row", { hasText: "acme/api" }).click()
  await expect(branch(page).locator(".crumb-here")).toHaveText("trunk")

  await say(page, "/branch retry-webhooks")
  await expect(branch(page).locator(".crumb-here")).toHaveText("retry-webhooks")

  // A branch the repository does not hold is refused and the selection stands.
  await say(page, "/branch no-such-branch")
  await expect(page.getByText("No branch no-such-branch")).toBeVisible()
  await expect(branch(page).locator(".crumb-here")).toHaveText("retry-webhooks")

  // A press outside an open list closes it.
  if (await page.getByTestId("composer-input").isVisible()) await page.keyboard.press("Escape")
  await branch(page).locator(".crumb-here").click()
  await expect(branch(page).locator(".tree")).toBeVisible()
  await page.mouse.click(900, 600)
  await expect(branch(page).locator(".tree")).toHaveCount(0)

  await repository(page).locator(".crumb-here").click()
  await repository(page).locator(".tree-row", { hasText: "zeta/web" }).click()
  await expect(repository(page).locator(".crumb-here")).toHaveText("zeta/web")
  await expect(branch(page).locator(".crumb-here")).toHaveText("develop")

  // Returning to the first repository restores the branch picked there.
  await repository(page).locator(".crumb-here").click()
  await repository(page).locator(".tree-row", { hasText: "acme/api" }).click()
  await expect(branch(page).locator(".crumb-here")).toHaveText("retry-webhooks")

  expect(conversations.size).toBeGreaterThan(0)
  expect([...conversations]).toEqual(["main"])
})
