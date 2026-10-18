import { expect, test } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"

/*
 * .17-home-polish (repo-ui-spec "The repo header", view 2; mock RepoFrame.tsx GitHubSyncChip, views/code/shared.tsx
 * PathHeader and LatestCommit, frame.css phone sheet): the GitHub sync chip on every view, the home's branch button on
 * tree and blob views, the latest-commit bar on tree and blob views from the P-1 commits read, and the phone Ask sheet
 * below the repo header. Transport fixtures isolate admission and data; layout and rendering run in the built app.
 */
const SHA = "a".repeat(40)
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString()

const fixtures = async (page: import("@playwright/test").Page, member: boolean, repoDocument: Record<string, unknown>, commitReads: string[] = []) => {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp", summary: "A small HTTP framework." }] } }))
  await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main", ...repoDocument } }))
  await page.route("**/api/repos/maya/tinyhttp/home", route => route.fulfill({ json: { kind: "readme", markdown: "# tinyhttp\n\nA small HTTP framework." } }))
  await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\/[^?]*)?(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/index.ts")) return route.fulfill({ json: { type: "file", content: "export const answer = 42\n// final line\n", size: 40, encoding: "utf-8", commit_sha: "b".repeat(40), raw_url: "/api/repos/maya/tinyhttp/contents/src/index.ts?raw=1" } })
    if (path.endsWith("/contents/src")) return route.fulfill({ headers: { "X-Contents-Commit": "b".repeat(40) }, json: [{ name: "index.ts", path: "src/index.ts", type: "file" }] })
    return route.fulfill({ json: [{ name: "src", path: "src", type: "dir" }, { name: "README.md", path: "README.md", type: "file", size: 50 }] })
  })
  await page.route("**/api/repos/maya/tinyhttp/bookmarks**", route => route.fulfill({ json: { items: [
    { name: "main", target_change_id: "main-change", target_commit_id: SHA },
    { name: "docs/ui", target_change_id: "docs-change", target_commit_id: "b".repeat(40) }
  ], next_cursor: "" } }))
  await page.route("**/api/repos/maya/tinyhttp/commits?*", route => {
    const search = new URL(route.request().url()).search
    commitReads.push(search)
    const docs = new URLSearchParams(search).get("ref") === "docs/ui"
    return route.fulfill({ json: { items: [{ sha: docs ? "b".repeat(40) : SHA, short_sha: docs ? "bbbbbbb" : "aaaaaaa", title: docs ? "Write the docs" : "Fix the parser", body: "Private body.", author: docs ? "Ben" : "Maya",
      authored_at: hoursAgo(4), committed_at: hoursAgo(3), parents: [] }] } })
  })
  if (member) {
    await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
    await page.route("**/api/user/repos", route => route.fulfill({ json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }] }))
    await page.route("**/api/user/orgs", route => route.fulfill({ json: [] }))
  }
}

const SYNC = {
  // Separator first, then the mock's exact string; no age, so the chip never ticks.
  synced: { document: { mirror_status: "synced", behind_refs: 0, failed_refs: 0, last_mirror_at: hoursAgo(3), last_mirror_error: null }, text: "·Synced with GitHub", error: false },
  // Behind with refs outstanding: "Synced <age>".
  stale: { document: { mirror_status: "behind", behind_refs: 2, failed_refs: 0, last_mirror_at: hoursAgo(3), last_mirror_error: null }, text: "·Synced 3 h ago", error: false },
  // Behind with 0/0 refs renders as synced (#4317: a 'behind' written at configuration, never by a mirror run).
  configured: { document: { mirror_status: "behind", behind_refs: 0, failed_refs: 0, last_mirror_at: hoursAgo(3), last_mirror_error: null }, text: "·Synced with GitHub", error: false },
  failed: { document: { mirror_status: "failed", behind_refs: 1, failed_refs: 1, last_mirror_at: hoursAgo(3), last_mirror_error: "GitHub returned 401 for the app installation." }, text: "·GitHub sync failed", writerText: "·GitHub sync failed: GitHub returned 401 for the app installation.", error: true }
} as const

for (const member of [false, true]) for (const width of [1280, 390]) {
  const who = `${member ? "member" : "signed-out"} ${width}`

  // 1. The GitHub sync chip in the repo header on every view, from the repository document the admission already read.
  test(`sync chip ${who}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await fixtures(page, member, SYNC.synced.document)
    const chip = page.locator(".repo-frame-repo-title .repo-frame-github")
    await page.goto("/maya/tinyhttp")
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible()
    await expect(chip).toHaveText(SYNC.synced.text)
    await expect(chip).not.toHaveClass(/repo-frame-sync-error/)
    // A viewer who cannot write reads the chip as text; only a writer's chip links to Settings -> GitHub sync (below).
    await expect(chip.locator("a")).toHaveCount(0)
    await expect(chip.locator(".repo-frame-sync-separator")).toHaveAttribute("aria-hidden", "true")
    expect(await chip.evaluate(node => node.tagName)).toBe("SPAN")
    for (const [state, { document, text, error }] of Object.entries(SYNC)) {
      if (state === "synced") continue
      await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main", ...document } }))
      await page.goto("/maya/tinyhttp")
      await expect(chip, state).toHaveText(text)
      if (error) {
        await expect(chip).toHaveClass(/repo-frame-sync-error/)
        await expect(chip.locator("svg")).toHaveAttribute("aria-hidden", "true")
        // No "Last success": last_mirror_at is stamped on failed reports too (Platform d-yhg0yo).
        await expect(chip.locator(".repo-frame-last-sync")).toHaveCount(0)
      } else await expect(chip).not.toHaveClass(/repo-frame-sync-error/)
    }
    // A writer (the document's can_write, signed in; the app takes can_write only from a document that names this repository) reads the failure's reason and the chip links to Settings -> GitHub sync;
    // signed out, the same document stays text without the reason (a mirror's raw git error is a member's to read).
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { full_name: "maya/tinyhttp", is_public: true, default_bookmark: "main", ...SYNC.failed.document, can_write: true } }))
    await page.goto("/maya/tinyhttp")
    await expect(chip).toHaveText(member ? SYNC.failed.writerText : SYNC.failed.text)
    expect(await chip.evaluate(node => node.tagName)).toBe(member ? "A" : "SPAN")
    if (member) await expect(chip).toHaveAttribute("href", "/maya/tinyhttp/settings/sync")
    // No last_mirror_at, or no mirror_status: no sync claim at all.
    for (const document of [{ mirror_status: "behind", behind_refs: 3, failed_refs: 0, last_mirror_at: null, last_mirror_error: null }, { mirror_status: "", behind_refs: 0, failed_refs: 0, last_mirror_at: hoursAgo(1), last_mirror_error: null }, {}]) {
      await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main", ...document } }))
      await page.goto("/maya/tinyhttp")
      await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible()
      await expect(chip).toHaveCount(0)
      await expect(page.locator(".repo-frame-sync-separator")).toHaveCount(0)
    }
    // On every view: the tree, the blob, the issues and the pulls lists carry the same chip.
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main", ...SYNC.stale.document } }))
    for (const path of ["/tree/main/src", "/blob/main/src/index.ts", "/issues", "/pulls"]) {
      await page.goto(`/maya/tinyhttp${path}`)
      await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible()
      await expect(chip, path).toHaveText(SYNC.stale.text)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  // 2. (F) The tree and blob views carry the home's branch button, not a native select; (H) and the latest commit at the view's ref.
  test(`tree and blob branch button and latest commit ${who}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const commitReads: string[] = []
    await fixtures(page, member, SYNC.synced.document, commitReads)
    await page.goto("/maya/tinyhttp/tree/main/src")
    const folder = page.getByRole("region", { name: "Folder view" })
    await expect(folder.getByRole("table", { name: "Files in src" })).toBeVisible()
    await expect(page.locator(".repo-code-path-header select")).toHaveCount(0)
    const picker = page.locator(".repo-code-path-header details.repo-ui-dropdown").first()
    await expect(picker.locator("summary")).toHaveText("main")
    expect(Math.round((await picker.locator("summary").boundingBox())?.height ?? 0)).toBe(width === 390 ? 40 : 36)
    expect((await picker.locator("summary").boundingBox())?.width ?? 999).toBeLessThan(200)
    const latest = folder.locator('[aria-label="Latest commit"]')
    await expect(latest).toContainText("Maya")
    await expect(latest).toContainText("Fix the parser")
    await expect(latest).toContainText("aaaaaaa")
    await expect(latest).toContainText("3 h ago")
    await expect(latest).not.toContainText("Private body")
    await expect(latest).not.toContainText(SHA)
    await expect(latest.locator("a")).toHaveCount(0)
    expect(commitReads).toEqual(["?limit=1&ref=main"])
    // The bar heads the file box, above the table (mock Tree.tsx: the Box header).
    expect(await latest.evaluate(node => node.parentElement?.classList.contains("repository-code-box") === true && node.parentElement.firstElementChild === node)).toBe(true)
    // The picker lists the branches the home lists, filtered the same way, and a pick keeps the path at the new ref.
    await picker.locator("summary").click()
    await expect(picker.getByRole("link", { name: "docs/ui", exact: true })).toHaveAttribute("href", "/maya/tinyhttp/tree/docs/ui/src")
    const filter = picker.getByRole("textbox", { name: "Filter branches or enter full SHA" })
    await filter.fill("docs")
    await expect(picker.getByRole("link")).toHaveCount(1)
    await page.keyboard.press("Escape")
    await expect(picker.locator("summary")).toBeFocused()
    await expect(picker).not.toHaveAttribute("open")
    // The blob view: the same button and bar, the commit read at the blob's ref.
    commitReads.length = 0
    await page.goto("/maya/tinyhttp/blob/docs/ui/src/index.ts")
    const file = page.getByRole("region", { name: "File view" })
    await expect(file.getByRole("region", { name: "Source of src/index.ts" })).toContainText("// final line")
    await expect(page.locator(".repo-code-path-header select")).toHaveCount(0)
    await expect(page.locator(".repo-code-path-header details.repo-ui-dropdown summary").first()).toHaveText("docs/ui")
    const blobLatest = file.locator('[aria-label="Latest commit"]')
    await expect(blobLatest).toContainText("Ben")
    await expect(blobLatest).toContainText("Write the docs")
    await expect(blobLatest).toContainText("bbbbbbb")
    expect(commitReads).toEqual(["?limit=1&ref=docs%2Fui"])
    await expect(page.locator(".repo-ui-btn-primary:visible")).toHaveCount(1)
    // Keyboard reach of every visible control in the view, the branch button included (its closed list is not in the ring).
    const controls = file.locator("a:visible, button:visible, summary:visible")
    await controls.first().focus()
    for (let i = 0; i < await controls.count(); i++) {
      await expect(controls.nth(i)).toBeFocused()
      await page.keyboard.press("Tab")
    }
    // A commits read that is refused, with no change record to fall back on, leaves no bar and no bare commit id.
    await page.route("**/api/repos/maya/tinyhttp/commits?*", route => route.fulfill({ status: 404, json: { message: "no commits route" } }))
    await page.route("**/api/repos/maya/tinyhttp/changes/**", route => route.fulfill({ status: 404, json: { message: "no change" } }))
    await page.goto("/maya/tinyhttp/tree/main/src")
    await expect(folder.getByRole("table", { name: "Files in src" })).toBeVisible()
    await expect(folder.locator('[aria-label="Latest commit"]')).toHaveCount(0)
    // No bare id in the file box (the branch list's own commit ids sit in its closed menu, as on the home).
    await expect(folder.locator(".repository-code-box").getByText(/\b[0-9a-f]{40}\b/)).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  // 4. (L) On a phone the Ask is a bottom sheet below the repo header (mock frame.css: fixed, bottom 0, 72dvh), never over it.
  if (member && width === 390) test(`phone Ask sheet below the repo header ${who}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await fixtures(page, member, SYNC.synced.document)
    await page.goto("/maya/tinyhttp")
    await page.getByRole("button", { name: "Ask", exact: true }).click()
    const ask = page.getByRole("complementary", { name: "Ask", exact: true })
    await expect(ask).toBeVisible()
    await expect(ask.getByTestId("composer-input")).toBeVisible()
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => { const node = document.querySelector(selector); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom } }
      const aside = document.querySelector<HTMLElement>("aside[aria-label=Ask]")!
      const style = getComputedStyle(aside)
      return { ask: box("aside[aria-label=Ask]"), header: box(".repo-frame-repo-header"), global: box(".repo-frame-global"), tabs: box("nav[aria-label=Repository]"), inner: innerHeight,
        position: style.position, top: style.top, bottom: style.bottom, height: style.height, offsetParent: aside.offsetParent?.className ?? null,
        composer: box('[data-testid="composer-input"]'), scrollTop: document.querySelector(".repo-frame-scroll")?.scrollTop ?? null }
    })
    const diagnosis = JSON.stringify(geometry)
    console.log(`ASK_SHEET ${diagnosis}`)
    expect(geometry.ask?.y ?? -1, diagnosis).toBeGreaterThanOrEqual(geometry.header?.bottom ?? Infinity)
    expect(Math.round(geometry.ask?.bottom ?? -1), diagnosis).toBe(geometry.inner)
    expect(Math.round(geometry.ask?.height ?? -1), diagnosis).toBeLessThanOrEqual(Math.round(geometry.inner * 0.8))
    await expect(page.getByRole("navigation", { name: "Repository", exact: true })).toBeInViewport()
    await expect(page.getByRole("button", { name: "Close Ask", exact: true })).toBeInViewport()
    await page.getByRole("button", { name: "Close Ask", exact: true }).click()
    await expect(ask).toBeHidden()
  })
}
