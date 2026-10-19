import { expect, test } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"

// Each case traverses and reloads the list, all four tabs signed out and signed in, and read failures.
test.setTimeout(180_000)

/*
 * Commits, Checks and Files changed read through the viewer's own GitHub
 * credential (/api/user/github-repos/…), which a signed-out visitor does not
 * have: live on smithers-canary/smithers#3723 (2026-10-19) all three answered
 * 401 and each tab said "<X> unavailable." with a Retry that could never work.
 * Signed out, each tab asks for sign-in and returns to itself; the tab rows
 * below are what a signed-in viewer reads.
 */
const SIGNED_OUT_TABS = [["commits", "Commits", "Sign in to see commits"], ["checks", "Checks", "Sign in to see checks"], ["files", "Files changed", "Sign in to see files"]] as const

for (const width of [1280, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`pull requests frame ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    const head = "a".repeat(40)
    await page.route(/\/api\/user\/github-repos\/maya\/tinyhttp\/pulls(?:\/34)?(?:\?.*)?$/, route => route.fulfill({status: 401, json: {message: "authentication required"}}))
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp" }] } }))
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { full_name: "maya/tinyhttp", is_public: true, default_bookmark: "main", github_source: { owner: "maya", repo: "tinyhttp" } } }))
    await page.route("**/api/repos/maya/tinyhttp/github/metadata/pulls?*", route => route.fulfill({ json: [{ number: 34, title: "Preserve request headers", state: "open", user: { login: "maya" }, labels: [{ name: "bug" }], created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z" }] }))
    await page.route("**/api/repos/maya/tinyhttp/github/metadata/pulls/34", route => route.fulfill({ json: { number: 34, title: "Preserve request headers", body: "Keep headers in the response.", state: "open", user: { login: "maya" }, created_at: "2026-10-17T12:00:00Z", head: { sha: head, ref: "fix/headers" }, base: { ref: "main" }, commits: 1 } }))
    await page.route("**/api/user/github-repos/maya/tinyhttp/pulls/34/commits?*", route => route.fulfill({ json: [{ sha: head, commit: { message: "Preserve headers", author: { name: "maya", date: "2026-10-17T12:00:00Z" } }, author: { login: "maya" } }] }))
    await page.route("**/api/user/github-repos/maya/tinyhttp/pulls/34/diff", route => route.fulfill({ contentType: "text/plain", body: "diff --git a/src/headers.ts b/src/headers.ts\n--- a/src/headers.ts\n+++ b/src/headers.ts\n@@ -1 +1 @@\n-oldHeader\n+newHeader\n" }))
    await page.route(`**/api/user/github-repos/maya/tinyhttp/commits/${head}/check-runs?*`, route => route.fulfill({ json: { total_count: 1, check_runs: [{ id: 1, name: "Unit tests", status: "completed", conclusion: "success", started_at: "2026-10-17T12:00:00Z" }] } }))
    const proxied: string[] = []
    page.on("request", request => { if (/\/api\/user\/github-repos\/maya\/tinyhttp\/(?:pulls\/34\/(?:commits|diff)|commits\/[^/]+\/check-runs)/.test(new URL(request.url()).pathname)) proxied.push(request.url()) })
    await page.goto("/maya/tinyhttp/pulls")
    const main = page.getByRole("main")
    const keyboardReach = async () => {
      const controls = main.locator("a,button,input,summary,select,textarea")
      const visible = []
      for (let i = 0; i < await controls.count(); i++) if (await controls.nth(i).isVisible()) visible.push(controls.nth(i))
      const reached = new Set<number>()
      for (let step = 0; step < 80 && reached.size < visible.length; step++) {
        await page.keyboard.press("Tab")
        for (let i = 0; i < visible.length; i++) if (await visible[i]!.evaluate(element => element === document.activeElement)) reached.add(i)
      }
      expect(reached.size).toBe(visible.length)
    }
    await expect(main.getByRole("list", { name: "Pull requests", exact: true })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Repository", exact: true }).getByRole("link", { name: "Pull requests 1", exact: true })).toBeVisible()
    await keyboardReach()
    await main.getByRole("combobox", { name: "Label", exact: true }).selectOption("bug")
    await expect(page).toHaveURL(/label%3Abug/)
    await expect(main.getByRole("link", { name: "Preserve request headers", exact: true })).toBeVisible()
    await main.getByRole("combobox", { name: "Author", exact: true }).selectOption("maya")
    await expect(page).toHaveURL(/author%3Amaya/)
    await main.getByRole("link", { name: "Preserve request headers", exact: true }).click()
    await expect(main.getByRole("heading", { name: "Preserve request headers #34", exact: true })).toBeVisible()
    await expect(main.getByText("Keep headers in the response.", { exact: true })).toBeVisible()
    await expect(main.getByRole("link", { name: "Merge on GitHub ↗", exact: true })).toHaveAttribute("href", "https://github.com/maya/tinyhttp/pull/34")
    await keyboardReach()
    await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
    for (const [tab, label, prompt] of SIGNED_OUT_TABS) {
      // Signed out, the tab is one quiet sign-in door: no failure, no Retry, no empty answer.
      await page.goto("/maya/tinyhttp/pull/34")
      await main.getByRole("navigation", { name: "Pull request", exact: true }).getByRole("link", { name: new RegExp(`^${label}`) }).click()
      await expect(page).toHaveURL(new RegExp(`/pull/34/${tab}$`))
      await expect(main.getByRole("heading", { name: "Preserve request headers #34", exact: true })).toBeVisible()
      const door = main.getByRole("button", { name: prompt, exact: true })
      await expect(door).toBeVisible()
      await expect(main.getByRole("alert")).toHaveCount(0)
      await expect(main).not.toContainText("unavailable")
      await expect(main.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
      await expect(main).not.toContainText(/No (commits|checks reported|changed files)/)
      await page.reload()
      await expect(door).toBeVisible()
      // The quiet button, never a full-width call: it sits at the pane's start, narrower than the pane.
      const [box, pane] = [await door.boundingBox(), await main.getByRole("region", { name: label, exact: true }).boundingBox()]
      expect(box!.width).toBeLessThan(pane!.width / 2)
      expect(box!.x - pane!.x).toBeLessThan(24)
      await keyboardReach()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      // Sign-in returns to this tab's own page.
      const request = page.context().waitForEvent("request", request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
      await door.click()
      expect(new URL((await request).url()).searchParams.get("return_to")).toBe(`/maya/tinyhttp/pull/34/${tab}`)
      // Let the hop finish before the next navigation, or it aborts that one.
      await expect(page.getByText("Sign-in handoff", { exact: true })).toBeVisible()
    }
    // Signed out, the doomed signed-in reads were never asked for.
    expect(proxied).toEqual([])
    // Signed in, the tabs read their rows; the Conversation's checks summary reads them too.
    await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
    await page.goto("/maya/tinyhttp/pull/34")
    await expect(main.getByRole("heading", { name: "Preserve request headers #34", exact: true })).toBeVisible()
    await expect(main.getByText("Checks passed.", { exact: true })).toBeVisible()
    await expect(main.getByText("Checks passed. Your review is next.", { exact: true })).toHaveCount(0)
    await keyboardReach()
    for (const [tab, label, evidence] of [["commits", "Commits", "Preserve headers"], ["checks", "Checks", "Unit tests"], ["files", "Files changed", "newHeader"]]) {
      // Both a native tab link and a direct reload resolve the same real view.
      await main.getByRole("navigation", { name: "Pull request", exact: true }).getByRole("link", { name: new RegExp(`^${label}`) }).click()
      await expect(page).toHaveURL(new RegExp(`/pull/34/${tab}$`))
      await expect(main.getByRole("heading", { name: "Preserve request headers #34", exact: true })).toBeVisible()
      await expect(main).toContainText(evidence!)
      await page.reload()
      await expect(main).toContainText(evidence!)
      await keyboardReach()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await expect(main.getByRole("link", { name: "Stack", exact: true })).toHaveCount(0)
    await expect(main).not.toContainText(/Smithers (reviews|merges|lands)|Ready to merge/)
    // A real failure, signed in, keeps its notice and Retry.
    await page.route(`**/api/user/github-repos/maya/tinyhttp/commits/${head}/check-runs?*`, route => route.fulfill({ status: 503, json: {} }))
    await page.goto("/maya/tinyhttp/pull/34/checks")
    await expect(main.getByRole("alert")).toContainText("Checks unavailable")
    await expect(main.getByText("No checks reported.", { exact: true })).toHaveCount(0)
    await expect(main.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
    await expect(main.getByRole("button", { name: "Sign in to see checks", exact: true })).toHaveCount(0)
    // Signed in, a 401 keeps today's handling: the notice and Retry, no sign-in door.
    await page.route(`**/api/user/github-repos/maya/tinyhttp/commits/${head}/check-runs?*`, route => route.fulfill({ status: 401, json: { message: "github oauth token was rejected" } }))
    await page.goto("/maya/tinyhttp/pull/34/checks")
    await expect(main.getByRole("alert")).toContainText("Checks unavailable")
    await expect(main.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
    await expect(main.getByRole("button", { name: "Sign in to see checks", exact: true })).toHaveCount(0)
    await expect(main.getByText("No checks reported.", { exact: true })).toHaveCount(0)
    // Signed out again for the list refusal and the native records below.
    await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute(null))
    await page.route("**/api/repos/maya/tinyhttp/github/metadata/pulls?*", route => route.fulfill({ status: 401, json: { message: "authentication required" } }))
    await page.goto("/maya/tinyhttp/pulls")
    await expect(main.getByRole("alert")).toContainText("authentication required")
    await expect(main.getByText("No pull requests.", { exact: true })).toHaveCount(0)
    // Native records without a GitHub mapping cannot invent a merge URL.
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { full_name: "maya/tinyhttp", is_public: true, default_bookmark: "main" } }))
    await page.route("**/api/repos/maya/tinyhttp/landings/34", route => route.fulfill({ json: { number: 34, title: "Native proposal", body: "A proposal", state: "open", author: { login: "maya" }, change_ids: ["change-1"], target_bookmark: "main" } }))
    await page.route("**/api/repos/maya/tinyhttp/landings/34/reviews?*", route => route.fulfill({ json: [] }))
    await page.route("**/api/repos/maya/tinyhttp/landings/34/changes?*", route => route.fulfill({ json: [] }))
    await page.route("**/api/repos/maya/tinyhttp/landings/34/diff", route => route.fulfill({ json: { changes: [] } }))
    await page.route("**/api/repos/maya/tinyhttp/commits/change-1/statuses?*", route => route.fulfill({ status: 503, json: {} }))
    await page.goto("/maya/tinyhttp/pull/34/checks")
    await expect(main.getByRole("alert")).toContainText("Checks unavailable")
    await expect(main.getByText("No checks reported.", { exact: true })).toHaveCount(0)
    await page.goto("/maya/tinyhttp/pull/34")
    await expect(main.getByRole("heading", { name: "Native proposal #34", exact: true })).toBeVisible()
    await expect(main.getByRole("link", { name: "Merge on GitHub ↗", exact: true })).toHaveCount(0)
  })
}
