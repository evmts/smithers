import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { SIGN_IN, SIGN_OUT } from "../src/features/auth/contract"
import { NEW_ISSUE } from "../src/features/issues/contract"
import { flowName } from "./fixtures"

// Issues, end to end (docs/features/issues.md, decision 0012 slice G0): the real app, ChatApi, Durable Objects,
// Postgres and Electric, two devices side by side in one video each, so `pnpm e2e:gifs` makes one GIF per flow.
//
// - "who reads" runs wherever the app runs: a signed-out device is asked to sign in on a repository GitHub hasn't said
//   is public, while a signed-in Member's device gets the list and New issue. It writes nothing anywhere.
// - "two devices" is G1 and G3: device A opens an issue, device B sees it numbered by GitHub, B comments, A sees the
//   comment. It writes to GitHub, so it runs only on a scratch repository Will owns with the Smithers GitHub App
//   installed, never `smithersai/*`, and skips naming what it lacks:
//   - E2E_ISSUES_REPOSITORY: `owner/name` of that repository, which is the deployment's GITHUB_REPOSITORY;
//   - E2E_SESSION_COOKIE: a signed-in Member's session cookie on the app under test (`name=value`), from a real sign-in
//     as the test account, since this suite can't drive GitHub's sign-in page;
//   - locally, GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in the dev server's environment (with GITHUB_REPOSITORY set
//     to the scratch repository and GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET for sign-in).
//
// The issues list shows a loading state until the repository's first complete sync (0012 §2, never "No issues"
// before), so these tests don't use the no-spinner fixtures: a loading list is the specified state, not a regression.

const BASE = process.env.BASE_URL ?? "http://localhost:1337"
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(BASE)

/** The repository the "who reads" test opens, read-only: the dev server's default `GITHUB_REPOSITORY`. */
const READ_REPOSITORY = "smithersai/smithers"

const VIEWPORT = { width: 560, height: 720 }

/** A device: its own browser context, video and log, labelled in its video. */
interface Device {
  readonly name: string
  readonly context: BrowserContext
  readonly page: Page
  readonly openedAt: number
  readonly log: Array<string>
}

class Devices {
  readonly all: Array<Device> = []
  private readonly startedAt = Date.now()
  constructor(private readonly browser: Browser, private readonly testInfo: TestInfo) {}

  async open(name: string, cookie?: { readonly name: string; readonly value: string }) {
    const context = await this.browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: this.testInfo.outputPath("videos"), size: VIEWPORT },
    })
    if (cookie !== undefined) await context.addCookies([{ ...cookie, url: BASE }])
    const page = await context.newPage()
    await page.addInitScript((label: string) => {
      addEventListener("DOMContentLoaded", () => {
        const badge = document.createElement("div")
        badge.setAttribute("aria-hidden", "true")
        badge.textContent = label
        Object.assign(badge.style, {
          position: "fixed",
          top: "6px",
          right: "6px",
          zIndex: "2147483647",
          pointerEvents: "none",
          font: "600 12px/1.6 system-ui, sans-serif",
          color: "#fff",
          background: "#1f2937",
          padding: "0 8px",
          borderRadius: "999px",
        })
        document.body.append(badge)
      })
    }, name)
    const log: Array<string> = []
    page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`))
    page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`))
    const device = { name, context, page, openedAt: (Date.now() - this.startedAt) / 1000, log }
    this.all.push(device)
    return device
  }

  async teardown() {
    if (this.testInfo.status !== this.testInfo.expectedStatus) {
      for (const device of this.all) {
        const path = this.testInfo.outputPath(`${device.name}-browser.log`)
        await writeFile(path, device.log.join("\n"))
        await this.testInfo.attach(`${device.name}-browser.log`, { path, contentType: "text/plain" })
      }
    }
    await Promise.all(this.all.map((device) => device.context.close().catch(() => undefined)))
    const videos = await Promise.all(
      this.all.map(async (device) => ({ name: device.name, video: await device.page.video()?.path(), openedAt: device.openedAt })),
    )
    await writeFile(
      this.testInfo.outputPath("devices.json"),
      JSON.stringify({ flow: flowName(this.testInfo), title: this.testInfo.title, status: this.testInfo.status, videos }, null, 2),
    )
  }
}

const test = base.extend<{ devices: Devices }>({
  devices: async ({ browser }, use, testInfo) => {
    const devices = new Devices(browser, testInfo)
    await use(devices)
    await devices.teardown()
  },
})

test("who reads: signed out, a repository GitHub hasn't said is public asks to sign in; a Member gets the list", async ({ devices }) => {
  test.skip(!local, "signing out on a deployment goes through GitHub; this runs against alchemy dev's local developer")
  test.skip(
    process.env.E2E_ISSUES_REPOSITORY !== undefined || process.env.GITHUB_APP_ID !== undefined,
    "this case needs a repository GitHub hasn't said is public: run it on a dev server without the GitHub App",
  )
  const member = await devices.open("Member")
  const visitor = await devices.open("signed out")
  // A Member (alchemy dev's local developer, an Admin) gets the list, and New issue opens the form.
  await member.page.goto(`/${READ_REPOSITORY}/issues`)
  await expect(member.page.getByRole("region", { name: `${READ_REPOSITORY} issues` })).toBeVisible({ timeout: 30_000 })
  expect((await member.page.request.get("/api/shapes/items?offset=-1")).status()).toBe(200)
  await member.page.getByRole("link", { name: NEW_ISSUE }).click()
  await expect(member.page).toHaveURL(new RegExp(`/${READ_REPOSITORY}/issues/new$`))
  await expect(member.page.getByLabel("Title")).toBeVisible()

  // The visitor signs out: alchemy dev's local developer stays signed out with the dev cookie.
  await visitor.page.goto("/app")
  await visitor.page.getByRole("button", { name: SIGN_OUT }).click({ timeout: 30_000 })
  await expect(visitor.page.getByRole("link", { name: SIGN_IN }).first()).toBeVisible({ timeout: 30_000 })
  // Signed out, the shape itself refuses: nothing of the repository reaches the device.
  expect((await visitor.page.request.get("/api/shapes/items?offset=-1")).status()).toBe(401)
  await visitor.page.goto(`/${READ_REPOSITORY}/issues`)
  await expect(visitor.page.getByRole("main", { name: "Issues" }).getByRole("link", { name: SIGN_IN })).toBeVisible({
    timeout: 30_000,
  })
  await expect(visitor.page.getByRole("region", { name: `${READ_REPOSITORY} issues` })).toHaveCount(0)
  // The Member's form is still there beside it.
  await expect(member.page.getByLabel("Title")).toBeVisible()
})

const scratch = process.env.E2E_ISSUES_REPOSITORY ?? ""
const needs = [
  "E2E_ISSUES_REPOSITORY",
  "E2E_SESSION_COOKIE",
  ...(local ? ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"] : []),
].filter((name) => (process.env[name] ?? "") === "")

test("two devices: A opens an issue, B sees GitHub number it and comments, A sees the comment", async ({ devices }) => {
  test.skip(needs.length > 0, `This writes to a scratch GitHub repository: set ${needs.join(", ")}.`)
  test.skip(/^smithersai\//i.test(scratch), "E2E_ISSUES_REPOSITORY may not be a smithersai repository")
  test.setTimeout(240_000)
  const raw = process.env.E2E_SESSION_COOKIE!
  const cookie = { name: raw.slice(0, raw.indexOf("=")), value: raw.slice(raw.indexOf("=") + 1) }
  const a = await devices.open("A", cookie)
  const b = await devices.open("B", cookie)
  const title = `Smithers e2e ${new Date().toISOString()}`

  // A opens the issue: Requested at once as #–, then numbered once GitHub has it.
  await a.page.goto(`/${scratch}/issues/new`)
  await a.page.getByLabel("Title").fill(title)
  await a.page.getByLabel("Description").fill("Opened by the two-device e2e test.")
  await a.page.getByRole("button", { name: "Create issue" }).click()
  await expect(a.page).toHaveURL(new RegExp(`/${scratch}/issues$`))
  const row = (page: Page) => page.getByRole("listitem").filter({ hasText: title })
  await expect(row(a.page)).toBeVisible({ timeout: 30_000 })
  await expect(row(a.page)).toContainText(/#\d+/, { timeout: 120_000 })

  // B sees it, numbered, and comments on it.
  await b.page.goto(`/${scratch}/issues`)
  await expect(row(b.page)).toContainText(/#\d+/, { timeout: 60_000 })
  await row(b.page).getByRole("link", { name: title }).click()
  await expect(b.page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 })
  const comment = `Comment from B ${Date.now()}`
  await b.page.getByLabel("Comment").fill(comment)
  await b.page.getByRole("button", { name: "Comment" }).click()
  await expect(b.page.getByText(comment)).toBeVisible({ timeout: 30_000 })

  // A sees B's comment once GitHub has it.
  await row(a.page).getByRole("link", { name: title }).click()
  await expect(a.page.getByText(comment)).toBeVisible({ timeout: 120_000 })
})
