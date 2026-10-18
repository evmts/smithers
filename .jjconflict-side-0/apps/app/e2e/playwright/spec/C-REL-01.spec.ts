import { expect, test } from "../browserTest"
import { owner, say } from "./j1-fixtures"

// UI projection of .specs/engineering/checks/C-REL-01.md; not a qualification receipt.
// 2026-10-20: the docs card opens on Welcome; Quickstart is the hosted smithers.sh walk and the Mac host steps live in Self-host (docs chain 4327e).
// mvp.md §12.4, M-35: bundled Markdown through the person-facing /docs flow.
test("C-REL-01: Docs expose the hosted Quickstart, Self-host and the Flows reference", async ({ page }) => {
  test.setTimeout(60_000)
  await owner(page)
  await page.goto("/")
  await say(page, "/docs")
  await expect(page.getByRole("navigation", { name: "Docs pages" }).getByRole("link", { name: "Quickstart", exact: true })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Docs pages" }).getByRole("link", { name: "Flows reference", exact: true })).toBeVisible()
  // The in-app Quickstart is the hosted smithers.sh walk (PM d-1mgknf); the docs card opens on Welcome.
  const nav = page.getByRole("navigation", { name: "Docs pages" })
  await nav.getByRole("link", { name: "Quickstart", exact: true }).first().press("Enter")
  for (const step of [
    "1. Open smithers.sh",
    "2. Open a repository",
    "3. Read a file",
    "4. Read issues and pull requests",
    "5. Sign in with GitHub"
  ]) await expect(page.getByRole("heading", { name: step, exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Run agents on your Mac", exact: true }).first()).toBeVisible()
  // The Mac host steps moved to their own page.
  await nav.getByRole("link", { name: "Self-host Smithers", exact: true }).first().press("Enter")
  await expect(page.getByRole("heading", { name: "Put HTTPS in front", exact: true })).toBeVisible()
  await expect(page.getByText("smthrs host backup", { exact: false }).first()).toBeVisible()
  await nav.getByRole("link", { name: "Flows reference", exact: true }).first().press("Enter")
  await expect(page.getByText(".smithers/flows/<name>/flow.ts", { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("/flow.edit", { exact: false })).toBeVisible()
})
