import { expect, test } from "./browserTest"
import { signedOutVisitor } from "./identity"
const sha = "a".repeat(40)
const commit = { sha, short_sha: "aaaaaaa", title: "Fix router history", body: "Keep the requested branch.", author: "Ada", authored_at: "2026-10-18T12:00:00Z", committed_at: "2026-10-18T12:00:00Z", parents: [] }
for (const width of [1440, 1280, 390]) for (const theme of ["light", "dark"] as const) {
  test(`commits ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.emulateMedia({ colorScheme: theme })
    await signedOutVisitor(page)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "ada/widgets" }] } }))
    await page.route("**/api/repos/ada/widgets", route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
    await page.route("**/api/repos/ada/widgets/bookmarks?*", route => route.fulfill({ json: { items: [{ name: "main", target_change_id: "change", target_commit_id: sha }], next_cursor: "" } }))
    await page.route("**/api/repos/ada/widgets/commits?*", route => route.fulfill({ json: new URL(route.request().url()).searchParams.has("cursor") ? { items: [] } : { items: [commit], next_cursor: "next-page" } }))
    await page.goto("/ada/widgets/commits/main")
    const content = page.locator("#repo-content")
    await expect(content.getByRole("heading", { name: "Commits", exact: true })).toBeVisible()
    await expect(content.getByRole("link", { name: commit.title, exact: true })).toBeVisible()
    await expect(content).toContainText("Ada")
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `${process.env.HOME}/smithers-lanes/out/pl-p2-history/shots/history-commits-main-${width}-${theme}.png` })
    const controls = content.locator("a,button,select")
    await controls.first().focus()
    for (let i = 0; i < await controls.count(); i++) { await expect(controls.nth(i)).toBeFocused(); await page.keyboard.press("Tab") }
    await content.getByRole("button", { name: "Older", exact: true }).press("Enter")
    await expect(content).toContainText("No commits found.")
    await expect(page).toHaveURL(/cursor=next-page/)
    await page.reload()
    await expect(content).toContainText("No commits found.")
  })
}
