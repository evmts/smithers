import { expect, test } from "./browserTest"
import { identityRoute, signedOutVisitor } from "./identity"
import { mkdir } from "node:fs/promises"
import { APPLICATION_SIGN_IN_PATH } from "@smthrs/rpc/ApplicationAuth"
import type { Locator, Page } from "@playwright/test"

// The shared config and test host both consume this port. Never assume the VM's 47311 is free.
const origin = `http://127.0.0.1:${process.env.SMITHERS_E2E_PORT ?? "47311"}`
const request = "add slugify(text) with tests"
const sha = "a".repeat(40)
const stages = ["admitted", "allocating", "cloning", "model", "testing"]
const failures = ["failed", "cancelled", "timed-out", "refused"]
const codingResult = (state: string, finishedAt: string) => ({
  head_commit: state === "no-change" ? "b".repeat(40) : sha,
  head_change_id: "turn-head",
  test_not_run: ["no-tests", "no-change", "test-env-unavailable"].includes(state)
    ? state === "test-env-unavailable"
      ? { reason_code: "test_env_unavailable", reason: "dependencies not installed in the sandbox" }
      : { reason_code: "runtime_offline_unavailable", reason: "Runtime offline execution is unavailable" }
    : null,
  test_receipt:
    ["no-tests", "no-change", "test-env-unavailable"].includes(state)
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
    const busy = (targetState === "box-busy" && starts <= 2) || targetState === "box-busy-exhausted"
    if (targetState === "queued") observed = "allocating"
    if (targetState === "box-busy" || targetState === "box-busy-exhausted") observed = busy ? "box-busy" : "ready"
    if (finalStage >= 0) observed = stages[Math.min(poll - 1, finalStage)]!
    const terminal = !stages.includes(observed),
      failed = failures.includes(observed) || busy
    return route.fulfill({
      json: {
        id: "hosted-session",
        message_count: observed === "model" || observed === "testing" || (terminal && !failed) ? 2 : 1,
        stage: targetState === "queued" ? "queued" : null,
        queued_at: targetState === "queued" ? iso(0) : null,
        status: busy ? "failed" : failed
          ? observed === "refused"
            ? "failed"
            : observed === "timed-out"
              ? "timed_out"
              : observed
          : terminal
            ? "completed"
            : "active",
        reason_code: busy ? "box_busy" : failed ? "capacity" : null,
        reason: busy ? "The workspace service is busy starting other boxes; try again in a moment." : failed
          ? observed === "refused"
            ? "Not started: no machine is free."
            : "The machine stopped before finishing the change."
          : null,
        retryable: failed && observed !== "refused",
        created_at: iso(0),
        base_commit: "b".repeat(40),
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
                  parts: [...(targetState === "no-change" ? [{ part_index: 1, type: "text", content: { value: "The tools failed; no change made." } }] : []), { part_index: 0, type: "coding_result", content: codingResult(targetState, iso(72)) }]
                }
              ]
            : [])
      ]
    })
  })
  await page.route("**/api/repos/maya/tinyhttp/changes/turn-head/files", (route) =>
    route.fulfill({ json: targetState === "no-change" ? [] : [{ path: "src/slug.ts" }, { path: "test/slug.test.ts" }] })
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
        tested: !["no-tests", "test-env-unavailable"].includes(targetState),
        passed: !["tests-failed", "zero-tests", "no-tests", "test-env-unavailable"].includes(targetState)
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
  if (!signedOut) await page.getByRole("button", { name: "Ask", exact: true }).click()
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
// The card's action sits fully inside the transcript and above the composer
// (design-lead f-2ixutz): the hosted change card reads from its bottom.
async function aboveComposer(page: Page, control: Locator) {
  await expect(async () => {
    const box = await control.boundingBox(),
      composer = await page.locator("#repo-ask .composer-overlay").boundingBox(),
      viewport = await page.locator("#repo-ask .sui-msg-scroller-viewport").boundingBox()
    expect(box && composer && viewport).toBeTruthy()
    expect(box!.y).toBeGreaterThanOrEqual(viewport!.y)
    expect(box!.y + box!.height).toBeLessThanOrEqual(composer!.y)
  }).toPass({ timeout: 10_000 })
}
async function shot(page: Page, state: string, width: number, scheme: string) {
  // Close the real notices through their native controls, including a live run notice.
  // Record unexpected errors before closing notices; assert after capture so a late failure keeps the still.
  const noticeFailures = await page.locator('.notice[data-tone="failed"] b').allTextContents()
  const expectedFailure = [...failures, "reader", "slash-reader", "signed-out"].includes(state)
  // Pointer clicks, as a person makes them. A notice can close itself between
  // the count and the click ("Agent finished" times out), so a click that finds
  // its notice gone moves on; the count check below fails if any notice stays.
  for (let attempt = 0; attempt < 12; attempt++) {
    const button = page.locator(".notice .notice-hide").first()
    if (!(await button.count())) break
    await button.click({ timeout: 2_000 }).catch(() => undefined)
  }
  await expect(page.locator(".notice")).toHaveCount(0)
  const dir = process.env.REPOSITORY_SHOTS
  if (dir) {
    await mkdir(dir, { recursive: true })
    const still = state === "commands" ? "code-home-ask-commands" : ["code-home-ask-change", state].join("-")
    await page.screenshot({
      path: `${dir}/${still}-${width}-${scheme}.png`,
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
  "test-env-unavailable",
  "no-change",
  "box-busy",
  "box-busy-exhausted",
  "queued",
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
      if (state === "box-busy" || state === "box-busy-exhausted" || state === "queued") await page.clock.install()
      const f = await fixture(page, target, reader, signedOut)
      if (state === "commands") {
        await page.locator("#repo-ask textarea").last().fill("/")
        await expect(page.getByText("Start an agent on a change", { exact: true })).toBeVisible({ timeout: 20_000 })
        await shot(page, state, width, scheme)
        return
      }
      if (signedOut) {
        // Signed-out Ask goes to sign-in, as the landed frame does (repository-frame.spec.ts);
        // no panel, no chat, and nothing starts.
        await page.route("**/api/auth/github**", route => route.fulfill({ body: "Sign-in handoff" }))
        const signIn = page.waitForRequest(request => new URL(request.url()).pathname === APPLICATION_SIGN_IN_PATH)
        await page.getByRole("button", { name: "Ask", exact: true }).click()
        await signIn
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
        if (state === "slash-reader") {
          await expect(page.getByText(`/change ${request}`, { exact: true }).first()).toBeVisible()
          await expect(page.locator('.smithers-card[data-kind="hosted-change"]')).toHaveCount(0)
          await expect(page.getByRole("button", { name: "Start agent", exact: true })).toHaveCount(0)
        }
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
      if (state === "queued") {
        // The first read is queued; the observation clock keeps advancing without another response.
        await expect(page.getByText("Queued: starting soon", { exact: true })).toBeVisible({ timeout: 20_000 })
        await page.clock.runFor(1000)
        await expect(page.locator('.hosted-change-stage[data-tone="live"]')).toContainText("Queued: starting soon")
        await expect(page.locator('.hosted-change-stage[data-tone="live"] .hosted-change-duration')).toContainText(/\d+ (?:min \d+ )?s/)
        return
      }
      if (state === "box-busy" || state === "box-busy-exhausted") {
        const waits = state === "box-busy" ? [2000, 4000] : [2000, 4000, 8000, 16000]
        for (const [index, delay] of waits.entries()) {
          await expect(page.getByText("Starting a machine, please wait…", { exact: true })).toBeVisible({ timeout: 20_000 })
          await expect(page.locator('.hosted-change-stage[data-tone="live"]')).toContainText("Allocating a machine")
          await expect(page.locator('.hosted-change-card [role="alert"]')).toHaveCount(0)
          await expect(page.locator(`.hosted-change-card[data-busy-retries="${index}"]`)).toBeVisible()
          await page.clock.runFor(delay)
          await expect.poll(f.starts).toBe(index + 2)
        }
        if (state === "box-busy") {
          await expect(page.getByRole("button", { name: "Open pull request", exact: true })).toBeVisible({ timeout: 20_000 })
        } else {
          await expect(page.locator(".hosted-change-card [role=alert]")).toHaveText("The workspace service is busy starting other boxes; try again in a moment.")
          const retry = page.locator(".hosted-change-card").getByRole("button", { name: "Try again", exact: true })
          await expect(retry).toHaveClass(/repo-ui-btn-quiet/)
          await expect(retry).not.toHaveClass(/repo-ui-btn-primary/)
          await retry.click()
          await expect.poll(f.starts).toBe(6)
          await expect(page.getByText("Starting a machine, please wait…", { exact: true }).last()).toBeVisible()
        }
        return
      }
      if (stages.includes(state)) {
        const label = {
          admitted: "Allocating a machine",
          allocating: "Allocating a machine",
          cloning: "Cloning",
          model: "Model working",
          testing: "Testing"
        }[state as "model"]
        await expect(page.locator('.hosted-change-stage[data-tone="live"]').filter({ hasText: label })).toBeVisible({
          timeout: 20_000
        })
        if (state === "admitted") {
          await expect(page.locator('.hosted-change-stage[data-tone="done"]').filter({ hasText: "Admitted" })).toBeVisible()
          await expect(page.locator(".hosted-change-chip")).toHaveText("Running")
        }
        // A live run's notice appears after the toast debounce; wait for it so shot() closes it.
        await expect(page.locator(".notice").filter({ hasText: "Starting agent…" })).toBeVisible()
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
      if (state === "no-change") {
        // Five intermediate stages each consume the seam's 2-second polling interval.
        await expect(page.getByText("No change made", { exact: true })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText("The tools failed; no change made.", { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: "Open pull request", exact: true })).toHaveCount(0)
        await expect(page.getByRole("region", { name: "Change diff" })).toHaveCount(0)
        await shot(page, state, width, scheme)
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
        if (state === "pr") {
          await expect(page.getByText("main is unchanged. Your review is next.")).toBeVisible()
          await aboveComposer(page, page.getByRole("link", { name: "Merge on GitHub ↗" }))
        }
        await shot(page, state, width, scheme)
        expect(f.prOpened()).toBe(true)
        return
      }
      if (state === "ready" || state === "tests-failed") await aboveComposer(page, open)
      await shot(page, state, width, scheme)
      const text =
        state === "tests-failed"
          ? `bun test exited 1 in the agent's sandbox at ${sha.slice(0, 12)} · 33 tests`
          : state === "test-env-unavailable"
            ? "Tests not run: dependencies not installed in the sandbox"
          : state === "no-tests"
            ? "Tests not run: Runtime offline execution is unavailable"
            : state === "zero-tests"
              ? "node --test ran 0 tests in the agent's sandbox"
              : state === "count-unknown"
                ? `make test exited 0 in the agent's sandbox at ${sha.slice(0, 12)}`
                : `bun test exited 0 in the agent's sandbox at ${sha.slice(0, 12)} · 33 tests`
      await expect(page.getByText(text, { exact: true }).last()).toBeVisible({ timeout: 20_000 })
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
    const ask = page.getByRole("button", { name: "Ask", exact: true })
    if (await ask.getAttribute("aria-expanded") === "false") await ask.click()
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
