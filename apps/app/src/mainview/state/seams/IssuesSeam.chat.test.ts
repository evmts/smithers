import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"
import type { AgentPort } from "../../runtime/AgentPort"
import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"

/*
 * Threads and tasks through the issues seam (smithers-ui-DESIGN.md §3.1,
 * §3.2): the list narrows to chats and tasks, task metadata reads off the
 * issue DTO, and a chat is created with `--kind chat`. The chat reads and
 * sends themselves belong to the chat = issues seam (#2111).
 */

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) }
}
const unavailableAgent: AgentPort = { available: false, startTurn: async () => ({ status: "error", message: "unavailable" }), cancelTurn: async () => {}, subscribe: () => () => {} }
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
type RouteAnswer = Response | ((request: Request) => Response | Promise<Response>)
const backend = (routes: Record<string, RouteAnswer>, calls: Array<{ line: string; body?: unknown }> = []): AppServices => ({
  fetchImpl: async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const absolute = new URL(url, "https://app.test")
    const method = (init?.method ?? "GET").toUpperCase()
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined
    calls.push({ line: `${method} ${absolute.pathname}${absolute.search}`, ...(body === undefined ? {} : { body }) })
    for (const [route, answer] of Object.entries(routes)) {
      const space = route.indexOf(" ")
      if (route.slice(0, space) !== method || absolute.pathname !== route.slice(space + 1)) continue
      return typeof answer === "function" ? answer(new Request(absolute.toString(), init)) : answer.clone()
    }
    return json(404, { status: "error", message: `no stub for ${method} ${absolute.pathname}` })
  }
})
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
const signedIn = async (store: AppStore): Promise<void> => {
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", allowlisted: true, admin: false, scopesPlain: null })
  store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }] })
  await settled()
}
const REPO = "will/flows"
const chatIssue = { number: 7, title: "Will ↔ Personal Assistant", state: "open", kind: "chat", visibility: "private", body: "", author: { login: "will" }, labels: [], created_at: "2026-09-26T09:00:00Z", updated_at: "2026-09-26T09:05:00Z" }

describe("threads and tasks through the issues seam (the chat acts land with the chat = issues seam, #2111)", () => {
  test("the chat acts refuse in words until the chat seam lands", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, backend({}))
    await signedIn(store)
    const retry = await controller.commands.run("issues.comment.retry", JSON.stringify({ cardId: "issue-x", requestId: "r1" }))
    expect(retry.status).toBe("failed")
    if (retry.status === "failed") expect(retry.error).toContain("chat backend")
    await controller.dispose()
  })

  test("issues.list narrows to chats by kind and to tasks by their metadata; a chat is created with --kind chat", async () => {
    const calls: Array<{ line: string; body?: unknown }> = []
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, backend({
      "GET /api/repos/will/flows/issues": json(200, [
        chatIssue,
        { number: 8, title: "Land the fence", state: "fixed", owner: { login: "software-engineer" }, priority: 1, fixed_by: { login: "software-engineer" }, author: { login: "will" }, labels: [], updated_at: "2026-09-26T08:00:00Z" },
        { number: 9, title: "Plain issue", state: "open", author: { login: "will" }, labels: [], updated_at: "2026-09-25T08:00:00Z" }
      ]),
      "POST /api/repos/will/flows/issues": json(201, { ...chatIssue, number: 10 }),
      "GET /api/repos/will/flows/issues/10": json(200, { ...chatIssue, number: 10 }),
      "GET /api/repos/will/flows/issues/10/comments": json(200, [])
    }, calls))
    await signedIn(store)
    const tasks = await controller.commands.run("issues.list", `all --kind task ${REPO}`)
    expect(tasks.status).toBe("executed")
    const found = [...store.collections.cards.values()].find((card) => card.kind === "issue-list")
    if (found?.kind !== "issue-list") throw new Error("the issue list card is absent")
    const list = found
    expect(list.payload.kind).toBe("task")
    expect(list.payload.issues.map((issue) => issue.number)).toEqual([8])
    expect(list.payload.issues[0]!.task).toMatchObject({ owner: { id: "software-engineer" }, priority: 1, fixedBy: { id: "software-engineer" } })
    await controller.commands.run("issues.list", `all --kind chat ${REPO}`)
    expect(calls.some((call) => call.line === "GET /api/repos/will/flows/issues?kind=chat")).toBe(true)
    const created = await controller.commands.run("issues.create", `Ask the PA ${REPO} --kind chat`)
    expect(created.status).toBe("executed")
    const post = calls.find((call) => call.line === "POST /api/repos/will/flows/issues")!
    expect(post.body).toMatchObject({ title: "Ask the PA", kind: "chat" })
    expect((post.body as { idempotency_key: string }).idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
    await controller.dispose()
  })
})
