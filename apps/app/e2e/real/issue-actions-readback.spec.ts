import type { APIRequestContext, Page } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { authenticatedTest } from "./auth-permissions/profile"
import { scenario } from "./coverage/types"
import { attachJson } from "./issues/local"
import { withOwnedRepository, type OwnedRepository } from "./portable/owned-repository"
import { awaitBoot, closeComposer, command, expect, productUrl, realApi, reloadApp } from "./support/test"
import { finishFirstVisit } from "./support/first-visit"

authenticatedTest.setTimeout(240_000)

const boot = async (page: Page, repo: OwnedRepository) => {
  const started = performance.now()
  await page.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
  await awaitBoot(page, "navigate", started)
  await finishFirstVisit(page)
}
const slash = async (page: Page, line: string) => {
  await command(page, line)
  await closeComposer(page)
}
const seed = async (page: Page, request: APIRequestContext, repo: OwnedRepository, title: string, kind: "issue" | "chat" = "issue") => {
  const response = await realApi(page, request, "POST", `${repo.path}/issues`, { title, kind })
  expect(response.status(), await response.text()).toBe(201)
  const body = await response.json() as { number: number; title: string; kind: string }
  expect(body.title).toBe(title)
  expect(body.number).toEqual(expect.any(Number))
  expect(body.kind).toBe(kind)
  return body.number
}
const read = async (page: Page, request: APIRequestContext, repo: OwnedRepository, number: number) => {
  const response = await realApi(page, request, "GET", `${repo.path}/issues/${number}`)
  expect(response.status()).toBe(200)
  return response.json() as Promise<{ number: number; title: string; state: string; priority: number | null; due: string | null }>
}

authenticatedTest("search.issues filters real listed issues and opens the selected result from the keyboard", scenario("issues.search-filter-readback", {
  capabilities: ["identity"],
  description: "Seed two actual issues with different persisted states, read them through the issue list, search the loaded public projection, and open its exact result with the keyboard; independently verify API state and reload identity.",
  coverage: ["action:search.issues", "host:local", "path:success", "path:persistence", "path:keyboard", "door:slash", "door:button", "dimension:state-filter", "dimension:reload", "evidence:issues-api-readback"]
}), async ({ page, request }, testInfo) => {
  await withOwnedRepository(page, request, async (repo) => {
    const marker = `search-${randomUUID()}`
    const open = await seed(page, request, repo, `${marker} open`)
    const closed = await seed(page, request, repo, `${marker} closed`)
    const changed = await realApi(page, request, "PATCH", `${repo.path}/issues/${closed}`, { state: "closed" })
    expect(changed.status()).toBe(200)
    expect((await read(page, request, repo, open)).state).toBe("open")
    expect((await read(page, request, repo, closed)).state).toBe("closed")
    await boot(page, repo)
    await slash(page, `/issues.list all ${repo.fullName}`)
    await expect(page.locator(`[data-issue="${open}"]`).first()).toContainText(`${marker} open`)
    await expect(page.locator(`[data-issue="${closed}"]`).first()).toContainText(`${marker} closed`)
    await slash(page, `/search.issues ${marker} is:open`)
    const results = page.getByTestId("card-search-search.issues")
    const row = results.getByTestId(`search-item-issue-${open}`)
    await expect(row).toBeVisible()
    await expect(results.getByTestId(`search-item-issue-${closed}`)).toHaveCount(0)
    const button = row.locator("[data-role='open']")
    await button.focus()
    await expect(button).toBeFocused()
    await button.press("Enter")
    const thread = page.locator(`article.ghc-detail[data-issue="${open}"]`)
    await expect(thread).toContainText(`${marker} open`)
    await reloadApp(page)
    await expect(thread).toContainText(`${marker} open`)
    await slash(page, `/issues.list all ${repo.fullName}`)
    await expect(page.locator(`[data-issue="${open}"]`).first()).toContainText(`${marker} open`)
    await expect(page.locator(`[data-issue="${closed}"]`).first()).toContainText(`${marker} closed`)
    await slash(page, `/search.issues ${marker} is:closed`)
    await expect(results.getByTestId(`search-item-issue-${closed}`)).toBeVisible()
    await expect(results.getByTestId(`search-item-issue-${open}`)).toHaveCount(0)
    await attachJson(testInfo, "issue-search-readback", { repo: repo.fullName, open: await read(page, request, repo, open), closed: await read(page, request, repo, closed) })
  })
})

authenticatedTest("issues.set persists priority and due date without changing another issue", scenario("issues.task-fields-readback", {
  capabilities: ["identity"],
  description: "Set and clear task metadata through the registered command, compare independent backend readback and the task strip across reload, and reject out-of-range priority without a mutation.",
  coverage: ["action:issues.set", "host:local", "path:success", "path:error", "path:persistence", "door:slash", "dimension:priority-due-clear", "dimension:issue-isolation", "dimension:reload", "evidence:task-api-readback"]
}), async ({ page, request }, testInfo) => {
  await withOwnedRepository(page, request, async (repo) => {
    const target = await seed(page, request, repo, `task-${randomUUID()}`)
    const untouched = await seed(page, request, repo, `untouched-${randomUUID()}`)
    const before = await read(page, request, repo, untouched)
    await boot(page, repo)
    await slash(page, `/issues.view ${target} ${repo.fullName}`)
    const thread = page.locator(`article.ghc-detail[data-issue="${target}"]`)
    await expect(thread).toBeVisible()
    const writes: Array<unknown> = []
    page.on("request", (outgoing) => {
      if (outgoing.method() === "PATCH" && new URL(outgoing.url()).pathname === `${repo.path}/issues/${target}`) writes.push(outgoing.postDataJSON())
    })
    const set = async (field: string, value: string) => slash(page, `/issues.set ${JSON.stringify({ number: target, field, value, repo: repo.fullName })}`)
    await set("priority", "2")
    await expect.poll(async () => (await read(page, request, repo, target)).priority).toBe(2)
    await expect(thread.locator(".thread-priority")).toHaveText("P2")
    await set("due", "2026-12-31")
    await expect.poll(async () => (await read(page, request, repo, target)).due).toBe("2026-12-31")
    await reloadApp(page)
    await expect(thread.locator(".thread-priority")).toHaveText("P2")
    await expect(thread.locator(".thread-due")).toBeVisible()
    await command(page, `/issues.set ${JSON.stringify({ number: target, field: "priority", value: "4", repo: repo.fullName })}`)
    const refusal = page.locator('.toast[data-toast-status="failed"]').filter({ hasText: "Priority is 0 to 3" })
    await expect(refusal).toBeVisible()
    const details = refusal.locator("summary", { hasText: "Details" })
    await details.focus()
    await expect(details).toBeFocused()
    await details.press("Enter")
    await expect(refusal.locator("pre")).toBeVisible()
    await expect(refusal.locator("pre")).toHaveText("Priority is 0 to 3")
    await closeComposer(page)
    expect((await read(page, request, repo, target)).priority).toBe(2)
    expect(writes).toEqual([{ priority: 2 }, { due: "2026-12-31" }])
    await set("due", "")
    await expect.poll(async () => (await read(page, request, repo, target)).due).toBeNull()
    await expect(thread.locator(".thread-due")).toHaveCount(0)
    expect(writes).toEqual([{ priority: 2 }, { due: "2026-12-31" }, { due: null }])
    const after = await read(page, request, repo, untouched)
    expect({ priority: after.priority, due: after.due }).toEqual({ priority: before.priority, due: before.due })
    await attachJson(testInfo, "task-field-readback", { repo: repo.fullName, target: await read(page, request, repo, target), untouched: after, writes })
  })
})

authenticatedTest("issues.comment.react records one reaction and its keyboard removal survives reload", scenario("issues.reaction-readback", {
  capabilities: ["identity"],
  description: "React to an actual stored comment through the registered flow, replay the same desired state without duplication, and remove the owned reaction from its keyboard button; independently compare the backend reaction list before and after reload.",
  coverage: ["action:issues.comment.react", "host:local", "path:success", "path:persistence", "path:keyboard", "door:slash", "door:button", "dimension:reaction-idempotency", "dimension:reload", "evidence:reaction-api-readback"]
}), async ({ page, request }, testInfo) => {
  await withOwnedRepository(page, request, async (repo) => {
    const number = await seed(page, request, repo, `reaction-${randomUUID()}`, "chat")
    const response = await realApi(page, request, "POST", `${repo.path}/issues/${number}/comments`, { body: `comment-${randomUUID()}` })
    expect(response.status()).toBe(201)
    const comment = await response.json() as { id: number }
    expect(comment.id).toEqual(expect.any(Number))
    const path = `${repo.path}/issues/${number}/comments/${comment.id}/reactions`
    const reactions = async () => {
      const result = await realApi(page, request, "GET", path)
      expect(result.status()).toBe(200)
      return result.json() as Promise<Array<{ name: string; actor: string; active: boolean }>>
    }
    expect(await reactions()).toEqual([])
    await boot(page, repo)
    await slash(page, `/issues.view ${number} ${repo.fullName}`)
    const thread = page.getByTestId(`conversation-${number}`)
    await expect(thread.locator(`[data-message="${comment.id}"]`)).toBeVisible()
    const identity = await realApi(page, request, "GET", "/api/user")
    expect(identity.status()).toBe(200)
    const viewer = await identity.json() as { id: number; username: string }
    expect(viewer.id).toEqual(expect.any(Number))
    expect(viewer.username).toEqual(expect.any(String))
    const owned = { name: "thumbsup", actor: `user:${viewer.id}`, username: viewer.username, active: true }
    const line = `/issues.comment.react ${JSON.stringify({ number, commentId: comment.id, name: "thumbsup", active: true, repo: repo.fullName })}`
    const react = async () => {
      const saved = page.waitForResponse(result => result.request().method() === "PUT" && new URL(result.url()).pathname === path)
      await slash(page, line)
      expect((await saved).status()).toBe(200)
    }
    await react()
    await expect.poll(reactions).toEqual([owned])
    await react()
    expect(await reactions()).toEqual([owned])
    await reloadApp(page)
    await attachJson(testInfo, "reaction-before-keyboard-removal", { viewer: { id: viewer.id, username: viewer.username }, reactions: await reactions(), repo: repo.fullName, commentId: comment.id })
    const remove = thread.getByRole("button", { name: "Remove your thumbsup reaction", exact: true })
    await expect(remove).toBeVisible()
    await remove.focus()
    await expect(remove).toBeFocused()
    await remove.press("Enter")
    await expect.poll(reactions).toEqual([])
    await reloadApp(page)
    await expect(thread.locator(".thread-reaction")).toHaveCount(0)
    await attachJson(testInfo, "reaction-readback", { repo: repo.fullName, number, commentId: comment.id, reactions: await reactions() })
  })
})
