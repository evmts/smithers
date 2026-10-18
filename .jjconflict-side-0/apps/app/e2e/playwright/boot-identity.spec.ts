import { fillComposer } from "./composer"
import { controlTabKey, expect,test } from "./browserTest"

/*
 * The boot-blocking regression (the local app stuck on "Smithers is starting
 * your session." while /api/user pended on the remote identity seam):
 * first paint — the entrance wordmark, then the guide shell — must never wait
 * on that seam.
 * The T1 host stubs identity out entirely, so this spec boots its own origin
 * (identity-hang-host.ts) with the seam behind a socket that never answers.
 *
 * Repository routes (Will's 2026-10-18 decision; CEO ruling a-e1tbtp; PM gap
 * list row 15): `/owner/repo` is the repository frame. Signed out it offers no
 * composer (guest access is off); its one primary action, Ask, leads to
 * sign-in carrying return_to, and nothing redirects on load. The Ask door's
 * return_to is `/owner/repo/?ask=1` (Design d-fbhqgy): the page reopens Ask
 * when `ask=1` is present and drops the parameter from the address; the
 * header's Sign in returns to the bare page. The slash-command doors a
 * signed-out visitor types still park with one prompt in the transcript:
 * state/signed-out-doors.test.ts pins each command's prompt.
 */


import { identityRoute, signedOutVisitor, skipSignup } from "./identity"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"

const slash = async (page: import("@playwright/test").Page, command: string) => {
  await fillComposer(page, command)
  await page.getByTestId("composer-input").press("Enter")
}

/** The chat shell's own door (a route the frame does not admit): Chat opens the composer. */
const chatSlash = async (page: import("@playwright/test").Page, command: string) => {
  await page.getByRole("button", { name: "Chat", exact: true }).click()
  const input = page.getByTestId("composer-input")
  await expect(input).toBeVisible()
  await input.fill(command)
  await input.press("Enter")
}

/** A public repository the frame admits: the catalog row and the reads the Code home makes. */
const publicRepository = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [
    { name: "smithersai/smithers", title: "Smithers", url: "https://github.com/smithersai/smithers", summary: "Smithers.", stats: null },
  ] } }))
  await page.route("**/api/repos/smithersai/smithers", route => route.fulfill({ json: { full_name: "smithersai/smithers", is_public: true, default_bookmark: "main" } }))
  await page.route("**/api/repos/smithersai/smithers/home", route => route.fulfill({ json: { kind: "readme", markdown: "# Smithers\n\nSmithers." } }))
  await page.route(/\/api\/repos\/smithersai\/smithers\/contents(?:\?.*)?$/, route => route.fulfill({ json: [{ name: "README.md", path: "README.md", type: "file", size: 20 }] }))
  await page.route("**/api/repos/smithersai/smithers/bookmarks**", route => route.fulfill({ json: { items: [
    { name: "main", target_change_id: "main-change", target_commit_id: "a".repeat(40) }
  ], next_cursor: "" } }))
}

/** Every request that reaches the sign-in route, from first paint on. */
const signInRequests = (page: import("@playwright/test").Page): string[] => {
  const requests: string[] = []
  page.on("request", request => { if (new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH) requests.push(request.url()) })
  return requests
}

test("repository frame sign-in is keyboard reachable from Ask and carries return_to", async ({ page }) => {
  await signedOutVisitor(page)
  await publicRepository(page)
  const redirects = signInRequests(page)
  await page.goto("/smithersai/smithers/")
  const door = page.getByRole("button", { name: "Ask", exact: true })
  await expect(door).toBeVisible()
  // The frame keeps its own doors: the quiet header Sign in and the one primary action, Ask.
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible()
  await expect(page.getByTestId("composer-input")).toBeHidden()
  expect(redirects).toEqual([])
  for (let step = 0; step < 40 && !await door.evaluate(node => node === document.activeElement); step++) await page.keyboard.press(controlTabKey(page))
  await expect(door).toBeFocused()
  const bounds = await door.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
  const request = page.context().waitForEvent("request", request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
  await page.keyboard.press("Enter")
  expect(new URL((await request).url()).searchParams.get("return_to")).toBe("/smithersai/smithers/?ask=1")
})

test("the header's Sign in returns to the bare repository page; only the Ask door asks for Ask", async ({ page }) => {
  await signedOutVisitor(page)
  await publicRepository(page)
  await page.goto("/smithersai/smithers/")
  await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
  const request = page.context().waitForEvent("request", request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  expect(new URL((await request).url()).searchParams.get("return_to")).toBe("/smithersai/smithers/")
})

/*
 * The return: `/owner/repo/?ask=1` opens Ask for a viewer who can Ask (a
 * member, at 1280 where the Ask starts collapsed) and drops the parameter
 * from the address; signed out it opens nothing and redirects nowhere.
 */
for (const width of [1280, 390]) {
  test(`?ask=1 reopens Ask for a member and leaves the address bare ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signedOutVisitor(page)
    await publicRepository(page)
    await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", identityRoute())
    await page.route("**/api/user/repos**", route => route.fulfill({ json: [{ owner: "smithersai", name: "smithers", full_name: "smithersai/smithers", default_bookmark: "main" }] }))
    await page.route("**/api/user/orgs**", route => route.fulfill({ json: [] }))
    const redirects = signInRequests(page)
    await page.goto("/smithersai/smithers/?ask=1")
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Ask", exact: true }).getByTestId("composer-input")).toBeVisible()
    // Design (K): the Ask says what it is about.
    await expect(page.getByRole("complementary", { name: "Ask", exact: true })).toContainText("Asking about smithersai/smithers at main")
    // Design (J) and (I), painted: the header's Ask is not filled while the Ask is open; Send is the brand's tinted control, 40% with nothing to send; one ring.
    const painted = (locator: import("@playwright/test").Locator) => locator.evaluate(node => {
      const probe = document.createElement("span"); node.append(probe)
      const read = (value: string) => { probe.style.color = value; return getComputedStyle(probe).color }
      const style = getComputedStyle(node)
      const result = { background: style.backgroundColor, color: style.color, brand: read("var(--brand)"), brandSoft: read("var(--brand-soft)"), surface2: read("var(--surface-2)"), opacity: style.opacity, outline: style.outlineStyle, border: style.borderColor, shadow: style.boxShadow }
      probe.remove(); return result
    })
    const askPaint = await painted(page.getByRole("button", { name: "Ask", exact: true }))
    expect(askPaint.background).toBe(askPaint.surface2)
    expect(askPaint.background).not.toBe(askPaint.brand)
    const send = page.getByTestId("composer-send")
    const sendPaint = await painted(send)
    // The mock's tinted Send (frame.css .repo-frame-send): the brand's soft surface and the brand's ink, not a second full fill.
    expect(sendPaint.background).toBe(sendPaint.brandSoft)
    expect(sendPaint.color).toBe(sendPaint.brand)
    expect(sendPaint.opacity).toBe("0.4")
    const input = page.getByTestId("composer-input")
    await input.focus()
    await page.keyboard.type("hello")
    expect((await painted(send)).opacity).toBe("1")
    expect((await painted(input)).outline).toBe("none")
    // The composer's border carries the brand (its glass surface may add an alpha); the channels are what the eye reads.
    // The library composer eases its border over .15s (`.sui-chat-composer` transition), so the settled color is the one read.
    const channels = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    await expect.poll(async () => {
      const wrapper = await painted(page.locator(".repository-chat .smithers-composer").first())
      return Math.max(...channels(wrapper.border).map((channel, index) => Math.abs(channel - channels(wrapper.brand)[index]!)))
    }).toBeLessThanOrEqual(2)
    // One ring: the mock's 1px brand ring, never the library's 4px focus halo under it. The composer eases box-shadow
    // with its border, so the settled shadow is the one read.
    const ring = async () => (await painted(page.locator(".repository-chat .smithers-composer").first())).shadow
    await expect.poll(ring).toMatch(/^rgba?\([^)]*\) 0px 0px 0px 1px$/)
    expect(await ring()).not.toMatch(/\b4px\b/)
    await expect(page).toHaveURL(url => url.pathname === "/smithersai/smithers/" && url.searchParams.get("ask") === null)
    expect(redirects).toEqual([])
    // A reload of the bare address is the ordinary page: the Ask starts collapsed below 1440.
    await page.reload()
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toHaveAttribute("aria-expanded", "false")
  })

  test(`?ask=1 signed out opens nothing, redirects nowhere and leaves the address bare ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signedOutVisitor(page)
    await publicRepository(page)
    const redirects = signInRequests(page)
    await page.goto("/smithersai/smithers/?ask=1")
    const ask = page.getByRole("button", { name: "Ask", exact: true })
    await expect(ask).toBeVisible()
    await expect(ask).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByTestId("composer-input")).toBeHidden()
    await expect(page.getByRole("region", { name: "README", exact: true })).toBeVisible()
    await expect(page).toHaveURL(url => url.pathname === "/smithersai/smithers/" && url.searchParams.get("ask") === null)
    expect(redirects).toEqual([])
  })
}

/*
 * Signed out, the repository frame has no composer to type a slash command into
 * (guest access is off): the commands' own doors are pinned per command in
 * state/signed-out-doors.test.ts. What the route still owes a signed-out
 * visitor is the page itself: no redirect on load, no stand-in for data it
 * cannot read, no stray notice, and Ask leading to sign-in that returns here.
 */
test("signed out, the repository frame keeps the visitor on the page and Ask leads to sign-in with return_to", async ({ page }) => {
  await signedOutVisitor(page)
  await publicRepository(page)
  const redirects = signInRequests(page)
  await page.goto("/smithersai/smithers/")
  const ask = page.getByRole("button", { name: "Ask", exact: true })
  await expect(ask).toBeVisible()
  await expect(ask).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByTestId("composer-input")).toBeHidden()
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "README", exact: true }).getByRole("heading", { name: "Smithers", level: 1 })).toBeVisible()
  await expect(page.getByText(/0 Open|No open issues in/)).toHaveCount(0)
  await expect(page.locator(".notice")).toHaveCount(0)
  expect(new URL(page.url()).pathname).toMatch(/^\/smithersai\/smithers\/?$/)
  expect(redirects).toEqual([])
  await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
  const request = page.context().waitForEvent("request", request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
  await ask.click()
  expect(new URL((await request).url()).searchParams.get("return_to")).toBe("/smithersai/smithers/?ask=1")
})

// The Wiki is core (D-09b) and the web host seeds no World page; the default chrome has no icon rail (#3334).
test("unknown repository has one sign-in card and no icon rail", async ({ page }) => {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [] } }))
  await page.goto("/nope/nope/")
  await expect(page.getByRole("article").filter({ has: page.locator('[data-flow="sign-in"]') })).toContainText("nope/nope")
  await expect(page.getByRole("article").filter({ has: page.locator('[data-flow="sign-in"]') })).toHaveCount(1)
  await expect(page.getByTestId("chrome-actions")).toHaveCount(0)
  await expect(page.locator(".world-document-title")).toHaveCount(0)
})

// The transcript's own sign-in door on a repository route stands where the frame cannot admit the
// repository (the card above); it is the same action the slash doors raise, painted readable.
test("repository transcript sign-in paints with the readable primary action token", async ({ page }) => {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [] } }))
  await page.goto("/nope/nope/")
  const door = page.getByRole("article").filter({ has: page.locator('[data-flow="sign-in"]') }).getByRole("button", { name: "Sign in with GitHub", exact: true }).last()
  await expect(door).toBeVisible()
  expect(await door.evaluate(node => {
    const probe = document.createElement("span")
    node.append(probe)
    const read = (value: string) => { probe.style.color = value; return getComputedStyle(probe).color }
    const painted = getComputedStyle(node).color
    const same = { action: painted === read("var(--action-primary)"), text: painted === read("var(--text)") }
    probe.remove()
    return same
  })).toEqual({ action: true, text: false })
})

/*
 * CT089: a bare repository command typed before first run has chosen its
 * target parks and resumes into the sign-in requirement. The selected
 * backend's user API is the one identity read on the critical path
 * (state/controller/auth-billing.ts loadSession), so it is held here.
 */
const heldIdentity = async (page: import("@playwright/test").Page) => {
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route(url => url.pathname === "/api/user" || url.pathname === "/api/auth/session", async route => { await held; await identityRoute(null)(route) })
  return release
}

/*
 * The identity answer is SLOW, which is the scenario: the user types while it
 * is outstanding. The CONTROL waits out this window to show nothing lands in
 * it; the first-run scenario waits on the park's own trace line instead.
 */
const HELD_WINDOW_MS = 1_500

test("a bare issues.list during first-run identity resumes into one sign-in prompt", async ({ page }) => {
  await signedOutVisitor(page)
  const release = await heldIdentity(page)
  const errors: string[] = []
  const issueReads: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("request", request => { if (/\/api\/.*issues/.test(request.url())) issueReads.push(request.url()) })

  await page.goto("/")
  await skipSignup(page)
  // /verbose states every flow outcome, so the deferral's own trace line is the
  // event that says the command has parked — no wall clock to wait out.
  await slash(page, "/debug.verbose")
  await expect(page.getByTestId("transcript").getByText("Verbose on — showing every flow, including hidden and background ones", { exact: true })).toBeVisible()
  await slash(page, "/issues.list")
  await expect(page.getByTestId("transcript").getByText(/You ran \/issues\.list → deferred \(waits on first-run-target\)/)).toBeVisible()
  // The command parks: nothing is published, and it never asks for a repository.
  await expect(page.locator('.smithers-card[data-kind="issue-list"], .smithers-card[data-kind="flow-form"]')).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Repo" })).toHaveCount(0)

  release()
  const signIn = page.getByRole("article").filter({ has: page.locator('[data-flow="sign-in"]') })
  await expect(signIn).toHaveCount(1)
  await expect(signIn.getByRole("button", { name: "Sign in with GitHub", exact: true })).toBeVisible()
  await expect(page.locator('.smithers-card[data-kind="issue-list"]')).toHaveCount(0)
  await expect(page.locator('.smithers-card[data-kind="flow-form"]')).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Repo" })).toHaveCount(0)
  expect(errors).toEqual([])
  // The sign-in requirement keeps the repository read parked without issuing a request.
  expect(issueReads).toEqual([])
})

/*
 * The admitted repository frame has no composer signed out, so the control
 * types into the repository transcript the frame does not admit: a repository
 * Smithers does not have. Its entry is still a route target, which is what
 * the control pins.
 */
test("CONTROL: a repository entry is a target, so the same command never parks or reaches practice", async ({ page }) => {
  await signedOutVisitor(page)
  await page.route("**/api/public/repos", route => route.fulfill({ json: { repos: [] } }))
  /*
   * No latch here, deliberately: a repository path never takes the
   * non-blocking branch (ControllerBootMemo canPaintAppBeforeIdentity), so the
   * first-run window does not exist for it — which is what this control pins.
   */
  await page.goto("/nope/nope/")
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
  await chatSlash(page, "/issues.list")
  await page.waitForTimeout(HELD_WINDOW_MS)
  // firstRunTargetPending is false whenever an entry or a selection exists, so
  // nothing parks and the bundled practice source is never the target.
  await expect(page.getByTestId("card-practice-issues")).toHaveCount(0)
  await expect(page.getByText("Continuing:")).toHaveCount(0)
})

/*
 * The same first run with NO artificial delay: the identity answer is released
 * in the same tick the line is sent, so the signed-out row lands before the
 * practice selection does. The command must still wait for the target — this
 * is the narrow version of the held-latch race, and the one every fast network
 * actually produces.
 */
test("a bare issues.list offers sign-in when identity answers immediately", async ({ page }) => {
  await signedOutVisitor(page)
  const release = await heldIdentity(page)
  await page.goto("/")
  await skipSignup(page)
  await slash(page, "/issues.list")
  release()
  const signIn = page.getByRole("article").filter({ has: page.locator('[data-flow="sign-in"]') })
  await expect(signIn).toHaveCount(1)
  await expect(signIn.getByRole("button", { name: "Sign in with GitHub", exact: true })).toBeVisible()
  await expect(page.locator('.smithers-card[data-kind="flow-form"]')).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Repo" })).toHaveCount(0)
})
