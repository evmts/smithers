/*
 * #3865, the second half of the journey: what the box card the hosted form
 * created actually renders.
 *
 * Once `workspace-open` reached Smithers Cloud, Submit created a box and its
 * card. On the hosted app (`cloud`, design FIXTURE off, no `install`) the body
 * rendered NOTHING: `branch:<id>` is an install live topic, so the card showed
 * its heading and no state, no stage and no failure — while the seam's own
 * sentence promises "the card tracks it". The row the seam already holds is
 * what it tracks.
 *
 * The live projection stays authoritative wherever it is served; this is the
 * fallback under it, and it binds no act the controller does not compose.
 */
import { act } from "react"
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { TopicSnapshot } from "../runtime/LiveChannel"
import type { Card, CloudWorkspaceInput } from "../state/AppState"
import { createAppStore } from "../state/AppStore"
import { createAppController } from "../state/AppController"
import { json, memoryStorage, unavailableAgent } from "../state/TestFixtures"
import { ControllerTestProvider } from "../ControllerContext"
import { CARD_RENDERERS } from "./CardRenderers"
import { createRoot } from "./views/testDom"

const REPO = "roninjin10/e2e-verify"
const BOX = "0b0c0d0e-0000-4000-8000-000000003865"

/** What https://smithers.sh/api/bootstrap answered on 2026-10-14. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.5", buildSha: "c6c360ddca963cf23c13c3e512e554f0a7af2dbf",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
    "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}
const INSTALL: AppBootstrap = { ...HOSTED, capabilities: [...HOSTED.capabilities, "install"] }

const box = (overrides: Partial<CloudWorkspaceInput> = {}): CloudWorkspaceInput => ({
  id: BOX, repoId: REPO, name: "main", status: "starting", targetBookmark: "main",
  provisioningStage: null, suspendedAt: null, createdAt: "2026-10-14T00:17:00Z", kind: "vm", ...overrides
})
const card: Extract<Card, { kind: "branch" }> = {
  id: `branch:${BOX}`, kind: "branch", title: "main", status: "active", createdAt: 1, ordinal: 1, payload: { id: BOX }
}
const actions = { onDecideApproval: () => {}, onConnectGitHub: () => {}, onRunWorkflow: () => {}, onStopRun: () => {},
  onRetryRun: () => {}, onChooseWorkflowRepo: () => {}, worldDocuments: [], onChangeWorldDocument: () => {}, onRunCommand: () => {} }

const mounted = async (options: {
  readonly workspace?: CloudWorkspaceInput
  readonly bootstrap?: AppBootstrap
  readonly snapshot?: TopicSnapshot
  /** The box list the app read after the card was saved, the production order. */
  readonly listed?: ReadonlyArray<CloudWorkspaceInput>
  readonly listing?: { readonly error?: string }
  /** The wire, where a test drives the real seam instead of dispatching a list result. */
  readonly fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, {
    bootstrap: options.bootstrap ?? HOSTED,
    toastDebounceMs: 0,
    live: { subscribe: () => () => {}, getSnapshot: (topic: string) => topic === `branch:${BOX}` ? options.snapshot : undefined },
    fetchImpl: options.fetchImpl ?? (async () => json(404, { code: "not_found", message: "no stub" }))
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "roninjin10", expiresAt: null, scopes: null }).isPersisted.promise
  if (options.workspace !== undefined) await store.dispatch({ type: "workspace.updated", actor: "system", workspace: options.workspace }).isPersisted.promise
  await store.dispatch({ type: "card.upsert", actor: "user", card }).isPersisted.promise
  if (options.listed !== undefined) {
    await store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO, workspaces: [...options.listed] }).isPersisted.promise
  }
  if (options.listing !== undefined) {
    await store.dispatch({ type: "workspaces.list.started", actor: "system", requestId: "refresh", repoId: REPO }).isPersisted.promise
    if (options.listing.error !== undefined) {
      await store.dispatch({ type: "workspaces.list.failed", actor: "system", requestId: "refresh", repoId: REPO, error: options.listing.error }).isPersisted.promise
    }
  }
  const host = document.body.appendChild(document.createElement("div"))
  const root = createRoot(host)
  await act(async () => root.render(<ControllerTestProvider controller={controller}>{CARD_RENDERERS.branch.render(card, actions as never)}</ControllerTestProvider>))
  return { host, controller, dispose: async () => {
    await act(async () => root.unmount())
    host.remove()
    await controller.dispose()
  } }
}

test("the hosted box card shows the box the form created, its bookmark and its stage", async () => {
  const h = await mounted({ workspace: box({ provisioningStage: "image" }) })
  try {
    expect(h.controller.design.enabled).toBe(false)
    const view = h.host.querySelector('[data-kind="branch"]')
    expect(view).not.toBeNull()
    expect(view?.getAttribute("data-machine")).toBe("waking")
    expect(h.host.textContent).toContain("Waking")
    expect(h.host.textContent).toContain("main")
    /* Facts only: the fallback binds no act the live projection would compose. */
    expect(h.host.querySelector("[data-flow]")).toBeNull()
  } finally { await h.dispose() }
})

test("a running box reads awake and a failed one carries Smithers Cloud's own words", async () => {
  const running = await mounted({ workspace: box({ status: "running" }) })
  try {
    expect(running.host.querySelector('[data-kind="branch"]')?.getAttribute("data-machine")).toBe("awake")
  } finally { await running.dispose() }

  const failed = await mounted({ workspace: box({ status: "failed",
    failureCode: "no_environment_image", failureMessage: "no NixOS environment image is registered for kind vm" }) })
  try {
    expect(failed.host.querySelector('[data-kind="branch"]')?.getAttribute("data-machine")).toBe("failed")
    expect(failed.host.querySelector('[aria-label="Failure details"]')?.textContent)
      .toContain("no NixOS environment image is registered for kind vm")
  } finally { await failed.dispose() }
})

test("the live projection stays authoritative, and a card with no box of its own renders nothing", async () => {
  /* Where `branch:<id>` IS served, its facts win over the row. */
  const live = await mounted({ workspace: box({ status: "starting" }), snapshot: { topic: `branch:${BOX}`, cursor: 1,
    data: { id: BOX, name: "Served branch", machine: { state: "asleep" }, presence: [], terminals: [], ssh_line: "ssh -p 2222 box@cloud" } } })
  try {
    expect(live.host.querySelector('[data-kind="branch"]')?.getAttribute("data-machine")).toBe("asleep")
    expect(live.host.textContent).toContain("Served branch")
  } finally { await live.dispose() }

  /*
   * No row and no topic: the card invents no box — and says which stage it is
   * in rather than rendering a heading with no body (#3882). Nothing has read
   * the box list yet, so this is pending, not absence.
   */
  const empty = await mounted({})
  try {
    const view = empty.host.querySelector('[data-kind="branch"]')
    expect(view?.getAttribute("data-branch-stage")).toBe("loading")
    expect(view?.getAttribute("data-machine")).toBe("unknown")
    expect(empty.host.textContent).toContain("Loading this box.")
    expect(empty.host.querySelector("[data-flow]")).toBeNull()
  } finally { await empty.dispose() }

  /* An install serves its own branch topic; a stray cloud row never stands in for it. */
  const install = await mounted({ workspace: box(), bootstrap: INSTALL })
  try {
    const view = install.host.querySelector('[data-kind="branch"]')
    expect(view?.getAttribute("data-branch-source")).toBe("live-topic")
    expect(view?.getAttribute("data-branch-stage")).toBe("loading")
    /* The stray row's own state is not this card's state. */
    expect(install.host.textContent).not.toContain("Waking")
  } finally { await install.dispose() }
})

/*
 * The actual acceptance failure root's native Arc retest reported after 02a
 * deployed: a card SAVED beside its box, whose row a later box list pruned.
 * `workspaces.loaded` deletes every row its list did not name; both
 * collections are persisted, so the card outlives the row across every reload
 * and `CloudBoxBody` had nothing to find. The synthetic fixture above held a
 * row and so never reached it (#3882).
 */
test("a box list that no longer names the box leaves the card a stage, never an empty body", async () => {
  const h = await mounted({ workspace: box({ status: "running" }), listed: [] })
  try {
    expect(h.controller.store.collections.cloudWorkspaces.get(BOX)).toBeUndefined()
    expect(h.controller.store.collections.cards.get(`branch:${BOX}`)).not.toBeUndefined()
    const view = h.host.querySelector('[data-kind="branch"]')
    expect(view).not.toBeNull()
    expect(view?.getAttribute("data-branch-stage")).toBe("absent")
    expect(view?.getAttribute("data-branch-source")).toBe("cloud-row")
    /* The box it names, for the retest that reads it. */
    expect(view?.getAttribute("data-branch-id")).toBe(BOX)
    expect(h.host.textContent).toContain("This box is not available.")
    expect(h.host.textContent).toContain(BOX)
    expect(h.host.textContent).toContain("Not available")
    /* No invented machine state and no act. */
    expect(view?.getAttribute("data-machine")).toBe("unknown")
    expect(h.host.querySelector("[data-flow]")).toBeNull()
  } finally { await h.dispose() }
})

test("a list still in flight reads pending, and a failed read carries its own words", async () => {
  const loading = await mounted({ listed: [], listing: {} })
  try {
    expect(loading.host.querySelector('[data-kind="branch"]')?.getAttribute("data-branch-stage")).toBe("loading")
    expect(loading.host.textContent).toContain("Loading this box.")
  } finally { await loading.dispose() }

  const failed = await mounted({ listed: [], listing: { error: "Box inventory is unavailable" } })
  try {
    expect(failed.host.querySelector('[data-kind="branch"]')?.getAttribute("data-branch-stage")).toBe("failed")
    expect(failed.host.textContent).toContain("Box inventory is unavailable")
  } finally { await failed.dispose() }
})

test("a pruned row restores the card the moment the box is listed again", async () => {
  const h = await mounted({ workspace: box({ status: "running" }), listed: [] })
  try {
    expect(h.host.querySelector('[data-kind="branch"]')?.getAttribute("data-branch-stage")).toBe("absent")
    await act(async () => {
      await h.controller.store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO,
        workspaces: [box({ status: "running" })] }).isPersisted.promise
    })
    const view = h.host.querySelector('[data-kind="branch"]')
    expect(view?.getAttribute("data-branch-stage")).toBeNull()
    expect(view?.getAttribute("data-machine")).toBe("awake")
  } finally { await h.dispose() }
})

/*
 * Root's own shape, which no fixture above reached: the card and its box were
 * SAVED, and the app was opened again. Both collections are persisted, so a
 * reopened session finds the row and the card renders the box — and it is the
 * NEW session's first box list, not the save, that takes the row away. A
 * fresh-store fixture proved the renderer; only a reopen proves the saved card
 * a native retest actually loads (#3882).
 */
test("a saved card renders its box after the app is opened again, and the next list leaves it a stage", async () => {
  const storage = memoryStorage()
  const saved = await createAppStore({ kind: "localStorage", storage })
  await saved.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await saved.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "roninjin10", expiresAt: null, scopes: null }).isPersisted.promise
  await saved.dispatch({ type: "workspace.updated", actor: "system", workspace: box({ status: "running" }) }).isPersisted.promise
  await saved.dispatch({ type: "card.upsert", actor: "user", card }).isPersisted.promise
  await saved.dispose?.()

  const store = await createAppStore({ kind: "localStorage", storage })
  const controller = createAppController(store, unavailableAgent, {
    bootstrap: HOSTED,
    toastDebounceMs: 0,
    live: { subscribe: () => () => {}, getSnapshot: () => undefined },
    fetchImpl: async () => json(404, { code: "not_found", message: "no stub" })
  })
  const host = document.body.appendChild(document.createElement("div"))
  const root = createRoot(host)
  try {
    /* The reopened session holds both rows, and the card finds its own. */
    expect(store.collections.cards.get(`branch:${BOX}`)?.payload).toEqual({ id: BOX })
    expect(store.collections.cloudWorkspaces.get(BOX)?.status).toBe("running")
    await act(async () => root.render(<ControllerTestProvider controller={controller}>{CARD_RENDERERS.branch.render(card, actions as never)}</ControllerTestProvider>))
    expect(host.querySelector('[data-kind="branch"]')?.getAttribute("data-machine")).toBe("awake")
    expect(host.querySelector("[data-branch-stage]")).toBeNull()

    /* The first list of the new session no longer names it. */
    await act(async () => {
      await store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO, workspaces: [] }).isPersisted.promise
    })
    const view = host.querySelector('[data-kind="branch"]')
    expect(view?.getAttribute("data-branch-stage")).toBe("absent")
    expect(view?.getAttribute("data-branch-source")).toBe("cloud-row")
    expect(view?.getAttribute("data-branch-id")).toBe(BOX)
    expect(view?.getAttribute("data-machine")).toBe("unknown")
    expect(host.textContent).toContain("This box is not available.")
    /* The card itself is kept: a box one list omitted can be listed again. */
    expect(store.collections.cards.get(`branch:${BOX}`)).not.toBeUndefined()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    await controller.dispose()
    await store.dispose?.()
  }
})

/*
 * #3882 end to end, on the shape production actually has: the card and its row
 * are saved, and then the real seam runs a real list against a wire that
 * behaves the way the hosted deployment behaves — the owner-scoped list names
 * NOTHING (a branch machine's row belongs to `smithers-machines`), while the
 * box's own detail route serves it.
 *
 * Before the repair the list's silence deleted the row and this card read
 * "This box is not available." about a box that was provisioning. The whole
 * point is that it now reads the box's own state, and it is asserted here
 * through the seam and the renderer together rather than from a dispatched
 * fixture.
 */
test("a box no list can name still reads its own state, through the real list", async () => {
  const asked: Array<string> = []
  const h = await mounted({
    workspace: box({ status: "starting", provisioningStage: null }),
    fetchImpl: async (input) => {
      const url = String(typeof input === "string" || input instanceof URL ? input : input.url)
      const path = url.replace(/^.*\/api\//, "api/").split("?")[0]
      asked.push(path)
      /* Owner-scoped: this person's lists cannot name a machine-owned box. */
      if (path === "api/user/workspaces") return json(200, [])
      if (path === `api/repos/${REPO}/workspaces`) return json(200, [])
      /* Repository-read scoped, and the box is still coming up. */
      if (path === `api/repos/${REPO}/workspaces/${BOX}`) {
        return json(200, { id: BOX, name: "main", status: "starting", target_bookmark: "main",
          provisioning_stage: "waiting_for_machine", kind: "vm", created_at: "2026-10-14T00:17:00Z" })
      }
      return json(404, { code: "not_found", message: "no stub" })
    }
  })
  try {
    await act(async () => { await h.controller.listWorkspaces(REPO) })
    expect(asked).toContain(`api/repos/${REPO}/workspaces/${BOX}`)
    /* The row survived the silence, carrying the facts the box itself answered. */
    expect(h.controller.store.collections.cloudWorkspaces.get(BOX))
      .toMatchObject({ id: BOX, repoId: REPO, status: "starting", provisioningStage: "waiting_for_machine" })
    const view = h.host.querySelector('[data-kind="branch"]')
    expect(view?.getAttribute("data-machine")).toBe("waking")
    expect(h.host.textContent).toContain("Waking")
    expect(h.host.textContent).not.toContain("This box is not available.")
  } finally { await h.dispose() }
})
