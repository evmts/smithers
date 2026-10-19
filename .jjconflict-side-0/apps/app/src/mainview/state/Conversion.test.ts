import { expect, test } from "bun:test"
import { createAppStore } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"
import { memoryStorage, settle, unavailableAgent } from "./TestFixtures"
import { openRequestedRepo } from "../RepoLink"

const createController = scopedControllers()
const source = 'import { Effect } from "effect"'
const setup = async () => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: "localStorage", storage })
  let submissions = 0
  let complete!: () => void
  let wire: Record<string, unknown> | undefined
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://app.test").pathname
    if (path === "/api/user") return new Response(null, { status: 401 })
    if (path === "/api/repos/sponsor/public") return Response.json({ is_public: true, default_bookmark: "main" })
    if (path === "/api/repos/sponsor/public/guest") return Response.json({ allowed: true, sessionId: "opaque-session", landingId: "b0c8af15-f9cc-4325-b383-149c13144913", revision: "main-tip" })
    if (path.endsWith("/conversions")) {
      submissions++; wire = JSON.parse(String(init?.body))
      await new Promise<void>(resolve => { complete = resolve })
      return Response.json({ state: "compiled", effeck: "const value = 1", effeckVersion: "0.0.1" })
    }
    return Response.json({}, { status: 404 })
  }
  const controller = createController(store, unavailableAgent, { fetchImpl, toastDebounceMs: 1 })
  await controller.adoptSession({ state: "signed-out", login: null, admin: false })
  await openRequestedRepo(controller, fetchImpl, "sponsor/public"); await settle()
  return { store, storage, controller, fetchImpl, calls: () => submissions, wire: () => wire, finish: () => complete() }
}

test("/convert persists before HTTP and returns while compilation is unresolved; Chat stays usable", async () => {
  const h = await setup()
  const receipt = await h.controller.commands.run("convert", source)
  expect(receipt.status).toBe("executed")
  await settle()
  expect(h.calls()).toBe(1)
  expect(h.store.session().phase).toBe("idle")
  const request = [...h.store.collections.messages.values()].find(row => row.conversion)?.conversion
  expect(request).toMatchObject({ source, repo: "sponsor/public", sourceLabel: "direct" })
  expect(h.wire()).toEqual({ input: source, idempotencyKey: request!.key, sourceLabel: "direct" })
  expect([...h.store.collections.toasts.values()].some(toast => toast.status === "running")).toBe(true)
  await h.controller.commands.runForAgent("convert", JSON.stringify({ source, idempotencyKey: request!.key }))
  expect(h.calls()).toBe(1)
  h.finish(); await settle()
  const row = [...h.store.collections.messages.values()].find(row => row.conversion)
  expect(JSON.parse(row!.conversion!.result!)).toMatchObject({ state: "compiled", effeckVersion: "0.0.1" })
  expect(row!.text).toContain('"compiled"')
})

test("a signed-in agent uses the same typed conversion action", async () => {
  const h = await setup()
  await h.controller.adoptSession({ state: "signed-in", login: "sponsor", admin: false })
  const receipt = await h.controller.commands.runForAgent("convert", JSON.stringify({ source, idempotencyKey: "agent-key", sourceLabel: "hn" }))
  expect(receipt.status).toBe("executed"); await settle()
  expect(h.wire()).toEqual({ input: source, idempotencyKey: "agent-key", sourceLabel: "hn" })
  h.finish(); await settle()
})

test("reload reconnects the persisted key and retains one transcript result", async () => {
  const h = await setup()
  await h.controller.commands.run("convert", source); await settle()
  const key = h.wire()!.idempotencyKey
  await h.controller.dispose()
  const store = await createAppStore({ kind: "localStorage", storage: h.storage })
  const controller = createController(store, unavailableAgent, { fetchImpl: h.fetchImpl })
  await controller.adoptSession({ state: "signed-out", login: null, admin: false })
  await settle()
  expect(h.calls()).toBe(2)
  expect(h.wire()!.idempotencyKey).toBe(key)
  h.finish(); await settle()
  expect([...store.collections.messages.values()].filter(row => row.conversion?.key === key)).toHaveLength(1)
  expect([...store.collections.messages.values()].find(row => row.conversion)?.conversion?.result).toContain('"compiled"')
})
