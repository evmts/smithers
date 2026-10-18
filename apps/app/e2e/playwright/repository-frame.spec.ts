import { expect, test } from "./browserTest"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"
import { identityRoute, signedOutVisitor } from "./identity"

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
    if (member) {
      await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
      await page.route("**/api/user/repos", route => route.fulfill({ json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }] }))
      await page.route("**/api/user/orgs", route => route.fulfill({ json: [] }))
    }
    await page.goto("/maya/tinyhttp")
    await expect(page.locator(".session-shell > .session-navigation")).toBeHidden()
    expect((await page.locator(".repo-frame").boundingBox())?.width).toBe(width)
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
    await page.getByText("Code", { exact: true }).filter({ hasNot: page.locator("svg") }).last().click()
    await expect(page.getByText("git clone https://api.smithers.sh/maya/tinyhttp.git", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.locator(".repo-code-home-code-menu")).not.toHaveAttribute("open")
    await expect(page.locator(".repo-code-home-code-menu summary")).toBeFocused()
    await expect(page.getByRole("search")).toHaveCount(0)
    await expect(page.locator('a[href$="/branches"]')).toHaveCount(0)
    await expect(page.locator('a[href*="/HEAD/"]')).toHaveCount(0)
    if (process.env.REPOSITORY_SHOTS) await page.screenshot({ path: `${process.env.REPOSITORY_SHOTS}/code-home-${member ? "member" : "signed-out"}-${width}-${colorScheme}.png`, fullPage: true })
    if (member) {
      await page.getByRole("button", { name: "Ask", exact: true }).click()
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
      await expect(page.getByRole("complementary", { name: "Ask", exact: true }).getByTestId("composer-input")).toBeVisible()
      await page.getByTestId("composer-input").focus()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
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
