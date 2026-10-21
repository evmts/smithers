import { expect, type Page, test, type TestInfo } from "@playwright/test"
import { recordActions, step, themeOf, writeManifest } from "./fixtures"

// The coding factory, end to end (decision 0016, the factory simplified; docs/features/todos.md#the-run): a person asks
// Smithers for a TODO and commits it; the `todo` run takes it to a mergeable pull request on GitHub. Everything is real
// but the chat agent that drafts the TODO, the scripted one in the browser's engine worker (`/app?agent=todo-draft`,
// src/test/scriptedAgent.ts), so the draft is the same every run. The run itself is the deployment's: the branch on
// GitHub, the agent writing the change on the branch's machine with the real model, the commit and the pull request.
//
// It writes to GitHub, so it runs only against a live instance (BASE_URL) with the GitHub App and `TODO_RUNS` on, on a
// scratch repository the test account administers with the App installed, and skips naming what it lacks:
// - E2E_FACTORY_REPOSITORY: `owner/name` of that repository, which is the deployment's GITHUB_REPOSITORY;
// - E2E_SESSION_COOKIE: the test account's session cookie on the app under test (`name=value`), from a real sign-in.
// It never merges: a person merges, and the pull request stays open for one.

const started = new WeakMap<TestInfo, number>()
const repo = process.env.E2E_FACTORY_REPOSITORY ?? ""

test.beforeEach(async ({ context, page }, info) => {
  started.set(info, Date.now())
  const raw = process.env.E2E_SESSION_COOKIE
  test.skip(!raw || repo === "" || process.env.BASE_URL === undefined, "Needs a live instance, its scratch repository and a real session")
  await page.emulateMedia({ colorScheme: themeOf(info) })
  await context.addCookies([{ name: raw!.slice(0, raw!.indexOf("=")), value: raw!.slice(raw!.indexOf("=") + 1), url: process.env.BASE_URL! }])
  await recordActions(page, info, "Maya")
  const session = await (await context.request.get("/api/auth/session")).json() as { signedIn: boolean; role?: string }
  expect(session.signedIn, "The live session must be renewed before running this spec").toBe(true)
  expect(["admin", "maintainer", "member"], `the test account's role on ${repo}`).toContain(session.role)
})

test.afterEach(async ({ page }, info) => {
  await writeManifest(info, "flow.json", started.get(info) ?? Date.now(), [{ name: "Maya", video: await page.video()?.path(), openedAt: 0 }])
})

/** The stack page's row of the TODO whose title has `word`. */
const row = (page: Page, word: string) =>
  page.getByRole("region", { name: `${repo} stack` }).locator("[data-slot=issues-row]", { hasText: word })

/** The page of the TODO titled `title`. */
const todoPage = (page: Page, title: string) => page.getByRole("article", { name: new RegExp(title) })

test("factory: a TODO runs to a mergeable pull request", {
  annotation: { type: "summary", description: "Commit a TODO; Smithers branches, writes the change, and opens a pull request a person can merge." },
}, async ({ page }) => {
  test.setTimeout(30 * 60_000)
  const word = `f${Date.now().toString(36)}`
  const title = `Greet in the README ${word}`

  await step("Ask Smithers for a TODO", async () => {
    await page.goto("/app?agent=todo-draft")
    await expect(page.getByRole("main", { name: "App" })).toBeVisible({ timeout: 60_000 })
    const composer = page.getByRole("textbox", { name: "Message Smithers" })
    if (await composer.isHidden()) await page.keyboard.press("ControlOrMeta+k")
    await expect(page.locator('form[data-slot="chat-composer"]')).toHaveAttribute("data-status", "ready", { timeout: 60_000 })
    await composer.fill(`todo-draft ${repo} ${word}`)
    await composer.press("Enter")
  })

  await step("Edit the draft and commit it", async () => {
    const draft = page.getByRole("form", { name: "TODO draft" })
    await expect(draft).toBeVisible({ timeout: 120_000 })
    await draft.getByLabel("Title").fill(title)
    await draft.getByRole("button", { name: "Commit" }).click()
    await expect(page).toHaveURL(new RegExp(`/${repo}/stack$`), { timeout: 30_000 })
    await expect(row(page, word)).toContainText(/T\d+/, { timeout: 60_000 })
  })

  const number = (await row(page, word).textContent())!.match(/T(\d+)/)![1]!

  await step("Smithers starts working on it", async () => {
    await expect(row(page, word)).toHaveAttribute("data-status", "running", { timeout: 120_000 })
    await row(page, word).getByRole("link", { name: title }).click()
    await expect(page).toHaveURL(new RegExp(`/${repo}/stack/${number}$`))
    await expect(todoPage(page, title)).toHaveAttribute("data-status", /running|in_review/, { timeout: 60_000 })
  })

  await step("The agent writes the change and opens a pull request", async () => {
    await expect(todoPage(page, title)).toHaveAttribute("data-status", "in_review", { timeout: 25 * 60_000 })
  })

  const pull = await step("The pull request is open and mergeable on GitHub", async () => {
    const link = page.getByRole("link", { name: /^#\d+$/ })
    await expect(link).toBeVisible({ timeout: 60_000 })
    const prNumber = Number((await link.textContent())!.slice(1))
    const response = await page.request.get(`https://api.github.com/repos/${repo}/pulls/${prNumber}`)
    expect(response.status()).toBe(200)
    const body = await response.json() as { state: string; merged: boolean; mergeable: boolean | null; head: { ref: string } }
    expect(body.state).toBe("open")
    expect(body.merged).toBe(false)
    expect(body.head.ref).toMatch(new RegExp(`^smithers/t${number}-`))
    return { prNumber, body }
  })
  expect(pull.prNumber).toBeGreaterThan(0)
})
