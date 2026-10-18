import { expect, test } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"
import { mkdir } from "node:fs/promises"
import type { Page } from "@playwright/test"

// The shared config and test host both consume this port. Never assume the VM's 47311 is free.
const origin = `http://127.0.0.1:${process.env.SMITHERS_E2E_PORT ?? "47311"}`
const request = "add slugify(text) with tests"
const sha = "a".repeat(40)
const stages = ["admitted", "allocating", "cloning", "model", "testing"]
const failures = ["failed", "cancelled", "timed-out", "refused"]
const codingResult = (state: string, finishedAt: string) => ({
  head_commit: sha,
  head_change_id: "turn-head",
  test_receipt:
    state === "no-tests"
      ? null
      : {
          command: state === "zero-tests" ? "node --test" : state === "count-unknown" ? "make test" : "bun test",
          exit_code: state === "tests-failed" ? 1 : 0,
          commit: sha,
          tests_run: state === "zero-tests" ? 0 : state === "count-unknown" ? null : 33,
          finished_at: finishedAt,
          output_tail: ""
        }
})
async function fixture(page: Page, target: string, reader = false, signedOut = false) {
  await signedOutVisitor(page)
  let targetState = target,
    observed = "admitted",
    poll = 0,
    starts = 0,
    accepted = false,
    prOpened = false,
    landingErrors = 0
  const base = Date.now() - 72_000
  const iso = (seconds: number) => new Date(base + seconds * 1000).toISOString()
  const entries: Array<Record<string, unknown>> = []
  const admissions = new Map<string, string>()
  let view: Record<string, unknown> = { queue: [], instructions: [] }
  const unknownConversationCalls: string[] = []
  if (!signedOut) {
    await page.route(
      (url) => url.pathname === "/api/user" || url.pathname === "/api/auth/session",
      identityRoute("maya")
    )
    await page.route("**/api/user/repos", (route) =>
      route.fulfill({
        json: [{ owner: "maya", name: "tinyhttp", full_name: "maya/tinyhttp", default_bookmark: "main" }]
      })
    )
    await page.route("**/api/user/orgs", (route) => route.fulfill({ json: [] }))
  }
  await page.route("**/api/public/repos", (route) =>
    route.fulfill({ json: { repos: [{ name: "maya/tinyhttp", summary: "A small HTTP framework." }] } })
  )
  await page.route("**/api/repos/maya/tinyhttp", (route) =>
    route.fulfill({
      json: { is_public: true, default_bookmark: "main", permission: reader ? "read" : "write", can_write: !reader }
    })
  )
  await page.route("**/api/repos/maya/tinyhttp/home", (route) =>
    route.fulfill({ json: { kind: "readme", markdown: "# tinyhttp\n\nA small HTTP framework." } })
  )
  await page.route(/\/api\/repos\/maya\/tinyhttp\/contents(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        { name: "src", path: "src", type: "dir" },
        { name: "README.md", path: "README.md", type: "file" }
      ]
    })
  )
  await page.route("**/api/repos/maya/tinyhttp/bookmarks**", (route) =>
    route.fulfill({
      json: { items: [{ name: "main", target_change_id: "main-change", target_commit_id: sha }], next_cursor: "" }
    })
  )
  // Account history is a separate read from the branch conversation. An absent index caused
  // round 1's "Conversations" error toast before the first prompt was even sent.
  await page.route(/\/api\/agent\/conversations(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { status: "ok", conversations: [], next: null } })
  )
  await page.route("**/api/conversation-archives", (route) => route.fulfill({ json: { archives: [] } }))
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method()
    if (path === "/api/conversations/main" && method === "GET") return route.fulfill({ json: { id: "main", entries } })
    if (path === "/api/conversations/main/view-state") {
      if (method === "PUT") view = { ...view, ...route.request().postDataJSON() }
      return route.fulfill({ json: view })
    }
    if (path === "/api/conversations/main/prompt" && method === "POST") {
      const { prompt, idempotencyKey } = route.request().postDataJSON()
      if (typeof prompt !== "string" || typeof idempotencyKey !== "string") throw new Error("Invalid shared prompt")
      let id = admissions.get(idempotencyKey)
      if (!id) {
        id = `ask-turn-${entries.length}`
        admissions.set(idempotencyKey, id)
        entries.push({
          id,
          author: 1,
          authorLogin: "maya",
          runId: id,
          prompt,
          state: "completed",
          frames: [{ runId: id, type: "done", reason: "stop" }]
        })
        view = { ...view, instructions: [{ id: `form-${id}`, command: "change.ask", payload: { request: prompt } }] }
      }
      return route.fulfill({ status: 202, json: { turnId: id, terminal: true } })
    }
    unknownConversationCalls.push(`${method} ${path}`)
    return route.fulfill({ status: 500, json: { message: `Unstubbed conversation request: ${method} ${path}` } })
  })
  await page.route("**/api/repos/maya/tinyhttp/agent/sessions", (route) => {
    starts++
    poll = 0
    accepted = false
    observed = "admitted"
    return route.fulfill({ status: 201, json: { id: "hosted-session", created_at: iso(0), updated_at: iso(0) } })
  })
  await page.route("**/api/repos/maya/tinyhttp/agent/sessions/hosted-session", (route) => {
    const finalStage = stages.indexOf(targetState)
    observed =
      poll < stages.length ? stages[Math.min(poll++, finalStage < 0 ? stages.length - 1 : finalStage)]! : targetState
    if (finalStage >= 0) observed = stages[Math.min(poll - 1, finalStage)]!
    const terminal = !stages.includes(observed),
      failed = failures.includes(observed)
    return route.fulfill({
      json: {
        id: "hosted-session",
        message_count: observed === "model" || observed === "testing" || (terminal && !failed) ? 2 : 1,
        status: failed
          ? observed === "refused"
            ? "failed"
            : observed === "timed-out"
              ? "timed_out"
              : observed
          : terminal
            ? "completed"
            : "active",
        reason_code: failed ? "capacity" : null,
        reason: failed
          ? observed === "refused"
            ? "Not started: no machine is free."
            : "The machine stopped before finishing the change."
          : null,
        retryable: failed && observed !== "refused",
        created_at: iso(0),
        updated_at: iso(terminal ? 72 : Math.min(poll * 2, 70)),
        workspace:
          observed === "allocating"
            ? null
            : {
                id: "box",
                name: "agent",
                status: observed === "admitted" ? "pending" : observed === "cloning" ? "provisioning" : "ready",
                created_at: iso(1),
                updated_at: iso(observed === "cloning" ? 9 : 12)
              },
        run:
          observed === "admitted"
            ? null
            : {
                id: 42,
                status: failed
                  ? observed === "cancelled"
                    ? "cancelled"
                    : "failure"
                  : observed === "allocating" || observed === "cloning"
                    ? "queued"
                    : terminal
                      ? "success"
                      : "running",
                model: observed === "model" || observed === "testing" || terminal ? "cerebras:qwen-3.8-27b" : null,
                started_at: iso(0),
                finished_at: terminal ? iso(72) : null
              }
      }
    })
  })
  await page.route("**/api/repos/maya/tinyhttp/agent/sessions/hosted-session/messages*", (route) => {
    if (route.request().method() === "POST") {
      accepted = true
      return route.fulfill({
        status: 201,
        json: {
          id: 1,
          session_id: "hosted-session",
          sequence: 1,
          role: "user",
          created_at: iso(0),
          parts: [{ part_index: 0, type: "text", content: { value: request } }]
        }
      })
    }
    const result = observed === "testing" || (!stages.includes(observed) && !failures.includes(observed))
    return route.fulfill({
      json: [
        {
          id: 1,
          session_id: "hosted-session",
          sequence: 1,
          role: "user",
          created_at: iso(0),
          parts: [{ part_index: 0, type: "text", content: { value: request } }]
        },
        ...(observed === "model"
          ? [
              {
                id: 2,
                session_id: "hosted-session",
                sequence: 2,
                role: "assistant",
                created_at: iso(12),
                parts: [{ part_index: 0, type: "text", content: { value: "Writing src/slug.ts and its test" } }]
              }
            ]
          : result
            ? [
                {
                  id: 3,
                  session_id: "hosted-session",
                  sequence: 2,
                  role: "assistant",
                  created_at: iso(72),
                  parts: [{ part_index: 0, type: "coding_result", content: codingResult(targetState, iso(72)) }]
                }
              ]
            : [])
      ]
    })
  })
  await page.route("**/api/repos/maya/tinyhttp/changes/turn-head/files", (route) =>
    route.fulfill({ json: [{ path: "src/slug.ts" }, { path: "test/slug.test.ts" }] })
  )
  await page.route(/\/api\/repos\/maya\/tinyhttp\/(changes\/turn-head|landings\/12)\/diff$/, (route) =>
    route.fulfill({
      json: {
        file_diffs: [
          {
            path: "src/slug.ts",
            additions: 18,
            deletions: 0,
            patch: "diff --git a/src/slug.ts b/src/slug.ts\n+export function slugify(text) {}"
          },
          { path: "test/slug.test.ts", additions: 23, deletions: 0, patch: "+test('slugify')" }
        ]
      }
    })
  )
  await page.route("**/api/repos/maya/tinyhttp/agent/sessions/hosted-session/landing", (route) => {
    if (targetState === "pr-error" && landingErrors++ === 0)
      return route.fulfill({
        status: 502,
        json: { code: "github_unavailable", message: "GitHub couldn't open the pull request. Try again." }
      })
    prOpened = true
    return route.fulfill({
      status: 201,
      json: {
        landing_number: 12,
        branch: "smithers/landing-12",
        pull_number: 37,
        pull_url: "https://github.com/maya/tinyhttp/pull/37",
        head_commit: sha,
        tested: targetState !== "no-tests",
        passed: !["tests-failed", "zero-tests", "no-tests"].includes(targetState)
      }
    })
  })
  await page.route("**/api/user/github-repos/maya/tinyhttp/pulls/37", (route) =>
    route.fulfill({
      json: {
        state: targetState === "merged" ? "closed" : "open",
        merged: targetState === "merged",
        merged_by: targetState === "merged" ? { login: "maya" } : null,
        merge_commit_sha: targetState === "merged" ? "9c1e2ab" + "0".repeat(33) : null,
        base: { ref: "main" }
      }
    })
  )
  await page.goto(`${origin}/maya/tinyhttp`)
  await page.getByRole("button", { name: "Ask", exact: true }).click()
  return {
    starts: () => starts,
    accepted: () => accepted,
    prOpened: () => prOpened,
    unknownConversationCalls,
    set: (next: string) => {
      targetState = next
      poll = 0
    }
  }
}
async function send(page: Page, text: string) {
  const composer = page.locator("#repo-ask textarea").last()
  await composer.fill(text)
  await composer.press("Enter")
}
async function tabTo(page: Page, name: string) {
  const control = page.getByRole("button", { name, exact: true })
  for (let step = 0; step < 100; step++) {
    if (await control.evaluate((node) => node === node.ownerDocument.activeElement)) return
    await page.keyboard.press("Tab")
  }
  await expect(control).toBeFocused()
}
async function start(page: Page) {
  await send(page, request)
  await expect(page.getByRole("button", { name: "Start agent", exact: true })).toBeVisible({ timeout: 20_000 })
  await tabTo(page, "Start agent")
  await page.keyboard.press("Enter")
}
async function shot(page: Page, state: string, width: number, scheme: string) {
  // Close the real notices through their native controls, including a live run notice.
  // Record unexpected errors before closing notices; assert after capture so a late failure keeps the still.
  const noticeFailures = await page.locator('.notice[data-tone="failed"] b').allTextContents()
  const expectedFailure = [...failures, "reader", "slash-reader", "signed-out"].includes(state)
  // A live run notice re-renders on every poll, so its button is never "stable"
  // for click(); dispatch the native click instead. The count check below still
  // fails if a hidden notice comes back.
  for (let attempt = 0; attempt < 12; attempt++) {
    const buttons = page.locator(".notice .notice-hide")
    if (!(await buttons.count())) break
    await buttons.first().dispatchEvent("click")
  }
  await expect(page.locator(".notice")).toHaveCount(0)
  const dir = process.env.REPOSITORY_SHOTS
  if (dir) {
    await mkdir(dir, { recursive: true })
    await page.screenshot({
      path: `${dir}/${state === "commands" ? "code-home-ask-commands" : `code-home-ask-change-${state}`}-${width}-${scheme}.png`,
      fullPage: true
    })
  }
  expect(noticeFailures.filter((title) => title === "Conversations" || !expectedFailure)).toEqual([])
}
const scenarios = [
  "confirm",
  "admitted",
  "allocating",
  "cloning",
  "model",
  "testing",
  "ready",
  "tests-failed",
  "no-tests",
  "zero-tests",
  "count-unknown",
  "failed",
  "cancelled",
  "timed-out",
  "refused",
  "pr",
  "merged",
  "diff",
  "pr-error",
  "reader",
  "signed-out",
  "slash",
  "slash-form",
  "slash-reader",
  "commands"
] as const
for (const [width, scheme] of [
  [1440, "light"],
  [390, "dark"]
] as const) {
  for (const state of scenarios)
    test(`hosted change ${state} ${width} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.emulateMedia({ colorScheme: scheme })
      const reader = state === "reader" || state === "slash-reader",
        signedOut = state === "signed-out"
      const target =
        state === "slash" ? "admitted" : state === "diff" || state === "pr" || state === "merged" ? "ready" : state
      const f = await fixture(page, target, reader, signedOut)
      if (state === "commands") {
        await page.locator("#repo-ask textarea").last().fill("/")
        await expect(page.getByText("Start an agent on a change", { exact: true })).toBeVisible({ timeout: 20_000 })
        await shot(page, state, width, scheme)
        return
      }
      if (signedOut) {
        await expect(page.getByText("Sign in to start an agent.")).toBeVisible()
        await shot(page, state, width, scheme)
        await expect(page.locator("#repo-ask textarea")).toHaveCount(0)
        expect(f.starts()).toBe(0)
        return
      }
      if (reader) {
        await send(page, state === "reader" ? request : `/change ${request}`)
        await expect(
          page
            .getByText(
              signedOut ? "Sign in to start an agent." : "Only people who can push to maya/tinyhttp can start an agent."
            )
            .first()
        ).toBeVisible({ timeout: 20_000 })
        await shot(page, state, width, scheme)
        expect(f.starts()).toBe(0)
        return
      }
      if (state === "slash-form" || state === "slash") {
        await send(page, state === "slash-form" ? "/change" : `/change ${request}`)
        await expect(
          state === "slash-form"
            ? page.getByRole("button", { name: "Start agent", exact: true })
            : page.getByText("Keeps running if you close this tab.")
        ).toBeVisible({ timeout: 20_000 })
        await shot(page, state, width, scheme)
        if (state === "slash")
          await expect(page.getByRole("button", { name: "Start agent", exact: true })).toHaveCount(0)
        return
      }
      if (state === "confirm") {
        await send(page, request)
        await expect(page.getByRole("button", { name: "Start agent", exact: true })).toBeVisible({ timeout: 20_000 })
        await shot(page, state, width, scheme)
        expect(f.starts()).toBe(0)
        // Full card fits above the composer, and both stay in the transcript rather than a clipped box.
        const card = page.locator(".hosted-change-confirm"),
          composer = page.locator(".composer-overlay")
        const cardBox = await card.boundingBox(),
          composerBox = await composer.boundingBox()
        expect(cardBox).not.toBeNull()
        expect(composerBox).not.toBeNull()
        expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(composerBox!.y)
        await expect(page.getByText(request, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
        return
      }
      await start(page)
      if (stages.includes(state)) {
        const label = {
          admitted: "Admitted",
          allocating: "Allocating a machine",
          cloning: "Cloning",
          model: "Model working",
          testing: "Testing"
        }[state as "model"]
        await expect(page.locator('.hosted-change-stage[data-tone="live"]').filter({ hasText: label })).toBeVisible({
          timeout: 20_000
        })
        await shot(page, state, width, scheme)
        expect(f.accepted()).toBe(true)
        return
      }
      if (failures.includes(state)) {
        await expect(
          page.locator(".hosted-change-card [role=alert]").filter({
            hasText:
              state === "refused"
                ? "Not started: no machine is free."
                : "The machine stopped before finishing the change."
          })
        ).toBeVisible({ timeout: 20_000 })
        await shot(page, state, width, scheme)
        if (state === "failed") {
          f.set("model")
          await page.getByRole("button", { name: "Try again", exact: true }).click()
          await expect(page.getByText("Keeps running if you close this tab.")).toBeVisible({ timeout: 20_000 })
          await expect.poll(f.starts).toBe(2)
        }
        return
      }
      const open = page.getByRole("button", { name: "Open pull request", exact: true })
      await expect(open).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText("src/slug.ts", { exact: true })).toBeVisible({ timeout: 20_000 })
      if (["pr", "merged", "pr-error", "diff"].includes(state)) {
        if (state === "merged") f.set("merged")
        await tabTo(page, "Open pull request")
        await page.keyboard.press("Enter")
        if (state === "pr-error") {
          await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible({ timeout: 20_000 })
          await shot(page, state, width, scheme)
          await page.getByRole("button", { name: "Retry", exact: true }).click()
          await expect(page.getByRole("link", { name: "Merge on GitHub ↗" })).toBeVisible({ timeout: 20_000 })
          return
        }
        if (state === "merged")
          await expect(page.getByText(/Merged on GitHub by maya/)).toBeVisible({ timeout: 20_000 })
        else await expect(page.getByRole("link", { name: "Merge on GitHub ↗" })).toBeVisible({ timeout: 20_000 })
        if (state === "diff") {
          await page.getByRole("button", { name: "View diff", exact: true }).click()
          await expect(page.locator(".hosted-change-main-diff")).toBeVisible({ timeout: 20_000 })
        }
        await shot(page, state, width, scheme)
        expect(f.prOpened()).toBe(true)
        return
      }
      await shot(page, state, width, scheme)
      const text =
        state === "tests-failed"
          ? "bun test exited 1 · 33 tests"
          : state === "no-tests"
            ? "Skipped · No test command found"
            : state === "zero-tests"
              ? "node --test ran 0 tests"
              : state === "count-unknown"
                ? "make test exited 0"
                : "bun test exited 0 · 33 tests passed"
      await expect(page.getByText(`Testing: ${text}`)).toBeVisible({ timeout: 20_000 })
      expect(f.unknownConversationCalls).toEqual([])
    })
  test(`hosted change reload ${width} ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: scheme })
    const f = await fixture(page, "model")
    await start(page)
    await expect(
      page.locator('.hosted-change-stage[data-tone="live"]').filter({ hasText: "Model working" })
    ).toBeVisible({ timeout: 20_000 })
    await page.reload()
    await expect(page.getByText("Keeps running if you close this tab.")).toBeVisible({ timeout: 20_000 })
    expect(f.starts()).toBe(1)
  })
}

// A person dismisses a live run's notice while the run is still polling: with
// the pointer, and with the keyboard (guardian-review f-vf376j). It stays
// hidden across two poll cycles.
for (const [width, scheme] of [
  [1440, "light"],
  [390, "dark"]
] as const) {
  for (const door of ["pointer", "keyboard"] as const)
    test(`hosted change live notice hides by ${door} ${width} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await fixture(page, "model")
      await start(page)
      await expect(page.locator('.hosted-change-stage[data-tone="live"]').filter({ hasText: "Model working" })).toBeVisible({
        timeout: 20_000
      })
      const notice = page.locator(".notice").filter({ hasText: "Starting agent…" })
      await expect(notice).toBeVisible()
      if (door === "pointer") await notice.locator(".notice-hide").click()
      else {
        await tabTo(page, "Hide Starting agent…")
        await page.keyboard.press("Enter")
      }
      await expect(notice).toHaveCount(0)
      await page.waitForTimeout(4_500)
      await expect(notice).toHaveCount(0)
      await expect(page.locator('.hosted-change-stage[data-tone="live"]').filter({ hasText: "Model working" })).toBeVisible()
    })
}
