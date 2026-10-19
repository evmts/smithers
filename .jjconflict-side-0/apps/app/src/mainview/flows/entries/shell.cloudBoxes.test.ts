/*
 * #3865. The hosted app's cloud box doors, on the bootstrap production
 * actually serves.
 *
 * The person's journey (roninjin10/e2e-verify, 2026-10-14): open a Smithers
 * Cloud issue, choose Issue flows, fill the box prerequisite form — bookmark
 * `main`, kind `vm` — and Submit. https://smithers.sh/api/bootstrap serves
 * `cloud` with the design FIXTURE off, so gating `workspace-open` on the
 * fixture answered that Submit "Branch unavailable" before `openWorkspace`'s
 * own cloud sign-in and scope fences ran, and no box was ever requested.
 *
 * The doors are the retired `box.open`/`box.list`, whose declaration was
 * `runtime: ["cloud"]`; the capability is the door, and the fences below it
 * stay exactly where they were.
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { flowArgs } from "../FlowArgs"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, unavailableAgent, waitFor } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"
const BOX = "0b0c0d0e-0000-4000-8000-000000003865"
const FORM = "form-box.open"

/** What https://smithers.sh/api/bootstrap answered on 2026-10-14, verbatim. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.5", buildSha: "c6c360ddca963cf23c13c3e512e554f0a7af2dbf",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
    "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}
/** The same origin with the boxes turned off, and the single-owner install. */
const WITHOUT_CLOUD: AppBootstrap = { ...HOSTED, capabilities: HOSTED.capabilities.filter(capability => capability !== "cloud") }
const INSTALL: AppBootstrap = { ...HOSTED, capabilities: [...HOSTED.capabilities, "install"] }

const boxWire = () => ({
  id: BOX, repository_id: 7, repo_full_name: REPO, name: "overnight", slug: "overnight", target_bookmark: "main",
  status: "starting", provisioning_stage: null, suspended_at: null, created_at: "2026-10-14T00:17:00Z"
})

const hosted = async (options: {
  readonly bootstrap?: AppBootstrap
  readonly cloud?: "signed-in" | "signed-out"
  readonly create?: () => Response
} = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const writes: Array<{ readonly path: string; readonly body: unknown }> = []
  const controller = createAppController(store, unavailableAgent, {
    bootstrap: options.bootstrap ?? HOSTED,
    toastDebounceMs: 0,
    live: { subscribe: () => () => {}, getSnapshot: () => undefined },
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "https://smithers.sh").pathname
      const method = init?.method ?? "GET"
      if (method !== "GET") writes.push({ path, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
      if (method === "POST" && path === `/api/repos/${REPO}/workspaces`) return (options.create ?? (() => json(201, boxWire())))()
      if (path === `/api/repos/${REPO}/bookmarks`) return json(200, { items: [{ name: "main" }], next_cursor: "" })
      if (path === `/api/repos/${REPO}/workspaces`) return json(200, [])
      return json(404, { code: "not_found", message: `no stub for ${method} ${path}` })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  if (options.cloud !== "signed-out") {
    await store.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "roninjin10", expiresAt: null, scopes: null }).isPersisted.promise
  }
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  await store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO, workspaces: [] }).isPersisted.promise
  /* The card the person has open: a Smithers Cloud issue they created with /issues.create. */
  await store.dispatch({ type: "card.upsert", actor: "user", card: {
    id: "issue-5", kind: "issue", title: "Overnight-browser-20261014-0017", status: "active", createdAt: 1, ordinal: 1,
    payload: { repo: REPO, number: 5, title: "Overnight-browser-20261014-0017", source: "smithers-cloud",
      state: "open", author: "roninjin10", issueBody: "Reproduction", labels: [], comments: [] }
  } }).isPersisted.promise
  /* Production shape: the host serves the boxes, the seeded design world is off. */
  expect(controller.design.enabled).toBe(false)
  return { store, controller, writes, creates: () => writes.filter(write => write.path === `/api/repos/${REPO}/workspaces`) }
}

const submitBox = (h: Awaited<ReturnType<typeof hosted>>, payload: Record<string, unknown> = {}) =>
  h.controller.submitCommand({ name: "branch", payload: { operation: "workspace-open", repo: REPO, bookmark: "main", kind: "vm", ...payload }, actor: "user" })

test("the hosted issue card's box prerequisite form opens a real box on the chosen bookmark and kind", async () => {
  const h = await hosted()
  try {
    /* Issue flows needs a box, so it renders the form and reaches no backend. */
    const asked = await h.controller.runCommandForResult("issue.flows", flowArgs("issue.flows", { number: 5, repo: REPO }))
    expect(asked).toMatchObject({ status: "executed", value: expect.stringContaining("rendered a form for") })
    expect(h.store.collections.cards.get(FORM)).toMatchObject({ kind: "flow-form", payload: { flow: "branch", via: "user", given: { repo: REPO, operation: "workspace-open" } } })
    expect(h.creates()).toEqual([])

    expect((await h.controller.runCommandForResult("form.set", `${FORM} bookmark main`)).status).toBe("executed")
    expect((await h.controller.runCommandForResult("form.set", `${FORM} kind vm`)).status).toBe("executed")
    expect((await h.controller.runCommandForResult("form.submit", FORM)).status).toBe("executed")
    await waitFor(() => h.creates().length > 0)
    expect(h.creates()).toEqual([{ path: `/api/repos/${REPO}/workspaces`, body: { source_bookmark: "main", kind: "vm" } }])
    /* The box the backend answered with is on its own card, and coding runs now target it. */
    await waitFor(() => h.store.collections.cards.get(`branch:${BOX}`) !== undefined)
    expect(h.store.session().activeRepoKey).toBe(`${REPO}#workspace:${BOX}`)
  } finally { await h.controller.dispose() }
})

test("the same submission on the backing flow reaches Smithers Cloud once, and a provisioning refusal reads as the backend wrote it", async () => {
  const opened = await hosted()
  try {
    expect(await submitBox(opened)).toMatchObject({ status: "executed" })
    expect(opened.creates()).toEqual([{ path: `/api/repos/${REPO}/workspaces`, body: { source_bookmark: "main", kind: "vm" } }])
  } finally { await opened.controller.dispose() }

  /* A real provisioning failure is the backend's own sentence, never "Branch unavailable". */
  const refused = await hosted({ create: () => json(409, { code: "no_environment_image", message: "no NixOS environment image is registered for kind vm" }) })
  try {
    const answer = await submitBox(refused)
    expect(answer.status).toBe("failed")
    if (answer.status === "failed") {
      expect(answer.error).toContain("no NixOS environment image is registered for kind vm")
      expect(answer.error).not.toBe("Branch unavailable")
    }
    expect(refused.creates()).toHaveLength(1)
  } finally { await refused.controller.dispose() }
})

test("the fences under the door keep their own answers and admit no box", async () => {
  /* The origin that serves no boxes says so, and asks Smithers Cloud for nothing. */
  for (const bootstrap of [WITHOUT_CLOUD, INSTALL]) {
    const h = await hosted({ bootstrap })
    try {
      expect(await submitBox(h)).toMatchObject({ status: "failed", error: "Branch unavailable" })
      expect(h.creates()).toEqual([])
    } finally { await h.controller.dispose() }
  }

  /* Signed in to GitHub but not to Smithers Cloud: the seam's own fence answers. */
  const unauthorized = await hosted({ cloud: "signed-out" })
  try {
    const answer = await submitBox(unauthorized)
    expect(answer.status).toBe("failed")
    if (answer.status === "failed") expect(answer.error).toContain("Sign in to Smithers Cloud")
    expect(unauthorized.creates()).toEqual([])
  } finally { await unauthorized.controller.dispose() }
})

test("a saved box.list action lists this host's boxes, and an install lists its branches", async () => {
  const h = await hosted()
  try {
    expect((await h.controller.runCommandForResult("branches", JSON.stringify({ repo: REPO, operation: "workspace" }))).status).toBe("executed")
    expect([...h.store.collections.messages.values()].some(message => message.text.includes("No boxes on"))).toBe(true)
  } finally { await h.controller.dispose() }

  const install = await hosted({ bootstrap: INSTALL })
  try {
    await install.controller.runCommandForResult("branches", JSON.stringify({ repo: REPO, operation: "workspace" }))
    expect([...install.store.collections.messages.values()].some(message => message.text.includes("No boxes on"))).toBe(false)
  } finally { await install.controller.dispose() }
})
