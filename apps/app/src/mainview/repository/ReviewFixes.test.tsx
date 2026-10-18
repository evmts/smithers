import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IssueViews, matchesIssueReadKey } from "./IssueViews"
import { LandingListCardBody } from "../cards/LandingCards"
import { PullViews } from "./PullViews"
import { subjectCommand } from "../RepositorySubjectEntry"
import { createIssuesSeam } from "../state/seams/IssuesSeam"
import { createLandingsSeam } from "../state/seams/LandingsSeam"
import type { SeamContext } from "../state/seams/SeamContext"
import { createAppStore } from "../state/AppStore"
import { memoryStorage } from "../state/TestFixtures"
import type { Card } from "../state/AppState"

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "" } } })
  try { return renderToStaticMarkup(element) } finally { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window") }
}
const issue = { number: 7, title: "Native issue", body: "Native body", state: "open", labels: [], assignees: [], author: { login: "maya" }, comment_count: 0 }
async function setup(identity: "signed-out" | "unavailable", refused = false, nativeOnly = false, stale = false) {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: identity, login: null, admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "maya/tinyhttp", org: "maya", ownerKind: "user", name: "tinyhttp", head: null }] }).isPersisted.promise
  const calls: string[] = []
  const http: SeamContext["http"] = async input => {
    const url = new URL(String(input), "https://app.test")
    calls.push(url.pathname)
    if (url.pathname === "/api/repos/maya/tinyhttp") return Response.json({ full_name: "maya/tinyhttp", ...(nativeOnly ? {} : { github_source: { owner: "maya", repo: "tinyhttp" } }) })
    if (stale && url.pathname.includes("github-repos") && !url.pathname.endsWith("/comments")) return Response.json([{ number: 8, title: "Mirror issue", state: "open", user: { login: "maya" }, labels: [], comments: 0 }], { headers: { "X-Metadata-Stale": "true", "X-Metadata-Synced-At": "2026-09-16T12:00:00Z" } })
    if (url.pathname.endsWith("/issue-views") || url.pathname.endsWith("/comments")) return Response.json([])
    if (url.pathname === "/api/repos/maya/tinyhttp/issues/7") return Response.json(issue)
    if (url.pathname === "/api/repos/maya/tinyhttp/issues" && !refused) return Response.json([issue])
    return Response.json({ message: "authentication required" }, { status: 401 })
  }
  let ordinal = 0
  const ctx: SeamContext = { store, http, baseUrl: "https://app.test", actor: () => "user", nextOrdinal: () => ++ordinal, dispatch: transition => store.dispatch(transition) }
  const issues = createIssuesSeam(ctx)
  const pulls = createLandingsSeam(ctx)
  const controller = { commands: { run: async (name: string, args: string) => { const p = JSON.parse(args); return name === "issues.list" ? issues.listIssues("all", p.repo) : name === "issues.view" ? issues.viewIssue(p.number, p.repo, p.source) : pulls.listLandings(p.repo) } } }
  return { store, controller, calls, issues, ctx }
}
const markup = (card: Card) => render(createElement(IssueViews, { repo: "maya/tinyhttp", card, signedIn: false, onRunCommand: () => {} }))
test("signed out keeps native rows beside a GitHub refusal and opens the native tracker", async () => {
  const { store, controller, calls, issues } = await setup("signed-out")
  await controller.commands.run("issues.list", JSON.stringify({ repo: "maya/tinyhttp", filter: "all" }))
  const card = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  const html = markup(card)
  expect(html).toContain("Native issue")
  expect(html).toContain("/maya/tinyhttp/issues/7?source=smithers-cloud")
  expect(html).toContain("authentication required")
  expect(html).toContain("<details")
  expect(html).not.toContain("<p>authentication required</p>")
  expect(html).toContain("Retry")
  expect(html).not.toContain("No issues yet")
  const command = subjectCommand("maya/tinyhttp", { kind: "issue", number: 7 }, "smithers-cloud")
  expect(command.args).toContain("smithers-cloud")
  await issues.viewIssue(7, "maya/tinyhttp", "smithers-cloud")
  expect(calls).toContain("/api/repos/maya/tinyhttp/issues/7")
  expect([...store.collections.cards.values()].some(card => card.kind === "issue" && card.payload.source !== "github")).toBe(true)
})
for (const identity of ["signed-out", "unavailable"] as const) test(`${identity} native 401 finishes with Retry`, async () => {
  const { store, controller } = await setup(identity, true)
  await controller.commands.run("issues.list", JSON.stringify({ repo: "maya/tinyhttp", filter: "all" }))
  const card = [...store.collections.cards.values()].find(card => card.viewRepo === "maya/tinyhttp")!
  expect(card.loading).toBe(false)
  expect(card.status).toBe("error")
  const html = markup(card)
  expect(html).toContain("Retry")
  expect(html).not.toContain("Loading")
  expect(html).not.toContain("No issues yet")
  await controller.commands.run("pr", JSON.stringify({ repo: "maya/tinyhttp", operation: "list" }))
  const pull = [...store.collections.cards.values()].find(card => card.viewKey === "prs-maya/tinyhttp")!
  expect(pull.loading).toBe(false)
  expect(pull.status).toBe("error")
})
test("queued, failed and unknown pulls remain in the open list", () => {
  const card: Card = { id: "prs", kind: "pr-list", title: "Pull requests", status: "active", createdAt: 0, ordinal: 0, payload: { repo: "maya/tinyhttp", landings: ["open", "draft", "queued", "failed", "unknown", "closed", "merged", "landed"].map((state, i) => ({ number: i + 1, title: `Pull ${state}`, author: null, updatedAt: null, state })) } }
  const html = render(createElement(PullViews, { repo: "maya/tinyhttp", card, onRunCommand: () => {} }))
  for (const state of ["open", "draft", "queued", "failed", "unknown"]) expect(html).toContain(`Pull ${state}`)
  for (const state of ["closed", "merged", "landed"]) expect(html).not.toContain(`Pull ${state}`)
  const chat = render(createElement(LandingListCardBody, { card: card as Extract<Card, {kind: "pr-list"}>, onRunCommand: () => {} }))
  expect(chat).toContain("5 Open")
  expect(chat).toContain("3 Other")
})

test("a native-only repository never asks the GitHub tracker for its issues", async () => {
  const { store, controller, calls } = await setup("signed-out", false, true)
  await controller.commands.run("issues.list", JSON.stringify({ repo: "maya/tinyhttp", filter: "all" }))
  const card = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  expect(markup(card)).toContain("Native issue")
  expect(markup(card)).not.toContain("authentication required")
  expect(calls.some(path => path.includes("github"))).toBe(false)
})

test("stale mirror rows and issue details retain their sync age", async () => {
  const { store, controller, issues } = await setup("signed-out", false, false, true)
  await controller.commands.run("issues.list", JSON.stringify({ repo: "maya/tinyhttp", filter: "all" }))
  const list = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  expect(markup(list)).toContain("Stale")
  expect(markup(list)).toContain("synced")
  await issues.viewIssue(8, "maya/tinyhttp", "github")
  const detail = [...store.collections.cards.values()].find(card => card.kind === "issue")!
  expect(detail.body).toStartWith("Stale · synced ")
})

test("stale pull mirror headers remain visible beside an empty list", async () => {
  const { store, ctx } = await setup("signed-out")
  const pulls = createLandingsSeam({ ...ctx, http: async (url, init) => url.includes("/pulls") ? Response.json([], { headers: { "X-Metadata-Stale": "true", "X-Metadata-Synced-At": "2026-09-16T12:00:00Z" } }) : ctx.http(url, init) })
  await pulls.listLandings("maya/tinyhttp")
  const card = [...store.collections.cards.values()].find(card => card.kind === "pr-list")!
  const html = render(createElement(PullViews, { repo: "maya/tinyhttp", card, onRunCommand: () => {} }))
  expect(html).toContain("Stale · synced")
  expect(html).toContain("No pull requests.")
})

test("a native tracker 404 is an error, never a GitHub fallback", async () => {
  const { store, ctx, calls } = await setup("signed-out", false, true)
  const issues = createIssuesSeam({ ...ctx, http: async (url, init) => /\/issues(?:\?.*)?$/.test(url) ? Response.json({}, { status: 404 }) : ctx.http(url, init) })
  await issues.listIssues("all", "maya/tinyhttp")
  const card = [...store.collections.cards.values()].find(card => card.viewRepo === "maya/tinyhttp")!
  expect(card.status).toBe("error")
  expect(markup(card)).toContain("Retry")
  expect(calls.some(path => path.includes("github"))).toBe(false)
})

test("the repository frame matches native and GitHub issue reads without crossing repositories or numbers", () => {
  expect(matchesIssueReadKey("issue-maya/tinyhttp-7", "maya/tinyhttp", 7)).toBe(true)
  expect(matchesIssueReadKey("issue-github-Maya/TinyHttp-7", "maya/tinyhttp", 7)).toBe(true)
  expect(matchesIssueReadKey("issue-maya/tinyhttp-8", "maya/tinyhttp", 7)).toBe(false)
  expect(matchesIssueReadKey("issue-maya/other-7", "maya/tinyhttp", 7)).toBe(false)
  expect(matchesIssueReadKey(undefined, "maya/tinyhttp", 7)).toBe(false)
  expect(matchesIssueReadKey(JSON.stringify(["issues", "maya/tinyhttp", "all", "all", null]), "maya/tinyhttp")).toBe(true)
  expect(matchesIssueReadKey("issue-maya/tinyhttp-7", "maya/tinyhttp")).toBe(false)
})

for (const nativeOnly of [true, false]) test(`a bare signed-out issue URL resolves its declared ${nativeOnly ? "native" : "GitHub"} tracker`, async () => {
  const { store, issues, calls } = await setup("signed-out", false, nativeOnly, !nativeOnly)
  const number = nativeOnly ? 7 : 8
  const command = subjectCommand("maya/tinyhttp", { kind: "issue", number })
  expect(command.args).not.toContain("--source")
  await issues.viewIssue(number, "maya/tinyhttp")
  const card = [...store.collections.cards.values()].find(card => card.kind === "issue")!
  expect(card.kind).toBe("issue")
  if (card.kind === "issue") expect(card.payload.source === "github").toBe(!nativeOnly)
  if (nativeOnly) expect(calls.some(path => path.includes("github"))).toBe(false)
  else expect(calls).not.toContain("/api/repos/maya/tinyhttp/issues/8")
})
test("failed source discovery on a bare issue URL finishes with Retry", async () => {
  const { store, ctx } = await setup("unavailable")
  const issues = createIssuesSeam({ ...ctx, http: async url => url.endsWith("/maya/tinyhttp") ? Response.json({}, { status: 401 }) : ctx.http(url) })
  await issues.viewIssue(7, "maya/tinyhttp")
  const card = [...store.collections.cards.values()].find(card => card.viewRepo === "maya/tinyhttp")!
  expect(card.status).toBe("error")
  expect(card.loading).toBe(false)
  expect(markup(card)).toContain("Retry")
})

for (const nativeOnly of [true, false]) test(`new issues follow the declared ${nativeOnly ? "native" : "GitHub"} tracker`, async () => {
  const { ctx } = await setup("signed-out", false, nativeOnly)
  const writes: string[] = []
  const seam = createIssuesSeam({ ...ctx, http: async (url, init) => {
    if (init?.method === "POST") {
      writes.push(new URL(url).pathname)
      return Response.json({ number: 7 }, {status: 202})
    }
    return ctx.http(url, init)
  } })
  await seam.createIssue("New issue", "maya/tinyhttp")
  expect(writes).toEqual([`/api/repos/maya/tinyhttp/${nativeOnly ? "issues" : "github/issues"}`])
})
for (const identity of ["signed-in", "unavailable", "signed-out"] as const) test(`${identity} 401 keeps Retry and offers the appropriate chat sign-in door`, async () => {
  const {ctx, store} = await setup("signed-out", true, true)
  await store.dispatch({type: "identity.session.loaded", actor: "system", state: identity, login: identity === "signed-in" ? "maya" : null, admin: false, scopesPlain: null}).isPersisted.promise
  const prompts: string[] = []
  const scoped = {...ctx, promptSignIn: (summary?: string) => { prompts.push(summary ?? "") }}
  await createIssuesSeam(scoped).listIssues("all", "maya/tinyhttp")
  await createLandingsSeam(scoped).listLandings("maya/tinyhttp")
  expect(prompts).toHaveLength(identity === "signed-out" ? 0 : 2)
  for (const card of store.collections.cards.values()) if (card.viewRepo === "maya/tinyhttp") {
    expect(card.loading).toBe(false)
    expect(card.status).toBe("error")
  }
})

test("an expired session during pull source discovery retains Retry and offers sign-in", async () => {
  const {ctx, store} = await setup("unavailable")
  const prompts: string[] = []
  await createLandingsSeam({...ctx, promptSignIn: summary => {prompts.push(summary ?? "")}, http: async () => Response.json({message: "Session expired"}, {status: 401})}).listLandings("maya/tinyhttp")
  expect(prompts).toEqual(["read pull requests on maya/tinyhttp"])
  expect([...store.collections.cards.values()].find(card => card.viewKey === "prs-maya/tinyhttp")).toMatchObject({status: "error", loading: false})
})

test("an explicit Smithers tracker takes precedence over a retained GitHub binding", async () => {
  const {ctx, store, calls} = await setup("signed-out")
  const scoped = {...ctx, http: async (url: string, init?: RequestInit) => {
    if (url.endsWith("/maya/tinyhttp")) return Response.json({full_name: "maya/tinyhttp", is_public: true, issue_tracker: "smithers-cloud", github_source: {owner: "maya", repo: "tinyhttp"}})
    if (url.includes("/landings?")) return Response.json([{number: 12, title: "Native landing", state: "open", author: {login: "maya"}}])
    return ctx.http(url, init)
  }}
  await createIssuesSeam(scoped).listIssues("all", "maya/tinyhttp")
  const list = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  expect(markup(list)).toContain("Native issue")
  expect(markup(list)).not.toContain("authentication required")
  await createLandingsSeam(scoped).listLandings("maya/tinyhttp")
  const pulls = [...store.collections.cards.values()].find(card => card.kind === "pr-list")!
  expect(pulls).toMatchObject({status: "active", loading: false, payload: {landings: [{number: 12, title: "Native landing"}]}})
  expect(calls.some(path => path.includes("github"))).toBe(false)
})
for (const tracker of ["github", "future-tracker"]) test(`${tracker} without a readable binding never becomes an empty native tracker`, async () => {
  const {ctx, store} = await setup("signed-out")
  const scoped = {...ctx, http: async (url: string) => url.endsWith("/maya/tinyhttp") ? Response.json({full_name: "maya/tinyhttp", issue_tracker: tracker}) : Response.json([])}
  await createIssuesSeam(scoped).listIssues("all", "maya/tinyhttp")
  const list = [...store.collections.cards.values()].find(card => card.viewRepo === "maya/tinyhttp")!
  expect(markup(list)).toContain("Retry")
  expect(markup(list)).not.toContain("No issues yet")
  await createLandingsSeam(scoped).listLandings("maya/tinyhttp")
  expect([...store.collections.cards.values()].find(card => card.viewKey === "prs-maya/tinyhttp")).toMatchObject({status: "error", loading: false})
})

for (const tab of ["commits", "checks", "files"] as const) test(`${tab} failure keeps typed Retry and collapses backend details`, () => {
  const card: Card = { id: "pr", kind: "pr", title: "Fix", status: "active", createdAt: 0, ordinal: 0,
    payload: {repo: "maya/tinyhttp", number: 7, title: "Fix", state: "open", author: "maya", prBody: "", reviews: [], checks: [], readErrors: {[tab]: "Upstream diagnostic"}} }
  const html = render(createElement(PullViews, {repo: "maya/tinyhttp", number: 7, tab, card, onRunCommand: () => {}}))
  expect(html).toContain('role="alert"')
  expect(html).toContain('data-flow="pr"')
  expect(html).toContain('data-flow-args=')
  expect(html).toContain("Retry")
  expect(html).toContain('<details><summary>Details</summary>')
  expect(html).toContain("Upstream diagnostic</pre>")
  expect(html).not.toContain("<p>Upstream diagnostic</p>")
  expect(html).not.toContain("No checks reported.")
})
