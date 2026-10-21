import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { OWNER_KEY } from "../src/device/identity"
import { serveBuilds } from "./builds"
import { serverRows } from "./devices"
import { expect, QUEUED, step, test } from "./fixtures"

// A deploy from a login-only legacy device (decisions 0021 and 0023): server-backed messages return, but the old
// local queue and draft cannot be assigned to a stable person and are cleared online. Once this build establishes
// the owner, its new queued question and draft survive a same-owner reload. Both builds use the real dev ChatApi,
// Electric and Postgres on one origin. Service workers are blocked so the reload selects the build served now.

const OLD_BUILD = process.env.OLD_BUILD_DIR ?? join(homedir(), "Desktop", "smithers-mvp", "builds", "c6940ac53e5a")

test.use({ serviceWorkers: "block" })

test(
  "deploy: legacy local data clears, then the verified owner's queued question and draft survive reload",
  {
    annotation: {
      type: "summary",
      description: "Legacy data clears before sign-in; a verified owner's queue and draft survive reload."
    }
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
        conversation.locator(".sui-chat-message[data-role=\"user\"]", { hasText: text })
      const openComposer = async () => {
        if (await composer.isHidden()) await page.keyboard.press("ControlOrMeta+k")
        await expect(composer).toBeVisible()
      }
      const word = `deploy-${Date.now().toString(36)}`
      const synced = `Which build is this, ${word}?`
      const queued = `Asked offline before the deploy, ${word}`
      const draft = `A legacy draft before the deploy, ${word}`
      const ownedQueued = `Asked offline by the verified owner, ${word}`
      const ownedDraft = `A verified owner's draft, ${word}`
      let legacyQueuedId: string | null = null
      let ownedQueuedId: string | null = null
      let ownerId: string
      const identityChecks: Array<string> = []
      page.on("console", (message) => {
        const text = message.text()
        if (text.includes("auth.device_identity")) identityChecks.push(text)
      })
      // The questions Postgres holds for this run, read through ChatApi's shape as devices read them.
      const storedRows = async () => (await serverRows(request, word)).filter((row) => row.role === "user")
      const stored = async () => (await storedRows()).map((row) => row.text)
      const assertQueueIds = async () => {
        const rows = await storedRows()
        expect(rows.filter((row) => row.id === legacyQueuedId)).toHaveLength(0)
        expect(rows.filter((row) => row.id === ownedQueuedId)).toHaveLength(1)
      }

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
        legacyQueuedId = await question(queued).getAttribute("data-id")
        expect(legacyQueuedId).toEqual(expect.any(String))
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
      await step("The legacy queue and draft are cleared before this owner opens the device", async () => {
        const session = await (await page.request.get(new URL("/api/auth/session", app).href)).json()
        expect(session.signedIn).toBe(true)
        expect(typeof session.personId).toBe("string")
        ownerId = session.personId
        await expect.poll(() =>
          page.evaluate((key) => {
            const owner = localStorage.getItem(key)
            return owner === null ? undefined : JSON.parse(owner).personId
          }, OWNER_KEY), { timeout: 60_000 }).toBe(session.personId)
        expect(identityChecks.some((line) => line.includes("changed"))).toBe(true)
        expect(identityChecks.some((line) => line.includes("verified"))).toBe(true)
        await expect(question(queued)).toHaveCount(0)
        await openComposer()
        await expect(composer).toHaveValue("")
        await expect(composer).toHaveAttribute("data-draft", "saved")
        expect(await stored()).toEqual([synced])
      })
      await step("The verified owner queues a new question and saves a draft offline", async () => {
        await context.setOffline(true)
        await composer.fill(ownedQueued)
        await composer.press("Enter")
        await expect(question(ownedQueued).getByText(QUEUED, { exact: true })).toBeVisible({ timeout: 15_000 })
        ownedQueuedId = await question(ownedQueued).getAttribute("data-id")
        expect(ownedQueuedId).toEqual(expect.any(String))
        await composer.fill(ownedDraft)
        await expect(composer).toHaveAttribute("data-draft", "saved", { timeout: 15_000 })
        // Close the page while still offline, so the pending write cannot
        // reach Postgres until the next activation reopens its stored outbox.
        await page.goto("about:blank")
        await context.setOffline(false)
        await page.goto(app)
        await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 60_000 })
      })
      await step("The owner's queued question sends once; the legacy queue never sends", async () => {
        await expect(question(ownedQueued)).toHaveCount(1, { timeout: 60_000 })
        await expect.poll(stored, { timeout: 60_000 }).toEqual([synced, ownedQueued])
        await assertQueueIds()
        await expect(question(ownedQueued).getByText(QUEUED, { exact: true })).toHaveCount(0)
        await expect(question(queued)).toHaveCount(0)
        await openComposer()
        await expect(composer).toHaveValue(ownedDraft, { timeout: 30_000 })
        await expect(composer).toHaveAttribute("data-draft", "saved")
      })
      await step("Reload: the owner's draft stays and neither queue replays", async () => {
        await page.reload()
        await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 60_000 })
        await openComposer()
        await expect(composer).toHaveValue(ownedDraft, { timeout: 30_000 })
        await expect(composer).toHaveAttribute("data-draft", "saved")
        expect(await stored()).toEqual([synced, ownedQueued])
        await assertQueueIds()
        expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).personId, OWNER_KEY)).toBe(ownerId)
        await expect(question(queued)).toHaveCount(0)
      })
    } finally {
      await builds.close()
    }
  }
)
