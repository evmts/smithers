import { expect, test } from "./browserTest"
import { queryDatabase, trackDatabaseWorker } from "./databaseProbe"
import { owner } from "./spec/j1-fixtures"
import { installFixture } from "../../src/mainview/state/seams/InstallFixtures.test-support"
import type { AgentTurnFrame } from "@smthrs/rpc/NativeAgent"

test("working details stream in order, expand real invocations, and freeze after reload", async ({ page }, testInfo) => {
  await owner(page)
  await page.route("**/api/bootstrap", route => route.fulfill({ json: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install", "identity"], authFlow: "redirect", sandbox: null } }))
  await page.route("**/api/install", route => route.fulfill({ json: installFixture() }))
  let theme = "light", frames: AgentTurnFrame[] = [], state = "running", startedAt = 0, finishedAt: number | undefined
  const entry = () => ({ id: "trace-turn", author: 1, authorLogin: "ben", runId: "trace-run", prompt: "Check the retry tests", state, startedAt, ...(finishedAt === undefined ? {} : { finishedAt }), frames })
  const conversation = () => ({ id: "main", entries: [entry()] })
  await page.route("**/api/conversations/main", route => route.fulfill({ json: conversation() }))
  await page.route("**/api/conversations/main/view-state", route => route.fulfill({ json: { instructions: [{ id: theme, command: "theme", payload: { mode: theme } }] } }))
  let publish = () => {}
  await page.routeWebSocket("**/api/live", socket => socket.onMessage(raw => {
    if (typeof raw !== "string") return
    const message = JSON.parse(raw)
    if (message.t !== "sub") return
    if (message.topic !== "conversation-trace:main") { socket.send(JSON.stringify({ t: "err", id: message.id, code: "unsupported" })); return }
    let cursor = 0
    publish = () => socket.send(JSON.stringify({ t: "snap", id: message.id, cursor: ++cursor, data: conversation() }))
    publish()
  }))
  for (const color of ["light", "dark"]) for (const width of [1280, 390]) {
    theme = color; state = "running"; startedAt = Date.now() - 41_000; finishedAt = undefined
    frames = [{ runId: "trace-run", type: "delta", kind: "reasoning", text: "Looking at " }]
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("data-theme", color)
    const turn = page.locator('[data-shared-turn="trace-turn"]')
    const duration = turn.locator("[data-turn-elapsed]")
    await expect(duration).toContainText("Working for ")
    const first = await duration.textContent()
    await expect(duration).not.toHaveText(first!, { timeout: 2500 })
    await expect(turn.locator("[data-turn-reasoning]")).toHaveText("Looking at ")
    frames.push({ runId: "trace-run", type: "delta", kind: "reasoning", text: "the retry tests" },
      { runId: "trace-run", type: "delta", kind: "text", text: "Checking the source." },
      { runId: "trace-run", type: "call.started", link: 0, ordinal: 0, name: "file", arguments: "src/retry.ts", description: "Open and co-edit a file" },
      { runId: "trace-run", type: "call.settled", link: 0, ordinal: 0, name: "file", verdict: "run" })
    publish()
    await expect(turn.locator("[data-turn-reasoning]")).toHaveText("Looking at the retry tests")
    const activity = turn.locator('details[data-turn-activity="0"]')
    await expect(activity.locator("summary")).toHaveText("Read files")
    await expect(activity.locator("pre")).toBeHidden()
    await activity.locator("summary").press("Enter")
    await expect(activity.locator("pre")).toBeVisible()
    await expect(activity.locator("pre")).toContainText('"arguments": "src/retry.ts"')
    const mark = turn.locator('.author .avatar[data-smithers]')
    const brand = await mark.evaluate(node => {
      const probe = document.createElement("span"); probe.style.color = "var(--g-accent)"; node.append(probe)
      const result = getComputedStyle(probe).color; probe.remove(); return result
    })
    await expect(mark).toHaveCSS("background-color", brand)
    await expect(mark).toHaveAttribute("aria-label", "Smithers")
    await expect(turn).not.toContainText("Smithers for")
    const prose = turn.locator('.sui-md p').filter({ hasText: "Checking the source." }).first()
    expect(await turn.locator("[data-turn-reasoning]").evaluate(node => getComputedStyle(node).color)).not.toBe(await prose.evaluate(node => getComputedStyle(node).color))
    const script = "await ctx.call('read', { path: 'src/retry.test.ts' })"
    frames.push({ runId: "trace-run", type: "link.authored", link: 1, scriptDigest: "script", script },
      { runId: "trace-run", type: "call.started", link: 1, ordinal: 0, name: "read" },
      { runId: "trace-run", type: "call.settled", link: 1, ordinal: 0, name: "read", verdict: "run" },
      { runId: "trace-run", type: "link.authored", link: 2, scriptDigest: "message", script: "return done({message:'Tests checked.'})" },
      { runId: "trace-run", type: "call.started", link: 2, ordinal: 0, name: "message" },
      { runId: "trace-run", type: "delta", kind: "text", text: "Tests checked." },
      { runId: "trace-run", type: "done", reason: "stop" })
    state = "completed"; finishedAt = startedAt + 47_000; publish()
    await expect(duration).toHaveText("Worked for 47s")
    await expect(turn.locator("[data-turn-activity]")).toHaveCount(2)
    const code = turn.locator('details[data-turn-activity="1"]')
    await code.locator("summary").press("Enter")
    await expect(code.locator("pre")).toContainText(script)
    expect(await turn.evaluate(node => {
      const text = node.textContent ?? ""
      return text.indexOf("Checking the source.") < text.indexOf("Read files") && text.indexOf("Read files") < text.indexOf("Tests checked.")
    })).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`working-details-${color}-${width}.png`), fullPage: true })
    await page.reload()
    await expect(duration).toHaveText("Worked for 47s")
    await page.waitForTimeout(1100)
    await expect(duration).toHaveText("Worked for 47s")
    state = "cancelled"; publish()
    await expect(duration).toHaveText("Stopped after 47s")
    state = "failed"; publish()
    await expect(duration).toHaveText("Failed after 47s")
  }
})

test("install reads the shared conversation with author attribution after reload", async ({ page }) => {
  await owner(page)
  await page.route("**/api/bootstrap", route => route.fulfill({ json: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install", "identity"], authFlow: "redirect", sandbox: null } }))
  await page.route("**/api/install", route => route.fulfill({ json: installFixture() }))
  await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries: [
    { id: "turn-ben", author: 1, authorLogin: "ben", runId: "run-ben", prompt: "List changed tests", state: "completed", frames: [
      { runId: "run-ben", type: "delta", kind: "text", text: "One changed test" }, { runId: "run-ben", type: "done", reason: "stop" }
    ] }
  ] } }))
  let writes = 0
  page.on("request", request => { if (request.method() === "POST" && /\/api\/(agent|chat)\/turn$/.test(new URL(request.url()).pathname)) writes++ })
  await page.goto("/")
  const transcript = page.locator('[data-shared-conversation="main"]')
  await expect(transcript.locator('article[data-role="assistant"] .author .avatar[data-smithers]')).toHaveAttribute("aria-label", "Smithers")
  await expect(transcript.locator('[data-reply-to="turn-ben:prompt"]')).toContainText("List changed tests")
  await expect(transcript).not.toContainText("Smithers for")
  await expect(transcript).toContainText("List changed tests")
  await expect(transcript).toContainText("One changed test")
  await page.reload()
  await expect(transcript).toContainText("One changed test")
  expect(writes).toBe(0)
  await expect(page.locator('[data-flow="chat.queue.resume"]')).toHaveCount(0)
})

test("composer admits in the background and reconnects the same host turn after reload", async ({ page }) => {
  await trackDatabaseWorker(page)
  await owner(page)
  await page.route("**/api/bootstrap", route => route.fulfill({ json: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install", "identity"], authFlow: "redirect", sandbox: null } }))
  await page.route("**/api/install", route => route.fulfill({ json: installFixture() }))
  let admit!: () => void, accepted = false, completed = false
  const requests: unknown[] = []
  await page.route("**/api/conversations/main/prompt", async route => {
    requests.push(route.request().postDataJSON())
    await new Promise<void>(resolve => { admit = resolve })
    accepted = true
    await route.fulfill({ status: 202, json: { status: "accepted", turnId: "host-turn", terminal: false } })
  })
  await page.route("**/api/conversations/main/view-state", route => route.fulfill({ json: {} }))
  const shared = () => ({ id: "main", entries: accepted ? [
    { id: "host-turn", author: 1, authorLogin: "canary-owner", runId: "host-run", prompt: "Shared prompt", state: completed ? "completed" : "running", frames: completed ? [
      { runId: "host-run", type: "delta", kind: "text", text: "Host completed once" }, { runId: "host-run", type: "done", reason: "stop" }
    ] : [] }
  ] : [] })
  await page.route("**/api/conversations/main", route => route.fulfill({ json: shared() }))
  let publish = () => {}
  await page.routeWebSocket("**/api/live", socket => socket.onMessage(raw => {
    if (typeof raw !== "string") return
    const message = JSON.parse(raw)
    if (message.t !== "sub") return
    if (message.topic !== "conversation:main") { socket.send(JSON.stringify({ t: "err", id: message.id, code: "unsupported" })); return }
    let cursor = 0
    publish = () => socket.send(JSON.stringify({ t: "snap", id: message.id, cursor: ++cursor, data: shared() }))
    publish()
  }))
  let legacy = 0
  page.on("request", request => { if (request.method() === "POST" && /\/api\/(agent|chat)\/turn$/.test(new URL(request.url()).pathname)) legacy++ })
  await page.goto("/")
  await page.getByRole("button", { name: "Chat", exact: true }).press("Enter")
  const composer = page.getByTestId("composer-input")
  await composer.fill("Shared prompt")
  await composer.press("Enter")
  await expect.poll(() => requests.length).toBe(1)
  await expect(composer).not.toBeVisible()
  await page.getByRole("button", { name: "Chat", exact: true }).press("Enter")
  await composer.fill("Unrelated draft")
  await expect(composer).toHaveValue("Unrelated draft")
  expect(requests[0]).toEqual({ prompt: "Shared prompt", idempotencyKey: expect.any(String) })
  admit()
  await expect(page.locator('[data-shared-turn="host-turn"]')).toHaveAttribute("data-state", "running")
  // A host read can paint the turn before its admission receipt commits locally.
  // Reload after that receipt, so this assertion exercises accepted recovery.
  await expect.poll(async () => {
    const rows = await queryDatabase(page, "SELECT value FROM smithers_collection_rows WHERE collection_id = 'app-sessions'") as { value: string }[]
    return rows.some(row => JSON.parse(row.value).sharedPrompts?.some((prompt: { id: string; state: string; turnId?: string }) =>
      prompt.id === (requests[0] as { idempotencyKey: string }).idempotencyKey && prompt.state === "accepted" && prompt.turnId === "host-turn"))
  }).toBe(true)
  await page.reload()
  await expect(page.locator('[data-shared-turn="host-turn"]')).toHaveAttribute("data-state", "running")
  completed = true
  publish()
  await expect(page.locator('[data-shared-turn="host-turn"]')).toContainText("Host completed once")
  expect(requests).toHaveLength(1)
  expect(legacy).toBe(0)
})

test("member card view and scroll anchor restore after reload", async ({ page }) => {
  await owner(page)
  await page.route("**/api/bootstrap", route => route.fulfill({ json: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install", "identity"], authFlow: "redirect", sandbox: null } }))
  await page.route("**/api/install", route => route.fulfill({ json: installFixture() }))
  let view: Record<string, unknown> = { scroll_anchor: "turn-4:prompt", home: { filter: "working" }, toasts_hidden: false }
  const writes: Record<string, unknown>[] = []
  await page.route("**/api/conversations/main/view-state", async route => {
    if (route.request().method() === "PUT") { view = route.request().postDataJSON(); writes.push(view) }
    await route.fulfill({ json: { ...view, queue: [] } })
  })
  const card = { id: "shared-file", kind: "file", title: "README.md", status: "active", ordinal: 1, createdAt: 1, payload: { repo: "owner/repo", path: "README.md", content: "Shared file bytes", truncated: false } }
  await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries: Array.from({ length: 12 }, (_, index) => ({
    id: `turn-${index}`, author: 1, authorLogin: "ben", runId: `run-${index}`, prompt: `Question ${index}`, state: "completed", frames: [
      { runId: `run-${index}`, type: "delta", kind: "text", text: Array.from({ length: 8 }, (_, line) => `Answer ${index}, paragraph ${line}.`).join("\n\n") },
      ...(index === 4 ? [{ type: "card", runId: "run-4", card }] : []),
      { runId: `run-${index}`, type: "done", reason: "stop" }
    ]
  })) } }))
  await page.goto("/")
  const file = page.getByTestId("card-shared-file")
  await expect(file).toBeAttached()
  await file.locator('[data-flow="card.maximize"]').click()
  await expect(file).toHaveAttribute("data-maximized", "true")
  await page.reload()
  await expect(file).toHaveAttribute("data-maximized", "true")
  await file.locator('[data-flow="card.minimize"]').click()
  await expect(file).toHaveAttribute("data-maximized", "false")
  const viewport = page.getByRole("region", { name: "Conversation messages", exact: true })
  await viewport.evaluate(node => { node.scrollTop = 900; node.dispatchEvent(new Event("scroll", { bubbles: true })) })
  await expect.poll(() => typeof view.scroll_anchor === "string" && view.scroll_anchor !== "turn-4:prompt").toBe(true)
  const savedAnchor = String(view.scroll_anchor)
  await page.reload()
  await expect.poll(async () => page.locator(`[data-message-id="${savedAnchor}"]`).evaluate(node => {
    const container = node.closest('[data-slot="message-scroller-viewport"]')!
    return Math.abs(node.getBoundingClientRect().top - container.getBoundingClientRect().top)
  })).toBeLessThan(100)
  expect(writes.every(body => !("queue" in body) && JSON.stringify(body.home) === JSON.stringify({ filter: "working" }))).toBe(true)
})
