import { expect, test } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"

/*
 * Increment 2's Flows and Settings routes in the built app, through the
 * repository frame and the router (mock screens flows-list, flows-list-signed-out,
 * flows-list-reader, flows-source, flows-held, flows-not-found, settings-models-held,
 * settings-sync-member, settings-reader-denied, settings-signed-out). Transport
 * fixtures stand in for the repository document and the contents route; admission,
 * routing, rendering, layout and keyboard run for real.
 */
const REPO = "maya/tinyhttp"
const SOURCE = 'import { Flow } from "smithers"\nexport default Flow.make("review", { description: "Review a change" })\n'
type Viewer = "signed-out" | "reader" | "member"

async function repository(page: import("@playwright/test").Page, viewer: Viewer) {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: REPO }] } }))
  await page.route(`**/api/repos/${REPO}`, route => route.fulfill({ json: {
    full_name: REPO, is_public: true, default_bookmark: "main", can_write: viewer === "member",
    mirror_status: "behind", behind_refs: 2, failed_refs: 0, last_mirror_at: new Date(Date.now() - 3 * 3600_000).toISOString(), last_mirror_error: null
  } }))
  await page.route(`**/api/repos/${REPO}/bookmarks**`, route => route.fulfill({ json: { items: [{ name: "main", target_change_id: "c", target_commit_id: "a".repeat(40) }], next_cursor: "" } }))
  await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.replace(`/api/repos/${REPO}/contents`, "").replace(/^\//, ""))
    if (path === ".smithers/flows") return route.fulfill({ json: [{ name: "review", path: ".smithers/flows/review", type: "dir" }, { name: "notes", path: ".smithers/flows/notes", type: "dir" }, { name: "README.md", path: ".smithers/flows/README.md", type: "file" }] })
    if (path === ".smithers/flows/review") return route.fulfill({ json: [{ name: "flow.ts", type: "file" }] })
    if (path === ".smithers/flows/notes") return route.fulfill({ json: [{ name: "notes.ts", type: "file" }] })
    if (path === ".smithers/flows/review/flow.ts") return route.fulfill({ headers: { "X-Contents-Commit": "b".repeat(40) }, json: { type: "file", content: SOURCE, encoding: "utf-8", size: SOURCE.length } })
    if (path === "") return route.fulfill({ json: [{ name: ".smithers", type: "dir" }, { name: "README.md", type: "file" }] })
    return route.fulfill({ status: 404, json: { code: "not_found", message: "Path not found" } })
  })
  if (viewer !== "signed-out") {
    await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
    await page.route("**/api/user/repos", route => route.fulfill({ json: [] }))
    await page.route("**/api/user/orgs", route => route.fulfill({ json: [] }))
  }
}

/** Every visible control in the page content is reachable with Tab and shows a focus outline. */
async function keyboardReach(page: import("@playwright/test").Page) {
  const controls = page.locator("#repo-content a, #repo-content button, #repo-content select")
  const visible = []
  for (let i = 0; i < await controls.count(); i++) if (await controls.nth(i).isVisible()) visible.push(controls.nth(i))
  expect(visible.length).toBeGreaterThan(0)
  await page.locator("#repo-content").focus()
  const reached = new Set<number>()
  for (let step = 0; step < 40 && reached.size < visible.length; step++) {
    await page.keyboard.press("Tab")
    for (let i = 0; i < visible.length; i++) if (await visible[i]!.evaluate(element => element === document.activeElement && getComputedStyle(element).outlineStyle !== "none")) reached.add(i)
  }
  expect(reached.size).toBe(visible.length)
}

const noSideways = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
/** A marker on the document: it survives router navigation and dies on a reload. */
const mark = (page: import("@playwright/test").Page) => page.evaluate(() => { (window as unknown as { __u2: number }).__u2 = 1 })
const marked = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __u2?: number }).__u2 === 1)

for (const width of [1280, 390]) for (const theme of ["light", "dark"] as const) {
  test(`flows and settings ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: theme })
    const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`u2-${name}-${width}-${theme}.png`), fullPage: true })
    const main = page.locator("#repo-content")
    const tabs = page.getByRole("navigation", { name: "Repository", exact: true })

    // Signed out: Flows is readable, Settings is the sign-in state.
    await repository(page, "signed-out")
    await page.goto(`/${REPO}/flows`)
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
    await expect(main.getByRole("heading", { name: "Flows", level: 1 })).toBeVisible()
    for (const label of ["Code", "Issues", "Pull requests", "Flows"]) await expect(tabs.getByRole("link", { name: label, exact: true })).toBeVisible()
    await expect(tabs.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0)
    await expect(tabs.getByRole("link", { name: "Flows", exact: true })).toHaveAttribute("aria-current", "page")
    await expect(main.getByRole("note")).toHaveText("Hosted runs of this flow are held; run it locally instead.")
    await expect(main.getByRole("link", { name: "review", exact: true })).toHaveAttribute("href", `/${REPO}/flows/review`)
    await expect(main.getByRole("link", { name: ".smithers/flows/review/flow.ts", exact: true })).toHaveAttribute("href", `/${REPO}/blob/main/.smithers/flows/review/flow.ts`)
    await expect(main.getByText("notes", { exact: true })).toHaveCount(0)
    await expect(main.getByRole("button", { name: /^Run/ })).toHaveCount(0)
    await noSideways(page)
    await keyboardReach(page)
    await shot("flows-list-signed-out")

    await mark(page)
    await main.getByRole("link", { name: "review", exact: true }).click()
    await expect(page).toHaveURL(`/${REPO}/flows/review`)
    await expect(main.getByRole("heading", { name: "review", level: 1 })).toBeVisible()
    await expect(main.getByText("Review a change", { exact: true })).toBeVisible()
    await expect(main.getByRole("region", { name: ".smithers/flows/review/flow.ts" })).toContainText('Flow.make("review"')
    await expect(main.getByRole("button", { name: "Copy npx smthrs@next flow start review", exact: true })).toBeVisible()
    await expect(main.getByRole("button", { name: /^Run/ })).toHaveCount(0)
    expect(await marked(page)).toBe(true)
    await noSideways(page)
    await keyboardReach(page)
    await shot("flows-source")
    await page.goBack()
    await expect(page).toHaveURL(`/${REPO}/flows`)
    await expect(main.getByRole("link", { name: "review", exact: true })).toBeVisible()
    await page.goForward()
    await expect(main.getByRole("heading", { name: "review", level: 1 })).toBeVisible()
    expect(await marked(page)).toBe(true)

    await page.goto(`/${REPO}/flows/notes`)
    await expect(main.getByRole("heading", { name: "Flow not found." })).toBeVisible()
    await expect(main.getByRole("link", { name: "All flows", exact: true })).toHaveAttribute("href", `/${REPO}/flows`)

    // A typed URL for a subject the frame has no view for is the frame's not-found state, never the full chat.
    await page.goto(`/${REPO}/commits`)
    await expect(main.getByRole("heading", { name: "Page not found." })).toBeVisible()
    await expect(tabs.locator('[aria-current="page"]')).toHaveCount(0)
    await expect(page.getByTestId("transcript")).toBeHidden()

    await page.goto(`/${REPO}/settings`)
    await expect(main.getByRole("heading", { name: "Sign in to open repository settings." })).toBeVisible()
    await expect(main.getByRole("button", { name: "Sign in with GitHub", exact: true })).toBeVisible()
    await expect(main.getByText("Models", { exact: true })).toHaveCount(0)
    await noSideways(page)
    await shot("settings-signed-out")

    // A signed-in reader: no Settings tab, and Settings is not found.
    await repository(page, "reader")
    await page.goto(`/${REPO}/settings`)
    await expect(main.getByRole("heading", { name: "Page not found." })).toBeVisible()
    await expect(tabs.getByRole("link", { name: "Flows", exact: true })).toBeVisible()
    await expect(tabs.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0)
    await shot("settings-reader")

    // A member (can_write): the Settings tab, Models held, and GitHub sync from the document.
    await repository(page, "member")
    await page.goto(`/${REPO}/flows`)
    await expect(main.getByRole("link", { name: "review", exact: true })).toBeVisible()
    await mark(page)
    await tabs.getByRole("link", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(`/${REPO}/settings`)
    await expect(tabs.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page")
    await expect(main.getByRole("heading", { name: "Models", level: 1 })).toBeVisible()
    await expect(main.getByText("Hosted coding runs on Cerebras Qwen; locally, smthrs uses your login.", { exact: true })).toBeVisible()
    await expect(main.locator("input, textarea")).toHaveCount(0)
    expect(await marked(page)).toBe(true)
    await noSideways(page)
    await keyboardReach(page)
    await shot("settings-models-held")
    if (width >= 768) await main.getByRole("navigation", { name: "Repository settings" }).getByRole("link", { name: "GitHub sync", exact: true }).click()
    else await main.getByRole("combobox", { name: "Settings section" }).selectOption("sync")
    await expect(page).toHaveURL(`/${REPO}/settings/sync`)
    await expect(main.getByRole("heading", { name: "GitHub sync", level: 1 })).toBeVisible()
    await expect(main.locator(".repo-settings-sync-state")).toHaveText("Synced 3 h ago")
    expect(await marked(page)).toBe(true)
    await noSideways(page)
    await keyboardReach(page)
    await shot("settings-sync-member")
    await page.goBack()
    await expect(main.getByRole("heading", { name: "Models", level: 1 })).toBeVisible()
    await page.goBack()
    await expect(main.getByRole("heading", { name: "Flows", level: 1 })).toBeVisible()
    expect(await marked(page)).toBe(true)
  })
}
