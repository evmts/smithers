/*
 * #3879. The canonical `/issue` and `/issues` on the bootstrap production
 * actually serves.
 *
 * The person's journey (roninjin10/e2e-verify, 2026-10-14): the Commands card
 * offers `/issue` and `/issues` to a hosted Cloud user whose repository holds
 * Smithers Cloud issue #5 `Overnight-browser-20261014-0017`.
 * `/issues.view 5 roninjin10/e2e-verify` opened it, while `/issue 5` answered
 * "No issue #5" and `/issues` opened an empty mock list: both handlers read
 * the seeded design world unless the host holds `install`, and
 * https://smithers.sh/api/bootstrap serves `cloud` with the design FIXTURE
 * off.
 *
 * The doors are the ones `issues.view` and `issues.list` already declare in
 * `runtimeAny` — `cloud` and `install`, never the fixture — and the seam
 * fences below them stay exactly where they were. Same class as #3865.
 */
import { expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { AppServices } from "../../state/AppController"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { json, memoryStorage, unavailableAgent } from "../../state/TestFixtures"

const REPO = "roninjin10/e2e-verify"
const TITLE = "Overnight-browser-20261014-0017"

/** What https://smithers.sh/api/bootstrap answered on 2026-10-14, verbatim. */
const HOSTED: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "1.0.0-rc.5", buildSha: "c6c360ddca963cf23c13c3e512e554f0a7af2dbf",
  capabilities: ["identity", "agent", "chat.archive", "github", "model.turn", "recommend", "commands.select",
    "cloud", "cloud.terminal", "billing.balance", "billing.overview", "billing.plans", "billing.portal", "billing.checkout"],
  authFlow: "redirect", sandbox: { platform: "linux", mode: "enforced" }
}
/** The same origin with the Cloud issues turned off, and the single-owner install. */
const WITHOUT_CLOUD: AppBootstrap = { ...HOSTED, capabilities: HOSTED.capabilities.filter(capability => capability !== "cloud") }
const INSTALL: AppBootstrap = { ...HOSTED, capabilities: [...HOSTED.capabilities, "install"] }

/** The Cloud issue root of the repository the person is watching. */
const ISSUES = `/api/repos/roninjin10/e2e-verify/issues`

/* Plue's issue and comment wire shapes (multi src/smithersCloud/issues.ts). */
const cloudIssue = {
  id: 500, number: 5, title: TITLE, body: "Reproduction", state: "open", kind: "issue", visibility: "public",
  labels: [], assignees: [], author: { id: 8, login: "roninjin10" }, milestone_id: null, comment_count: 1,
  created_at: "2026-10-14T00:17:00Z", updated_at: "2026-10-14T00:20:00Z", closed_at: null
}
const cloudComment = {
  id: 9, issue_id: 500, user_id: 8, commenter: "roninjin10", body: "Still reproducing", type: "comment",
  created_at: "2026-10-14T00:19:00Z", updated_at: "2026-10-14T00:19:00Z"
}

/** The install's own issue door (GET /api/issues/{n}), GitHub's wire. */
const installIssue = {
  issue: { number: 5, title: TITLE, body: "Reproduction", state: "open", user: { login: "roninjin10" }, labels: [], comments: 0 },
  comments: []
}

const hosted = async (options: { readonly bootstrap?: AppBootstrap | undefined; readonly routes?: Record<string, unknown> } = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  const routes = options.routes ?? {}
  const services: AppServices = {
    ...("bootstrap" in options && options.bootstrap === undefined ? {} : { bootstrap: options.bootstrap ?? HOSTED }),
    toastDebounceMs: 0,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(typeof input === "string" || input instanceof URL ? input : input.url), "https://smithers.sh")
      const method = (init?.method ?? "GET").toUpperCase()
      calls.push(`${method} ${url.pathname}`)
      const answer = routes[`${method} ${url.pathname}`]
      return answer === undefined ? json(404, { status: "error", code: "not_found", message: `no stub for ${method} ${url.pathname}` }) : json(200, answer)
    }
  }
  const controller = createAppController(store, unavailableAgent, services)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: { bookmark: "main", changeId: "c", commitId: "k" } }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  calls.length = 0
  return { store, controller, calls }
}

const cloudRoutes = {
  [`GET ${ISSUES}`]: [cloudIssue],
  [`GET ${ISSUES}/5`]: cloudIssue,
  [`GET ${ISSUES}/5/comments`]: [cloudComment],
  [`GET /api/repos/roninjin10/e2e-verify/issue-views`]: [],
  [`GET /api/user/github-repos/roninjin10/e2e-verify/issues`]: []
}

test("the hosted app's canonical /issue opens the repository's own Cloud issue, with its body and comments", async () => {
  const h = await hosted({ routes: cloudRoutes })
  try {
    /* Production shape: the host serves the issues, the seeded design world is off. */
    expect(h.controller.design.enabled).toBe(false)
    const outcome = await h.controller.runCommandForResult("issue", "5")
    expect(outcome).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get(`issue-${REPO}-5`)).toMatchObject({ kind: "issue", payload: {
      repo: REPO, number: 5, title: TITLE, state: "open", author: "roninjin10", issueBody: "Reproduction",
      comments: [{ author: "roninjin10", commentBody: "Still reproducing" }]
    } })
    /* The Cloud source answered it; no design card was opened. */
    expect(h.calls).toEqual([`GET ${ISSUES}/5`, `GET ${ISSUES}/5/comments`])
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

test("the hosted app's canonical /issues lists that repository's own Cloud issues", async () => {
  const h = await hosted({ routes: cloudRoutes })
  try {
    const outcome = await h.controller.runCommandForResult("issues")
    expect(outcome).toMatchObject({ status: "executed" })
    const card = h.store.collections.cards.get(`issues-${REPO}`)
    expect(card).toMatchObject({ kind: "issue-list", payload: { repo: REPO, filter: "open" } })
    expect(card?.kind === "issue-list" ? card.payload.issues : []).toMatchObject([{ number: 5, title: TITLE, source: "smithers-cloud" }])
    expect(h.calls).toContain(`GET ${ISSUES}`)
    expect([...h.store.collections.cards.keys()].filter(id => id.startsWith("design:"))).toEqual([])
  } finally { await h.controller.dispose() }
})

test("an install keeps its GitHub-App issue door, and reaches no Cloud issue route", async () => {
  const h = await hosted({ bootstrap: INSTALL, routes: { "GET /api/issues/5": installIssue } })
  try {
    expect(await h.controller.runCommandForResult("issue", "5")).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get(`issue-github-${REPO}-5`)).toMatchObject({ kind: "issue", payload: { number: 5, title: TITLE } })
    expect(h.calls).toEqual(["GET /api/issues/5"])
  } finally { await h.controller.dispose() }
})

test("the seeded design preview still answers both commands, and asks no backend for them", async () => {
  const h = await hosted({ bootstrap: undefined })
  try {
    expect(h.controller.design.enabled).toBe(true)
    expect(await h.controller.runCommandForResult("issue", "#231")).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get("design:issue:231")?.kind).toBe("issue")
    expect(await h.controller.runCommandForResult("issues")).toMatchObject({ status: "executed" })
    expect(h.store.collections.cards.get("design:issues")?.kind).toBe("issue-list")
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})

test("a host that serves neither Cloud issues nor an install is unchanged, and asks for nothing", async () => {
  const h = await hosted({ bootstrap: WITHOUT_CLOUD, routes: cloudRoutes })
  try {
    expect(await h.controller.runCommandForResult("issue", "5")).toEqual({ status: "failed", error: "No issue #5" })
    expect(h.calls).toEqual([])
  } finally { await h.controller.dispose() }
})
