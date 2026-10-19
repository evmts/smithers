import { expect, test } from "./browserTest"
import { signedOutVisitor } from "./identity"

for (const defaultSlashBranch of [true, false]) for (const width of [1280, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`Code home slash branch links default=${defaultSlashBranch} ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    const repo = "alpha/one", branch = "poc/pre-withdrawal-checkpoint", sha = "b".repeat(40)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: repo }] } }))
    await page.route("**/api/repos/alpha/one", route => route.fulfill({ json: { is_public: true, default_bookmark: defaultSlashBranch ? branch : "main" } }))
    await page.route("**/api/repos/alpha/one/home", route => route.fulfill({ json: { kind: "readme", markdown: "# Release" } }))
    await page.route("**/api/repos/alpha/one/bookmarks**", route => route.fulfill({ json: { items: [{ name: "main", target_change_id: "main", target_commit_id: "a".repeat(40) }, { name: branch, target_change_id: "release", target_commit_id: sha }], next_cursor: "" } }))
    await page.route(/\/api\/repos\/alpha\/one\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ json: path.endsWith("/index.ts")
        ? { type: "file", content: "export const release = 12\n", size: 26, encoding: "utf-8", commit_sha: sha, raw_url: `/api/repos/${repo}/contents/index.ts?raw=1&ref=${sha}` }
        : [{ name: "index.ts", path: "index.ts", type: "file" }, { name: "src", path: "src", type: "dir" }] })
    })
    await page.goto(`/${repo}`)
    const files = page.getByRole("region", { name: "Files", exact: true })
    const file = files.getByRole("link", { name: "index.ts", exact: true })
    await expect(file).toHaveAttribute("href", `/${repo}/blob/${defaultSlashBranch ? branch : "main"}/index.ts`)
    await file.focus(); await page.keyboard.press("Enter")
    await expect(page.getByRole("region", { name: "File view", exact: true })).toContainText("export const release = 12")
    await expect(page).toHaveURL(new RegExp(`/${repo}/blob/${defaultSlashBranch ? branch : "main"}/index.ts$`))
    await page.goto(`/${repo}`)
    const folder = files.getByRole("link", { name: "src", exact: true })
    await expect(folder).toHaveAttribute("href", `/${repo}/tree/${defaultSlashBranch ? branch : "main"}/src`)
    await folder.focus(); await page.keyboard.press("Enter")
    await expect(page.getByRole("table", { name: "Files in src", exact: true })).toBeVisible()
    await page.goto(`/${repo}`)
    const menu = page.locator(".repo-code-home-toolbar details").first()
    await menu.locator("summary").focus(); await page.keyboard.press("Enter")
    const branchLink = menu.getByRole("link", { name: branch, exact: true })
    await expect(branchLink).toHaveAttribute("href", `/${repo}/tree/${branch}`)
    const rootRead = page.waitForRequest(request => {
      const url = new URL(request.url())
      return url.pathname === `/api/repos/${repo}/contents` && url.searchParams.get("ref") === branch
    })
    await branchLink.focus(); await page.keyboard.press("Enter")
    await rootRead
    await expect(page.getByRole("region", { name: "Folder view", exact: true })).toBeVisible()
    await expect(page.getByRole("table", { name: "Repository files", exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${repo}/tree/${branch}$`))
  })
}
