import { expect, test, type Page } from "./browserTest"
import { identityRoute } from "./identity"

// An admitted repository's frame opens its composer through Ask; an unresolved
// or refused URL stays on the chat page, where ⌘K opens it. Sending clears it either way.
const command = async (page: Page, line: string) => {
  const input = page.getByTestId("composer-input")
  if (!await input.isVisible()) {
    const ask = page.getByRole("button", { name: "Ask", exact: true })
    if (await ask.isVisible()) await ask.click()
    else await page.keyboard.press("Control+k")
  }
  await expect(input).toBeVisible()
  await input.fill(line)
  await input.press("Enter")
  await expect(input).toHaveValue("")
}

test("an unresolved or failed repository URL never reads the previous repository by default", async ({ page }) => {
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["agent", "identity", "cloud", "cloud.terminal"], authFlow: "native-handoff", sandbox: null,
  } }))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
  let release!: () => void
  let gate: Promise<void> | undefined
  await page.route("**/api/repos/missing-owner/missing-repository", async route => {
    await gate
    await route.fulfill({ status: 404, json: { message: "Not found" } })
  })
  await page.route("**/api/repos/smithersai/smithers", route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
  let reads = 0
  await page.route(/\/api\/repos\/smithersai\/smithers\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => {
    reads++
    return route.fulfill({ json: [{ path: "README.md", name: "README.md", type: "file", size: 11 }] })
  })
  await page.goto("/smithersai/smithers/?design=off")
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible()
  await command(page, "/files / smithersai/smithers")
  await expect(page.locator('[data-kind="file-list"]').last()).toContainText("README.md")

  gate = new Promise<void>(resolve => { release = resolve })
  await page.goto("/missing-owner/missing-repository/?design=off")
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
  reads = 0
  await command(page, "/files /")
  await page.waitForTimeout(400)
  expect(reads).toBe(0)
  // Explicit targets still use the same public read seam while entry resolution waits.
  await command(page, "/files / smithersai/smithers")
  await expect.poll(() => reads).toBe(1)
  await command(page, "/files /smithersai/smithers/docs")
  await expect.poll(() => reads).toBe(2)
  const refused = page.waitForResponse(response => response.url().endsWith("/api/repos/missing-owner/missing-repository"))
  release()
  gate = undefined
  await refused
  await command(page, "/files /")
  await page.waitForTimeout(400)
  expect(reads).toBe(2)

  await page.reload()
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
  await command(page, "/files /")
  await page.waitForTimeout(400)
  expect(reads).toBe(2)
})
