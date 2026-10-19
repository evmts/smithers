import { expect, test } from "bun:test"
import { createAppStore } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"
import { memoryStorage, settle, unavailableAgent } from "./TestFixtures"
import { openRequestedRepo } from "../RepoLink"
import { conversationTabIdOf, inConversation } from "./AppState"

const createAppController = scopedControllers()
const landingId = "b0c8af15-f9cc-4325-b383-149c13144913"

const setup = async (allowed = true, refuse = false) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  let finish!: (complete?:boolean) => void
  let calls = 0
  let wire: Record<string, unknown> | undefined
  const paths: string[] = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://app.test").pathname
    paths.push(path)
    if (path === "/api/user") return new Response(null, { status: 401 })
    if (path === "/api/repos/sponsor/public") return Response.json({ is_public: true, default_bookmark: "main" })
    if (path === "/api/repos/sponsor/public/guest") return allowed
      ? Response.json({ allowed: true, sessionId: "opaque-session", landingId, revision: "main-tip" })
      : Response.json({ code: "guest_not_allowed", signIn: true }, { status: 403 })
    if (path.endsWith("/guest/chat")) {
      calls++
      wire = JSON.parse(String(init?.body))
      if (refuse) return Response.json({ code: "guest_daily_cap", signIn: true }, { status: 429 })
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello from the repository"}}]}\n\n'))
        finish = (complete=true) => { if(complete) controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close() }
      } })
      return new Response(body, { headers: { "content-type": "text/event-stream" } })
    }
    return Response.json({}, { status: 404 })
  }
  const controller = createAppController(store, unavailableAgent, { fetchImpl })
  await controller.adoptSession({ state: "signed-out", login: null, admin: false })
  const entry = await openRequestedRepo(controller, fetchImpl, "sponsor/public")
  expect(entry).toBeUndefined()
  await settle()
  return { store, controller, paths, finish: (complete=true) => finish(complete), calls: () => calls, wire: () => wire }
}

test("signed-out composer and guest flow stream through the same HTTP action without waiting for completion", async () => {
  const h = await setup()
  expect(h.paths).not.toContain("/api/public/repos")
  expect(h.store.collections.repositories.get("sponsor/public")?.guest).toMatchObject({ landingId, revision: "main-tip" })
  const receipt = await h.controller.commands.run("chat.send", "How does this repository work?")
  expect(receipt.status).toBe("executed")
  await settle()
  expect(h.calls()).toBe(1)
  expect([...h.store.collections.messages.values()].some(message => message.text.includes("Hello from the repository"))).toBe(true)
  expect(h.store.session().phase).toBe("responding")
  expect(h.wire()).toMatchObject({ prompt: "How does this repository work?", landingId })
  expect(h.wire()).not.toHaveProperty("tools")
  expect(h.wire()).not.toHaveProperty("model")
  await h.controller.commands.run("guest.chat", "Do not buy a duplicate while running")
  expect(h.calls()).toBe(1)
  h.finish()
  await settle()
  expect(h.store.session().phase).toBe("idle")
})

test("the agent door invokes the fixed guest action", async () => {
  const h = await setup()
  const receipt = await h.controller.commands.runForAgent("guest.chat", JSON.stringify({ text: "A repository question" }))
  expect(receipt.status).toBe("executed")
  await settle()
  expect(h.calls()).toBe(1)
  h.finish(); await settle()
})

test("nonallowlisted public repositories keep the sign-in gate", async () => {
  const h = await setup(false)
  await h.controller.send("Keep this draft")
  await settle()
  expect(h.calls()).toBe(0)
  expect([...h.store.collections.messages.values()].some(message => message.action?.flow === "sign-in")).toBe(true)
})

test("spend refusal offers sign-in and never sends another model request", async () => {
  const h = await setup(true, true)
  await h.controller.commands.run("guest.chat", "A repository question")
  await settle()
  expect(h.calls()).toBe(1)
  expect([...h.store.collections.messages.values()].some(message => message.action?.flow === "sign-in")).toBe(true)
  expect(h.store.session().phase).toBe("idle")
  expect([...h.store.collections.messages.values()].some(message=>message.status==="failed")).toBe(true)
})

test("a disconnected stream keeps its partial answer failed and offers sign-in", async () => {
  const h=await setup()
  await h.controller.commands.run("guest.chat","A repository question")
  await settle(); h.finish(false); await settle()
  expect([...h.store.collections.messages.values()].find(message=>message.text.includes("Hello from the repository"))?.status).toBe("failed")
  expect([...h.store.collections.messages.values()].some(message=>message.action?.flow==="sign-in")).toBe(true)
  expect(h.calls()).toBe(1)
})

test("a new guest session cannot see the previous session's conversation", async () => {
  const h = await setup()
  await h.controller.commands.run("guest.chat", "First session")
  await settle(); h.finish(); await settle()
  const oldScope = conversationTabIdOf(h.store.session())
  expect([...h.store.collections.messages.values()].filter(message => inConversation(message, oldScope)).length).toBeGreaterThan(0)
  const repo = h.store.collections.repositories.get("sponsor/public")!
  await h.store.dispatch({ type: "repository.upserted", actor: "system", repository: { ...repo, guest: { ...repo.guest!, sessionId: "another-session" } } }).isPersisted.promise
  const nextScope = conversationTabIdOf(h.store.session())
  expect(nextScope).not.toBe(oldScope)
  expect([...h.store.collections.messages.values()].filter(message => inConversation(message, nextScope))).toHaveLength(0)
})
