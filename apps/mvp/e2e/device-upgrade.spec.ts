import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { serveBuilds } from "./builds"
import { serverRows } from "./devices"
import { expect, QUEUED, step, test } from "./fixtures"

// A deploy, on one device (decision 0021): the build production ran before it (its files, mirrored from production,
// in OLD_BUILD_DIR) makes synced messages, a question queued offline and a draft; then this build opens on the same
// origin, so the same OPFS store and IndexedDB outbox, brings them forward before it reads them, and shows all three.
// ChatApi, Electric and Postgres are the dev server's, for both builds. Service workers are off, so the reload gets the
// build the origin serves now, as a deploy's service worker update does.

const OLD_BUILD = process.env.OLD_BUILD_DIR ?? join(homedir(), "Desktop", "smithers-mvp", "builds", "7b96f878")

test.use({ serviceWorkers: "block" })

test(
  "deploy: synced messages, a question queued offline and a draft from the deployed build are all there in this build",
  {
    annotation: {
      type: "summary",
      description: "A device's messages, a question it queued offline and its draft survive a deploy.",
    },
  },
  async ({ page, context, request }) => {
    test.skip(!existsSync(join(OLD_BUILD, "index.html")), `No deployed build at ${OLD_BUILD} (OLD_BUILD_DIR)`)
    // A mirror that saved the site's redirect for /index.html has an empty page (docs/infrastructure.md).
    expect(statSync(join(OLD_BUILD, "index.html")).size, "the deployed build's index.html is empty").toBeGreaterThan(0)
    const builds = await serveBuilds({ old: OLD_BUILD })
    try {
      const app = new URL("/app", builds.url).href
      const conversation = page.getByRole("region", { name: "Conversation", exact: true })
      const composer = page.getByRole("textbox", { name: "Message Smithers" })
      const question = (text: string) =>
        conversation.locator('.sui-chat-message[data-role="user"]', { hasText: text })
      const openComposer = async () => {
        if (await composer.isHidden()) await page.keyboard.press("ControlOrMeta+k")
        await expect(composer).toBeVisible()
      }
      const word = `deploy-${Date.now().toString(36)}`
      const synced = `Which build is this, ${word}?`
      const queued = `Asked offline before the deploy, ${word}`
      const draft = `A draft kept across the deploy, ${word}`
      // The questions Postgres holds for this run, read through ChatApi's shape as devices read them.
      const stored = async () =>
        (await serverRows(request, word)).filter((row) => row.role === "user").map((row) => row.text)

      await step("Open the deployed build", async () => {
        await page.goto(app)
        await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 60_000 })
      })
      await step("Ask a question online", async () => {
        await openComposer()
        await composer.fill(synced)
        await composer.press("Enter")
        await expect(question(synced)).toHaveCount(1)
        // Postgres has it before the device goes offline: a synced row, not one waiting in the outbox.
        await expect.poll(stored, { timeout: 30_000 }).toContain(synced)
      })
      await step("Go offline and ask again", async () => {
        await context.setOffline(true)
        await composer.fill(queued)
        await composer.press("Enter")
        await expect(question(queued).getByText(QUEUED, { exact: true })).toBeVisible({ timeout: 15_000 })
      })
      await step("Leave a draft", async () => {
        await composer.fill(draft)
        // The old build marks the draft once the device stored it.
        await expect(composer).toHaveAttribute("data-draft", "saved", { timeout: 15_000 })
      })

      await step("Deploy: the origin serves this build, and the device is back online", async () => {
        await page.goto("about:blank")
        builds.use("new")
        await context.setOffline(false)
      })
      await step("Open this build on the same device", async () => {
        await page.goto(app)
        await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 60_000 })
      })
      await step("The synced messages are there", async () => {
        await expect(question(synced)).toHaveCount(1, { timeout: 60_000 })
      })
      await step("The question queued offline is sent", async () => {
        await expect(question(queued)).toHaveCount(1, { timeout: 60_000 })
        // This build's outbox sent the old build's write: Postgres has it, once.
        await expect.poll(stored, { timeout: 60_000 }).toEqual([synced, queued])
        await expect(question(queued).getByText(QUEUED, { exact: true })).toHaveCount(0)
      })
      await step("The draft is in the composer, and stays", async () => {
        await openComposer()
        await expect(composer).toHaveValue(draft, { timeout: 30_000 })
        // This build stored it too, and it is still the draft once stored.
        await expect(composer).toHaveAttribute("data-draft", "saved", { timeout: 15_000 })
        await expect(composer).toHaveValue(draft)
      })
      await step("Reload: the draft is still there", async () => {
        await page.reload()
        await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 60_000 })
        await openComposer()
        await expect(composer).toHaveValue(draft, { timeout: 30_000 })
        await expect(composer).toHaveAttribute("data-draft", "saved")
      })
    } finally {
      await builds.close()
    }
  },
)
