import { expect, step, test } from "./fixtures"

// Code intelligence in the code view (docs/features/code-intelligence.md), against the real app, Worker, Postgres,
// Electric, GitHub and Code Storage, with TypeScript's language service in the tab's own worker. The fixture is the
// small public `vercel/ms` at a fixed commit, whose `src/format.test.ts` imports `format` from `src/index.ts`; nothing
// is created on GitHub. Cloning it is idempotent, so a second run finds it ready. Locally the run needs the Code
// Storage organization in the dev server's environment; against a deployment (`BASE_URL`), the deployment holds it.

const missing = ["CODE_STORAGE_ORG", "CODE_STORAGE_KEY"].filter((name) => process.env[name] === undefined)
test.skip(
  process.env.BASE_URL === undefined && missing.length > 0,
  `The code intelligence tests need Code Storage: ${missing.join(" and ")} unset.`,
)

const REPO = "/vercel/ms"
const SHA = "4ff48cec099f0514c3e9bbca18706c9c21122bfb"

test(
  "hover, definition, references: a symbol's card, a jump to the file that defines it, and every place it is used",
  { annotation: { type: "summary", description: "TypeScript answers in the tab: hover, go to definition, find references." } },
  async ({ page }) => {
    test.setTimeout(420_000)
    const header = page.locator('header[aria-label="Repository"]')
    const code = page.locator('[data-slot="code-view"]')
    const token = (line: number, char: number) => code.locator(`[data-line="${line}"] [data-char="${char}"]`)
    const card = code.locator('[data-slot="code-view-hover"][data-placed]')
    const symbols = page.locator('[data-slot="symbols-pane"]')

    await step("Open src/format.test.ts at the commit, cloning vercel/ms if Smithers hasn't got it", async () => {
      await page.goto(`${REPO}/blob/${SHA}/src/format.test.ts`)
      await expect(header).toContainText("vercel / ms", { timeout: 30_000 })
      const clone = header.getByRole("button", { name: "Clone" })
      await expect(code.or(clone)).toBeVisible({ timeout: 60_000 })
      if (await clone.isVisible()) await clone.click()
      await expect(code).toHaveAttribute("data-state", "ready", { timeout: 180_000 })
      // `      format(500, { long: true });`, highlighted: the call is a token of its own. Shiki's first highlight on a
      // cold worker pool can take a minute on a loaded machine; the plain text shows meanwhile.
      await expect(token(9, 6)).toHaveText("format", { timeout: 120_000 })
    })

    await step("Hover format: its signature", async () => {
      await token(9, 6).hover()
      await expect(card).toContainText("format(ms: number, options?: Options): string", { timeout: 90_000 })
    })

    await step("Enter on format: go to its definition in src/index.ts", async () => {
      await token(9, 6).click()
      await expect(symbols).toBeVisible()
      await code.press("Enter")
      await expect(page).toHaveURL(new RegExp(`${REPO}/blob/${SHA}/src/index\\.ts\\?L=225$`), { timeout: 30_000 })
      await expect(token(225, 16)).toHaveText("format", { timeout: 30_000 })
    })

    await step("Click format: the Symbols pane lists its definition and every reference", async () => {
      await token(225, 16).click()
      await expect(symbols.locator(".sui-symbols-title")).toHaveText("format")
      const references = symbols.getByRole("region", { name: "References" })
      await expect(references.locator(".sui-symbols-file-name").filter({ hasText: "src/format.test.ts" })).toBeVisible({
        timeout: 90_000,
      })
      await expect(references.locator('[data-slot="symbols-row"]').first()).toBeVisible()
      expect(await references.locator('[data-slot="symbols-row"]').count()).toBeGreaterThan(10)
      await expect(symbols.getByRole("region", { name: "Definition" })).toContainText("export function format")
    })

    await step("A reference opens its line", async () => {
      const row = symbols.locator('[data-slot="symbols-row"]', { hasText: "import { format } from './index';" })
      await row.click()
      await expect(page).toHaveURL(new RegExp(`${REPO}/blob/${SHA}/src/format\\.test\\.ts\\?L=2$`), { timeout: 30_000 })
    })
  },
)
