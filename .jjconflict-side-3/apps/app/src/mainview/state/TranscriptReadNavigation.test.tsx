import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "../App"
import { ControllerTestProvider } from "../ControllerContext"
import { readScopeOf, type Card } from "./AppState"
import { createAppStore } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"
import { memoryStorage, silentAgent, waitFor } from "./TestFixtures"

GlobalRegistrator.register()
const createAppController = scopedControllers()

/*
 * Real mounted App over the real projection. The transcript's layout is the
 * one thing a DOM without a layout engine cannot supply, so the rows and the
 * viewport report the production geometry: a saved shared conversation whose
 * private pane card sits near the top, yesterday's shared turns filling the
 * middle, and the composer's flow form last. Nothing else is simulated.
 */
const geometry = new Map<string, { top: number; height: number }>()
let viewportMetrics = { scrollHeight: 0, clientHeight: 0 }
const saved = new Map<string, PropertyDescriptor | undefined>()
const isViewport = (el: HTMLElement) => el.dataset.slot === "message-scroller-viewport"

beforeAll(() => {
  for (const property of ["scrollHeight", "clientHeight", "scrollTop", "offsetTop", "offsetHeight", "getBoundingClientRect"]) {
    saved.set(property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property))
  }
  const scrollTops = new WeakMap<HTMLElement, number>()
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true,
    get(this: HTMLElement) { return isViewport(this) ? viewportMetrics.scrollHeight : 0 } })
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true,
    get(this: HTMLElement) { return isViewport(this) ? viewportMetrics.clientHeight : 0 } })
  Object.defineProperty(HTMLElement.prototype, "scrollTop", { configurable: true,
    get(this: HTMLElement) { return isViewport(this) ? scrollTops.get(this) ?? 0 : 0 },
    set(this: HTMLElement, value: number) { if (isViewport(this)) scrollTops.set(this, value) } })
  Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true,
    get(this: HTMLElement) { return (this.dataset.messageId && geometry.get(this.dataset.messageId)?.top) || 0 } })
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true,
    get(this: HTMLElement) { return (this.dataset.messageId && geometry.get(this.dataset.messageId)?.height) || 0 } })
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", { configurable: true,
    value(this: HTMLElement): DOMRect {
      const base = { left: 0, right: 0, width: 0, x: 0, toJSON: () => ({}) }
      if (isViewport(this)) {
        return { ...base, top: 0, bottom: viewportMetrics.clientHeight, height: viewportMetrics.clientHeight, y: 0 } as DOMRect
      }
      const geom = this.dataset.messageId ? geometry.get(this.dataset.messageId) : undefined
      if (!geom) return { ...base, top: 0, bottom: 0, height: 0, y: 0 } as DOMRect
      const viewport = document.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')
      const top = geom.top - (viewport?.scrollTop ?? 0)
      return { ...base, top, bottom: top + geom.height, height: geom.height, y: top } as DOMRect
    } })
})
afterAll(async () => {
  for (const [property, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, property, descriptor)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property]
  }
  await new Promise(resolve => setTimeout(resolve, 20))
  await GlobalRegistrator.unregister()
})
afterEach(() => { geometry.clear(); viewportMetrics = { scrollHeight: 0, clientHeight: 0 } })

const PANE = "issues-roninjin10/e2e-verify"
const paneCard = (ordinal: number, loading?: true): Card => ({
  id: PANE, kind: "issue-list", title: "Issues · roninjin10/e2e-verify", status: "active", createdAt: 1, ordinal,
  viewKey: JSON.stringify(["issues", "roninjin10/e2e-verify", "all", "all", null]), viewRepo: "roninjin10/e2e-verify",
  ...(loading ? { loading } : {}),
  payload: { repo: "roninjin10/e2e-verify", filter: "all", issues: [{ number: 6, kind: "issue",
    title: "Production issue workflow verification 20261015-1835", state: "open", author: "roninjin10",
    comments: 0, updatedAt: "2026-10-15T18:35:00Z" }] }
})
const formCard: Card = { id: "issue-form", kind: "status", status: "active", title: "Create an issue",
  payload: {}, createdAt: 2, ordinal: 40 }

/* Yesterday's saved conversation: the shared turns the private cards are anchored among. */
const turns = Array.from({ length: 6 }, (_, index) => ({
  id: `turn-${index}`, author: 1, authorLogin: "roninjin10", runId: `run-${index}`, sequence: index + 1,
  prompt: `Yesterday's prompt ${index}`, state: "completed", frames: [
    { runId: `run-${index}`, type: "delta", kind: "text", text: `Yesterday's answer ${index}` },
    { runId: `run-${index}`, type: "done", reason: "stop" }
  ]
}))

const viewport = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!
const latestButton = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-slot="message-scroller-button"][data-target="end"]')!

/*
 * Production 20261015 (UI 10a823b3, SUCCESS run 38764661812, signed in as
 * roninjin10 on roninjin10/e2e-verify): ⌘K /issues.create submitted and
 * ⌘K /issues.list both landed on the repository's one pane card, which keeps
 * its retained ordinal and its saved transcript place near the top of a
 * conversation full of yesterday's shared turns. Nothing moved — the view
 * stayed on the composer's form at the bottom, /debug.errors showed no
 * answer either, and the created issue #6 was only found with the browser's
 * own Find, already on screen in the refreshed list, two matches up.
 */
test("a read a person asked for brings its own pane card into view in a saved shared conversation (#3813)", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["agent"], authFlow: "redirect", sandbox: null },
    fetchImpl: async input => Response.json(String(input).endsWith("/view-state") ? {} : { id: "main", entries: turns })
  })
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host)
  try {
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
    await store.dispatch({ type: "card.upsert", actor: "user", card: paneCard(1) }).isPersisted.promise
    await store.dispatch({ type: "card.upsert", actor: "user", card: formCard }).isPersisted.promise
    await controller.sharedConversation!.read()
    viewportMetrics = { scrollHeight: 5200, clientHeight: 640 }
    geometry.set(PANE, { top: 420, height: 300 })
    for (const [index, turn] of turns.entries()) {
      geometry.set(`${turn.id}:prompt`, { top: 720 + index * 680, height: 340 })
      geometry.set(`${turn.id}:answer`, { top: 1060 + index * 680, height: 340 })
    }
    geometry.set("issue-form", { top: 4800, height: 400 })
    flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
    await waitFor(() => host.querySelector(`[data-message-id="${PANE}"]`) !== null && host.textContent?.includes("Yesterday's answer 5") === true)
    // The saved conversation opens at its live edge, the composer's form.
    // The live edge (the composer's form), not the pane card near the top.
    expect(viewport(host).scrollTop).toBeGreaterThanOrEqual(4560)
    // The read a person asked for: the pane card keeps its place and refreshes.
    await store.dispatch({ type: "card.view.loaded", actor: "user", card: paneCard(1) }).isPersisted.promise
    await waitFor(() => viewport(host).scrollTop === 410)
    expect(store.collections.cards.get(PANE)?.ordinal).toBe(1)
    // A passive shared reply afterwards leaves the answer on screen.
    turns.push({ ...turns[0]!, id: "turn-late", runId: "run-late", sequence: 99, prompt: "A teammate's later prompt",
      frames: [{ runId: "run-late", type: "delta", kind: "text", text: "A teammate's later answer" }, { runId: "run-late", type: "done", reason: "stop" }] })
    geometry.set("turn-late:prompt", { top: 5200, height: 340 })
    geometry.set("turn-late:answer", { top: 5540, height: 340 })
    viewportMetrics = { scrollHeight: 5880, clientHeight: 640 }
    await controller.sharedConversation!.read()
    await waitFor(() => host.textContent?.includes("A teammate's later answer") === true)
    expect(viewport(host).scrollTop).toBe(410)
  } finally {
    turns.length = 6
    flushSync(() => root.unmount()); host.remove(); await controller.dispose()
  }
})

/*
 * The receipt persists with the session. A reload is not an ask: the saved
 * reading position is a deliberate mid-transcript anchor, and Latest has to
 * stay the way back to the live edge — a read still believed to be in flight
 * holds the viewport and makes that control inert.
 */
test("a reload restores the saved reading position and keeps Latest reachable (#3813)", async () => {
  const storage = memoryStorage()
  const open = async () => {
    const store = await createAppStore({ kind: "localStorage", storage })
    const controller = createAppController(store, silentAgent, {
      bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["agent"], authFlow: "redirect", sandbox: null },
      fetchImpl: async input => Response.json(String(input).endsWith("/view-state") ? { scroll_anchor: "turn-2:answer" } : { id: "main", entries: turns })
    })
    return { store, controller }
  }
  const first = await open()
  const host = document.createElement("div"); document.body.append(host)
  try {
    await first.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
    await first.store.dispatch({ type: "card.upsert", actor: "user", card: paneCard(1) }).isPersisted.promise
    await first.store.dispatch({ type: "card.upsert", actor: "user", card: formCard }).isPersisted.promise
    await first.store.dispatch({ type: "card.view.loaded", actor: "user", card: paneCard(1) }).isPersisted.promise
    expect(first.store.session().requestedRead?.cardId).toBe(PANE)
    await first.controller.dispose()
    // The same session opens again with that receipt still saved.
    const next = await open()
    await next.controller.sharedConversation!.read()
    expect(next.store.session().requestedRead?.cardId).toBe(PANE)
    viewportMetrics = { scrollHeight: 5200, clientHeight: 640 }
    geometry.set(PANE, { top: 420, height: 300 })
    for (const [index, turn] of turns.entries()) {
      geometry.set(`${turn.id}:prompt`, { top: 720 + index * 680, height: 340 })
      geometry.set(`${turn.id}:answer`, { top: 1060 + index * 680, height: 340 })
    }
    geometry.set("issue-form", { top: 4800, height: 400 })
    const reloaded = document.createElement("div"); document.body.append(reloaded); const root = createRoot(reloaded)
    flushSync(() => root.render(<ControllerTestProvider controller={next.controller}><App /></ControllerTestProvider>))
    try {
      await waitFor(() => reloaded.textContent?.includes("Yesterday's answer 2") === true)
      // The saved anchor, with the restore's own peek — not the read's destination.
      await waitFor(() => viewport(reloaded).scrollTop === 2364)
      expect(latestButton(reloaded).dataset.active).toBe("true")
    } finally { flushSync(() => root.unmount()); reloaded.remove(); await next.controller.dispose() }
  } finally { host.remove() }
})

/*
 * Root's review of this fix, 2026-10-15: the boot generation cannot be a bare
 * revision number, and a read is an ask by ONE person at one place. App stays
 * mounted across a sign-in as somebody else, and a repository pane card id is
 * the repository's and not the account's — so the previous person's read must
 * not replay on the card that now shares its id, and the new person's own
 * reads must still navigate. Two independent things hold here: the identity
 * scrub takes the previous account's cards with it, so their read names
 * nothing; and the read itself carries the account, repository and branch that
 * asked, so it cannot be mistaken for this reader's even if a card survived.
 * The scope is a stated contract and the guard of last resort — the ordinal
 * high-water mark and the account scrub are what a reader notices today — so
 * what is asserted of it here is the record, not a viewport it alone decides.
 */
test("a read belongs to the account, repository and branch that asked (#3813)", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["agent"], authFlow: "redirect", sandbox: null },
    fetchImpl: async input => Response.json(String(input).endsWith("/view-state") ? {} : { id: "main", entries: turns })
  })
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host)
  const scopeNow = () => readScopeOf(store.collections.identitySessions.get("identity"), store.session())
  try {
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
    await store.dispatch({ type: "card.upsert", actor: "user", card: paneCard(1) }).isPersisted.promise
    await store.dispatch({ type: "card.upsert", actor: "user", card: formCard }).isPersisted.promise
    await store.dispatch({ type: "card.view.loaded", actor: "user", card: paneCard(1) }).isPersisted.promise
    const bens = store.session().requestedRead!
    expect(bens).toMatchObject({ cardId: PANE, scope: scopeNow() })

    // Somebody else signs in on this session.
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ada", admin: false, scopesPlain: null }).isPersisted.promise
    // Ben's cards left with his identity, so his read names nothing of hers…
    expect([...store.collections.cards.keys()]).toEqual([])
    // …and the read still says it was his, at his place.
    expect(store.session().requestedRead).toEqual(bens)
    expect(bens.scope).not.toBe(scopeNow())

    // Ada opens the same repository: the pane card id is the repository's.
    await store.dispatch({ type: "card.upsert", actor: "user", card: paneCard(1) }).isPersisted.promise
    await store.dispatch({ type: "card.upsert", actor: "user", card: formCard }).isPersisted.promise
    await controller.sharedConversation!.read()
    viewportMetrics = { scrollHeight: 5200, clientHeight: 640 }
    geometry.set(PANE, { top: 420, height: 300 })
    for (const [index, turn] of turns.entries()) {
      geometry.set(`${turn.id}:prompt`, { top: 720 + index * 680, height: 340 })
      geometry.set(`${turn.id}:answer`, { top: 1060 + index * 680, height: 340 })
    }
    geometry.set("issue-form", { top: 4800, height: 400 })
    flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
    await waitFor(() => host.querySelector(`[data-message-id="${PANE}"]`) !== null && host.textContent?.includes("Yesterday's answer 5") === true)
    const edge = viewport(host).scrollTop
    expect(edge).toBeGreaterThanOrEqual(4560)
    // A passive refresh of that card appends nothing and leaves her at the edge.
    await store.dispatch({ type: "card.upsert", actor: "system", card: paneCard(1) }).isPersisted.promise
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(viewport(host).scrollTop).toBe(edge)
    expect(store.session().requestedRead).toEqual(bens)

    // Her own read, on this very card, navigates and records her scope.
    await store.dispatch({ type: "card.view.loaded", actor: "user", card: paneCard(1) }).isPersisted.promise
    const adas = store.session().requestedRead!
    expect(adas).toMatchObject({ cardId: PANE, scope: scopeNow() })
    expect(adas.scope).not.toBe(bens.scope)
    await waitFor(() => viewport(host).scrollTop === 410)

    /*
     * Moving branch keeps her cards — the scrub is the account's, not the
     * branch's — and appends nothing, so the recorded scope is the only thing
     * saying the read she asked for on main is not a read of this branch. The
     * branch's own view opens at the edge and stays there.
     */
    flushSync(() => latestButton(host).click())
    await waitFor(() => viewport(host).scrollTop >= 4560)
    await store.dispatch({ type: "branch.navigation.changed", actor: "user",
      navigation: { owner: "ada", open: false, selected_branch: "ada/fix-the-read", nodes: [] } }).isPersisted.promise
    expect(store.session().requestedRead).toEqual(adas)
    expect(adas.scope).not.toBe(scopeNow())
    await store.dispatch({ type: "card.upsert", actor: "system", card: paneCard(1) }).isPersisted.promise
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(viewport(host).scrollTop).toBeGreaterThanOrEqual(4560)
  } finally { flushSync(() => root.unmount()); host.remove(); await controller.dispose() }
})
