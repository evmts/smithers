import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { cloudCapabilities } from "@smthrs/rpc/HostCapabilities"
import App from "./App"
import { ControllerTestProvider } from "./ControllerContext"
import { openRequestedRepo } from "./RepoLink"
import { createAppStore } from "./state/AppStore"
import { currentConversationTabIdOf, inConversation, type Card } from "./state/AppState"
import { scopedControllers } from "./state/ControllerTestScope"
import { json, memoryStorage, silentAgent, writeLegacyCollection } from "./state/TestFixtures"

// HTTP fixtures supply public repository data; controller, forms, journal,
// persistence, agent context and the mounted repository Ask are production code.
GlobalRegistrator.register({ url: "https://smithers.sh/" })
const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!(); window.history.replaceState(null, "", "/") })
afterAll(async () => { await settled(); await GlobalRegistrator.unregister() })
const createController = scopedControllers()
const settled = async () => { for (let n = 0; n < 8; n++) await new Promise(resolve => setTimeout(resolve, 0)) }
const A = "smithersai/vibelang", B = "smithers-canary/smithers"
const bootstrap = {
  apiVersion: 1 as const, host: "cloud" as const, version: "test", buildSha: "test", authFlow: "redirect" as const, sandbox: null,
  capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: true, terminal: false })
}
const backend = (signedIn: boolean, deferredFile?: Promise<Response>) => async (input: unknown) => {
  const path = new URL(String(input), "https://smithers.sh").pathname
  if (path === "/api/user") return signedIn ? json(200, { id: 1, username: "reader", is_admin: false }) : json(401, {})
  if (path === "/api/auth/scopes") return json(200, { scopes: [] })
  if (path === "/api/user/repos") return json(200, [])
  if (path === "/api/user/orgs" || path === "/api/user/workspaces") return json(200, [])
  for (const repo of [A, B]) {
    const root = `/api/repos/${repo}`
    if (path === root) return json(200, { is_public: true, default_bookmark: "main" })
    if (path === `${root}/guest`) return json(403, { code: "guest_not_allowed" })
    if (path === `${root}/home`) return json(200, { kind: "none" })
    if (path === `${root}/bookmarks`) return json(200, { items: [{ name: "main" }], next_cursor: "" })
    if (path === `${root}/contents`) return json(200, [{ name: "package.json", path: "package.json", type: "file" }])
    if (path === `${root}/contents/package.json`) return repo === A && deferredFile ? deferredFile : file(repo)
  }
  return json(404, {})
}
const file = (repo: string) => json(200, { path: "package.json", content: JSON.stringify({ name: repo }), encoding: "utf-8", size: 50 })
const mount = (controller: ReturnType<typeof createController>) => {
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  const dispose = () => { flushSync(() => root.unmount()); host.remove() }
  cleanups.push(dispose)
  return host
}
const open = async (storage: ReturnType<typeof memoryStorage>, repo: string, signedIn: boolean, deferredFile?: Promise<Response>) => {
  window.history.replaceState(null, "", `/${repo}`)
  const store = await createAppStore({ kind: "localStorage", storage })
  const fetchImpl = backend(signedIn, deferredFile)
  const controller = createController(store, silentAgent, { bootstrap, repositoryApp: repo, fetchImpl })
  await controller.loadSession()
  expect(await openRequestedRepo(controller, fetchImpl, repo)).toBeUndefined()
  await settled()
  return { store, controller, fetchImpl }
}
const formFor = (cards: Iterable<Card>) => [...cards].find(card => card.kind === "flow-form" && card.payload.flow === "file")!
const readWithForm = async (controller: ReturnType<typeof createController>) => {
  expect((await controller.commands.run("file")).status).toBe("form")
  const form = formFor([...controller.store.collections.cards.values()].filter(card => inConversation(card, currentConversationTabIdOf(controller.store.session()))))
  expect(form).toBeDefined()
  expect((await controller.commands.run("form.set", `${form.id} path package.json`)).status).toBe("executed")
  expect((await controller.commands.run("form.submit", form.id)).status).toBe("executed")
  await settled()
  return form.id
}

for (const signedIn of [false, true]) test(`repository forms, file cards and model context stay scoped across takeover/reload and return (${signedIn ? "member" : "signed out"})`, async () => {
  const storage = memoryStorage()
  const first = await open(storage, A, signedIn)
  const formId = await readWithForm(first.controller)
  await first.store.dispatch({ type: "message.appended", actor: "system", text: "A repository's private local answer" }).isPersisted.promise
  const sourceScope = currentConversationTabIdOf(first.store.session())
  const sourceFile = [...first.store.collections.cards.values()].find(card => card.kind === "file")!
  expect(sourceFile.tabId).toBe(sourceScope)
  expect(first.store.collections.cards.get(formId)?.tabId).toBe(sourceScope)
  await first.controller.dispose() // The writer relinquishes its lease before the other tab boots.
  const second = await open(storage, B, signedIn)
  const host = mount(second.controller)
  await settled(); flushSync(() => {})
  expect(host.querySelector('aside[aria-label="Ask"]')).not.toBeNull()
  expect(host.querySelector('aside[aria-label="Ask"]')?.textContent).not.toContain("Open and co-edit a file")
  expect(host.querySelector('aside[aria-label="Ask"]')?.textContent).not.toContain(A)
  expect(currentConversationTabIdOf(second.store.session())).not.toBe(sourceScope)
  expect(second.store.agentContextSnapshot().messages.map(row => row.text)).not.toContain("A repository's private local answer")
  expect(second.store.collections.cards.get(sourceFile.id)?.kind).toBe("file")
  const secondFormId = await readWithForm(second.controller)
  expect(secondFormId).not.toBe(formId)
  expect(second.store.collections.cards.has(formId)).toBe(true)
  cleanups.pop()!()
  await second.controller.dispose()
  const returned = await open(storage, A, signedIn)
  const visible = [...returned.store.collections.cards.values()].filter(card => inConversation(card, currentConversationTabIdOf(returned.store.session())))
  expect(visible.some(card => card.id === sourceFile.id)).toBe(true)
  expect(visible.some(card => card.id === formId)).toBe(true)
  expect(visible.some(card => card.id === secondFormId)).toBe(false)
  expect(returned.store.agentContextSnapshot().messages.map(row => row.text)).toContain("A repository's private local answer")
})

test("a pending A read cannot publish into B when its response arrives after switching", async () => {
  let resolve!: (answer: Response) => void
  const response = new Promise<Response>(done => { resolve = done })
  const h = await open(memoryStorage(), A, true, response)
  const pending = h.controller.commands.run("file", "package.json")
  await settled()
  const placeholder = [...h.store.collections.cards.values()].find(card => card.loading)!
  expect(placeholder).toBeDefined()
  const origin = placeholder.tabId
  await openRequestedRepo(h.controller, h.fetchImpl, B)
  resolve(file(A)); await pending; await settled()
  expect(h.store.collections.cards.get(placeholder.id)?.tabId).toBe(origin)
  expect(inConversation(h.store.collections.cards.get(placeholder.id)!, currentConversationTabIdOf(h.store.session()))).toBe(false)
})

test("an active turn keeps A context after switching to B with existing B history", async () => {
  const h = await open(memoryStorage(), A, false)
  await openRequestedRepo(h.controller, h.fetchImpl, B)
  await h.store.dispatch({ type: "message.appended", actor: "system", text: "History for B" }).isPersisted.promise
  await openRequestedRepo(h.controller, h.fetchImpl, A)
  await h.store.dispatch({ type: "message.submitted", actor: "user", turnId: "from-a", text: "Question for A" }).isPersisted.promise
  await openRequestedRepo(h.controller, h.fetchImpl, B)
  await h.store.dispatch({ type: "message.response.delta", actor: "smithers", turnId: "from-a", channel: "text", delta: "Answer from A" }).isPersisted.promise
  expect(h.store.agentContextSnapshot().messages.map(row => row.text)).toEqual(["Question for A", "Answer from A"])
  const visibleB = [...h.store.collections.messages.values()].filter(row => inConversation(row, currentConversationTabIdOf(h.store.session())))
  expect(visibleB.map(row => row.text)).toEqual(["History for B"])
  await h.store.dispatch({ type: "message.response.completed", actor: "smithers", turnId: "from-a", context: [] }).isPersisted.promise
  expect(h.store.agentContextSnapshot().messages.map(row => row.text)).toEqual(["History for B"])
  await openRequestedRepo(h.controller, h.fetchImpl, A)
  expect(h.store.agentContextSnapshot().messages.map(row => row.text)).toEqual(["Question for A", "Answer from A"])
})

test("legacy rows without repository provenance stay readable at root and never become B's history", async () => {
  const storage = memoryStorage()
  const legacy = { id: "legacy-message", role: "smithers", text: "Unscoped old history", status: "complete", ordinal: 1, createdAt: 1 } as const
  writeLegacyCollection(storage, "app-messages", [legacy])
  const store = await createAppStore({ kind: "localStorage", storage })
  await store.dispatch({ type: "repository.upserted", actor: "system", repository: { id: B, org: "smithers-canary", name: "smithers", ownerKind: "user", head: null, catalog: true } }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: B }).isPersisted.promise
  expect(store.collections.messages.has("legacy-message")).toBe(true)
  expect(store.agentContextSnapshot().messages.map(row => row.text)).not.toContain("Unscoped old history")
  expect(inConversation(store.collections.messages.get("legacy-message")!, undefined)).toBe(true)
  await store.dispose?.()
})

test("branch-local history returns with its branch and a human form in B does not join A's running turn", async () => {
  const h = await open(memoryStorage(), A, true)
  await h.controller.commands.run("file", "package.json")
  const mainFile = [...h.store.collections.cards.values()].find(card => card.kind === "file")!
  await h.store.dispatch({ type: "message.appended", actor: "system", text: "Main history" }).isPersisted.promise
  await h.store.dispatch({ type: "branch.navigation.changed", actor: "user", navigation: { owner: "reader", open: false, selected_branch: "feature", nodes: [] } }).isPersisted.promise
  await h.controller.commands.run("file", "package.json")
  const featureFile = [...h.store.collections.cards.values()].find(card => card.kind === "file" && card.id !== mainFile.id)!
  expect(featureFile).toBeDefined()
  expect(featureFile.tabId).not.toBe(mainFile.tabId)
  await h.store.dispatch({ type: "message.appended", actor: "system", text: "Feature history" }).isPersisted.promise
  expect(h.store.agentContextSnapshot().messages.map(row => row.text)).toEqual(["Feature history"])
  await h.store.dispatch({ type: "branch.navigation.changed", actor: "user", navigation: { owner: "reader", open: false, selected_branch: "main", nodes: [] } }).isPersisted.promise
  expect(h.store.agentContextSnapshot().messages.map(row => row.text)).toEqual(["Main history"])
  expect(inConversation(mainFile, currentConversationTabIdOf(h.store.session()))).toBe(true)
  expect(inConversation(featureFile, currentConversationTabIdOf(h.store.session()))).toBe(false)
  await h.store.dispatch({ type: "message.submitted", actor: "user", turnId: "held-a", text: "Question A" }).isPersisted.promise
  await openRequestedRepo(h.controller, h.fetchImpl, B)
  await h.controller.commands.run("file")
  const form = formFor([...h.store.collections.cards.values()].filter(card => inConversation(card, currentConversationTabIdOf(h.store.session()))))
  expect(form).toBeDefined()
  expect(form.tabId).toBe(currentConversationTabIdOf(h.store.session()))
  expect(h.store.agentContextSnapshot().messages.map(row => row.text)).toEqual(["Main history", "Question A"])
})
