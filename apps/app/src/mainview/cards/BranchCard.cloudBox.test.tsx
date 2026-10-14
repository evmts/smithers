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
}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, {
    bootstrap: options.bootstrap ?? HOSTED,
    toastDebounceMs: 0,
    live: { subscribe: () => () => {}, getSnapshot: (topic: string) => topic === `branch:${BOX}` ? options.snapshot : undefined },
    fetchImpl: async () => json(404, { code: "not_found", message: "no stub" })
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "roninjin10", expiresAt: null, scopes: null }).isPersisted.promise
  if (options.workspace !== undefined) await store.dispatch({ type: "workspace.updated", actor: "system", workspace: options.workspace }).isPersisted.promise
  await store.dispatch({ type: "card.upsert", actor: "user", card }).isPersisted.promise
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

  /* No row, no topic: the card invents no box. */
  const empty = await mounted({})
  try { expect(empty.host.textContent).toBe("") } finally { await empty.dispose() }

  /* An install serves its own branch topic; a stray cloud row never stands in for it. */
  const install = await mounted({ workspace: box(), bootstrap: INSTALL })
  try { expect(install.host.textContent).toBe("") } finally { await install.dispose() }
})
