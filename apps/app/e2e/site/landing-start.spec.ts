import { expect,test } from "@playwright/test"
import { identityRoute } from "../playwright/identity"
import { fillComposer } from "../playwright/composer"

async function hostedAccount(page: import("@playwright/test").Page) {
  await page.route("**/api/**", route => route.fulfill({ status: 404, json: { code: "not_found" } }))
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "agent", "cloud"], authFlow: "redirect", sandbox: null,
  } }))
  await page.route("**/api/user", identityRoute())
  for (const path of ["repos", "orgs", "workspaces"]) await page.route(`**/api/user/${path}`, route => route.fulfill({ json: [] }))
}

test("production hosted Chat keeps confirmed output when private view loading fails", async ({ page }) => {
  await hostedAccount(page)
  let available = false
  await page.route("**/api/conversations/main/view-state", route => available ? route.fulfill({ json: {} }) : route.abort())
  await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries: [{
    id: "retained-turn", author: 1, authorLogin: "codeplanesmithers", runId: "retained-run", prompt: "Retained prompt", state: "completed",
    frames: [{ runId: "retained-run", type: "delta", kind: "text", text: "CONFIRMED RESPONSE" }, { runId: "retained-run", type: "done" }],
  }] } }))
  await page.goto("/")
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await expect(page.locator('[data-shared-turn="retained-turn"]')).toContainText("CONFIRMED RESPONSE")
  await expect(page.locator('[data-failure="ConversationUnavailable"]')).toContainText("View unavailable")
  available = true
  await page.reload()
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await expect(page.locator('[data-shared-turn="retained-turn"]')).toContainText("CONFIRMED RESPONSE")
  await expect(page.locator('[data-failure="ConversationUnavailable"]')).toHaveCount(0)
})

test("production hosted Chat edits and removes the server-owned prompt queue", async ({ page }) => {
  await hostedAccount(page)
  let queued: Array<{ id: string; prompt: string }> = []
  const mutations: Array<{ method: string; prompt?: string }> = []
  await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries: [{
    id: "running-turn", author: 1, authorLogin: "codeplanesmithers", runId: "running-run", prompt: "Running prompt", state: "running", frames: [],
  }] } }))
  await page.route("**/api/conversations/main/view-state", route => route.fulfill({ json: { queue: queued } }))
  await page.route("**/api/conversations/main/prompt", route => {
    queued = [{ id: "queued-turn", prompt: route.request().postDataJSON().prompt }]
    return route.fulfill({ status: 202, json: { turnId: "queued-turn", terminal: false } })
  })
  await page.route("**/api/conversations/main/turns/queued-turn", route => {
    const method = route.request().method(), prompt = method === "PATCH" ? route.request().postDataJSON().prompt : undefined
    mutations.push({ method, ...(prompt === undefined ? {} : { prompt }) })
    queued = method === "DELETE" ? [] : [{ id: "queued-turn", prompt }]
    return route.fulfill({ json: { status: "ok" } })
  })
  await page.goto("/")
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await fillComposer(page, "Queued prompt")
  await page.locator('[data-flow="chat.queue"]').click()
  await page.getByRole("button", { name: "Edit queued prompt: Queued prompt", exact: true }).click()
  await expect(page.getByTestId("composer-input")).toHaveValue("Queued prompt")
  await fillComposer(page, "Edited prompt")
  await page.getByTestId("composer-send").click()
  await page.getByRole("button", { name: "Remove queued prompt: Edited prompt", exact: true }).click()
  await expect(page.getByRole("region", { name: "Queued prompts" })).toHaveCount(0)
  expect(mutations).toEqual([{ method: "PATCH", prompt: "Edited prompt" }, { method: "DELETE" }])
})

test("production hosted Chat receives a real conversation response without install or owner keys", async ({ page }) => {
  const submitted: unknown[] = []
  await page.route("**/api/**", route => route.fulfill({ status: 404, json: { code: "not_found" } }))
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "agent", "cloud"], authFlow: "redirect", sandbox: null,
  } }))
  await page.route("**/api/user", identityRoute())
  for (const path of ["repos", "orgs", "workspaces"]) await page.route(`**/api/user/${path}`, route => route.fulfill({ json: [] }))
  await page.route("**/api/conversations/main/view-state", route => route.fulfill({ json: {} }))
  await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries: submitted.length ? [{
    id: "hosted-turn", author: 1, authorLogin: "codeplanesmithers", runId: "hosted-run", prompt: "Reply exactly READY.", state: "completed",
    frames: [{ runId: "hosted-run", type: "delta", kind: "text", text: "READY" }, { runId: "hosted-run", type: "done" }],
  }] : [] } }))
  await page.route("**/api/conversations/main/prompt", route => {
    submitted.push(route.request().postDataJSON())
    return route.fulfill({ status: 202, json: { turnId: "hosted-turn", terminal: false } })
  })
  await page.goto("/")
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await fillComposer(page, "Reply exactly READY.")
  await page.getByTestId("composer-send").click()
  await expect(page.locator('[data-shared-turn="hosted-turn"]')).toHaveAttribute("data-state", "completed")
  await expect(page.locator('[data-shared-turn="hosted-turn"]')).toContainText("READY")
  expect(submitted).toEqual([{ prompt: "Reply exactly READY.", idempotencyKey: expect.any(String) }])
  await expect(page.locator(".app-shell")).not.toContainText("On main: 0 working")
  await expect(page.locator(".app-shell")).not.toContainText("Model credential missing")
})

test("production Start with an empty cloud account never displays demo activity, including after reload", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 404, json: { code: "not_found", message: "Unavailable route" } }))
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["identity", "github", "cloud"], authFlow: "redirect", sandbox: null,
  } }))
  await page.route("**/api/user", identityRoute())
  for (const path of ["repos", "orgs", "workspaces"]) await page.route(`**/api/user/${path}`, route => route.fulfill({ json: [] }))
  for (const reload of [false, true]) {
    if (reload) await page.reload()
    else await page.goto("/")
    await page.getByRole("link", { name: "Get started for free", exact: true }).click()
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByTestId("composer-input")).toBeAttached()
    await expect(page.locator(".home")).toHaveCount(0)
    await expect(page.locator(".home .stack-row")).toHaveCount(0)
    await expect(page.locator(".home .run-row")).toHaveCount(0)
    for (const sample of ["acme/api", "Upgrade the Stripe SDK to v17", "Retry failed webhooks with backoff", "5 merged since you looked", "Wiki refresh", "GitHub API rate limited", "2/3 machines"]) {
      await expect(page.locator(".app-shell")).not.toContainText(sample)
    }
  }
})

test("Get started for free mounts the real island in place when it loads", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [], authFlow: "none", sandbox: null,
  } }))
  await page.goto("/")
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(page).toHaveURL("/")
  await expect(page.locator("#start-error")).toHaveCount(0)
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await page.reload()
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await expect(page.locator(".app-shell")).toBeVisible()
  expect(errors).toEqual([])
})

test("Get started for free swaps to the app before the boot answers", async ({ page }) => {
  await page.route("**/api/bootstrap", async route => {
    await new Promise(resolve => setTimeout(resolve, 3000))
    await route.fulfill({ json: {
      apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [], authFlow: "none", sandbox: null,
    } })
  })
  await page.goto("/")
  await expect(page.locator("#start")).toBeVisible()
  await page.keyboard.press("s")
  await expect(page.locator(".session-shell")).toBeVisible({ timeout: 1000 })
  await expect(page.locator("#start")).toHaveCount(0)
  await expect(page.getByTestId("composer-input")).toBeAttached()
})

for (const failure of ["chunk", "page"] as const) {
  test(`Get started for free reports an aborted app ${failure} and Reload reloads the document`, async ({ page }) => {
    let aborted = 0
    const route = failure === "chunk" ? /\/_astro\/AppIsland\.[^/]+\.js$/ : /\/smithersai\/smithers\/$/
    await page.route(route, request => { aborted++; return request.abort() })
    await page.goto("/")
    const start = page.getByRole("link", { name: "Get started for free", exact: true })
    await expect(start).toBeVisible()
    if (failure === "chunk") await page.keyboard.press("s")
    else await start.click()
    await expect(page.getByRole("alert")).toHaveText("Smithers couldn't load. Reload to try again.")
    expect(aborted).toBeGreaterThan(0)
    await expect(start).toBeHidden()
    await expect(page.locator("#start")).not.toHaveAttribute("aria-busy")
    await expect(page.locator(".app-shell")).toHaveCount(0)
    await expect(page).toHaveURL("/")
    const reload = page.getByRole("button", { name: "Reload", exact: true })
    await expect(reload).toBeFocused()
    await page.screenshot({ path: test.info().outputPath("load-error.png") })
    await Promise.all([
      page.waitForEvent("request", request => request.isNavigationRequest() && request.frame() === page.mainFrame()),
      page.keyboard.press("Enter"),
    ])
    await page.waitForLoadState()
    await expect(page.getByRole("alert")).toBeHidden()
    await expect(start).toBeVisible()
    expect(await page.evaluate(() => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).type)).toBe("reload")
  })
}

test("a returning entry reveals the landing error if its preloaded island fails", async ({ page }) => {
  await page.route(/\/_astro\/AppIsland\.[^/]+\.js$/, request => request.abort())
  // Only an authentication return resumes instantly; saved storage leaves Get started for free visible.
  await page.goto("/?signed-in")
  await expect(page.getByRole("alert")).toHaveText("Smithers couldn't load. Reload to try again.")
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toBeVisible()
  await expect(page.locator("main.home")).toHaveCSS("visibility", "visible")
})

test.describe("touch landing", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } })
  test("Get started for free hides the physical key chip on a coarse pointer", async ({ page }) => {
    await page.route(/\/smithersai\/smithers\/$/, request => request.abort())
    await page.goto("/")
    await expect(page.locator("#start")).toBeVisible()
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true)
    await expect(page.locator("#start kbd")).toBeHidden()
  })
})

for (const holdCommit of [false, true]) test(`tutorial query opens the plain app and hint dismissal survives reload${holdCommit ? " with SQLite commit held" : ""}`, async ({ page }) => {
  if (holdCommit) await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    const probe = { armed: false, held: false }
    ;(window as any).hintCommitProbe = probe
    Worker.prototype.postMessage = function(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
      if (probe.armed && typeof message === "object" && message !== null && "sql" in message &&
        typeof message.sql === "string" && /^\s*COMMIT\b/i.test(message.sql)) {
        probe.held = true
        return // The immediate reload kills this uncommitted worker; never acknowledge the write.
      }
      Reflect.apply(post, this, [message, options])
    }
  })
  await page.route("**/api/bootstrap", route => route.fulfill({ json: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [], authFlow: "none", sandbox: null,
  } }))
  await page.goto("/?tutorial")
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(page.locator(".help-bubble")).toHaveCount(1)
  const hint = page.locator('[data-first-sight-hint="chat"] .help-bubble')
  await expect(hint).toBeVisible()
  if (holdCommit) await page.evaluate(() => { (window as any).hintCommitProbe.armed = true })
  await hint.getByRole("button", { name: "Dismiss help" }).click()
  await expect(hint).toHaveCount(0)
  if (holdCommit) await expect.poll(() => page.evaluate(() => (window as any).hintCommitProbe.held)).toBe(true)
  await page.reload()
  await page.getByRole("link", { name: "Get started for free", exact: true }).click()
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(hint).toHaveCount(0)
  await expect(page.locator(".help-bubble")).toHaveCount(0)
})
