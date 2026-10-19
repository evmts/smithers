/*
 * The recorded first-run repository doors — `repo.choose` and `repo.create` —
 * against the bootstrap each origin actually serves.
 *
 * Live defect this pins: on the hosted origin (no `install` row), typing
 * `/repo.choose` appended a card titled "Set up Smithers" WITH AN EMPTY BODY
 * and nothing else — no loading, no error, no retry, no control. The handler
 * presented the install Setup card before asking whether this host has an
 * install at all, and `GET /api/install` answers 404 there, which
 * `quietWithoutInstall` retires without a word (state/seams/InstallSeam.ts).
 * `cards/SetupCard.tsx` renders nothing without a model, so the title was the
 * whole answer.
 *
 * The install setup routes are a declared host capability — "this origin
 * serves the single-owner install setup routes", emitted from
 * `features.install && !features.role.hosted()`
 * (packages/backend/internal/compose/bootstrap.go) — so these two doors
 * declare it as their runtime. An origin without it answers at the
 * registry/dispatch boundary with the catalog's own sentence
 * (`flows/Commands.explainAbsent`), and the card is presented by the install
 * seam's own `present`, only once an install model exists.
 */
import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, settle, unavailableAgent } from "../../state/TestFixtures"
import { installFixture } from "../../state/seams/InstallFixtures.test-support"
import { SetupCard } from "../../cards/SetupCard"
import { SetupView } from "../../cards/views/SetupView"
import { CardView } from "../../ChatCards"
import { ControllerTestProvider } from "../../ControllerContext"
import type { Card } from "@smthrs/rpc/Cards"

const REPO = "roninjin10/e2e-verify"
const DOORS = ["repo.choose", "repo.create"] as const

/** What production's hosted backend serves (public4b1d): every cloud row, and no `install`. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.9", buildSha: "test",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select", "cloud"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}
/** What a single-owner install serves: the `install` row is the setup routes' own mount condition. */
const INSTALL: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.9", buildSha: "test",
  capabilities: ["identity", "install", "agent", "model.turn"],
  authFlow: "redirect", sandbox: null
}

const mount = async (bootstrap: AppBootstrap, install: () => Response) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  const services: AppServices = {
    bootstrap, toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`)
      if (url.pathname === "/api/install") return install()
      return json(404, { status: "error", code: "not_found", message: `no stub for ${url.pathname}` })
    }
  }
  const controller = createAppController(store, unavailableAgent, services)
  return { store, controller, calls }
}

const signIn = (store: Awaited<ReturnType<typeof mount>>["store"]) =>
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise

/** The shipped card body, mounted over the controller's live install snapshots. */
const body = (controller: Awaited<ReturnType<typeof mount>>["controller"]) =>
  renderToStaticMarkup(createElement(SetupCard, {
    View: SetupView, install: controller.installSnapshots, dispatch: () => {}, allowed: true,
    view: { maximized: false }, onView: () => {}
  }))

const selectRepo = async (store: Awaited<ReturnType<typeof mount>>["store"]) => {
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
}

/** The transcript's own shell and body for one saved card: title, status and whatever the family renders. */
const SHELL = { maximized: false, onDecideApproval: () => {}, onMaximize: () => {}, onMinimize: () => {},
  onConnectGitHub: () => {}, onRunWorkflow: () => {}, onStopRun: () => {}, onRetryRun: () => {},
  onChooseWorkflowRepo: () => {}, worldDocuments: [], onChangeWorldDocument: () => {}, onRunCommand: () => {} }
const shell = (controller: Awaited<ReturnType<typeof mount>>["controller"], card: Card) =>
  renderToStaticMarkup(createElement(ControllerTestProvider, { controller,
    children: createElement(CardView, { card, ...SHELL }) }))

const said = (store: Awaited<ReturnType<typeof mount>>["store"]) =>
  [...store.collections.toasts.values()].map(toast => `${toast.title} ${toast.detail}`)

test("the hosted origin answers the setup doors at the dispatch boundary instead of an empty card", async () => {
  const h = await mount(HOSTED, () => json(404, { status: "error", code: "not_found", message: "no install" }))
  try {
    await signIn(h.store)
    await selectRepo(h.store)
    h.calls.length = 0
    for (const name of DOORS) {
      const outcome = await h.controller.runCommandForResult(name)
      // The refusal names the doors that DO work here, and never the Mac install's own instructions.
      expect(outcome, name).toMatchObject({ status: "unavailable", door: "origin",
        reason: `/${name} is the install's own Setup, which this origin does not serve. Pick a repository in the repository menu, or run /repos.import owner/repo.` })
      await settle()
      // No title-only card: the body a `setup` card would render here is empty.
      expect(h.store.collections.cards.has("setup"), name).toBe(false)
    }
    // Nothing was appended; a Setup card that IS in someone's saved history reads honestly instead of blank.
    expect(body(h.controller)).toContain("No install on this host")
    // And it points at the doors that DO add a repository here, in the refusal's own words.
    expect(body(h.controller)).toContain("Pick a repository in the repository menu, or run /repos.import owner/repo.")
    // The sentence reached the person, once per door, and names no transport detail.
    for (const name of DOORS) expect(said(h.store).some(line => line.includes(`/${name} is the install's own Setup`) && line.includes("/repos.import owner/repo")), name).toBe(true)
    for (const line of said(h.store)) expect(line).not.toMatch(/\bMac\b|localhost|127\.0\.0\.1|GitHub App/)
    for (const line of said(h.store)) expect(line).not.toMatch(/https?:\/\/|\/api\/|authorization|bearer|cookie|token/i)
    // A door this origin never mounted is never read for: no install request left the page.
    expect(h.calls.filter(call => call.includes("/api/install"))).toEqual([])
  } finally { await h.controller.dispose() }
})

test("an install serves the setup doors: the card carries the install's own steps", async () => {
  const h = await mount(INSTALL, () => Response.json(installFixture()))
  try {
    await signIn(h.store)
    await settle()
    // The install host's own read after sign-in opens no card of its own: this install has nothing left to do.
    expect(h.store.collections.cards.has("setup")).toBe(false)
    expect(await h.controller.runCommandForResult("repo.choose")).toMatchObject({ status: "executed" })
    await settle()
    expect(h.store.collections.cards.get("setup")?.kind).toBe("setup")
    const markup = body(h.controller)
    expect(markup).toContain('data-kind="setup"')
    expect(markup).toContain("Repository")
    expect(h.calls.filter(call => call === "GET /api/install").length).toBeGreaterThan(0)
  } finally { await h.controller.dispose() }
})

test("setup stays reachable before the owner signs in", async () => {
  const model = installFixture()
  model.github = { signed_in: false, app_installed: false }
  model.steps = model.steps.map(step => ({ id: step.id, state: "pending" })) as typeof model.steps
  const h = await mount(INSTALL, () => Response.json(model))
  try {
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
    expect(await h.controller.runCommandForResult("repo.create")).toMatchObject({ status: "executed" })
    await settle()
    expect(h.store.collections.cards.get("setup")?.kind).toBe("setup")
    expect(body(h.controller)).toContain('data-step="sign_in"')
  } finally { await h.controller.dispose() }
})

test("an install whose setup read fails states the failure instead of an empty card", async () => {
  const h = await mount(INSTALL, () => json(503, { code: "unreachable", class: "infra", message: "db down at 10.1.2.3:5432" }))
  try {
    await signIn(h.store)
    expect(await h.controller.runCommandForResult("repo.choose")).toMatchObject({ status: "executed" })
    await settle()
    // No card stands in for an install this page never read.
    expect(h.store.collections.cards.has("setup")).toBe(false)
    expect(body(h.controller)).toContain("Could not reach this install")
    // An install that IS mounted and unreachable is not sent to another door: the read is what failed.
    expect(body(h.controller)).not.toContain("Pick a repository in the repository menu")
    expect(said(h.store).join(" ")).toContain("Could not reach this install")
    for (const line of said(h.store)) expect(line).not.toMatch(/https?:\/\/|\/api\/|10\.1\.2\.3|authorization|bearer|cookie|token/i)
  } finally { await h.controller.dispose() }
})


test("a Setup card saved from an install reads honestly on an origin with no install", async () => {
  const h = await mount(HOSTED, () => json(404, { status: "error", code: "not_found", message: "no install" }))
  try {
    await signIn(h.store)
    /*
     * The card this defect already left in production's saved history. It is
     * the person's own transcript: it is never deleted or rewritten, so the
     * next ordinary reload has to render it honestly.
     */
    const card: Card = { id: "setup", kind: "setup", title: "Set up Smithers", status: "active", createdAt: 1, ordinal: 1, payload: {} }
    await h.store.dispatch({ type: "card.upsert", actor: "user", card }).isPersisted.promise
    const markup = shell(h.controller, card)
    expect(markup).toContain("Set up Smithers")
    expect(markup).toContain("No install on this host")
    expect(markup).toContain("Pick a repository in the repository menu, or run /repos.import owner/repo.")
    // Honest, and not the Mac install's steps on an origin that has no Mac.
    expect(markup).not.toContain("This Mac only")
    expect(markup).not.toContain("Create GitHub App")
    expect(markup).not.toContain("/api/")
  } finally { await h.controller.dispose() }
})
