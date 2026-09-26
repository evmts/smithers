import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"
import type { AgentPort } from "../../runtime/AgentPort"
import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import type { Card } from "../AppState"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"

/*
 * Chat threads through the issues seam (smithers-ui-DESIGN.md §3.1; the chat
 * = issues contract): a chat issue reads as a conversation with its Slack
 * mapping and reactions; a send is a pending row the drain posts with the
 * request id as its idempotency key; a refused post keeps the text as a
 * failed row a person retries; the list narrows to chats and tasks.
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
const waitFor = async (predicate: () => boolean, ms = 2_000) => {
  const until = Date.now() + ms
  while (!predicate()) { if (Date.now() > until) throw new Error("timed out"); await new Promise((resolve) => setTimeout(resolve, 5)) }
}
const signedIn = async (store: AppStore): Promise<void> => {
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", allowlisted: true, admin: false, scopesPlain: null })
  store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }] })
  await settled()
}
const REPO = "will/flows"
const issueRoute = `/api/repos/will/flows/issues/7`
const chatIssue = { number: 7, title: "Will ↔ Personal Assistant", state: "open", kind: "chat", visibility: "private", body: "", author: { login: "will" }, labels: [], created_at: "2026-09-26T09:00:00Z", updated_at: "2026-09-26T09:05:00Z" }
const comments = [
  { id: 9001, commenter: "smithers-bot", persona: { username: "Personal Assistant", iconEmoji: ":compass:" }, body: "Tomorrow's 1:1s are booked.", created_at: "2026-09-26T09:05:00Z" }
]
const issueCard = (store: AppStore): Extract<Card, { kind: "issue" }> | undefined =>
  [...store.collections.cards.values()].find((card): card is Extract<Card, { kind: "issue" }> => card.kind === "issue" && card.payload.number === 7)

describe("chat issues through the issues seam", () => {
  test("a chat reads as a conversation: persona, Slack mapping, reactions and the viewer", async () => {
    const calls: Array<{ line: string }> = []
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, backend({
      [`GET ${issueRoute}`]: json(200, chatIssue),
      [`GET ${issueRoute}/comments`]: json(200, comments),
      [`GET ${issueRoute}/slack`]: json(200, { connection_id: "slack", team_id: "T001", channel_id: "C001", thread_ts: "100.000001" }),
      [`GET ${issueRoute}/comments/9001/reactions`]: json(200, [{ name: "eyes", actor: "will", active: true }, { name: "eyes", actor: "U001", active: true }])
    }, calls))
    await signedIn(store)
    const outcome = await controller.commands.run("issues.view", `7 ${REPO}`)
    expect(outcome.status).toBe("executed")
    const card = issueCard(store)!
    expect(card.payload.kind).toBe("chat")
    expect(card.title).toBe("Will ↔ Personal Assistant")
    expect(card.payload.slack).toEqual({ teamId: "T001", channelId: "C001", threadTs: "100.000001" })
    expect(card.payload.viewer).toEqual({ id: "will", name: "will" })
    expect(card.payload.comments[0]).toMatchObject({ id: "9001", persona: { id: "Personal Assistant", name: "Personal Assistant" }, reactions: [{ name: "eyes", count: 2, mine: true }] })
    await controller.dispose()
  })

  test("a send is a pending row posted with its id as the idempotency key; a refusal keeps it as a failed row until Retry succeeds", async () => {
    const calls: Array<{ line: string; body?: unknown }> = []
    let refuse = true
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, backend({
      [`GET ${issueRoute}`]: json(200, chatIssue),
      [`GET ${issueRoute}/comments`]: json(200, comments),
      [`POST ${issueRoute}/comments`]: () => refuse ? json(503, { status: "error", message: "the mirror is down" }) : json(201, { id: 9002 })
    }, calls))
    await signedIn(store)
    await controller.commands.run("issues.view", `7 ${REPO}`)
    const sent = await controller.commands.run("issues.comment", JSON.stringify({ number: 7, text: "Book Friday too.", repo: REPO }))
    expect(sent.status).toBe("executed")
    await waitFor(() => issueCard(store)?.payload.pending?.[0]?.status === "failed")
    const failed = issueCard(store)!.payload.pending![0]!
    expect(failed.text).toBe("Book Friday too.")
    expect(failed.error).toContain("the mirror is down")
    const post = calls.find((call) => call.line.startsWith(`POST ${issueRoute}/comments`))!
    expect(post.body).toEqual({ body: "Book Friday too.", idempotency_key: failed.id })
    refuse = false
    await controller.commands.run("issues.comment.retry", JSON.stringify({ cardId: issueCard(store)!.id, requestId: failed.id }))
    await waitFor(() => (issueCard(store)?.payload.pending ?? []).length === 0)
    const posts = calls.filter((call) => call.line.startsWith(`POST ${issueRoute}/comments`))
    expect(posts).toHaveLength(2)
    // The retry reuses the same key, so the backend can answer with the same comment.
    expect(posts[1]!.body).toEqual(posts[0]!.body)
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
    const list = [...store.collections.cards.values()].find((card): card is Extract<Card, { kind: "issue-list" }> => card.kind === "issue-list")!
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
