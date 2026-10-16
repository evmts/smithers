import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { identityRoute, SCOPED_TEST_USER, signedOutVisitor, signupProfileRoute } from "../playwright/identity"

/*
 * The default root a fresh visitor meets (#4041, mvp.md M-45): `/` opens the
 * repository launcher — open, create, explore and real Smithers update news —
 * with no marketing press and no sign-in screen in front of it.
 *
 * This runs against the REAL built site document served by Astro preview and
 * the REAL app island it names, in a browser context Playwright creates for
 * each test: no storage, no cookie, no session. A launcher component test
 * cannot establish that a visitor can reach it.
 */

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

test("the default root opens the repository launcher for a fresh signed-out visitor", async ({ page }, testInfo) => {
  const errors: Array<string> = []
  page.on("pageerror", error => errors.push(error.message))
  const reads = await freshVisitor(page)

  // One navigation to the served root document. No press of any kind.
  await page.goto("/")

  const launcher = launcherOf(page)
  await expect(launcher).toBeVisible()
  // No marketing detour: the hero is gone once the app owns the document.
  await expect(page.locator("main.home")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Get started for free", exact: true })).toHaveCount(0)
  /*
   * No mandatory sign-in detour. The welcome and its email door are still on
   * the page — nothing was taken away — but they are under the launcher, and
   * the transcript is no longer centred on them.
   */
  await expect(page.locator('[data-slot="chat-transcript"]')).not.toHaveAttribute("data-login", /.*/)
  await expect(page.getByTestId("login")).toHaveCount(1)
  expect(await page.evaluate(() => {
    const launcher = document.querySelector('[data-testid="repository-launcher"]')
    const welcome = document.querySelector('[data-testid="login"]')
    return launcher !== null && welcome !== null &&
      (launcher.compareDocumentPosition(welcome) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })).toBe(true)
  /*
   * What a first visit actually shows, whole and from its first heading: the
   * launcher's own sections. Its reads land after it paints, so a transcript
   * that followed that growth would scroll the opening off the top.
   */
  for (const section of ["open-existing", "open", "create", "explore", "updates"]) {
    await expect(launcher.locator(`[data-section="${section}"]`)).toBeInViewport({ ratio: 1 })
  }
  expect(await launcher.evaluate(node => node.getBoundingClientRect().top >= 0)).toBe(true)
  // The default root keeps its own address.
  await expect(page).toHaveURL(/\/$/)

  // Open by name, your repositories, create, explore and the real update news.
  await expect(launcher.locator('[data-section="open-existing"] h2')).toHaveText("Open a repository")
  await expect(launcher.getByRole("textbox", { name: "Open an existing repository" })).toBeVisible()
  await expect(launcher.locator('[data-section="open"] h2')).toHaveText("Your repositories")
  await expect(launcher.locator('[data-section="create"] h2')).toHaveText("Create a repository on GitHub")
  const explore = launcher.getByRole("list", { name: "Public repositories" })
  await expect(explore.getByRole("link", { name: "smithersai/smithers" })).toBeVisible()
  await expect(explore.getByRole("link", { name: "smithersai/examples" })).toBeVisible()
  const updates = launcher.getByRole("list", { name: "Smithers updates" })
  await expect(updates.getByRole("link", { name: "Smithers 1.0.0-rc.8" })).toBeVisible()
  await expect(updates.getByRole("link", { name: "Smithers 1.0.0-rc.7" })).toBeVisible()

  // The sign-in door is on the launcher itself, pressed by the person and nobody else.
  await expect(launcher.locator('[data-flow="sign-in"]')).toBeVisible()
  expect(reads.auth).toEqual([])
  // The public reads carry no credential.
  expect(reads.publicHeaders.length).toBeGreaterThanOrEqual(2)
  for (const read of reads.publicHeaders) {
    expect(read.headers.authorization, read.url).toBeUndefined()
    expect(read.headers.cookie, read.url).toBeUndefined()
  }
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("first-visit-launcher.png"), fullPage: true })
})

test("a private launcher act offers the existing explicit sign-in and signs nobody in", async ({ page }) => {
  const reads = await freshVisitor(page)
  await page.goto("/")
  const launcher = launcherOf(page)
  await expect(launcher).toBeVisible()

  // Signed out, the private acts say what they need instead of attempting it.
  await expect(launcher.locator('[data-section="open"]')).toContainText("Sign in with GitHub to list your own repositories")
  await expect(launcher.locator('[data-section="create"]')).toContainText("Sign in with GitHub to create one")
  await expect(launcher.getByRole("button", { name: "Create", exact: true })).toHaveCount(0)
  await expect(launcher.getByRole("textbox", { name: "New repository name" })).toHaveCount(0)
  // Nothing was signed in by arriving.
  expect(reads.auth).toEqual([])

  // The welcome's own doors stay available under the launcher.
  await expect(page.getByTestId("login-github")).toBeAttached()
  await expect(page.getByTestId("login-email")).toBeAttached()

  const door = launcher.getByRole("button", { name: "Sign in with GitHub", exact: true })
  await expect(door).toBeVisible()
  await door.press("Enter")
  // The existing door, with the root's own safe return target.
  await expect.poll(() => reads.auth.length).toBe(1)
  const started = new URL(reads.auth[0]!)
  expect(started.pathname).toBe("/api/auth/github")
  expect(started.searchParams.get("return_to")).toBe("/?signed-in=github")
})

/*
 * The Open box on the real served document: a signed-out visitor types a
 * repository and presses Enter, and the browser GOES to that repository's own
 * address — the route there owns admission and every refusal. A host this app
 * does not know navigates nowhere and says what to enter, without repeating
 * the typed text.
 */
test("a signed-out visitor opens a repository by name from the launcher, and an unsafe entry goes nowhere", async ({ page }) => {
  const reads = await freshVisitor(page)
  await page.goto("/")
  const launcher = launcherOf(page)
  const field = launcher.getByRole("textbox", { name: "Open an existing repository" })
  await expect(field).toBeVisible()

  await field.fill("https://evil.example/smithersai/smithers")
  await field.press("Enter")
  await expect(launcher.getByTestId("repository-launcher-open-error")).toContainText("Enter owner/name")
  await expect(launcher.getByTestId("repository-launcher-open-error")).not.toContainText("evil.example")
  await expect(page).toHaveURL(/\/$/)
  expect(reads.auth).toEqual([])

  // Enter alone, with no button press, is the whole gesture.
  await field.fill("SmithersAI/Smithers")
  await field.press("Enter")
  await page.waitForURL(/\/smithersai\/smithers\/?$/)
  expect(reads.auth).toEqual([])
})

test("the launcher is the root through reload, Back and Forward", async ({ page }) => {
  await freshVisitor(page)
  await page.goto("/docs/")
  await page.goto("/")
  await expect(launcherOf(page)).toBeVisible()
  await page.reload()
  await expect(launcherOf(page)).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/docs\/?$/)
  await page.goForward()
  await expect(launcherOf(page)).toBeVisible()
})

test("explicit tutorial links and authentication returns still enter the app", async ({ page }) => {
  await freshVisitor(page)
  for (const entry of ["/?tutorial", "/?signed-in=github"]) {
    await page.goto(entry)
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByTestId("composer-input")).toBeAttached()
    await expect(page).toHaveURL("/?tutorial")
  }
})

test("a refused public read never reports that there are no repositories or no updates", async ({ page }) => {
  const reads = await freshVisitor(page, { catalog: 503, releases: 500 })
  await page.goto("/")
  const launcher = launcherOf(page)
  await expect(launcher).toBeVisible()
  const catalog = launcher.getByTestId("repository-launcher-catalog-unreadable")
  const updates = launcher.getByTestId("repository-launcher-updates-unreadable")
  await expect(catalog).toContainText("The public repositories couldn't be read.")
  await expect(updates).toContainText("Smithers updates couldn't be read.")
  for (const absent of ["No repositories are public yet", "carry no published update yet"]) {
    await expect(launcher).not.toContainText(absent)
  }
  // The refusal's only act is to read again, and it is the person's.
  const before = reads.publicHeaders.length
  await updates.getByRole("button", { name: "Retry", exact: true }).click()
  await expect.poll(() => reads.publicHeaders.length).toBeGreaterThan(before)
  expect(reads.auth).toEqual([])
})

test("an explore row opens that repository's own address", async ({ page }) => {
  await freshVisitor(page)
  await page.goto("/")
  const launcher = launcherOf(page)
  await expect(launcher).toBeVisible()
  await launcher.getByRole("list", { name: "Public repositories" }).getByRole("link", { name: "smithersai/smithers" }).click()
  await expect(page).toHaveURL(/\/smithersai\/smithers\/?$/)
  await expect(page.locator(".app-shell")).toBeVisible()
  await expect(launcherOf(page)).toHaveCount(0)
})

test.describe("narrow dark keyboard entry", () => {
  test.use({ colorScheme: "dark", viewport: { width: 380, height: 720 } })
  test("the launcher is legible and reachable by keyboard on a narrow dark root", async ({ page }, testInfo) => {
    await freshVisitor(page)
    await page.goto("/")
    const launcher = launcherOf(page)
    await expect(launcher).toBeVisible()
    for (const section of ["open-existing", "open", "create", "explore", "updates"]) {
      await expect(launcher.locator(`[data-section="${section}"]`)).toBeVisible()
    }
    const box = await launcher.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(380)
    // Narrow, the launcher still opens at its own first heading, not mid-page.
    await expect(launcher.locator('[data-section="open-existing"]')).toBeInViewport({ ratio: 1 })
    expect(box!.y).toBeGreaterThanOrEqual(0)
    // Narrow, the Open box and its own copy stay inside the viewport whole.
    await expect(launcher.getByRole("textbox", { name: "Open an existing repository" })).toBeInViewport({ ratio: 1 })
    await expect(launcher.locator('[data-section="open-existing"]'))
      .toContainText("the same path GitHub uses")
    /*
     * Tab from the document reaches the launcher's own doors and rows. The
     * shelf's rows arrive with the catalog read, AFTER the launcher paints,
     * so the walk waits for one: tabbing through a shelf that has not landed
     * yet failed about one run in three on this machine and said nothing
     * about the focus order it exists to check.
     */
    await expect(launcher.locator(".repository-launcher-row").first()).toBeVisible()
    const reached: Array<string> = []
    for (let press = 0; press < 20 && !reached.includes("row"); press++) {
      await page.keyboard.press("Tab")
      const focused = await page.evaluate(() => {
        const active = document.activeElement
        if (active === null) return ""
        const launcher = active.closest('[data-testid="repository-launcher"]')
        if (launcher === null) return ""
        return active.classList.contains("repository-launcher-row") ? "row" : active.getAttribute("data-flow") === "sign-in" ? "sign-in" : "other"
      })
      if (focused !== "" && !reached.includes(focused)) reached.push(focused)
    }
    expect(reached).toContain("sign-in")
    expect(reached).toContain("row")
    await page.screenshot({ path: testInfo.outputPath("narrow-dark-launcher.png"), fullPage: true })
  })
})

/*
 * The SIGNED-IN hosted root (lane 95). #4041 made the launcher the opening for
 * a signed-out visitor only, so a person with an account arrived at `/` with
 * the transcript's initial read on the Home card BELOW the launcher and the
 * scroller following the public shelf's and the news's growth to the live
 * edge: the Open box was above the top of the page they landed on. M-45's
 * default home is the launcher for everybody who opens repositories here.
 *
 * This runs on the REAL built document with the REAL app island, and the
 * retained state is made the way a person makes it — by opening a repository
 * first, in the same browser context — not by writing the store by hand.
 */

/** The signed-in account this spec runs as, with its own repository and the public reads. */
async function returningVisitor(page: Page): Promise<Reads> {
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
    repos: [{ owner: SCOPED_TEST_USER.login, name: "widgets", full_name: `${SCOPED_TEST_USER.login}/widgets`, default_bookmark: "main", owner_type: "User" }]
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
