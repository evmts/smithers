import { placeholderRules } from "@smthrs/rpc/fixtures/FrontDoor"
import emptyRules from "../../../../.smithers/front-door.json"
import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { identityRoute, SCOPED_TEST_USER, signedOutVisitor, signupProfileRoute } from "../playwright/identity"

/* Built static landing, shared open form and the retained signed-in launcher. */

/** The news source the launcher seam reads, credential-free (state/seams/LauncherSeam.ts). */
const RELEASES = /api\.github\.com\/repos\/smithersai\/smithers\/releases/

/** Two published releases, as GitHub's releases page answers them. */
const RELEASE_ROWS = [
  {
    name: "Smithers 1.0.0-rc.8", tag_name: "v1.0.0-rc.8", draft: false, published_at: "2026-10-14T09:00:00Z",
    html_url: "https://github.com/smithersai/smithers/releases/tag/v1.0.0-rc.8"
  },
  {
    name: "Smithers 1.0.0-rc.7", tag_name: "v1.0.0-rc.7", draft: false, published_at: "2026-10-02T09:00:00Z",
    html_url: "https://github.com/smithersai/smithers/releases/tag/v1.0.0-rc.7"
  }
]

/** The existing public catalog read (`GET /api/public/repos`): the explore shelf. */
const PUBLIC_REPOS = {
  repos: [
    { name: "smithersai/smithers", summary: "The Smithers monorepo" },
    { name: "smithersai/examples", summary: "Worked examples" }
  ]
}

interface Reads {
  /** Every request the page made to an authentication door. */
  readonly auth: Array<string>
  /** The headers of each public read, so a credential on one is visible here. */
  readonly publicHeaders: Array<{ readonly url: string; readonly headers: Record<string, string> }>
}

/**
 * A genuinely fresh signed-out visitor: no identity, the public catalog and
 * the published releases answering, and every authentication door observed
 * rather than taken.
 */
async function freshVisitor(page: Page, answers: { catalog?: number; releases?: number } = {}): Promise<Reads> {
  const reads: Reads = { auth: [], publicHeaders: [] }
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => {
    const request = route.request()
    reads.publicHeaders.push({ url: request.url(), headers: request.headers() })
    return answers.catalog === undefined || answers.catalog === 200
      ? route.fulfill({ json: PUBLIC_REPOS })
      : route.fulfill({ status: answers.catalog, json: { message: "Catalog unavailable" } })
  })
  await page.route(RELEASES, route => {
    const request = route.request()
    reads.publicHeaders.push({ url: request.url(), headers: request.headers() })
    return answers.releases === undefined || answers.releases === 200
      ? route.fulfill({ json: RELEASE_ROWS })
      : route.fulfill({ status: answers.releases, json: { message: "Releases unavailable" } })
  })
  // The sign-in hop leaves the origin. Observe the door; never follow it.
  await page.route("**/api/auth/github*", route => {
    reads.auth.push(route.request().url())
    return route.fulfill({ status: 204, body: "" })
  })
  return reads
}

const launcherOf = (page: Page) => page.getByTestId("repository-launcher")

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`signed-out static install landing at ${viewport.width}`, async ({ page, context }) => {
    await page.setViewportSize(viewport)
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const reads = await freshVisitor(page, { catalog: 503, releases: 500 })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Durable agent coding on your own subscription." })).toBeVisible()
    await expect(page.locator(".landing-sub")).toContainText("you review the diff and land it yourself")
    await expect(page.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute("href", "/docs/installation/")
    await expect(page.getByRole("link", { name: "Source", exact: true })).toHaveAttribute("href", "https://github.com/smithersai/smithers")
    await expect(page.locator(".landing-command")).toContainText("npm i -g smthrs@next")
    await page.getByRole("button", { name: "Copy", exact: true }).click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("npm i -g smthrs@next")
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
    await expect(page.locator("body")).not.toContainText(/Explore|Smithers updates|couldn't load|Welcome to Smithers/)
    await expect(launcherOf(page)).toHaveCount(0)
    await expect(page.getByTestId("composer-input")).toHaveCount(0)
    expect(reads.publicHeaders).toEqual([])
    expect(reads.auth).toEqual([])
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible()
    await page.screenshot({ path: `${process.env.HOME}/smithers-lanes/pm-smithers-1.shots/landing-${viewport.width}.png`, fullPage: true })
  })
}

/** The signed-in account this spec runs as, with its own repository and the public reads. */
async function returningVisitor(page: Page, zeroRepos = false): Promise<Reads> {
  const reads: Reads = { auth: [], publicHeaders: [] }
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) })
  await page.route("**/api/**", route => route.fulfill(json({ message: "Unavailable test route" }, 404)))
  await signupProfileRoute(page)
  await page.route("**/api/bootstrap", route => route.fulfill(json({
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["identity", "cloud", "agent"], authFlow: "redirect", sandbox: null
  })))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(SCOPED_TEST_USER.login))
  // The inventory read is `/api/user/repos?limit=100` (state/seams/RepositoriesSeam.ts).
  await page.route(url => url.pathname === "/api/user/repos", route => route.fulfill(json({
    repos: zeroRepos ? [] : [{ owner: SCOPED_TEST_USER.login, name: "widgets", full_name: `${SCOPED_TEST_USER.login}/widgets`, default_bookmark: "main", owner_type: "User" }]
  })))
  await page.route(url => url.pathname === `/api/repos/${SCOPED_TEST_USER.login}/widgets/bookmarks`,
    route => route.fulfill(json({ items: [{ name: "main", target_change_id: "chg-w", target_commit_id: "c0ffee" }], next_cursor: "" })))
  await page.route(url => url.pathname === "/api/user/orgs", route => route.fulfill(json({ orgs: [] })))
  await page.route(url => url.pathname === "/api/user/workspaces", route => route.fulfill(json([])))
  await page.route("**/api/public/repos", route => {
    reads.publicHeaders.push({ url: route.request().url(), headers: route.request().headers() })
    return route.fulfill(json(PUBLIC_REPOS))
  })
  await page.route(RELEASES, route => {
    reads.publicHeaders.push({ url: route.request().url(), headers: route.request().headers() })
    return route.fulfill(json(RELEASE_ROWS))
  })
  // The catalog repository this visitor opens first, so the root has something retained under it.
  await page.route("**/api/repos/smithersai/smithers", route => route.fulfill(json({ full_name: "smithersai/smithers", default_bookmark: "main" })))
  await page.route("**/api/repos/smithersai/smithers/home", route => route.fulfill(json({ kind: "none" })))
  await page.route("**/api/repos/smithersai/smithers/bookmarks", route => route.fulfill(json({ items: [{ name: "main", target_change_id: "chg-1" }], next_cursor: "" })))
  await page.route("**/api/repos/smithersai/smithers/contents**", route => route.fulfill(json([
    { name: "README.md", path: "README.md", type: "file" },
    { name: "apps", path: "apps", type: "dir" }
  ])))
  await page.route("**/api/auth/github*", route => {
    reads.auth.push(route.request().url())
    return route.fulfill({ status: 204, body: "" })
  })
  return reads
}

test("the hosted root opens on the launcher for a signed-in person, with their retained work below it", async ({ page }, testInfo) => {
  const errors: Array<string> = []
  page.on("pageerror", error => errors.push(error.message))
  const reads = await returningVisitor(page)

  // Retained state, made by opening a repository, exactly as a person would:
  // the selection and this account's own session persist in this context.
  await page.goto("/smithersai/smithers/")
  await expect(page.locator(".app-shell")).toBeVisible()
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(launcherOf(page)).toHaveCount(0)

  await page.goto("/")
  const launcher = launcherOf(page)
  await expect(launcher).toBeVisible()
  // The transcript says what it opened on, and it is not the live edge.
  await expect(page.locator('[data-slot="chat-transcript"]')).toHaveAttribute("data-opening", "launcher")
  await expect(page.locator('[data-slot="chat-transcript"]')).not.toHaveAttribute("data-login", /.*/)

  /*
   * Whole in the viewport, from the launcher's own first heading — the public
   * shelf and the news land after it paints, and that growth is what used to
   * carry the opening off the top.
   */
  for (const section of ["open-existing", "open", "create", "explore", "updates"]) {
    await expect(launcher.locator(`[data-section="${section}"]`)).toBeInViewport({ ratio: 1 })
  }
  await expect(launcher.getByRole("textbox", { name: "Open an existing repository" })).toBeInViewport({ ratio: 1 })
  expect(await launcher.evaluate(node => node.getBoundingClientRect().top >= 0)).toBe(true)
  // Signed in, the private acts are the person's own: their repository is listed, and Create is a form.
  await expect(launcher.locator('[data-section="open"]')).toContainText("widgets")
  await expect(launcher.getByRole("textbox", { name: "New repository name" })).toBeAttached()

  /*
   * Additive, and this is the exact regression: the Home card — what the
   * transcript used to open at for a signed-in person — is still on the page,
   * BELOW the launcher, and nothing was taken away to put the launcher first.
   */
  await expect(page.locator('[data-message-id="home"]')).toBeAttached()
  expect(await page.evaluate(() => {
    const launcherNode = document.querySelector('[data-testid="repository-launcher"]')
    const home = document.querySelector('[data-message-id="home"]')
    return launcherNode !== null && home !== null &&
      (launcherNode.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })).toBe(true)

  await expect(page).toHaveURL(/\/$/)
  // Reload, Back and Forward keep the launcher as this root's opening.
  await page.reload()
  await expect(launcherOf(page)).toBeVisible()
  await expect(page.locator('[data-slot="chat-transcript"]')).toHaveAttribute("data-opening", "launcher")
  await page.goBack()
  await expect(page).toHaveURL(/\/smithersai\/smithers\/?$/)
  await page.goForward()
  await expect(launcherOf(page)).toBeVisible()
  await expect(launcherOf(page).locator('[data-section="open-existing"]')).toBeInViewport({ ratio: 1 })

  // Nothing signed anybody in, and the public reads still carry no credential.
  expect(reads.auth).toEqual([])
  for (const read of reads.publicHeaders) {
    expect(read.headers.authorization, read.url).toBeUndefined()
    expect(read.headers.cookie, read.url).toBeUndefined()
  }
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("signed-in-root-launcher.png"), fullPage: true })
})

test.describe("narrow dark signed-in entry", () => {
  test.use({ colorScheme: "dark", viewport: { width: 380, height: 720 } })
  test("the signed-in root opens at the launcher's first heading on a narrow dark page, and Tab reaches the box", async ({ page }, testInfo) => {
    await returningVisitor(page)
    await page.goto("/")
    const launcher = launcherOf(page)
    await expect(launcher).toBeVisible()
    await expect(launcher.locator('[data-section="open-existing"]')).toBeInViewport({ ratio: 1 })
    await expect(launcher.getByRole("textbox", { name: "Open an existing repository" })).toBeInViewport({ ratio: 1 })
    expect(await launcher.evaluate(node => node.getBoundingClientRect().top >= 0)).toBe(true)
    // The box is reachable by keyboard from the document, signed in as well.
    const reached: Array<string> = []
    for (let press = 0; press < 20 && !reached.includes("open-existing"); press++) {
      await page.keyboard.press("Tab")
      const focused = await page.evaluate(() => {
        const active = document.activeElement
        if (active === null || active.closest('[data-testid="repository-launcher"]') === null) return ""
        return active.closest('[data-section]')?.getAttribute("data-section") ?? "other"
      })
      if (focused !== "" && !reached.includes(focused)) reached.push(focused)
    }
    expect(reached).toContain("open-existing")
    await page.screenshot({ path: testInfo.outputPath("narrow-dark-signed-in-launcher.png"), fullPage: true })
  })
})

/** Public contents route, the only changed server answer: the real seam and chooser still run. */
async function rulesFixture(page: Page, rules: unknown = placeholderRules) {
  await page.route("**/api/repos/smithers-canary/smithers/contents/.smithers/front-door.json", route =>
    route.fulfill({ json: { content: JSON.stringify(rules), encoding: "utf-8" } }))
  // Per-load holdout is random in production. Keep these journey fixtures in the treatment arm.
  await page.addInitScript(() => { Math.random = () => 0.9 })
}

test("a journey arrival never adds a second signed-out action", async ({ page }) => {
  const reads = await freshVisitor(page)
  await rulesFixture(page)
  await page.goto("/?utm_source=effeck&utm_medium=powered-by", { referer: "https://effeck.dev/" })
  await expect(page.locator(".landing-command")).toBeVisible()
  await expect(page.getByTestId("front-door-lead")).toHaveCount(0)
  await expect(page.getByRole("button")).toHaveCount(1)
  expect(reads.publicHeaders).toEqual([])
})

test("a signed-in zero-repo account gets the fixture import lead with open-existing first", async ({ page }) => {
  await returningVisitor(page, true)
  await rulesFixture(page)
  await page.goto("/")
  const launcher = launcherOf(page)
  await expect(launcher.getByTestId("front-door-lead")).toContainText("PLACEHOLDER: Bring your repository")
  expect(await launcher.locator("[data-section]").first().getAttribute("data-section")).toBe("open-existing")
  await expect(launcher.getByRole("textbox", { name: "Open an existing repository" })).toBeVisible()
})

test("empty rules leave the signed-out first screen unchanged", async ({ page }) => {
  await freshVisitor(page)
  await rulesFixture(page, emptyRules)
  await page.goto("/")
  await expect(page.locator(".landing-command")).toBeVisible()
  await expect(page.getByTestId("front-door-lead")).toHaveCount(0)
})

test("held open variant accepts a GitHub URL at the same repository route", async ({ page }) => {
  test.skip(process.env.SMITHERS_LANDING_TEST_ACTION !== "open", "Built with the install action")
  await freshVisitor(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Coding agents for your GitHub repo." })).toBeVisible()
  await expect(page.locator(".landing-command")).toHaveCount(0)
  await page.getByRole("textbox", { name: "Open an existing repository" }).fill("https://evil.example/private/name")
  await page.getByRole("button", { name: "Open", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Enter owner/name")
  await expect(page.getByRole("alert")).not.toContainText("evil.example")
  await page.getByRole("textbox", { name: "Open an existing repository" }).fill("https://github.com/smithersai/smithers")
  await page.getByRole("button", { name: "Open", exact: true }).click()
  await expect(page).toHaveURL(/\/smithersai\/smithers\/?$/)
})
