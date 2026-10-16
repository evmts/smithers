import { CardSchema } from "@smthrs/rpc/Cards"
import { verifyConversationHistoryPage } from "./ConversationHistory"
import cutHistory from "./testdata/cut-history-mixed.json"
import { LiveChannel, type LiveSocket } from "../runtime/LiveChannel"
import { fixtures } from "@smthrs/rpc/fixtures/Confirm"
import type { MemberConfirmation } from "@smthrs/rpc/ConfirmCard"
import { createConversationHistory } from "../native/ConversationHistory"
import historyFixture from "./testdata/earlier-history.json"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "../App"
import { ControllerTestProvider } from "../ControllerContext"
import { createAppStore } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"
import { memoryStorage, silentAgent, waitFor } from "./TestFixtures"
import { branchTree } from "./seams/BranchNavigationSeam"
import { BRANCH_PICKS_STORAGE_KEY } from "./seams/RepositoryBranchesSeam"

const nativeFetch = globalThis.fetch.bind(globalThis)
const NativeAbortController = globalThis.AbortController
const serverFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const abort = new NativeAbortController()
  const cancel = () => abort.abort()
  if (init?.signal?.aborted) cancel()
  init?.signal?.addEventListener("abort", cancel, { once: true })
  try { return await nativeFetch(input, { ...init, signal: abort.signal }) }
  finally { init?.signal?.removeEventListener("abort", cancel) }
}
GlobalRegistrator.register()
const cleanups: Array<() => void> = []
// Registered first so each mount unmounts before scopedControllers() disposes its controller.
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
const controllerFor = scopedControllers()
afterAll(async () => { await new Promise(resolve => setTimeout(resolve, 20)); await GlobalRegistrator.unregister() })
const row = (name: string, from = "main", state = "awake") => ({ name, kind: "scratch", state, machine: { id: name }, forked_from: { ref: from } })

const mount = (controller: ReturnType<typeof controllerFor>) => {
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  cleanups.push(() => { flushSync(() => root.unmount()); host.remove() })
  return host
}

test("/branches mounts the install tree before an unresolved read, then shows real rows and readonly Earlier", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  let finish!: (value: Response) => void
  const read = new Promise<Response>(resolve => { finish = resolve })
  const frames: { t: string; id: number; topic?: string }[] = []
  const socket = { readyState: 1, onopen: null, onclose: null, onmessage: null,
    send: (data: string | Uint8Array) => { if (typeof data === "string") frames.push(JSON.parse(data)) }, close: () => {} } as LiveSocket
  const live = new LiveChannel({ socket: () => socket })
  cleanups.push(() => live.dispose())
  let starts = 0
  const controller = controllerFor(store, { ...silentAgent, startTurn: async () => { starts++; return { status: "started" } } }, {
    bootstrap: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install"], authFlow: "redirect", sandbox: null },
    live,
    fetchImpl: async input => String(input).includes("/api/branches?") ? read : new Response("{}", { status: 404 })
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "message.appended", actor: "system", text: "Archived greeting" }).isPersisted.promise
  await store.dispatch({ type: "conversation.cleared", actor: "user", branchId: "new-conversation", notes: [] }).isPersisted.promise
  const host = mount(controller)
  const result = await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  expect(result.status).toBe("executed")
  await waitFor(() => host.querySelector('nav[aria-label="Branches"]') !== null)
  expect(store.session().branchNavigation?.nodes).toEqual([])
  finish(Response.json([row("retry"), row("nested", "retry"), row("closed", "main", "closed")]))
  await waitFor(() => host.querySelector('[data-node="nested"]') !== null)
  const subscription = frames.find(frame => frame.topic === "branch:retry")!
  expect(subscription).toBeDefined()
  const ben = { kind: "person", login: "ben", name: "Ben", avatar_url: "https://github.com/ben.png", color_index: 0 } as const
  const agent = { kind: "agent", id: "coding-1", agent: "coding", avatar_url: "https://github.com/agent.png", color_index: 6 } as const
  socket.onmessage?.({ data: JSON.stringify({ t: "snap", id: subscription.id, cursor: 1, data: { presence: [{ actor: agent }, { actor: ben }] } }) })
  await waitFor(() => store.session().branchNavigation?.nodes[0]?.children[0]?.present.length === 2)
  expect(store.session().branchNavigation?.nodes[0]?.children[0]?.present).toEqual([ben, agent])
  await waitFor(() => host.querySelector('[data-node="retry"] [aria-label="Ben"]') !== null)
  socket.onmessage?.({ data: JSON.stringify({ t: "err", id: subscription.id, code: "forbidden" }) })
  await waitFor(() => store.session().branchNavigation?.nodes[0]?.children[0]?.present.length === 0)
  expect(host.querySelector('[data-node="closed"]')).toBeNull()
  expect(host.querySelector('[data-node="b-retry"]')).toBeNull()
  expect(host.querySelector('[data-node="nested"]')?.closest("li")?.getAttribute("data-depth")).toBe("2")
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
  await waitFor(() => host.querySelector('[aria-label="Earlier"]') !== null)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-archive="branch-main"]')!.click())
  await waitFor(() => host.querySelector(".archive-entries")?.textContent?.includes("Archived greeting") === true)
  expect(host.querySelector(".archive-entries button")).toBeNull()
  expect(starts).toBe(0)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "alice", admin: false, scopesPlain: null }).isPersisted.promise
  await waitFor(() => host.querySelector('[aria-label="Earlier"]') === null)
})

test("Earlier keeps navigation busy across its transcript remount until the write settles", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = controllerFor(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install"], authFlow: "redirect", sandbox: null },
    fetchImpl: async () => Response.json([])
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  let finish!: () => void
  const writing = new Promise<void>(resolve => { finish = resolve })
  const host = mount({ ...controller, setBranchNavigationView: async patch => {
    await controller.setBranchNavigationView(patch)
    await writing
  } })
  try {
    await waitFor(() => host.querySelector('[data-node="earlier"]') !== null)
    flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
    await waitFor(() => host.querySelector('[aria-label="Earlier"]') !== null)
    expect(host.querySelector("[data-branch-navigation]")?.getAttribute("aria-busy")).toBe("true")
    finish()
    await waitFor(() => host.querySelector("[data-branch-navigation]")?.getAttribute("aria-busy") === "false")
  } finally { finish() }
})

test("tree refuses cycles and repeated branch identities", () => {
  expect(() => branchTree([row("a", "b"), row("b", "a")])).toThrow("Cyclic")
  expect(() => branchTree([row("a"), row("a")])).toThrow("Repeated")
})


test("Earlier combines two browser archives with private journal replay without restoring execution", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const requests: Array<{ path: string; method: string; body?: unknown }> = []
  const history = createConversationHistory({ fetchImpl: async (input, init) => {
    const path = String(input)
    requests.push({ path, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    return Response.json(store.collections.identitySessions.get("identity")?.login === "alice" ? { status: "ok", conversations: [], next: null } : path.endsWith("/replay") ? historyFixture.replay : historyFixture.index)
  } }).history
  let starts = 0
  const controller = controllerFor(store, { ...silentAgent, history, startTurn: async () => { starts++; return { status: "started" } } }, {
    bootstrap: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install"], authFlow: "redirect", sandbox: null },
    fetchImpl: async input => String(input).includes("/api/branches?") ? Response.json([]) : new Response("{}", { status: 404 })
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "message.appended", actor: "system", text: "First browser archive" }).isPersisted.promise
  for (const frame of cutHistory.replay.page.batches[0]!.frames) {
    if (frame.type === "card") await store.dispatch({ type: "card.upsert", actor: "system", card: CardSchema.parse(frame.card) }).isPersisted.promise
  }
  await store.dispatch({ type: "conversation.cleared", actor: "user", branchId: "local-two", notes: [] }).isPersisted.promise
  await store.dispatch({ type: "message.appended", actor: "system", text: "Second browser archive" }).isPersisted.promise
  await store.dispatch({ type: "conversation.cleared", actor: "user", branchId: "current", notes: [] }).isPersisted.promise
  await store.dispatch({ type: "message.appended", actor: "system", text: "Current conversation" }).isPersisted.promise
  const messages = [...store.collections.messages.values()].map(row => row.text)
  const host = mount(controller)
  expect((await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })).status).toBe("executed")
  await waitFor(() => store.collections.branches.has("earlier:journal:legacy-journal"))
  expect([...store.collections.messages.values()].map(row => row.text)).toEqual(messages)
  expect(store.session().activeBranchId).toBe("current")
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
  await waitFor(() => host.querySelectorAll("[data-archive]").length === 3)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-archive="earlier:journal:legacy-journal"]')!.click())
  await waitFor(() => host.querySelector(".archive-entries")?.textContent?.includes("Archived journal greeting") === true)
  expect(host.querySelector(".archive-entries")?.textContent).toContain("Legacy journal question")
  expect(host.querySelectorAll(".archive-entries button")).toHaveLength(0)
  expect(starts).toBe(0)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-archive="branch-main"]')!.click())
  await waitFor(() => host.querySelector(".archive-entries")?.textContent?.includes("First browser archive") === true)
  for (const kind of ["admin-health", "agent", "connect", "grant-confirm", "notifications", "registration", "repository-setup"]) expect(host.querySelector(".archive-entries")?.textContent).toContain(`Saved ${kind}`)
  expect(host.querySelector(".archive-entries")?.textContent).not.toContain("private-body-canary")
  expect(host.querySelector(".archive-entries")?.textContent).not.toContain("private-payload-canary")
  expect(host.querySelector(".archive-entries button")).toBeNull()
  expect(requests).toEqual([
    { path: "/api/agent/conversations", method: "GET" },
    { path: "/api/agent/conversations/replay", method: "POST", body: { runId: "legacy-turn", legId: "legacy-leg" } }
  ])
  expect(store.collections.httpTurns.size).toBe(0)
  expect(store.collections.runtimeApprovals.size).toBe(0)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "alice", admin: false, scopesPlain: null }).isPersisted.promise
  await waitFor(() => host.querySelector(".archive-entries") === null)
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => host.querySelector('[data-node="earlier"]') !== null)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
  await waitFor(() => host.querySelector('[aria-label="Earlier"]') !== null)
  expect(host.querySelectorAll("[data-archive]")).toHaveLength(0)
})


test("Earlier hides live confirmation actions and returning restores the same pending request", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const pending: MemberConfirmation = { id: "10000000-0000-4000-8000-000000000001", state: "pending", command: "todo.drop", revision: "item:2", expires_at: "2099-01-01T00:00:00Z",
    payload: { input: { op: "drop" }, card: { ...fixtures.one_click.model, action: { tag: "todo.drop", verb: "Drop" }, subject: { kind: "todo", ref: "T12", revision: "item:2" } } } }
  const snapshot = { topic: "confirmations:17", data: [pending] }
  const writes: string[] = []
  const controller = controllerFor(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install"], authFlow: "redirect", sandbox: null },
    live: { subscribe: () => () => {}, getSnapshot: topic => topic === snapshot.topic ? snapshot : undefined },
    fetchImpl: async (input, init) => {
      const path = String(input)
      if (init?.method && init.method !== "GET") writes.push(path)
      return path.includes("/api/branches?") ? Response.json([]) : new Response("{}", { status: 404 })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", memberId: 17, admin: false, scopesPlain: null }).isPersisted.promise
  const host = mount(controller)
  const confirmation = () => host.querySelector(`[data-message-id="confirmation:${pending.id}"]`)
  await waitFor(() => confirmation()?.querySelector("button") !== null && confirmation() !== null)
  expect(confirmation()?.textContent).toContain("Drop")
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => host.querySelector('[data-node="earlier"]') !== null)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
  await waitFor(() => host.querySelector('[aria-label="Earlier"]') !== null)
  expect(confirmation() === null).toBe(true)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
  await waitFor(() => host.querySelector('[aria-label="Earlier"]') === null)
  await waitFor(() => confirmation() !== null)
  expect(confirmation()?.textContent).toContain("Drop")
  expect(pending.state).toBe("pending")
  expect(writes).toEqual([])
})


test("duplicate and cyclic branches carry typed diagnostic reasons", () => {
  const row = (name: string, parent?: string) => ({ name, kind: "scratch", state: "open", machine: { id: name }, forked_from: parent ? { ref: parent } : null })
  for (const [rows, sentence] of [[ [row("a"), row("a")], "Repeated branch" ], [[row("a", "b"), row("b", "a")], "Cyclic branch tree"]] as const) {
    try { branchTree(rows); throw new Error("accepted invalid branch tree") }
    catch (value) { expect(value).toMatchObject({ _tag: "BranchNavigationFailure", sentence }) }
  }
})

test("Earlier verifies seven historical cut cards before decoding, persists titles and fences member/prompt access", async () => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: "localStorage", storage })
  let owner = "ben"
  const origin = process.env.SMITHERS_CUT_HISTORY_ORIGIN
  const history = createConversationHistory({ fetchImpl: async (input, init) => origin
    ? serverFetch(`${origin}${input}`, { ...init, headers: { ...init?.headers, "X-Forwarded-Host": "127.0.0.1:4000",
      Authorization: `Bearer ${owner === "ben" ? process.env.SMITHERS_CUT_HISTORY_BEN : process.env.SMITHERS_CUT_HISTORY_ALICE}` } })
    : Response.json(owner === "alice" ? { status: "ok", conversations: [], next: null }
      : String(input).endsWith("/replay") ? cutHistory.replay : cutHistory.index) }).history
  if (origin) {
    const index = await history!.list()
    expect(index.conversations.map(row => row.id)).toContain("legacy-journal")
    const replay = await history!.replay({ runId: "legacy-turn", legId: "legacy-leg" })
    verifyConversationHistoryPage("legacy-turn", "legacy-leg", replay.page)
  }
  const requests: unknown[] = []
  const controller = controllerFor(store, { ...silentAgent, available: true, history, startTurn: async request => {
    requests.push(request); return { status: "error", message: "Captured" }
  } }, {
    bootstrap: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install"], authFlow: "redirect", sandbox: null },
    fetchImpl: async (input, init) => {
      if (String(input).endsWith("/prompt")) { requests.push(JSON.parse(String(init?.body))); return Response.json({}, { status: 503 }) }
      return Response.json([])
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: owner, admin: false, scopesPlain: null }).isPersisted.promise
  const host = mount(controller)
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => store.collections.branches.has("earlier:journal:legacy-journal"))
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
  await waitFor(() => host.querySelector('[data-archive="earlier:journal:legacy-journal"]') !== null)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-archive="earlier:journal:legacy-journal"]')!.click())
  await waitFor(() => host.querySelector(".archive-entries") !== null)
  const entries = host.querySelector(".archive-entries")!
  for (const kind of ["admin-health", "agent", "connect", "grant-confirm", "notifications", "registration", "repository-setup"]) expect(entries.textContent).toContain(`Saved ${kind}`)
  expect(entries.textContent).toContain("Saved File")
  expect(entries.textContent).toContain("Saved Run")
  expect(entries.textContent).not.toContain("retained-file-body-canary")
  expect(entries.textContent).toContain("<script>archiveCanary()</script>")
  expect(entries.querySelector("script,button,input,textarea")).toBeNull()
  expect(entries.textContent).not.toContain("private-body-canary")
  expect(entries.textContent).not.toContain("private-payload-canary")
  expect(store.collections.cards.size).toBe(0)
  expect(requests).toHaveLength(0)
  const snapshot = store.collections.branches.get("earlier:journal:legacy-journal")!.snapshot!
  expect(snapshot.cards).toHaveLength(10)
  expect(snapshot.cards.slice(8).map(card => card.kind)).toEqual(["file", "run"])
  expect(snapshot.cards.slice(0, 8).every(card => card.kind === "retired" && !('body' in card))).toBe(true)
  expect(JSON.stringify(snapshot)).not.toContain("private-payload-canary")
  await controller.setBranchNavigationView({ selected_branch: "main" })
  controller.send("Current question")
  await waitFor(() => requests.length === 1)
  expect(JSON.stringify(requests)).not.toContain("private-payload-canary")
  expect(JSON.stringify(requests)).not.toContain("private-body-canary")
  expect(JSON.stringify(requests)).not.toContain("Saved admin-health")
  owner = "alice"
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: owner, admin: false, scopesPlain: null }).isPersisted.promise
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => host.querySelector('[data-node="earlier"]') !== null)
  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="earlier"]')!.click())
  await waitFor(() => host.querySelector('[aria-label="Earlier"]') !== null)
  expect(host.querySelectorAll("[data-archive]")).toHaveLength(0)
})

/*
 * The hosted page, mounted: `/branches` paints the connected repository's own
 * branches and the toast says what is true. Production asked the hosted
 * backend for the install's global /api/branches, which it does not serve:
 * 404, and the person read "Branches didn't finish — the app hit an
 * unexpected error" (#4028).
 */
const hostedBookmark = (name: string) => ({ name, target_change_id: `change-${name}`, target_commit_id: `commit-${name}`, is_tracking_remote: true })
const hostedController = async (branches: ReadonlyArray<string> | null) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const paths: string[] = []
  const controller = controllerFor(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "agent", "cloud"], authFlow: "redirect", sandbox: null },
    fetchImpl: async input => {
      const url = new URL(String(input), "https://cloud.test")
      paths.push(url.pathname)
      if (url.pathname !== "/api/repos/acme/api/bookmarks") return new Response("{}", { status: 404 })
      // The hosted backend serves no branch list of its own; this is the one it serves.
      return branches === null ? new Response("404 page not found", { status: 404 })
        : Response.json({ items: branches.map(hostedBookmark), next_cursor: "" })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: "acme/api", org: "acme", ownerKind: "org", name: "api", head: { bookmark: "trunk", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await controller.commands.run("repo.select", "acme/api")
  return { store, controller, paths }
}

test("hosted /branches paints the connected repository's branches, marks its default, and selects through the shared door", async () => {
  const { store, controller, paths } = await hostedController(["trunk", "docs", "retry-webhooks"])
  const host = mount(controller)
  expect((await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })).status).toBe("executed")
  await waitFor(() => host.querySelector('[data-node="retry-webhooks"]') !== null)
  expect([...host.querySelectorAll("[data-node]")].map(node => node.getAttribute("data-node")))
    .toEqual(["trunk", "docs", "retry-webhooks", "earlier"])
  // The repository's own current bookmark is the trunk and reads as current — no hardcoded main.
  expect(host.querySelector('[data-node="trunk"]')?.closest("li")?.getAttribute("data-kind")).toBe("main")
  expect(host.querySelector('[data-node="trunk"]')?.getAttribute("aria-current")).toBe("page")
  expect(host.querySelector('[data-node="main"]')).toBeNull()
  expect([...store.collections.toasts.values()].some(toast => toast.status === "failed")).toBe(false)
  expect(paths.includes("/api/branches")).toBe(false)

  flushSync(() => host.querySelector<HTMLButtonElement>('[data-node="docs"]')!.click())
  await waitFor(() => host.querySelector('[data-node="docs"]')?.getAttribute("aria-current") === "page")
  expect(controller.repositoryBranches.pickOf("acme/api")).toBe("docs")
  expect(host.querySelector('[data-node="trunk"]')?.getAttribute("aria-current")).toBeNull()
  // The hosted account still has its one conversation.
  expect(store.session().branchNavigation?.selected_branch).toBe("main")
})

test("hosted /branches whose host refuses the read says branches were not listed, never that the app broke", async () => {
  const { store, controller } = await hostedController(null)
  const host = mount(controller)
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => [...store.collections.toasts.values()].some(toast => toast.status === "failed"))
  const failed = [...store.collections.toasts.values()].find(toast => toast.status === "failed")!
  expect(failed.detail).toContain("Branches for acme/api couldn't be listed")
  expect(failed.detail).not.toContain("unexpected error")
  expect(failed.detail).not.toContain("/api/")
  expect(failed.detail).not.toContain("404")
  expect(host.querySelectorAll('[data-node]:not([data-node="earlier"])')).toHaveLength(0)
})

/*
 * The hosted page's read question is ONE account generation and ONE
 * repository. `/branches` kept a single pending promise for every question
 * and fenced it on the account login alone, so a question about one
 * repository could answer underneath another repository's header while the
 * later question was dropped unread; and the session's
 * `branchNavigation.nodes` carries no repository, so a reload restored one
 * repository's tree beside a header that named a different one.
 */
const hostedRepositories = [
  { id: "acme/api", org: "acme", ownerKind: "org" as const, name: "api", head: { bookmark: "trunk", changeId: "c", commitId: "k" } },
  { id: "acme/web", org: "acme", ownerKind: "org" as const, name: "web", head: { bookmark: "develop", changeId: "c", commitId: "k" } }
]
const hostedBookmarks = (names: ReadonlyArray<string>) => Response.json({ items: names.map(hostedBookmark), next_cursor: "" })
const hostedPage = async (answer: (url: URL) => Response | Promise<Response> | undefined, storage = memoryStorage()) => {
  // Each fixture is its own browser: the picks this page's storage holds are its own.
  globalThis.localStorage?.removeItem(BRANCH_PICKS_STORAGE_KEY)
  const store = await createAppStore({ kind: "localStorage", storage })
  const paths: string[] = []
  const controller = controllerFor(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "agent", "cloud"], authFlow: "redirect", sandbox: null },
    fetchImpl: async input => {
      const url = new URL(String(input), "https://cloud.test")
      paths.push(url.pathname)
      return await answer(url) ?? new Response("{}", { status: 404 })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: hostedRepositories }).isPersisted.promise
  return { store, controller, paths, storage }
}
const painted = (host: HTMLElement) => [...host.querySelectorAll("[data-node]")].map(node => node.getAttribute("data-node"))

test("hosted /branches reads the repository the header now names, and the earlier repository's late answer paints nothing", async () => {
  let answerApi!: (response: Response) => void
  const api = new Promise<Response>(resolve => { answerApi = resolve })
  let webReads = 0
  const { store, controller } = await hostedPage(url => {
    if (url.pathname === "/api/repos/acme/api/bookmarks") return api
    if (url.pathname !== "/api/repos/acme/web/bookmarks") return undefined
    webReads += 1
    // Refused once, so only a question that was actually re-driven lists acme/web.
    return webReads === 1
      ? Response.json({ code: "unavailable", class: "infra", message: "busy" }, { status: 503 })
      : hostedBookmarks(["develop", "release"])
  })
  await controller.commands.run("repo.select", "acme/api")
  const host = mount(controller)
  await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  // acme/api has not answered. The person selects acme/web and asks again.
  await controller.commands.run("repo.select", "acme/web")
  await waitFor(() => webReads === 1)
  expect((await controller.submitCommand({ name: "branches", payload: {}, actor: "user" })).status).toBe("executed")
  await waitFor(() => host.querySelector('[data-node="release"]') !== null)
  expect(painted(host)).toEqual(["develop", "release", "earlier"])
  // acme/api answers last. It is not this page's question any more.
  answerApi(hostedBookmarks(["trunk", "docs"]))
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(painted(host)).toEqual(["develop", "release", "earlier"])
  expect(host.querySelector('[data-node="develop"]')?.getAttribute("aria-current")).toBe("page")
  expect(controller.repositoryBranches.pickOf("acme/api")).toBeUndefined()
  expect(store.session().branchNavigation?.selected_branch).toBe("main")
})

test("a reload paints no branch tree for a repository the header no longer names", async () => {
  const storage = memoryStorage()
  const first = await hostedPage(url => url.pathname === "/api/repos/acme/api/bookmarks" ? hostedBookmarks(["trunk", "docs"]) : undefined, storage)
  await first.controller.commands.run("repo.select", "acme/api")
  const firstHost = mount(first.controller)
  await first.controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => firstHost.querySelector('[data-node="docs"]') !== null)
  await first.controller.commands.run("repo.select", "acme/web")
  await first.controller.dispose()
  // The page is reloaded: this browser's storage restores the session, including
  // an open branch navigation, and acme/web is the repository it restores.
  const second = await hostedPage(url => url.pathname === "/api/repos/acme/web/bookmarks" ? hostedBookmarks(["develop", "release"]) : undefined, storage)
  expect(second.store.session().branchNavigation?.open).toBe(true)
  const secondHost = mount(second.controller)
  await waitFor(() => secondHost.querySelector('[data-node="earlier"]') !== null)
  expect(painted(secondHost)).toEqual(["earlier"])
  // acme/web's own read is what lists acme/web.
  await second.controller.submitCommand({ name: "branches", payload: {}, actor: "user" })
  await waitFor(() => secondHost.querySelector('[data-node="release"]') !== null)
  expect(painted(secondHost)).toEqual(["develop", "release", "earlier"])
})
