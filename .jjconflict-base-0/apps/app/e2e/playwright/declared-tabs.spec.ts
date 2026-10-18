import { expect, test } from "./browserTest"
import { signedOutVisitor } from "./identity"

for (const width of [1440, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`declared repository tabs ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    const contents: Record<string, unknown> = {
      ".smithers/ui/tabs.json": JSON.stringify({ tabs: [
        { type: "docs", title: "Docs", root: "docs/user/src", index: "01.md", nav: "docs/user/inventory.md" },
        { type: "eval", title: "Golden set", suite: "convert-golden", cases: "golden", command: "node score.mjs" }
      ] }),
      "docs/user/inventory.md": "## Guide\n- **Start Here**\n  - [First page](src/01.md)\n  - [Second page](src/02.md)\n- [Outside](../design/other.md)",
      "docs/user/src/01.md": "# First page\n\n[Next page](02.md)", "docs/user/src/02.md": "# Second page",
      golden: [{ name: "01-basic", type: "dir" }],
      "golden/01-basic": [{ name: "input.ts", type: "file" }, { name: "expected.effeck", type: "file" }],
      "golden/01-basic/input.ts": "const answer = 42", "golden/01-basic/expected.effeck": "let answer = 42"
    }
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp" }] } }))
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
    await page.route("**/api/repos/maya/tinyhttp/home", route => route.fulfill({ json: { kind: "none" } }))
    const reads: string[] = []
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.split("/contents/")[1] ?? "")
      reads.push(path)
      const body = contents[path]
      return body === undefined ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: typeof body === "string" ? { content: body, encoding: "utf-8" } : body })
    })
    await page.goto("/maya/tinyhttp/docs")
    await expect(page.getByRole("heading", { name: "First page", exact: true })).toBeVisible()
    const nav = page.getByRole("navigation", { name: "Documentation", exact: true })
    await expect(nav.getByRole("link")).toHaveText(["First page", "Second page"])
    expect(reads).not.toContain("docs/user/src/02.md")
    expect(reads).not.toContain("golden/01-basic")
    await expect(nav.getByRole("heading", { name: "Start Here", exact: true })).toBeVisible()
    await page.getByRole("link", { name: "Next page", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Second page", exact: true })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Repository", exact: true }).getByRole("link", { name: "Docs", exact: true })).toHaveAttribute("aria-current", "page")
    if (process.env.SMITHERS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SMITHERS_SCREENSHOT_DIR}/docs-${width}-${colorScheme}.png`, fullPage: true })
    await page.getByRole("link", { name: "Golden set", exact: true }).click()
    await expect(page.getByText("Hosted runs arrive later. Run it locally:", { exact: true })).toBeVisible()
    expect(reads).not.toContain("golden/01-basic/input.ts")
    await page.getByRole("link", { name: "01-basic", exact: true }).click()
    await expect(page).toHaveURL(/\/evals\/convert-golden\?case=01-basic$/)
    await expect(page.getByRole("heading", { name: "input.ts", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "expected.effeck", exact: true })).toBeVisible()
    await expect(page.locator("main")).not.toContainText(/Score|Pass|Fail/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (process.env.SMITHERS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SMITHERS_SCREENSHOT_DIR}/eval-${width}-${colorScheme}.png`, fullPage: true })
  })
}
