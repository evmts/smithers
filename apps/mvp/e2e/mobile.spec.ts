import { test as base, expect, type Page, type TestInfo } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { recordActions, writeManifest } from "./fixtures"
import { openComposer } from "./composer"
import { baseURL, requires, scriptedAgent } from "./target"

// Real pages and services. Persist a structured audit even when several checks fail,
// so the first run is the red receipt for each subsequent layout change.
const test = base.extend<{ recording: void }>({
  recording: [async ({ page }, use, info) => {
    const startedAt = Date.now()
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await recordActions(page, info)
    await use()
    await writeFile(info.outputPath("page-errors.json"), JSON.stringify(errors, null, 2))
    await writeManifest(info, "flow.json", startedAt, [{ name: "", video: "video.webm", openedAt: 0 }])
  }, { auto: true }],
})
test.use({ video: "on", screenshot: "only-on-failure", colorScheme: "light" })

type Finding = { element: string; problem: string }
const audit = async (page: Page, info: TestInfo, name = "screen") => {
  await page.evaluate(() => document.fonts.ready)
  const findings: Finding[] = []
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  if (overflow.scroll > overflow.width) findings.push({ element: "document", problem: `horizontal scroll ${overflow.scroll} > ${overflow.width}` })
  const controls = page.locator('a[href], button, input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="tab"], [contenteditable="true"]')
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue
    // Long pages and scrollable panels are legitimate. Bring each target into view,
    // then verify it is reachable, rather than requiring the whole page above the fold.
    await control.scrollIntoViewIfNeeded()
    const issues = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const name = `${element.tagName.toLowerCase()}.${element.className} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? ""}`
      const errors: Finding[] = []
      if (rect.width < 32 || rect.height < 32) errors.push({ element: name, problem: `tap target ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}` })
      if (rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) errors.push({ element: name, problem: `outside viewport ${JSON.stringify(rect.toJSON())}` })
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (top !== element && !element.contains(top)) errors.push({ element: name, problem: `covered by ${top?.tagName}.${top?.className}` })
      return errors
    })
    findings.push(...issues)
  }
  findings.push(...await page.evaluate(() => {
    const errors: Finding[] = []
    for (const element of document.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, label, button, a, span, li, td, th, pre")) {
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || !element.textContent?.trim() || element.clientWidth === 0) continue
      const style = getComputedStyle(element)
      // Accessibility-only labels are intentionally visually clipped, not visible prose.
      if (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)") continue
      // Source viewers intentionally scroll; clipped labels and prose do not.
      if (element.scrollWidth > element.clientWidth + 1 && !["auto", "scroll"].includes(style.overflowX)) {
        errors.push({ element: `${element.tagName.toLowerCase()}.${element.className} ${element.textContent.trim().slice(0, 80)}`, problem: `text clipped ${element.scrollWidth} > ${element.clientWidth}` })
      }
    }
    return errors
  }))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" })
  const receipt = info.outputPath(`${name}.json`)
  await writeFile(receipt, JSON.stringify({ route: page.url(), viewport: page.viewportSize(), findings }, null, 2))
  await info.attach(`layout-audit-${name}`, { path: receipt, contentType: "application/json" })
  expect.soft(findings, `${page.url()} at ${JSON.stringify(page.viewportSize())}`).toEqual([])
}

const screens = [
  { name: "landing", path: "/", ready: "main" },
  { name: "home", path: "/app", ready: 'main[aria-label="App"]' },
  { name: "repository", path: "/octocat/Spoon-Knife", ready: 'header[aria-label="Repository"]' },
  { name: "branch", path: "/octocat/Spoon-Knife/tree/test-branch", ready: 'nav[aria-label="Branch"]' },
  { name: "files", path: "/octocat/Spoon-Knife/blob/main/README.md", ready: 'article[aria-label="README.md"]' },
  { name: "file-tabs", path: "/octocat/Spoon-Knife/blob/main/index.html", ready: 'article[aria-label="index.html"]' },
  { name: "issues", path: "/smithersai/smithers/issues", ready: "main" },
  { name: "new-issue", path: "/smithersai/smithers/issues/new", ready: "main" },
  { name: "pulls", path: "/smithersai/smithers/pulls", ready: "main" },
  { name: "stack", path: "/octocat/Spoon-Knife/stack", ready: 'main[aria-label="Stack"]' },
  { name: "runs", path: "/app/runs", ready: 'main[aria-label="Runs"]' },
  { name: "flows", path: "/app/flows", ready: 'main[aria-label="Flows"]' },
  { name: "new-flow", path: "/app/flows/new", ready: "main" },
  { name: "settings", path: "/app/settings", ready: 'main[aria-label="Settings"]' },
  { name: "docs", path: "/smithersai/vibelang/docs", ready: '.docs-page-index' },
  { name: "doc-page", path: "/smithersai/vibelang/docs/error-management/018-retrying.md", ready: '[aria-label="Docs"]' },
  { name: "queue", path: "/app/queue", ready: "main" },
  { name: "terminal", path: "/octocat/Spoon-Knife/tree/test-branch?terminal=me", ready: ".terminal-panel" },
] as const

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport })
    for (const signedIn of [false, true]) {
      test.describe(signedIn ? "signed in" : "signed out", () => {
        test.beforeEach(async ({ context }) => {
          requires("devSignIn")
          if (!signedIn) {
            const secure = baseURL.startsWith("https:")
            await context.addCookies([{ name: `${secure ? "__Host-" : ""}smithers_dev_signed_out`, value: "1", url: baseURL, secure }])
          }
        })
        for (const screen of screens) {
          test(`${screen.name}: controls and text fit`, async ({ page }, info) => {
            await test.step(`Open ${screen.name}`, async () => {
              await page.goto(screen.path)
              await expect(page.locator(screen.ready).first()).toBeVisible({ timeout: 30_000 })
            })
            await audit(page, info)
          })
        }
        if (signedIn) test("composer: controls and text fit", async ({ page }, info) => {
          await page.goto(scriptedAgent("echo"))
          const composer = await openComposer(page)
          await composer.fill("Review mobile layouts and preserve all available actions on a narrow screen.")
          await audit(page, info)
        })
        if (signedIn) test("TODO: draft, stack and detail fit", async ({ page }, info) => {
          test.setTimeout(120_000)
          await page.goto("/octocat/Spoon-Knife/stack")
          await page.getByRole("button", { name: "New TODO" }).click()
          const draft = page.getByRole("form", { name: "TODO draft" }).first()
          const title = `Mobile layout ${crypto.randomUUID()}`
          await draft.getByLabel("Title").fill(title)
          await draft.getByLabel("Prompt").fill("Check that every control remains accessible on a narrow screen.")
          await audit(page, info, "draft")
          await draft.getByRole("button", { name: "Commit", exact: true }).click()
          const row = page.locator('[data-slot="issues-row"]', { hasText: title })
          await expect(row).toContainText(/T\d+/, { timeout: 60_000 })
          await audit(page, info, "stack")
          await row.getByRole("link", { name: title }).click()
          await expect(page.getByRole("article", { name: new RegExp(title) })).toBeVisible()
          try {
            await audit(page, info, "todo")
          } finally {
            await page.getByRole("button", { name: "Drop", exact: true }).click()
            await page.getByRole("dialog").getByRole("button", { name: "Drop", exact: true }).click()
          }
        })
        if (signedIn) test("run and queue: populated controls fit", async ({ page }, info) => {
          test.setTimeout(120_000)
          await page.goto(scriptedAgent("needs-you"))
          const composer = await openComposer(page)
          const question = `Deploy the docs preview, mobile-${crypto.randomUUID()}`
          const accepted = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/questions" && request.postDataJSON().text === question)
          await composer.fill(question)
          await composer.press("Enter")
          const { answerId } = (await accepted).postDataJSON() as { answerId: string }
          try {
            await expect(page.locator('[data-slot="needs-you"]').first()).toBeVisible({ timeout: 60_000 })
            await audit(page, info, "conversation")
            await page.keyboard.press("Escape")
            await page.keyboard.press("g")
            await page.keyboard.press("q")
            await expect(page).toHaveURL(/\/app\/queue$/)
            await expect(page.getByRole("article", { name: "Item" })).toBeVisible()
            await audit(page, info, "question")
            await page.goto(`/app/runs/${answerId}`)
            await expect(page.getByRole("group", { name: "Run graph" })).toBeVisible({ timeout: 30_000 })
            await audit(page, info, "run")
            await page.getByRole("tab", { name: "Journal", exact: true }).click()
            await audit(page, info, "journal")
          } finally {
            await page.request.post(`/api/answers/${answerId}`, { data: { status: "failed", failure: "unfinished" } })
            await page.request.post("/api/notifications/ack", { data: { subject: `run:${answerId}`, version: 3, act: "dismiss" } })
          }
        })
        if (signedIn) test("toasts: several live notices fit", async ({ page }, info) => {
          await page.goto("/app")
          await expect(page.getByRole("main", { name: "App" })).toBeVisible()
          const answers: string[] = []
          try {
            for (let index = 0; index < 5; index++) {
              const answerId = crypto.randomUUID()
              answers.push(answerId)
              expect((await page.request.post("/api/questions", { data: { id: crypto.randomUUID(), answerId, text: `Mobile notice ${answerId}` } })).ok()).toBe(true)
              expect((await page.request.post(`/api/runs/${answerId}`, { data: { status: "working" } })).ok()).toBe(true)
            }
            await expect(page.locator('[data-slot="toast"]')).toHaveCount(3, { timeout: 30_000 })
            await audit(page, info)
          } finally {
            for (const answerId of answers) {
              await page.request.post(`/api/answers/${answerId}`, { data: { status: "failed", failure: "unfinished" } })
              await page.request.post("/api/notifications/ack", { data: { subject: `run:${answerId}`, version: 2, act: "dismiss" } })
            }
          }
        })
      })
    }
  })
}
