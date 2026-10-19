import { expect, test } from "./browserTest"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"
import { identityRoute, signedOutVisitor } from "./identity"

const FRAME_METRIC_SELECTORS = [
  [".repo-frame-global","global header"],[".repo-frame-mark","logo"],[".repo-frame-crumbs","breadcrumb"],
  [".repo-frame-search","search"],[".repo-frame-inbox","Waiting on you"],[".repo-frame-avatar-button","avatar"],
  [".repo-frame-repo-header","repo header"],[".repo-frame-repo-title","repo title"],[".repo-frame-visibility","Public badge"],
  [":has(> .repo-frame-sync-separator)","sync chip"],[".repo-frame-ask-button","Ask button"],[".repo-frame-content","content"],
  ["nav[aria-label=Repository]","tab bar"],["[aria-current=page]","active tab"],["aside[aria-label=Ask]","Ask panel"]
]

// Transport fixtures isolate admission/data, while navigation, SQLite, rendering,
// responsive layout and keyboard interaction run in the real built application.
for (const member of [false, true]) for (const width of [1440, 1280, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`D1 repository frame ${member ? "member" : "signed-out"} ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp", summary: "A small HTTP framework." }] } }))
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
    await page.route("**/api/repos/maya/tinyhttp/home", route => route.fulfill({ json: { kind: "readme", markdown: "# tinyhttp\n\nA small HTTP framework.\n\n## Installation\n\n```sh\nnpm install tinyhttp\n```" } }))
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "src", path: "src", type: "dir" }, { name: "README.md", path: "README.md", type: "file", size: 50 }] }))
    await page.route("**/api/repos/maya/tinyhttp/bookmarks**", route => route.fulfill({ json: { items: [
      { name:"main", target_change_id:"main-change", target_commit_id:"a".repeat(40) },
      { name:"docs/ui", target_change_id:"docs-change", target_commit_id:"b".repeat(40) }
    ], next_cursor:"" } }))
    // Platform's P-1 commits read at the home's ref: what the latest-commit row shows (message, author, short id, age), never the whole commit id.
    const commitReads: string[] = []
    await page.route("**/api/repos/maya/tinyhttp/commits?*", route => {
      commitReads.push(new URL(route.request().url()).search)
      return route.fulfill({ json: { items: [{ sha: "a".repeat(40), short_sha: "aaaaaaa", title: "Fix the parser", body: "Private body.", author: "Maya",
        authored_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), committed_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), parents: [] }] } })
    })
    if (member) {
      await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
      await page.route("**/api/user/repos", route => route.fulfill({ json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }] }))
      await page.route("**/api/user/orgs", route => route.fulfill({ json: [] }))
    }
    await page.goto("/maya/tinyhttp")
    await expect(page.locator(".session-shell > .session-navigation")).toBeHidden()
    expect((await page.locator(".repo-frame").boundingBox())?.width).toBe(width)
    await expect(page.getByRole("button", { name:"Ask", exact:true })).toHaveAttribute("aria-expanded", String(member && width >= 1440))
    if (member && width >= 1440) await expect(page.getByRole("complementary", { name:"Ask", exact:true }).getByTestId("composer-input")).toBeVisible()
    const header = await page.locator(".repo-frame-global").boundingBox()
    expect(header?.height).toBe(width === 390 ? 50 : 56)
    const content = await page.locator(".repo-frame-content").boundingBox()
    expect(content?.x).toBe(0)
    expect(content?.width).toBe(member && width >= 1440 ? width - 380 : width)
    const tabStyle = await page.locator('.repo-ui-tab[aria-current="page"]').evaluate(element => {
      const style = getComputedStyle(element)
      return { height: element.getBoundingClientRect().height, weight: style.fontWeight, border: style.borderBottomWidth }
    })
    expect(tabStyle).toEqual({ height: 52, weight: "600", border: "2px" })
    const mainWidth = await page.locator(".repo-code-home-main").evaluate(element => element.getBoundingClientRect().width)
    const layoutWidth = await page.locator(".repo-code-home-layout").evaluate(element => element.getBoundingClientRect().width)
    expect(mainWidth).toBe(layoutWidth)
    const navigation = page.getByRole("navigation", { name: "Repository", exact: true })
    for (const label of ["Code", "Issues", "Pull requests", "Flows"]) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible()
    // Runs and Wiki are cut; Settings is a member's (the document's can_write), which this document does not grant.
    for (const label of ["Runs", "Wiki", "Settings"]) await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveCount(0)
    await expect(page.getByText("Waiting on you", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "README", exact: true }).getByRole("heading", { name: "tinyhttp", level: 1 })).toBeVisible()
    await expect(page.getByRole("region", { name: "Files", exact: true }).getByRole("link", { name: "src", exact: true })).toBeVisible()
    const latest = page.locator('[aria-label="Latest commit"]')
    await expect(latest).toContainText("Maya")
    await expect(latest).toContainText("Fix the parser")
    await expect(latest).toContainText("aaaaaaa")
    await expect(latest).toContainText("3 h ago")
    await expect(latest).not.toContainText("Private body")
    await expect(latest).not.toContainText("a".repeat(40))
    await expect(latest.locator("a")).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Files", exact: true }).getByText(/\b[0-9a-f]{40}\b/)).toHaveCount(0)
    expect(commitReads).toEqual(["?limit=1&ref=main"])
    // #4342: a repeat visit reads the record again and shows the row again.
    await page.goto("/maya/tinyhttp")
    await expect(latest).toContainText("Fix the parser")
    await expect(latest).toContainText("Maya")
    expect(commitReads).toEqual(["?limit=1&ref=main", "?limit=1&ref=main"])
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible()
    expect(await page.locator(".repo-code-home-file-row > span").first().evaluate(element => getComputedStyle(element).textAlign)).toBe("left")
    await expect(page.locator(".repo-ui-btn-primary:visible")).toHaveCount(1)
    await expect(page.getByText("What should we work on?", { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // Every visible shell control participates in the native keyboard ring,
    // including the horizontally scrolling phone tabs.
    const controls = page.locator('.repo-frame-global a, .repo-frame-global button, .repo-frame-global summary, .repo-frame-global input, .repo-frame-repo-header a, .repo-frame-repo-header button, main a, main summary')
    const visible = []
    for (let i = 0; i < await controls.count(); i++) if (await controls.nth(i).isVisible()) visible.push(controls.nth(i))
    await page.locator("body").click({ position: { x: 1, y: 1 } })
    const reached = new Set<number>()
    for (let step = 0; step < 65 && reached.size < visible.length; step++) {
      await page.keyboard.press("Tab")
      for (let i = 0; i < visible.length; i++) if (await visible[i]!.evaluate(element => element === document.activeElement)) reached.add(i)
    }
    expect(reached.size).toBe(visible.length)
    const branchMenu = page.locator(".repo-code-home-toolbar details").first()
    await branchMenu.locator("summary").click()
    await expect(branchMenu.getByRole("link", {name:"docs/ui", exact:true})).toHaveAttribute("href", "/maya/tinyhttp/tree/docs/ui")
    await expect(page.getByText("2 branches", {exact:true})).toBeVisible()
    const filter = branchMenu.getByRole("textbox", {name:"Filter branches or enter full SHA"})
    await filter.fill("abcdef1")
    await expect(branchMenu.getByRole("link")).toHaveCount(0)
    await filter.fill("c".repeat(40))
    await expect(branchMenu.getByRole("link", {name:"c".repeat(40), exact:true})).toHaveAttribute("href", `/maya/tinyhttp/tree/${"c".repeat(40)}`)
    await page.keyboard.press("Escape")
    await expect(branchMenu.locator("summary")).toBeFocused()
    await page.getByText("Code", { exact: true }).filter({ hasNot: page.locator("svg") }).last().click()
    await expect(page.getByText("git clone https://api.smithers.sh/maya/tinyhttp.git", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.locator(".repo-code-home-code-menu")).not.toHaveAttribute("open")
    await expect(page.locator(".repo-code-home-code-menu summary")).toBeFocused()
    await expect(page.getByRole("search")).toHaveCount(0)
    await expect(page.locator('a[href$="/branches"]')).toHaveCount(0)
    await expect(page.locator('a[href*="/HEAD/"]')).toHaveCount(0)
    if (process.env.REPOSITORY_METRICS && member && ((width === 1440 && colorScheme === "light") || (width === 1280 && colorScheme === "light") || (width === 390 && colorScheme === "dark"))) {
      const measure = async (state:string) => {
        const rows = await page.evaluate(selectors => selectors.map(([selector,label]) => {
          const element = document.querySelector(selector!)
          if (!element) return `| ${label} | missing | | | | | |`
          const box = element.getBoundingClientRect(), style = getComputedStyle(element)
          return `| ${label} | ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)} | ${style.fontSize}/${style.lineHeight} ${style.fontWeight} | ${style.color} | ${style.backgroundColor} | ${style.borderBottomWidth} ${style.borderBottomColor} | ${style.padding} |`
        }), FRAME_METRIC_SELECTORS)
        console.log("FRAME_METRICS " + JSON.stringify({width,colorScheme,state,rows}))
      }
      await measure(width >= 1440 ? "docked" : "closed")
      if (width >= 1440) { await page.getByRole("button", {name:"Close Ask",exact:true}).click(); await measure("closed") }
      else if (width === 1280) { await page.getByRole("button", {name:"Ask",exact:true}).click(); await measure("open"); await page.getByRole("button", {name:"Close Ask",exact:true}).click() }
    }
    if (process.env.REPOSITORY_SHOTS) await page.screenshot({ path: `${process.env.REPOSITORY_SHOTS}/code-home-${member ? "member" : "signed-out"}-${width}-${colorScheme}.png`, fullPage: true })
    if (member) {
      await page.getByRole("button", { name: "Ask", exact: true }).click()
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
      await expect(page.getByRole("complementary", { name: "Ask", exact: true }).getByTestId("composer-input")).toBeVisible()
      expect(await page.locator(".repo-code-home-main").evaluate(element => element.getBoundingClientRect().width)).toBe(
        await page.locator(".repo-code-home-layout").evaluate(element => element.getBoundingClientRect().width))
      await page.getByTestId("composer-input").focus()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
      if (width === 1280) {
        const composer = page.getByTestId("composer-input")
        await composer.fill("/file")
        await composer.press("Enter")
        const form = page.locator(".flow-form[data-flow-name='file']")
        await expect(form).toBeVisible()
        expect((await form.boundingBox())!.width).toBeGreaterThan(200)
        const path = form.getByTestId("flow-form-path")
        expect((await path.boundingBox())!.width).toBeGreaterThan(160)
        await path.fill("README.md")
        await expect(path).toHaveValue("README.md")
      }
      await page.getByRole("button", { name: "Close Ask" }).click()
      await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeFocused()
      return
    }
    await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
    const signIn = page.waitForRequest(request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
    await page.getByRole("button", { name: "Ask", exact: true }).click()
    await signIn
    await page.waitForURL(url => url.pathname === APPLICATION_SIGN_IN_PATH)
  })
}

/*
 * A declared home (app-spec row 6, repo-ui-spec view 1, Design (A)-(D)):
 * below the toolbar, text, prompt, links and Fixed by agents for everyone,
 * then Files and the README; no Files button. The prompt is the home's own
 * title: one quiet sign-in button for a visitor, an input plus Send for a
 * signed-in viewer. App blocks are for members only, in one row, and only
 * those whose flow this host serves: `issue.implement` needs the install's
 * TODO door, which the hosted origin lacks, so it renders for nobody;
 * `chat.open` is served here, so a member sees it and nobody else does. No
 * dead control, so no "This action is no longer available".
 *
 * Membership is the repository document's own per-viewer `can_write`
 * (routes/repos.go), never the account's own-repository list: `/api/user/repos`
 * names every public repository for every signed-in account, so the
 * "signed-in" viewer here is listed there and is still not a member. QA's D1
 * rule (f-1j8ydv): such a viewer sees no home button whose flow is anything
 * but chat.open or files; the prompt's own Send (chat.send, Design (B)) is
 * the one door that viewer has.
 */
for (const viewer of ["signed-out", "signed-in", "writer"] as const) for (const width of [1280, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`declared repository home blocks ${viewer} ${width} ${colorScheme}`, async ({ page }) => {
    const member = viewer === "writer"
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp" }] } }))
    // The document names itself (full_name), as the backend's does: the per-viewer answer counts only for the repository asked for.
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, full_name: "maya/tinyhttp", default_bookmark: "main", can_write: member } }))
    await page.route("**/api/repos/maya/tinyhttp/home", route => route.fulfill({ json: { kind: "blocks", blocks: [
      { type: "links", links: [{ label: "Documentation", url: "https://example.com/docs" }, { label: "Report a bug", url: "/bug" }] },
      { type: "app", flow: "issue.implement", title: "Fix an issue", picture: "issue" },
      { type: "app", flow: "chat.open", title: "Ask the codebase", picture: "wiki" },
      { type: "app", flow: "chat.open", title: "Explain the code", picture: "review" },
      { type: "prompt", title: "Ask about tinyhttp", placeholder: "What does it do?" },
      { type: "markdown", title: "Fixed by agents", path: "docs/fixed-by-agents.md", markdown: "- #12 Resize widgets, landed as abc1234" },
      { type: "text", text: "Repository introduction" },
      { type: "markdown", path: "README.md", markdown: "# Project README" }
    ] } }))
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "README.md", path: "README.md", type: "file" }] }))
    // The head is known from the bookmark list, but nobody may read its commits or its change record here.
    await page.route("**/api/repos/maya/tinyhttp/bookmarks**", route => route.fulfill({ json: { items: [{ name: "main", target_change_id: "main-change", target_commit_id: "a".repeat(40) }], next_cursor: "" } }))
    await page.route("**/api/repos/maya/tinyhttp/commits?*", route => route.fulfill({ status: 404, json: { message: "not found" } }))
    await page.route("**/api/repos/maya/tinyhttp/changes/main-change", route => route.fulfill({ status: 401, json: { message: "authentication required" } }))
    if (viewer !== "signed-out") {
      await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
      // The own-repository list names this public repository for every signed-in account, member or not.
      await page.route("**/api/user/repos**", route => route.fulfill({ json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }] }))
      await page.route("**/api/user/orgs**", route => route.fulfill({ json: [] }))
    }
    await page.goto("/maya/tinyhttp")
    const main = page.locator(".repo-code-home-main")
    const toolbar = main.locator(".repo-code-home-toolbar")
    const intro = main.locator(".repo-code-home-intro")
    const prompt = main.locator(".repo-ui-box", { has: page.locator(".repo-ui-box-header", { hasText: "Ask about tinyhttp" }) })
    const links = main.getByRole("navigation", { name: "Repository links", exact: true })
    const fixed = main.locator(".repo-ui-box", { has: page.locator(".repo-ui-box-header", { hasText: "Fixed by agents" }) })
    const files = page.getByRole("region", { name: "Files", exact: true })
    const readme = page.getByRole("region", { name: "README", exact: true })
    await expect(intro).toHaveText("Repository introduction")
    await expect(fixed).toContainText("#12 Resize widgets")
    await expect(readme.getByRole("heading", { name: "Project README", level: 1 })).toBeVisible()
    await expect(page.getByRole("region", { name: "README", exact: true })).toHaveCount(1)
    await expect(files.getByRole("link", { name: "README.md", exact: true })).toBeVisible()
    // Design (A): toolbar, text, prompt, links, Fixed by agents, Files, README, top to bottom.
    const tops: number[] = []
    for (const part of [toolbar, intro, prompt, links, fixed, files, readme]) tops.push((await part.boundingBox())!.y)
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    // Design (D): no Files button; the file table is the view.
    await expect(page.getByRole("button", { name: "Files", exact: true })).toHaveCount(0)
    // Links: the app's own pages in place, other sites in a new tab.
    await expect(links.getByRole("link", { name: "Report a bug" })).toHaveAttribute("href", "/bug")
    await expect(links.getByRole("link", { name: "Documentation" })).toHaveAttribute("target", "_blank")
    // No record read for this viewer: no latest-commit row, and never a bare commit id.
    await expect(page.locator('[aria-label="Latest commit"]')).toHaveCount(0)
    await expect(files.getByText(/\b[0-9a-f]{40}\b/)).toHaveCount(0)
    // The hosted origin has no door for issue.implement: nobody sees it.
    await expect(page.locator('[data-flow="issue.implement"]')).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Fix an issue", exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (member) {
      // Design (B): an input plus Send; Design (C): the served app blocks in one row.
      await expect(prompt.getByRole("button", { name: "Sign in to ask about tinyhttp" })).toHaveCount(0)
      const input = prompt.getByRole("textbox", { name: "Ask about tinyhttp", exact: true })
      await expect(input).toHaveAttribute("placeholder", "What does it do?")
      const apps = page.getByLabel("Repository apps", { exact: true })
      const ask = apps.getByRole("button", { name: "Ask the codebase", exact: true })
      const explain = apps.getByRole("button", { name: "Explain the code", exact: true })
      await expect(ask).toBeVisible()
      await expect(explain).toBeVisible()
      expect((await ask.boundingBox())!.y).toBe((await explain.boundingBox())!.y)
      expect((await apps.boundingBox())!.y).toBeGreaterThan((await fixed.boundingBox())!.y)
      expect((await apps.boundingBox())!.y).toBeLessThan((await files.boundingBox())!.y)
      await ask.focus(); await expect(ask).toBeFocused(); await page.keyboard.press("Enter")
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
      await expect(page.getByTestId("composer-input")).toBeVisible()
      // One prompt on the page: the block steps aside while the Ask is open, and returns when it closes.
      await expect(prompt).toHaveCount(0)
      await page.getByRole("button", { name: "Close Ask", exact: true }).click()
      await expect(input).toBeVisible()
      await input.fill("What does it do?")
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeHidden()
      await input.press("Enter")
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
      await expect(page.getByTestId("transcript").getByText("What does it do?", { exact: true })).toBeVisible()
    } else if (viewer === "signed-in") {
      // Signed in, not a member (the document answered can_write: false): the prompt is an input plus Send, and no app block at all.
      await expect(prompt.getByRole("button", { name: "Sign in to ask about tinyhttp" })).toHaveCount(0)
      await expect(prompt.getByRole("textbox", { name: "Ask about tinyhttp", exact: true })).toBeVisible()
      await expect(page.getByLabel("Repository apps", { exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Ask the codebase", exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Explain the code", exact: true })).toHaveCount(0)
      // QA's D1 rule: every home button's flow, outside the toolbar and the file table, is chat.open or files, plus the prompt's own Send.
      const flows = await main.locator("button[data-flow]").evaluateAll(nodes => nodes
        .filter(node => node.closest(".repo-code-home-toolbar, section") === null)
        .map(node => node.getAttribute("data-flow")))
      expect(flows).toEqual(["chat.send"])
      expect(flows.filter(flow => !["chat.open", "files", "chat.send"].includes(flow ?? ""))).toEqual([])
    } else {
      await expect(page.getByLabel("Repository apps", { exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Ask the codebase", exact: true })).toHaveCount(0)
      await expect(prompt.getByRole("textbox")).toHaveCount(0)
      const door = prompt.getByRole("button", { name: "Sign in to ask about tinyhttp", exact: true })
      await expect(door).toBeVisible()
      expect(await door.evaluate(node => node.classList.contains("repo-ui-btn-primary"))).toBe(false)
      expect((await door.boundingBox())!.width).toBeLessThan((await prompt.boundingBox())!.width * 0.8)
      await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
      const signIn = page.waitForRequest(request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
      await door.focus(); await expect(door).toBeFocused(); await page.keyboard.press("Enter")
      await signIn
    }
    await expect(page.getByText("This action is no longer available")).toHaveCount(0)
  })
}

/*
 * A declared home that carries no README block still shows the repository's
 * README below Files (CEO: README on every repo home; repo-ui-spec view 1),
 * read through the same contents read the tree uses. A repository without a
 * README shows nothing there: no region and no placeholder.
 */
for (const member of [false, true]) for (const width of [1280, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`declared home reads the repository README below Files ${member ? "member" : "signed-out"} ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp" }, { name: "maya/bare" }] } }))
    for (const name of ["tinyhttp", "bare"]) {
      await page.route(`**/api/repos/maya/${name}`, route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
      await page.route(`**/api/repos/maya/${name}/home`, route => route.fulfill({ json: { kind: "blocks", blocks: [
        { type: "text", text: "Repository introduction" },
        { type: "links", links: [{ label: "Documentation", url: "https://example.com/docs" }] }
      ] } }))
    }
    const readmeReads: string[] = []
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents\/README\.md(?:\?.*)?$/, route => {
      readmeReads.push(route.request().url())
      return route.fulfill({ json: { type: "file", content: "# Read me from the tree\n\nInstall it.", size: 36, encoding: "utf-8", commit_sha: "a".repeat(40), raw_url: "/api/repos/maya/tinyhttp/contents/README.md?raw=1" } })
    })
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "src", path: "src", type: "dir" }, { name: "README.md", path: "README.md", type: "file", size: 36 }] }))
    await page.route(/\/api\/repos\/maya\/bare\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "src", path: "src", type: "dir" }] }))
    // Until Platform's commits read is on this host, the head's change record (bookmark -> change) supplies the latest-commit row.
    await page.route("**/api/repos/maya/tinyhttp/bookmarks**", route => route.fulfill({ json: { items: [{ name: "main", target_change_id: "main-change", target_commit_id: "a".repeat(40) }], next_cursor: "" } }))
    await page.route("**/api/repos/maya/tinyhttp/changes/main-change", route => route.fulfill({ json: {
      change_id: "main-change", commit_id: "a".repeat(40), description: "Fix parser\n\nPrivate body.", author_name: "Maya",
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), has_conflict: false, parent_change_ids: []
    } }))
    if (member) {
      await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
      await page.route("**/api/user/repos**", route => route.fulfill({ json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }] }))
      await page.route("**/api/user/orgs**", route => route.fulfill({ json: [] }))
    }
    await page.goto("/maya/tinyhttp")
    const home = page.locator(".repo-code-home-intro")
    await expect(home).toContainText("Repository introduction")
    const files = page.getByRole("region", { name: "Files", exact: true })
    await expect(files.getByRole("link", { name: "README.md", exact: true })).toBeVisible()
    const readme = page.getByRole("region", { name: "README", exact: true })
    await expect(readme.getByRole("heading", { name: "Read me from the tree", level: 1 })).toBeVisible()
    await expect(readme).toContainText("README.md")
    expect((await home.boundingBox())!.y).toBeLessThan((await files.boundingBox())!.y)
    expect((await files.boundingBox())!.y).toBeLessThan((await readme.boundingBox())!.y)
    expect(readmeReads.map(url => new URL(url).search)).toEqual(["?ref=main"])
    const latest = page.locator('[aria-label="Latest commit"]')
    await expect(latest).toContainText("Maya")
    await expect(latest).toContainText("Fix parser")
    await expect(latest).toContainText("aaaaaaa")
    await expect(latest).toContainText("2 h ago")
    await expect(latest).not.toContainText("a".repeat(40))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // No README in the tree: nothing below Files, and nothing was read.
    await page.goto("/maya/bare")
    await expect(page.locator(".repo-code-home-intro")).toContainText("Repository introduction")
    await expect(page.getByRole("region", { name: "Files", exact: true }).getByRole("link", { name: "src", exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "README", exact: true })).toHaveCount(0)
    await expect(page.getByText(/readme/i)).toHaveCount(0)
    expect(readmeReads).toHaveLength(1)
  })
}

/*
 * An error is never shown as empty (QA's G8 walker injects a 500 on the
 * README contents read): the README region renders the read's failure with
 * its reason behind Details, below Files, instead of looking like a
 * repository with no README.
 */
for (const [width, colorScheme] of [[1280, "light"], [390, "dark"]] as const) {
  test(`a failed README read shows the README region's failure, never nothing ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp" }] } }))
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, full_name: "maya/tinyhttp", default_bookmark: "main", can_write: false } }))
    await page.route("**/api/repos/maya/tinyhttp/home", route => route.fulfill({ json: { kind: "blocks", blocks: [{ type: "text", text: "Repository introduction" }] } }))
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents\/README\.md(?:\?.*)?$/, route => route.fulfill({ status: 500, json: { message: "mirror read timed out" } }))
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "src", path: "src", type: "dir" }, { name: "README.md", path: "README.md", type: "file", size: 36 }] }))
    await page.route("**/api/repos/maya/tinyhttp/bookmarks**", route => route.fulfill({ json: { items: [{ name: "main", target_change_id: "main-change", target_commit_id: "a".repeat(40) }], next_cursor: "" } }))
    await page.route("**/api/repos/maya/tinyhttp/commits?*", route => route.fulfill({ status: 404, json: { message: "not found" } }))
    await page.route("**/api/repos/maya/tinyhttp/changes/main-change", route => route.fulfill({ status: 401, json: { message: "authentication required" } }))
    await page.goto("/maya/tinyhttp")
    const files = page.getByRole("region", { name: "Files", exact: true })
    await expect(files.getByRole("link", { name: "README.md", exact: true })).toBeVisible()
    const readme = page.getByRole("region", { name: "README", exact: true })
    await expect(readme).toHaveCount(1)
    await expect(readme).toContainText("README.md")
    const failure = readme.getByRole("alert")
    await expect(failure).toContainText("Couldn’t load this file.")
    expect((await files.boundingBox())!.y).toBeLessThan((await readme.boundingBox())!.y)
    // The reason stays behind one keyboard-operable disclosure.
    const details = failure.locator("summary")
    await details.focus(); await expect(details).toBeFocused(); await page.keyboard.press("Enter")
    await expect(failure.getByRole("region", { name: "Failure details", exact: true })).toContainText("500")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
