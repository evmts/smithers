/*
 * A retained History card after a normal reload (#4033). The card is written
 * by the real `/history` act, the page is reloaded by reopening the same
 * storage into a fresh store and controller, and the reconstructed card is
 * mounted against a real local HTTP host. Before this lane the card held its
 * heading and nothing else, indefinitely.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { StrictMode } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import type { StorageApi } from "@tanstack/db"
import { ControllerTestProvider } from "../ControllerContext"
import { createAppController, type AppController } from "../state/AppController"
import { createAppStore, type AppStore } from "../state/AppStore"
import { memoryStorage, settle, unavailableAgent, waitFor } from "../state/TestFixtures"
import { renderCardBody } from "./CardRenderers"

/*
 * The seam's transport is the page's own fetch, and this suite answers over a
 * real socket, so the fetch family stays the runtime's while the DOM is
 * happy-dom's (as in WikiAttachmentAuth.test.tsx).
 */
const network = {
  fetch: globalThis.fetch.bind(globalThis), Response: globalThis.Response, Request: globalThis.Request,
  Headers: globalThis.Headers, AbortController: globalThis.AbortController, AbortSignal: globalThis.AbortSignal
}
GlobalRegistrator.register()
Object.assign(globalThis, network)
afterAll(async () => { await settle(); await GlobalRegistrator.unregister() })

const ARCHIVES = "/api/conversation-archives"
const archive = (id: string, title: string, archived_at: number) =>
  ({ id, repository: null, branch: null, title, summary: null, runs: [], entries: 1, first_at: 1, last_at: 2, archived_at, archived_by: "maya" })
const conversation = (id: string, prompt: string) => ({
  id: `archive-${id}`,
  entries: [{ id: `${id}-turn`, author: 7, authorLogin: "maya", runId: "r1", prompt, state: "completed", title: prompt, tone: "quiet", sequence: 1,
    frames: [{ runId: "r1", type: "delta", kind: "text", text: "The cookie lacked SameSite." }, { runId: "r1", type: "done", reason: "stop" }] }]
})

interface Host {
  origin: string
  readonly seen: Array<{ readonly method: string; readonly path: string }>
  /** What the next listing answers; `null` holds it until `release` is called. */
  index: { readonly rows: ReadonlyArray<ReturnType<typeof archive>> } | { readonly status: number } | null
  opened: { readonly id: string; readonly prompt: string } | { readonly status: number } | null
  release: () => void
  stop: () => Promise<void>
}

/** One real local host for this suite's own fixtures; no runtime state is read. */
const serve = (): Host => {
  const held: Array<() => void> = []
  const host: Host = {
    origin: "", seen: [], index: { rows: [] }, opened: null,
    release: () => { for (const resume of held.splice(0)) resume() },
    stop: async () => { host.release(); await server.stop(true) }
  }
  /* A held plan answers with whatever `release` leaves in its place, never with the hold itself. */
  const settled = async <T,>(plan: () => T | null): Promise<T> => {
    if (plan() === null) await new Promise<void>(resume => held.push(resume))
    const answer = plan()
    if (answer === null) throw new Error("a held fixture was released with nothing to answer")
    return answer
  }
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url)
    host.seen.push({ method: request.method, path: url.pathname })
    if (url.pathname === ARCHIVES) {
      const plan = await settled(() => host.index)
      return "status" in plan ? new network.Response("{}", { status: plan.status }) : network.Response.json({ archives: plan.rows })
    }
    if (url.pathname.startsWith(`${ARCHIVES}/`)) {
      const id = decodeURIComponent(url.pathname.slice(ARCHIVES.length + 1))
      const plan = await settled(() => host.opened)
      if ("status" in plan) return new network.Response("{}", { status: plan.status })
      if (plan.id !== id) return new network.Response("{}", { status: 404 })
      return network.Response.json({ archive: archive(id, "Fix Safari login", 500), conversation: conversation(id, plan.prompt) })
    }
    return new network.Response("{}", { status: 404 })
  } })
  host.origin = `http://127.0.0.1:${server.port}`
  return host
}

const open = async (storage: StorageApi, origin: string, login = "maya"): Promise<{ store: AppStore; controller: AppController; dispose: () => Promise<void> }> => {
  const store = await createAppStore({ kind: "localStorage", storage })
  const controller = createAppController(store, unavailableAgent, {
    baseUrl: origin,
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["agent", "chat.archive"], authFlow: "none",
      sandbox: { platform: "darwin", mode: "trusted-only" } }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login, admin: false, scopesPlain: null }).isPersisted.promise
  await settle()
  return { store, controller, dispose: async () => { await controller.dispose(); await store.dispose?.() } }
}

/** The History card as the previous page persisted it. */
const storedCard = (storage: StorageApi): unknown => {
  const blob = JSON.parse(storage.getItem("smithers-mvp.store") ?? "{}") as { readonly entries?: Record<string, string> }
  const cards = JSON.parse(blob.entries?.["smithers-mvp.app-cards"] ?? "{}") as Record<string, { readonly data?: unknown }>
  return cards["s:archived-chats"]?.data
}

/**
 * The page before the reload: `/history` writes the durable card, with its
 * selection when one is named, and then the session goes away.
 */
const archived = async (host: Host, selected?: string): Promise<StorageApi> => {
  const storage = memoryStorage()
  const page = await open(storage, host.origin)
  try {
    await page.controller.showHistory(selected)
    await settle()
    expect(page.store.collections.cards.get("archived-chats")?.kind).toBe("archives")
    expect(storedCard(storage)).toMatchObject({ kind: "archives" })
  } finally { await page.dispose() }
  host.seen.length = 0
  return storage
}

/** The page after the reload: the same storage, a fresh store and controller, the card mounted. */
const reload = async (storage: StorageApi, host: Host, options: { readonly strict?: boolean; readonly login?: string } = {}) => {
  const page = await open(storage, host.origin, options.login)
  const card = page.store.collections.cards.get("archived-chats")!
  expect(card.kind).toBe("archives")
  const element = document.createElement("div")
  document.body.append(element)
  const root = createRoot(element)
  const body = <ControllerTestProvider controller={page.controller}>{renderCardBody(card, {
    presentation: "embedded", onDecideApproval: () => {}, onConnectGitHub: () => {}, onRunWorkflow: () => {}, onStopRun: () => {},
    onRetryRun: () => {}, onChooseWorkflowRepo: () => {}, worldDocuments: [], onChangeWorldDocument: () => {},
    onRunCommand: () => { throw new Error("History must not run a command on its own") }
  })}</ControllerTestProvider>
  flushSync(() => root.render(options.strict === true ? <StrictMode>{body}</StrictMode> : body))
  const reads = (path: string) => host.seen.filter(call => call.method === "GET" && call.path === path).length
  return {
    ...page, host: element, card,
    reads,
    writes: () => host.seen.filter(call => call.method !== "GET"),
    text: () => element.textContent ?? "",
    press: async (button: Element | null | undefined) => { flushSync(() => (button as HTMLButtonElement).click()); await settle() },
    settled: async (condition: () => boolean) => { await waitFor(condition); await settle() },
    close: async () => { flushSync(() => root.unmount()); element.remove(); await page.dispose() }
  }
}

test("a retained History card reads the authoritative index for the current identity after a reload", async () => {
  const host = serve()
  host.index = { rows: [archive("a1", "Fix Safari login", 500), archive("a2", "Rename the billing page", 400)] }
  const storage = await archived(host)
  const page = await reload(storage, host)
  try {
    await page.settled(() => page.text().includes("Fix Safari login"))
    expect(page.text()).toContain("Rename the billing page")
    // One read answered the mount, and the card asked the host for nothing else.
    expect(page.reads(ARCHIVES)).toBe(1)
    expect(page.writes()).toEqual([])
    expect(page.controller.chatArchives.get().archives?.map(row => row.id)).toEqual(["a1", "a2"])
    // Archived rows stay a read-only listing: no control replays an archived chat.
    expect(page.host.querySelector("[data-flow]")).toBeNull()
  } finally { await page.close(); await host.stop() }
})

test("a reload says it is reading until the host answers, then names an authoritative empty history", async () => {
  const host = serve()
  const storage = await archived(host)
  host.index = null
  const page = await reload(storage, host)
  try {
    await page.settled(() => page.text().includes("Reading history"))
    // The read has not answered, so the card never claims this identity archived nothing.
    expect(page.text()).not.toContain("No archived chats")
    host.index = { rows: [] }
    host.release()
    await page.settled(() => page.text().includes("No archived chats"))
    expect(page.text()).not.toContain("Reading history")
    expect(page.reads(ARCHIVES)).toBe(1)
    expect(page.writes()).toEqual([])
  } finally { await page.close(); await host.stop() }
})

test("a reload re-reads the archive the card still holds open, and keeps it read-only", async () => {
  const host = serve()
  host.index = { rows: [archive("a1", "Fix Safari login", 500)] }
  host.opened = { id: "a1", prompt: "Why does login fail?" }
  const storage = await archived(host, "a1")
  // The selection is durable: it is in the bytes the page left behind, not only in the session that wrote it.
  expect(storedCard(storage)).toMatchObject({ kind: "archives", payload: { selected: "a1" } })
  const page = await reload(storage, host)
  try {
    await page.settled(() => page.text().includes("Why does login fail?"))
    expect(page.card.payload).toEqual({ selected: "a1" })
    expect(page.text()).toContain("The cookie lacked SameSite.")
    expect(page.reads(ARCHIVES)).toBe(1)
    expect(page.reads(`${ARCHIVES}/a1`)).toBe(1)
    expect(page.writes()).toEqual([])
    // Archived entries are prose: nothing in them can act on a live chat.
    expect(page.host.querySelector("[data-archived-entries='archive-a1'] button, [data-archived-entries='archive-a1'] input, [data-archived-entries='archive-a1'] a[href]")).toBeNull()
  } finally { await page.close(); await host.stop() }
})

test("a failed listing after a reload offers Retry, which reads again and recovers", async () => {
  const host = serve()
  const storage = await archived(host)
  host.index = { status: 503 }
  const page = await reload(storage, host)
  try {
    await page.settled(() => page.text().includes("History unavailable"))
    // A read nobody answered is not an empty history, and drawing the card again does not re-ask.
    expect(page.text()).not.toContain("No archived chats")
    expect(page.reads(ARCHIVES)).toBe(1)
    host.index = { rows: [archive("a1", "Fix Safari login", 500)] }
    await page.press(page.host.querySelector("[data-failure='HistoryUnavailable'] button"))
    await page.settled(() => page.text().includes("Fix Safari login"))
    expect(page.text()).not.toContain("History unavailable")
    expect(page.reads(ARCHIVES)).toBe(2)
    expect(page.writes()).toEqual([])
  } finally { await page.close(); await host.stop() }
})

test("a failed read of the held-open archive offers that chat's Retry, which recovers its entries", async () => {
  const host = serve()
  host.index = { rows: [archive("a1", "Fix Safari login", 500)] }
  host.opened = { status: 500 }
  const storage = await archived(host, "a1")
  const page = await reload(storage, host)
  try {
    await page.settled(() => page.text().includes("Archived chat unavailable"))
    expect(page.reads(`${ARCHIVES}/a1`)).toBe(1)
    expect(page.text()).toContain("Fix Safari login")
    host.opened = { id: "a1", prompt: "Why does login fail?" }
    await page.press(page.host.querySelector("[data-failure='ArchivedChatUnavailable'] button"))
    await page.settled(() => page.text().includes("Why does login fail?"))
    expect(page.text()).not.toContain("Archived chat unavailable")
    expect(page.reads(`${ARCHIVES}/a1`)).toBe(2)
    expect(page.writes()).toEqual([])
  } finally { await page.close(); await host.stop() }
})

test("a signed-in identity change drops the previous account's answers and reads for the new one", async () => {
  const host = serve()
  host.index = { rows: [archive("a1", "Fix Safari login", 500)] }
  host.opened = { id: "a1", prompt: "Why does login fail?" }
  const storage = await archived(host, "a1")
  const page = await reload(storage, host)
  try {
    await page.settled(() => page.text().includes("Why does login fail?"))
    const before = page.reads(ARCHIVES)
    host.index = null
    // Ben reaches none of Maya's archived chats, and the card must never reuse hers.
    host.opened = { status: 404 }
    await page.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
    await settle()
    // Maya's listing and her opened chat are gone before Ben's own read answers.
    expect(page.text()).not.toContain("Fix Safari login")
    expect(page.text()).not.toContain("Why does login fail?")
    expect(page.controller.chatArchives.get().archives).toBeUndefined()
    expect(page.controller.chatArchives.get().opened).toEqual({})
    expect(page.reads(ARCHIVES)).toBe(before + 1)
    host.index = { rows: [archive("b1", "Ben's own chat", 600)] }
    host.release()
    await page.settled(() => page.text().includes("Ben's own chat"))
    expect(page.text()).not.toContain("Fix Safari login")
    expect(page.text()).not.toContain("Why does login fail?")
    expect(page.text()).not.toContain("The cookie lacked SameSite.")
    expect(page.writes()).toEqual([])
  } finally { await page.close(); await host.stop() }
})

test("StrictMode's double subscription and a remount read the index once each", async () => {
  const host = serve()
  host.index = { rows: [archive("a1", "Fix Safari login", 500)] }
  const storage = await archived(host)
  const strict = await reload(storage, host, { strict: true })
  try {
    await strict.settled(() => strict.text().includes("Fix Safari login"))
    expect(strict.reads(ARCHIVES)).toBe(1)
  } finally { await strict.close() }
  // The answer belongs to the disposed session, so the next page reads for itself exactly once.
  host.seen.length = 0
  const again = await reload(storage, host)
  try {
    await again.settled(() => again.text().includes("Fix Safari login"))
    expect(again.reads(ARCHIVES)).toBe(1)
    expect(again.writes()).toEqual([])
  } finally { await again.close(); await host.stop() }
})

test("a disposed page's held read answers into nothing", async () => {
  const host = serve()
  const storage = await archived(host)
  host.index = null
  const page = await reload(storage, host)
  await page.settled(() => page.text().includes("Reading history"))
  const seam = page.controller.chatArchives
  await page.close()
  host.index = { rows: [archive("a1", "Fix Safari login", 500)] }
  host.release()
  await settle()
  expect(seam.get().archives).toBeUndefined()
  // A disposed seam asks for nothing more.
  const spent = host.seen.length
  seam.ensure("a1")
  seam.retry()
  await settle()
  expect(host.seen).toHaveLength(spent)
  await host.stop()
})
