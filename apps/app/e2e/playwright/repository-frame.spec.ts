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
    for (const label of ["Code", "Issues", "Pull requests"]) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible()
    for (const label of ["Runs", "Wiki", "Flows", "Settings"]) await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveCount(0)
    await expect(page.getByText("Waiting on you", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "README", exact: true }).getByRole("heading", { name: "tinyhttp", level: 1 })).toBeVisible()
    await expect(page.getByRole("region", { name: "Files", exact: true }).getByRole("link", { name: "src", exact: true })).toBeVisible()
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
 * A declared home (app-spec row 6, repo-ui-spec view 1): text, prompt and
 * links blocks for everyone; app blocks for members only, and only those
 * whose flow this host serves. `issue.implement` needs the install's TODO
 * door, which the hosted origin lacks, so it renders for nobody; `chat.open`
 * is served here, so a member sees it and a visitor never does. No dead
 * control, so no "This action is no longer available".
 */
for (const member of [false, true]) for (const width of [1280, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test(`declared repository home blocks ${member ? "member" : "signed-out"} ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme })
    await signedOutVisitor(page)
    await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [{ name: "maya/tinyhttp" }] } }))
    await page.route("**/api/repos/maya/tinyhttp", route => route.fulfill({ json: { is_public: true, default_bookmark: "main" } }))
    await page.route("**/api/repos/maya/tinyhttp/home", route => route.fulfill({ json: { kind: "blocks", blocks: [
      { type: "links", links: [{ label: "Documentation", url: "https://example.com/docs" }] },
      { type: "app", flow: "issue.implement", title: "Fix an issue", picture: "issue" },
      { type: "app", flow: "chat.open", title: "Ask the codebase", picture: "wiki" },
      { type: "prompt", placeholder: "Ask about this repository" },
      { type: "text", text: "Repository introduction" },
      { type: "markdown", path: "README.md", markdown: "# Project README" }
    ] } }))
    await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "README.md", path: "README.md", type: "file" }] }))
    if (member) {
      await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
      await page.route("**/api/user/repos**", route => route.fulfill({ json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }] }))
      await page.route("**/api/user/orgs**", route => route.fulfill({ json: [] }))
    }
    await page.goto("/maya/tinyhttp")
    const home = page.getByTestId("repository-home")
    await expect(home).toBeVisible()
    const blocks = await home.locator(".repository-home-block").allTextContents()
    expect(blocks).toEqual(["Repository introduction", "Ask about this repository", "Documentation"])
    const files = page.getByRole("region", { name: "Files", exact: true })
    const readme = page.getByRole("region", { name: "README", exact: true })
    await expect(home.getByRole("button", { name: "Files", exact: true })).toBeVisible()
    await expect(readme.getByRole("heading", { name: "Project README", level: 1 })).toBeVisible()
    expect((await home.boundingBox())!.y).toBeLessThan((await files.boundingBox())!.y)
    expect((await files.boundingBox())!.y).toBeLessThan((await readme.boundingBox())!.y)
    await expect(home.getByText("Project README", { exact: true })).toHaveCount(0)
    // The hosted origin has no door for issue.implement: nobody sees it.
    await expect(home.locator('[data-flow="issue.implement"]')).toHaveCount(0)
    await expect(home.getByRole("button", { name: "Fix an issue", exact: true })).toHaveCount(0)
    if (member) {
      const ask = home.getByRole("button", { name: "Ask the codebase", exact: true })
      await expect(ask).toBeVisible()
      await ask.focus(); await expect(ask).toBeFocused(); await page.keyboard.press("Enter")
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
      await expect(page.getByTestId("composer-input")).toBeVisible()
    } else {
      await expect(home.locator(".repository-home-app")).toHaveCount(0)
      await expect(home.getByRole("button", { name: "Ask the codebase", exact: true })).toHaveCount(0)
    }
    await expect(page.getByText("This action is no longer available")).toHaveCount(0)
  })
}
