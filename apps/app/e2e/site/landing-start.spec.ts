import { expect,test } from "@playwright/test"
import { identityRoute, signedOutVisitor } from "../playwright/identity"
import { fillComposer } from "../playwright/composer"
import { landingCopy } from "../../../site/src/data/landingCopy"

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
  await expect(page.locator('[data-shared-turn="retained-turn"]')).toContainText("CONFIRMED RESPONSE")
  await expect(page.locator('[data-failure="ConversationUnavailable"]')).toContainText("View unavailable")
  available = true
  await page.reload()
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
  const input = page.getByTestId("composer-input"), chat = page.getByRole("button", { name: "Chat", exact: true })
  await fillComposer(page, "Queued prompt")
  await page.locator('[data-flow="chat.queue"]').click()
  // An accepted prompt dismisses Chat (#3819); its queue is in the reopened composer.
  await expect(input).toBeHidden()
  await chat.click()
  await page.getByRole("button", { name: "Edit queued prompt: Queued prompt", exact: true }).click()
  await expect(input).toHaveValue("Queued prompt")
  await fillComposer(page, "Edited prompt")
  await page.getByTestId("composer-send").click()
  await expect(input).toBeHidden()
  await chat.click()
  await page.getByRole("button", { name: "Remove queued prompt: Edited prompt", exact: true }).click()
  await expect(page.getByRole("region", { name: "Queued prompts" })).toHaveCount(0)
  // The strip left an open composer; a hidden one would hide it too.
  await expect(input).toBeVisible()
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
  await fillComposer(page, "Reply exactly READY.")
  await page.getByTestId("composer-send").click()
  await expect(page.locator('[data-shared-turn="hosted-turn"]')).toHaveAttribute("data-state", "completed")
  await expect(page.locator('[data-shared-turn="hosted-turn"]')).toContainText("READY")
  expect(submitted).toEqual([{ prompt: "Reply exactly READY.", idempotencyKey: expect.any(String) }])
  await expect(page.locator(".app-shell")).not.toContainText("On main: 0 working")
  await expect(page.locator(".app-shell")).not.toContainText("Model credential missing")
})

test("the default root with an empty cloud account never displays demo activity, including after reload", async ({ page }) => {
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

// 88068440 keeps the install landing signed out and resumes known identities.
test("the signed-in root mounts the real island in place and survives reload", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await hostedAccount(page)
  await page.goto("/")
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(page).toHaveURL("/")
  await expect(page.locator("#landing")).toHaveCount(0)
  await page.reload()
  await expect(page.locator(".app-shell")).toBeVisible()
  expect(errors).toEqual([])
})

test("the signed-out root keeps its install action while identity is unresolved", async ({ page }) => {
  await signedOutVisitor(page)
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route("**/api/user", async route => {
    await held
    await identityRoute(null)(route)
  })
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible()
    await expect(page.locator(".landing-command")).toContainText(landingCopy.commands.npx)
    await expect(page.getByTestId("composer-input")).toHaveCount(0)
    await expect(page).toHaveURL("/")
  } finally { release() }
})

for (const failure of ["chunk", "page"] as const) {
  test(`an explicit entry keeps the install action when its app ${failure} fails`, async ({ page }) => {
    await signedOutVisitor(page)
    let aborted = 0
    const route = failure === "chunk" ? /\/_astro\/AppIsland\.[^/]+\.js$/ : /\/smithersai\/smithers\/$/
    await page.route(route, request => { aborted++; return request.abort() })
    await page.goto("/?tutorial")
    await expect.poll(() => aborted).toBeGreaterThan(0)
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible()
    await expect(page.locator(".landing-command")).toContainText(landingCopy.commands.npx)
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible()
    await expect(page.locator(".app-shell")).toHaveCount(0)
    await page.reload()
    await expect.poll(() => aborted).toBeGreaterThan(1)
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible()
  })
}

test("an authentication return keeps the install action if its island fails", async ({ page }) => {
  await signedOutVisitor(page)
  let aborted = 0
  await page.route(/\/_astro\/AppIsland\.[^/]+\.js$/, request => { aborted++; return request.abort() })
  await page.goto("/?signed-in")
  await expect.poll(() => aborted).toBeGreaterThan(0)
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible()
  await expect(page.locator("#landing")).toBeVisible()
})

test.describe("touch landing", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } })
  test("the install action remains usable on a coarse pointer without loading the app", async ({ page }) => {
    await signedOutVisitor(page)
    let appReads = 0
    await page.route(/\/smithersai\/smithers\/$/, request => { appReads++; return request.abort() })
    await page.goto("/")
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true)
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible()
    await expect(page.locator("#landing kbd")).toHaveCount(0)
    expect(appReads).toBe(0)
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
  await expect(page.getByTestId("composer-input")).toBeAttached()
  await expect(hint).toHaveCount(0)
  await expect(page.locator(".help-bubble")).toHaveCount(0)
})

for (const entry of ["/?tutorial", "/?signed-in=github", "/?auth=failed", "/?auth=error"]) {
  test(`root app entry survives reload and browser history: ${entry}`, async ({ page }) => {
    await hostedAccount(page)
    await page.goto("/docs")
    await page.goto(entry)
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page).toHaveURL("/?tutorial")
    await page.reload()
    await expect(page.locator(".app-shell")).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/docs\/?$/)
    await page.goForward()
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page).toHaveURL("/?tutorial")
  })
}
