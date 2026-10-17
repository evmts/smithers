import { expect, test } from "@playwright/test"
import type { Page, Route } from "@playwright/test"
import { identityRoute, SCOPED_TEST_USER } from "../playwright/identity"

/*
 * A curated catalog row is not an admission fence (lane 95, mvp.md M-46).
 *
 * `/effect-ts/effect/` — one of the ten curated coming-soon names — used to be
 * a prerendered marketing page, and the Worker also kept every subject below
 * it out of the app, so a maintainer whose Smithers GitHub App installation
 * had just landed could never reach the import path: a compiled page won
 * first. This runs against the REAL built Astro document for that repository,
 * served by `astro preview`, with the REAL app island on it, and pins what the
 * route says in each state the backend can actually answer.
 *
 * Serving the app grants nothing. Availability is still the catalog's answer
 * and the account's own inventory, and every sentence below comes from a read.
 */

const CURATED = "effect-ts/effect"
const ACCESS = `**/api/user/github-access/effect-ts/effect*`
const INSTALL_PAGE = "https://github.com/apps/team-install/installations/new"

interface Reads {
  /** Every request to an authentication door, observed and never followed. */
  readonly auth: Array<string>
  /** Every coverage-door read, so one bounded repository-specific read is visible as one. */
  readonly access: Array<string>
}

/**
 * A signed-in visitor at a repository neither the public catalog nor this
 * account's inventory has, with the coverage door answering `verdict`.
 */
async function visitor(
  page: Page,
  options: { readonly signedIn?: boolean; readonly verdict?: Record<string, unknown>; readonly accessStatus?: number } = {}
): Promise<Reads> {
  const reads: Reads = { auth: [], access: [] }
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) })
  await page.route("**/api/**", (route: Route) => route.fulfill(json({ message: "Unavailable test route" }, 404)))
  await page.route("**/api/bootstrap", route => route.fulfill(json({
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["identity", "cloud", "agent"], authFlow: "redirect", sandbox: null
  })))
  // The curated repository is deliberately NOT in the catalog: a curated row
  // is availability, and this lane did not grant it.
  await page.route("**/api/public/repos", route => route.fulfill(json({
    repos: [{ name: "smithersai/smithers", title: "Smithers", url: "https://github.com/smithersai/smithers", summary: "The Smithers monorepo", stats: null }]
  })))
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session",
    identityRoute(options.signedIn === false ? null : SCOPED_TEST_USER.login))
  // The inventory read carries a limit (`/api/user/repos?limit=100`), so match the path.
  await page.route(url => url.pathname === "/api/user/repos", route => route.fulfill(json({ repos: [] })))
  await page.route(url => url.pathname === "/api/user/orgs", route => route.fulfill(json({ orgs: [] })))
  await page.route(url => url.pathname === "/api/user/workspaces", route => route.fulfill(json([])))
  await page.route(ACCESS, route => {
    reads.access.push(route.request().url())
    return options.accessStatus !== undefined
      ? route.fulfill(json({ message: "Coverage unavailable" }, options.accessStatus))
      : route.fulfill(json(options.verdict ?? { verdict: "app-not-installed", install_url: INSTALL_PAGE }))
  })
  await page.route("**/api/auth/github*", route => {
    reads.auth.push(route.request().url())
    return route.fulfill({ status: 204, body: "" })
  })
  return reads
}

/** The app, mounted on the curated repository's own built document. */
const mounted = async (page: Page) => {
  await expect(page.locator(".app-shell")).toBeVisible()
  await expect(page.getByTestId("composer-input")).toBeAttached()
  // The marketing page this document used to be is gone.
  await expect(page.locator("main.hero")).toHaveCount(0)
  await expect(page.getByText("Coming soon", { exact: false })).toHaveCount(0)
}

const entryNotice = (page: Page) => page.locator('[data-message-id="repository-entry"]')

test("a curated repository root serves the app, and an installed App offers the import", async ({ page }, testInfo) => {
  const errors: Array<string> = []
  page.on("pageerror", error => errors.push(error.message))
  const reads = await visitor(page, { verdict: { verdict: "ok", installation_id: 42, install_url: INSTALL_PAGE } })

  await page.goto(`/${CURATED}/`)
  await mounted(page)
  const notice = entryNotice(page)
  await expect(notice).toContainText(`Smithers doesn't have ${CURATED} yet.`)
  await expect(notice).toContainText("The Smithers GitHub App covers it for your account.")
  await expect(notice.getByRole("button", { name: "Import", exact: true })).toBeVisible()
  // Serving the app did not make the repository available, and nothing was imported by arriving.
  await expect(page.getByText("Coming soon")).toHaveCount(0)
  expect(reads.access).toHaveLength(1)
  expect(reads.auth).toEqual([])
  // The repository's own address, through a reload.
  await expect(page).toHaveURL(new RegExp(`/${CURATED}/?$`))
  await page.reload()
  await mounted(page)
  await expect(entryNotice(page)).toContainText("The Smithers GitHub App covers it for your account.")
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("curated-import-offer.png"), fullPage: true })
})

test("a curated repository the App does not cover links the installation page and asserts no absence", async ({ page }) => {
  await visitor(page, { verdict: { verdict: "app-not-installed", install_url: INSTALL_PAGE } })
  await page.goto(`/${CURATED}/`)
  await mounted(page)
  const notice = entryNotice(page)
  await expect(notice).toContainText("the Smithers GitHub App doesn't cover it for your account")
  // Both readings GitHub's 404 allows, asserting neither (M-46).
  await expect(notice).toContainText("It may not exist on GitHub, or may not be accessible to this account.")
  await expect(notice.getByRole("link", { name: "Install the Smithers GitHub App" })).toHaveAttribute("href", INSTALL_PAGE)
  await expect(notice.getByRole("button", { name: "Import", exact: true })).toHaveCount(0)
})

test("a curated repository whose installation cannot read it says so, and never claims it is absent", async ({ page }) => {
  await visitor(page, { verdict: { verdict: "permission-missing", installation_id: 7, approve_url: INSTALL_PAGE } })
  await page.goto(`/${CURATED}/`)
  await mounted(page)
  const notice = entryNotice(page)
  await expect(notice).toContainText("The Smithers GitHub App is installed on it, but it can't read it for your account.")
  await expect(notice).not.toContainText("may not exist on GitHub")
  await expect(notice.getByRole("button", { name: "Import", exact: true })).toHaveCount(0)
})

test("a coverage door that cannot be read is unknown and retryable, never a refusal of the repository", async ({ page }) => {
  const reads = await visitor(page, { accessStatus: 503 })
  await page.goto(`/${CURATED}/`)
  await mounted(page)
  const notice = entryNotice(page)
  await expect(notice).toContainText(`couldn't check whether it can import it`)
  await expect(notice).not.toContainText("doesn't cover it")
  await expect(notice.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
  expect(reads.access).toHaveLength(1)
})

test("signed out, a curated repository root reads nothing private and offers the existing door", async ({ page }) => {
  const reads = await visitor(page, { signedIn: false })
  await page.goto(`/${CURATED}/`)
  await mounted(page)
  await expect(page.getByText(`${CURATED} isn't on Smithers yet.`)).toBeVisible()
  // The account's coverage door is not a signed-out reader's read, and nothing signs anybody in.
  expect(reads.access).toEqual([])
  expect(reads.auth).toEqual([])
  await expect(page.getByRole("button", { name: "Sign in with GitHub" }).first()).toBeVisible()
})
