import { expect, test } from "./fixtures"

// Browsing a repository as Will reviewed it (docs/features/repo.md#the-page), against the real app, Worker, Postgres,
// Electric, GitHub and Code Storage:
// - the first visit uses the page: GitHub's folder, README and about panel before anyone clones the repository;
// - a clone is a workflow in the person's feed: a toast says how far it came, then why it stopped, with Try again;
// - a cloned copy without the Smithers app says it may be reclaimed, with Install;
// - a Markdown file opens as a document, its source one press away;
// - an HTML file shows as CodePen does, its page in a sandboxed frame that reaches neither the app nor the network.
// The first runs anywhere: it reads only GitHub. The rest need Code Storage, which a local run has only when the dev
// server's environment holds the organization; against a deployment (`BASE_URL`), the deployment holds it.

const missing = ["CODE_STORAGE_ORG", "CODE_STORAGE_KEY"].filter((name) => process.env[name] === undefined)
const noCodeStorage = process.env.BASE_URL === undefined && missing.length > 0
const needsCodeStorage = `Needs Code Storage: ${missing.join(" and ")} unset.`

const SPOON = "/octocat/Spoon-Knife"

/**
 * Opens Spoon-Knife, cloning it if no run has yet, and waits until the device has it ready: the branch picker, which
 * GitHub's preview of a repository nobody cloned doesn't have, and its README.
 */
const openSpoon = async (page: import("@playwright/test").Page) => {
  await page.goto(SPOON)
  const header = page.locator('header[aria-label="Repository"]')
  await expect(header).toContainText("octocat / Spoon-Knife", { timeout: 30_000 })
  const picker = page.getByRole("button", { name: "main", exact: true })
  const clone = header.getByRole("button", { name: "Clone" })
  await expect(picker.or(clone)).toBeVisible({ timeout: 60_000 })
  if (await clone.isVisible()) await clone.click()
  await expect(picker).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText("Well hello there!").first()).toBeVisible({ timeout: 30_000 })
}

test(
  "first visit: a repository nobody cloned shows its folder, README and about panel at once",
  { annotation: { type: "summary", description: "The first visit fills the page from GitHub, before any clone." } },
  async ({ page }) => {
    // octocat/linguist: a fork with a README, languages and contributors, which no test clones.
    await page.goto("/octocat/linguist")
    const about = page.locator('section[aria-label="About"]')
    await expect(about).toContainText("Language Savant", { timeout: 30_000 })
    await expect(about.getByRole("heading", { name: "Languages" })).toBeVisible()
    await expect(about.getByRole("list", { name: "Languages" })).toContainText("Ruby")
    await expect(about.getByRole("heading", { name: /^Contributors/ })).toBeVisible()
    await expect(about.getByRole("img", { name: "josh" })).toBeVisible()
    // GitHub's top folder, its README rendered under it, the default branch, the counts and the newest commit.
    await expect(page.getByRole("link", { name: "lib", exact: true })).toBeVisible()
    await expect(page.locator('article[aria-label="README.md"]')).toContainText("Linguist")
    await expect(page.getByText("master", { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/^\d[\d,]* Branch(es)?$/)).toBeVisible()
    await expect(page.locator('[aria-label="Head commit"]')).toContainText(/\d[\d,]* Commits?/)
    await expect(page.getByRole("button", { name: "Code" })).toBeVisible()
    // Never the empty card it used to be.
    await expect(page.getByText("Not cloned")).toHaveCount(0)
  },
)

test.describe("cloned repositories", () => {
  test.skip(noCodeStorage, needsCodeStorage)

  test(
    "the clone in the feed: a toast says how far it came, then why it stopped, with Try again",
    { annotation: { type: "summary", description: "A clone reports in the toasts, and a failed one offers Try again." } },
    async ({ page }) => {
      const name = `no-such-repo-${Date.now().toString(36)}`
      await page.goto(`/octocat/${name}`)
      const header = page.locator('header[aria-label="Repository"]')
      await expect(header).toContainText(`octocat / ${name}`, { timeout: 30_000 })
      // GitHub has no such repository: the page says so before anyone clones it.
      await expect(page.getByText("Not found").first()).toBeVisible({ timeout: 30_000 })
      await header.getByRole("button", { name: "Clone" }).click()
      // The toast follows the clone from the request; no spinner anywhere.
      const subject = `clone:github/octocat/${name}`
      await expect(page.locator(`[data-slot="toast"][data-subject="${subject}"]`)).toContainText(`Clone · octocat/${name}`, {
        timeout: 30_000,
      })
      // It stopped: the header says why, with Try again, and the entry stays in the person's list.
      await expect(header.getByRole("status").filter({ hasText: "Not found" })).toBeVisible({ timeout: 60_000 })
      await page.getByRole("region", { name: "Smithers" }).getByRole("button", { name: /^\+\d+$/ }).click()
      const entry = page.locator(`li[data-entry="${subject}"]`)
      await expect(entry).toContainText(`Clone · octocat/${name} · Not found`, { timeout: 30_000 })
      await entry.getByRole("button", { name: new RegExp(`Clone · octocat/${name}`) }).click()
      await entry.getByRole("button", { name: "Retry" }).click()
      // Try again's new attempt raises the entry again, and stops for the same reason.
      await expect(entry.or(page.locator(`[data-slot="toast"][data-subject="${subject}"]`)).first()).toContainText(
        `Clone · octocat/${name}`,
        { timeout: 30_000 },
      )
    },
  )

  test(
    "the reclaimable note: a copy without the Smithers app may be reclaimed, and Install opens the App's installation",
    { annotation: { type: "summary", description: "A cloned copy without the app says it may be reclaimed, with Install." } },
    async ({ page }) => {
      await openSpoon(page)
      const note = page.getByRole("note").filter({ hasText: "may be reclaimed" })
      await expect(note).toContainText("Until the Smithers app is installed, this copy may be reclaimed for space.")
      await expect(note.getByRole("link", { name: "Install" })).toHaveAttribute(
        "href",
        /^https:\/\/github\.com\/apps\/[a-z0-9-]+\/installations\/new$/,
      )
      // The about panel and the counts sit beside the files, as on GitHub.
      await expect(page.locator('section[aria-label="About"]')).toContainText("This repo is for demonstration purposes only.")
      await expect(page.getByText(/^3 Branches$/)).toBeVisible()
    },
  )

  test(
    "Markdown: a file opens as a document, read-only here, and Code shows its source",
    { annotation: { type: "summary", description: "Markdown renders as a document; its source is one press away." } },
    async ({ page }) => {
      await openSpoon(page)
      await page.goto(`${SPOON}/blob/main/README.md`)
      const file = page.locator('article[aria-label="README.md"]')
      await expect(file.getByRole("heading", { name: "Well hello there!" })).toBeVisible({ timeout: 30_000 })
      // No branch to commit to on this page: the document can't be edited.
      await expect(file.locator('[contenteditable="true"]')).toHaveCount(0)
      await file.getByRole("button", { name: "Code", exact: true }).click()
      await expect(file.getByText("### Well hello there!")).toBeVisible()
      await expect(page.getByRole("link", { name: "Raw" })).toBeVisible()
    },
  )

  test(
    "HTML: Code, Preview and Split, the page live in a frame that can't reach the app or the network",
    { annotation: { type: "summary", description: "An HTML file shows live beside its source, sandboxed." } },
    async ({ page }) => {
      await openSpoon(page)
      await page.goto(`${SPOON}/blob/main/index.html`)
      const file = page.locator('article[aria-label="index.html"]')
      await expect(file.getByText("<!DOCTYPE html>", { exact: false }).first()).toBeVisible({ timeout: 30_000 })
      await file.getByRole("button", { name: "Preview", exact: true }).click()
      const frame = file.locator('iframe[title="Preview of index.html"]')
      await expect(frame).toHaveAttribute("sandbox", "allow-scripts")
      const preview = page.frameLocator('iframe[title="Preview of index.html"]')
      await expect(preview.getByText("Fork me? Fork you, @octocat!")).toBeVisible()
      // Its scripts run in an opaque origin under the preview's policy: no app, no network.
      const inside = page.frames().find((candidate) => candidate.parentFrame() === page.mainFrame() && candidate.url() === "about:srcdoc")!
      expect(await inside.evaluate(() => {
        try {
          return String(window.parent.document.title)
        } catch {
          return "blocked"
        }
      })).toBe("blocked")
      expect(await inside.evaluate(() => fetch("https://example.com/").then(() => "fetched", () => "blocked"))).toBe("blocked")
      await file.getByRole("button", { name: "Split", exact: true }).click()
      await expect(file.locator(".sui-repo-html-split iframe")).toBeVisible()
      await expect(file.locator(".sui-repo-html-split .sui-code-view")).toBeVisible()
      await file.getByRole("button", { name: "Code", exact: true }).click()
      await expect(frame).toHaveCount(0)
    },
  )
})
