import { test as base, expect, type Page, type TestInfo } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { digestSync } from "@smthrs/crypto"
import { renderSource, SOURCE_PATH } from "../src/features/flows-ui/source"
import { recordActions, writeManifest } from "./fixtures"
import { desktopBaseline } from "./mobile-baseline"
import { openComposer } from "./composer"
import { baseURL, requires, scriptedAgent, target, writeHeaders } from "./target"

// Real pages and services. Persist a structured audit even when several checks fail,
// so the first run is the red receipt for each subsequent layout change.
const test = base.extend<{ recording: void; mobileViewport: { width: number; height: number } }>({
  mobileViewport: [{ width: 1280, height: 800 }, { option: true }],
  viewport: async ({ mobileViewport }, use) => use(mobileViewport),
  contextOptions: async ({ mobileViewport }, use, info) => {
    await use({ recordVideo: { dir: info.outputPath("videos"), size: mobileViewport } })
  },
  recording: [async ({ page }, use, info) => {
    const startedAt = Date.now()
    const errors: string[] = []
    const docsReads: Array<{ status: number; code?: string; reason?: string }> = []
    const reads: Array<Promise<void>> = []
    page.on("response", (response) => {
      if (!new URL(response.url()).pathname.startsWith("/api/repos/smithersai/vibelang/docs")) return
      reads.push((async () => {
        const receipt: { status: number; code?: string; reason?: string } = { status: response.status() }
        if (response.status() >= 400) {
          const body = await response.json().catch(() => ({})) as { code?: string; reason?: string }
          receipt.code = body.code
          receipt.reason = body.reason
        }
        docsReads.push(receipt)
      })())
    })
    page.on("pageerror", (error) => errors.push(error.message))
    await recordActions(page, info)
    await use()
    if (info.status === "skipped") return
    await Promise.all(reads)
    await writeFile(info.outputPath("docs-reads.json"), JSON.stringify(docsReads, null, 2))
    await writeFile(info.outputPath("page-errors.json"), JSON.stringify(errors, null, 2))
    const name = info.titlePath.slice(1).join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 150)
    // Playwright moves its temporary recording beside the manifest during teardown.
    await writeManifest(info, "flow.json", startedAt, [{ name: "", video: "video.webm", openedAt: 0 }], { test: name, flow: name })
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
    await control.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }))
    const issues = await control.evaluate((element) => {
      // Scrolling to the latest message legitimately hides its jump button.
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return []
      const rect = element.getBoundingClientRect()
      const name = `${element.tagName.toLowerCase()}.${element.className} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? ""}`
      const errors: Finding[] = []
      if (innerWidth <= 960 && (rect.width < 32 || rect.height < 32)) errors.push({ element: name, problem: `tap target ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}` })
      if (rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) errors.push({ element: name, problem: `outside viewport ${JSON.stringify(rect.toJSON())}` })
      // An inline link can wrap: its bounding-box center may be empty space
      // between fragments. Check every actual fragment, not that empty space.
      for (const fragment of element.getClientRects()) {
        const insetX = Math.min(4, fragment.width / 4)
        const insetY = Math.min(4, fragment.height / 4)
        const points = [
          [fragment.x + fragment.width / 2, fragment.y + fragment.height / 2],
          [fragment.left + insetX, fragment.top + fragment.height / 2],
          [fragment.right - insetX, fragment.top + fragment.height / 2],
          [fragment.left + fragment.width / 2, fragment.top + insetY],
          [fragment.left + fragment.width / 2, fragment.bottom - insetY],
        ]
        for (const [x, y] of points) {
          const top = document.elementFromPoint(x!, y!)
          if (top !== element && !element.contains(top)) {
            errors.push({ element: name, problem: `covered by ${top?.tagName}.${top?.className}` })
            break
          }
        }
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          const box = parent.getBoundingClientRect()
          const left = box.left + parent.clientLeft
          const top = box.top + parent.clientTop
          const clips = (overflow: string) => ["hidden", "clip", "auto", "scroll"].includes(overflow)
          if ((clips(style.overflowX) && (fragment.left < left - 1 || fragment.right > left + parent.clientWidth + 1)) ||
              (clips(style.overflowY) && (fragment.top < top - 1 || fragment.bottom > top + parent.clientHeight + 1))) {
            errors.push({ element: name, problem: `clipped by ${parent.tagName}.${parent.className}` })
          }
        }
      }
      return errors
    })
    findings.push(...issues)
  }
  findings.push(...await page.evaluate(() => {
    const errors: Finding[] = []
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (!(element instanceof HTMLElement) || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || !element.textContent?.trim()) continue
      const style = getComputedStyle(element)
      // Accessibility-only labels are intentionally visually clipped, not visible prose.
      if (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)") continue
      // Visible overflow (including an outside badge) is not clipping.
      // Source viewers intentionally scroll; hidden/clip overflow loses text.
      if (element.scrollWidth > element.clientWidth + 1 && ["hidden", "clip"].includes(style.overflowX)) {
        errors.push({ element: `${element.tagName.toLowerCase()}.${element.className} ${element.textContent.trim().slice(0, 80)}`, problem: `text clipped ${element.scrollWidth} > ${element.clientWidth}` })
      }
      if (element.scrollHeight > element.clientHeight + 1 && ["hidden", "clip"].includes(style.overflowY)) {
        errors.push({ element: `${element.tagName.toLowerCase()}.${element.className}`, problem: `text clipped vertically ${element.scrollHeight} > ${element.clientHeight}` })
      }
      // Check actual text fragments against clipping ancestors. A scrollable
      // ancestor makes its offscreen text reachable and ends that axis's check.
      for (const child of element.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(child)
        for (const fragment of range.getClientRects()) {
          let checkX = true
          let checkY = true
          for (let parent: HTMLElement | null = element; parent && (checkX || checkY); parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent)
            if (["auto", "scroll"].includes(parentStyle.overflowX)) checkX = false
            if (["auto", "scroll"].includes(parentStyle.overflowY)) checkY = false
            const box = parent.getBoundingClientRect()
            const left = box.left + parent.clientLeft
            const top = box.top + parent.clientTop
            if ((checkX && ["hidden", "clip"].includes(parentStyle.overflowX) && (fragment.left < left - 1 || fragment.right > left + parent.clientWidth + 1)) ||
                (checkY && ["hidden", "clip"].includes(parentStyle.overflowY) && (fragment.top < top - 1 || fragment.bottom > top + parent.clientHeight + 1))) {
              errors.push({ element: `${element.tagName.toLowerCase()}.${element.className}`, problem: `text clipped by ${parent.tagName}.${parent.className}` })
              break
            }
          }
        }
      }
    }
    return errors
  }))
  await page.evaluate(() => window.scrollTo(0, 0))
  const receipt = info.outputPath(`${name}.json`)
  await writeFile(receipt, JSON.stringify({ route: page.url(), viewport: page.viewportSize(), findings }, null, 2))
  await info.attach(`layout-audit-${name}`, { path: receipt, contentType: "application/json" })
  if (page.viewportSize()?.width === 1280) await desktopBaseline(page, info, name)
  else await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" })
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
  { name: "conversations", path: "/app/conversations", ready: 'main[aria-label="Conversations"]' },
  { name: "secrets", path: "/smithersai/smithers/settings/secrets", ready: 'main[aria-label="Secrets"]' },
  { name: "repo-settings", path: "/smithersai/smithers/settings", ready: 'main[aria-label="Settings"]' },
  { name: "settings", path: "/app/settings", ready: 'main[aria-label="Settings"]' },
  { name: "docs", path: "/smithersai/vibelang/docs", ready: '.docs-page-index' },
  { name: "doc-page", path: "/smithersai/vibelang/docs/error-management/018-retrying.md", ready: '[aria-label="Docs"]' },
  { name: "queue", path: "/app/queue", ready: "main" },
  { name: "terminal", path: "/octocat/Spoon-Knife/tree/test-branch?terminal=me", ready: ".terminal-panel" },
] as const

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ mobileViewport: viewport })
    for (const signedIn of [false, true]) {
      test.describe(signedIn ? "signed in" : "signed out", () => {
        test.beforeEach(async ({ context }) => {
          if (!signedIn && target === "deployment") await context.clearCookies()
          if (!signedIn && target === "local") {
            const secure = baseURL.startsWith("https:")
            await context.addCookies([{ name: `${secure ? "__Host-" : ""}smithers_dev_signed_out`, value: "1", url: baseURL, secure }])
          }
          // The farm's static page can be ready before its Worker. Wait for
          // the session boundary before opening the page under test.
          await expect.poll(async () => {
            const session = await context.request.get("/api/auth/session")
            return { status: session.status(), ...(session.ok() ? await session.json() : {}) }
          }, { timeout: 30_000 }).toMatchObject({ status: 200, signedIn })
        })
        for (const screen of screens) {
          test(`${screen.name}: controls and text fit`, async ({ page, request }, info) => {
            if (screen.name === "files" || screen.name === "file-tabs") requires("codeStorage")
            await test.step(`Open ${screen.name}`, async () => {
              if (screen.name === "conversations" && signedIn) {
                await page.goto("/octocat/Spoon-Knife/tree/test-branch")
                await expect(page.getByRole("navigation", { name: "Branch" })).toBeVisible({ timeout: 30_000 })
              }
              await page.goto(screen.path)
              if (screen.name === "files" || screen.name === "file-tabs") {
                await expect(page.getByRole("main", { name: "Repository", exact: true })).toBeVisible({ timeout: 30_000 })
                const repository = { owner: "octocat", name: "Spoon-Knife" }
                // The request fixture has the test person's session, independent of
                // a signed-out page's cookie. A real clone must precede file coverage.
                const clone = await request.post("/api/repos", { headers: writeHeaders(), data: repository })
                expect(clone.ok(), `the file fixture's real clone is admitted (HTTP ${clone.status()}, ${await clone.text()})`).toBe(true)
                const { cloneId } = await clone.json() as { cloneId: string }
                const launch = await request.post("/api/repos/launch", { headers: writeHeaders(), data: { ...repository, cloneId } })
                expect(launch.ok(), "the file fixture's real clone is launched").toBe(true)
              }
              const ready = screen.name === "terminal" && !signedIn ? ".branch-screen-view" : screen.ready
              await expect(page.locator(ready).first()).toBeVisible({ timeout: 30_000 })
              if (screen.name === "conversations" && signedIn) await expect(page.getByRole("list", { name: "Conversations" }).getByRole("link").first()).toBeVisible({ timeout: 30_000 })
              if (screen.name === "secrets" && signedIn) await expect(page.getByRole("form", { name: "Add secret" })).toBeVisible({ timeout: 30_000 })
              if (screen.name === "repo-settings" && signedIn) await expect(page.getByRole("region", { name: "Domains" })).toBeVisible({ timeout: 30_000 })
              if (screen.name === "doc-page") await expect(page.getByRole("heading", { name: "Retrying", exact: true }).first()).toBeVisible({ timeout: 60_000 })
              if (screen.name === "branch") await expect(page.locator(".branch-screen-view")).toBeVisible({ timeout: 30_000 })
              if (screen.name === "terminal" && !signedIn) await expect(page.locator(".terminal-panel")).toHaveCount(0)
            })
            await audit(page, info)
          })
        }
        if (signedIn) test("composer: controls and text fit", async ({ page }, info) => {
          requires("scriptedAgent")
          await page.goto(scriptedAgent("echo"))
          const composer = await openComposer(page)
          await composer.fill("Review mobile layouts and preserve all available actions on a narrow screen.")
          await audit(page, info)
        })
        if (signedIn) test("flow draft and code: controls and text fit", async ({ page }, info) => {
          const name = `mobile-${crypto.randomUUID()}`
          const draftId = crypto.randomUUID()
          const source = renderSource({ name, description: "Mobile layout", instructions: "Answer ready.", flows: [] })
          expect((await page.request.post(`/api/flow-drafts/${draftId}`, { headers: writeHeaders(), data: {
            scope: "person", round: 0, request: "Answer ready.", name, status: "ready", summary: "Mobile layout",
            files: [{ path: SOURCE_PATH, text: source }], checks: [{ check: "parses", ok: true }], questions: [], failure: null, flowId: null,
          } })).ok()).toBe(true)
          await page.goto(`/app/flows/drafts/${draftId}`)
          const save = page.getByRole("button", { name: "Save", exact: true })
          await expect.soft(save, "the persisted draft must load before layout coverage counts").toBeVisible({ timeout: 30_000 })
          if (await save.isVisible()) await audit(page, info, "flow-draft")
          const saved = await page.request.post("/api/flows/save", { headers: writeHeaders(), data: { draftId, name, description: "Mobile layout", source, digest: digestSync(source) } })
          expect(saved.ok()).toBe(true)
          const { flowId } = await saved.json() as { flowId: string }
          try {
            await page.goto(`/app/flows/code/${name}`)
            await expect(page.getByRole("textbox", { name: "Code", exact: true })).toHaveValue(source, { timeout: 30_000 })
            await audit(page, info, "flow-code")
          } finally {
            expect((await page.request.post(`/api/flows/${flowId}/delete`, { headers: writeHeaders(), data: {} })).ok()).toBe(true)
          }
        })
        for (const kind of ["issues", "pulls"] as const) test(`${kind} detail: a synced item and its tabs fit`, async ({ page }, info) => {
          requires("githubApp")
          await page.goto(`/smithersai/smithers/${kind}`)
          const prefix = kind === "issues" ? "issues" : "pull"
          const item = page.locator(`a[href^="/smithersai/smithers/${prefix}/"]`).filter({ hasNotText: "New issue" }).first()
          await expect(item, "a real synced item is required; an empty list is not detail-page coverage").toBeVisible({ timeout: 30_000 })
          const href = await item.getAttribute("href")
          await item.click()
          await expect(page.locator("main article").first()).toBeVisible()
          await audit(page, info, "detail")
          if (kind === "pulls") for (const tab of ["commits", "checks", "files"]) {
            await page.goto(`${href}/${tab}`)
            await expect(page.locator("main article").first()).toBeVisible()
            await audit(page, info, tab)
          }
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
            await expect(page.getByRole("article", { name: new RegExp(title) })).toHaveAttribute("data-status", "dropped", { timeout: 30_000 })
          }
        })
        if (signedIn) test("run and queue: populated controls fit", async ({ page }, info) => {
          test.setTimeout(120_000)
          requires("scriptedAgent")
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
            await page.request.post(`/api/answers/${answerId}`, { headers: writeHeaders(), data: { status: "failed", failure: "unfinished" } })
            await page.request.post("/api/notifications/ack", { headers: writeHeaders(), data: { subject: `run:${answerId}`, version: 3, act: "dismiss" } })
          }
        })
        if (signedIn) test("toasts: several live notices fit", async ({ page }, info) => {
          // This fixture creates unfinished questions as the local developer.
          // Never enqueue them into a deployment's shared home conversation.
          requires("devSignIn")
          await page.goto("/app")
          await expect(page.getByRole("main", { name: "App" })).toBeVisible()
          const answers: string[] = []
          try {
            for (let index = 0; index < 5; index++) {
              const answerId = crypto.randomUUID()
              answers.push(answerId)
              expect((await page.request.post("/api/questions", { headers: writeHeaders(), data: { id: crypto.randomUUID(), answerId, text: `Mobile notice ${answerId}` } })).ok()).toBe(true)
              expect((await page.request.post(`/api/runs/${answerId}`, { headers: writeHeaders(), data: { status: "working" } })).ok()).toBe(true)
            }
            // A conversation intentionally suppresses its own working notices.
            await page.goto("/app/flows")
            await expect(page.locator('[data-slot="toast"]')).toHaveCount(3, { timeout: 30_000 })
            await audit(page, info)
          } finally {
            for (const answerId of answers) {
              await page.request.post(`/api/answers/${answerId}`, { headers: writeHeaders(), data: { status: "failed", failure: "unfinished" } })
              await page.request.post("/api/notifications/ack", { headers: writeHeaders(), data: { subject: `run:${answerId}`, version: 2, act: "dismiss" } })
            }
          }
        })
      })
    }
  })
}
