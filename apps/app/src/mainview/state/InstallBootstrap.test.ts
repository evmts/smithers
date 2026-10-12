import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { scopedControllers } from "./ControllerTestScope"
import { createAppStore } from "./AppStore"
import { memoryStorage, settled } from "./TestFixtures"
import { installFixture } from "./seams/InstallFixtures.test-support"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { waitFor } from "./TestFixtures"
GlobalRegistrator.register({ url: "http://localhost:4000/setup" })
afterAll(() => GlobalRegistrator.unregister())
const controller = scopedControllers()
for (const host of ["local", "cloud"] as const) for (const install of [false, true]) {
  test(`${host} install=${install}: a real bootstrap never enables the demo world`, async () => {
    const requests: string[] = []
    const bootstrap: AppBootstrap = { apiVersion: 1, host, version: "test", buildSha: "test", capabilities: install ? ["install"] : [], authFlow: "none", sandbox: null }
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const app = controller(store, { available: false, startTurn: async () => ({ status: "error", message: "offline" }), cancelTurn: async () => {}, subscribe: () => () => {} }, {
      bootstrap, fetchImpl: async input => { requests.push(String(input)); return String(input).endsWith("/api/install") ? Response.json(installFixture()) : new Response("", { status: 404 }) }
    })
    await settled()
    expect(requests.filter(path => path.endsWith("/api/install"))).toHaveLength(install ? 1 : 0)
    expect(app.design.enabled).toBe(false)
    expect(app.design.world().todos).toEqual([])
    expect(app.design.world().repo.repo).toBe("")
    expect(app.design.world().runs).toEqual([])
    // Missing TODO routes must fail through the real seam, never simulate work.
    const answer = () => app.todoRoute(1, ["who-answers"], () => "seed" as const, () => "real" as const)
    await answer()
    await settled()
    expect(await answer()).toBe("real")
  })
}

test("an explicitly composed non-install journey fixture retains its design world", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const app = controller(store, { available: false, startTurn: async () => ({ status: "error", message: "offline" }), cancelTurn: async () => {}, subscribe: () => () => {} }, {
    designFixture: true,
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [], authFlow: "none", sandbox: null },
    fetchImpl: async () => new Response("", { status: 404 })
  })
  expect(app.design.enabled).toBe(true)
  expect(app.design.world().todos.map(todo => todo.ref)).toEqual(["T8", "T9", "T10", "T11"])
  expect(app.design.world().repo.repo).toBe("acme/api")
})

test("hosted chat admits a real prompt without install capability or demo replies", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const writes: Array<{ path: string; body: unknown }> = []
  const app = controller(store, { available: false, startTurn: async () => ({ status: "error", message: "offline" }), cancelTurn: async () => {}, subscribe: () => () => {} }, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "agent"], authFlow: "redirect", sandbox: null },
    fetchImpl: async (input, init) => {
      const path = String(input)
      if (init?.method === "POST") {
        writes.push({ path, body: JSON.parse(String(init.body)) })
        return Response.json({ turnId: "hosted-turn", terminal: false })
      }
      return Response.json(path.endsWith("/view-state") ? {} : { id: "main", entries: writes.length ? [{ id: "hosted-turn", author: 1, authorLogin: "owner", runId: "hosted-run", prompt: "change to dark mode", state: "completed", frames: [{ runId: "hosted-run", type: "delta", kind: "text", text: "Real model response" }, { runId: "hosted-run", type: "done" }] }] : [] })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", admin: false, scopesPlain: null }).isPersisted.promise
  await app.send("change to dark mode")
  await waitFor(() => app.sharedConversation?.get().conversation?.entries.length === 1)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ path: "/api/conversations/main/prompt", body: { prompt: "change to dark mode" } })
  expect(store.session().theme).not.toBe("dark")
  expect(JSON.stringify([...store.collections.messages.values()])).not.toContain("Changed Maya")
})

test("unavailable conversation admission preserves the draft and states availability honestly", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const app = controller(store, { available: false, startTurn: async () => ({ status: "error", message: "offline" }), cancelTurn: async () => {}, subscribe: () => () => {} }, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [], authFlow: "redirect", sandbox: null },
    toastAutoDismissMs: 60_000,
    fetchImpl: async () => new Response("{}", { status: 503 })
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "unavailable", login: null, admin: false, scopesPlain: null }).isPersisted.promise
  app.changeDraft("Keep this prompt")
  expect(await app.send("Keep this prompt")).toBe(false)
  await waitFor(() => store.collections.toasts.get("toast-chat.unavailable")?.status === "failed")
  expect(store.session().draft).toBe("Keep this prompt")
  expect(store.collections.toasts.get("toast-chat.unavailable")?.detail).toBe("Conversation unavailable")
})
