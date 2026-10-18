import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IssueViews } from "./IssueViews"
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
const markup = (card: Card) => render(createElement(IssueViews, { repo: "maya/tinyhttp", card, signedIn: false, run: () => {} }))
test("signed out keeps native rows beside a GitHub refusal and opens the native tracker", async () => {
  const { store, controller, calls, issues } = await setup("signed-out")
  await controller.commands.run("issues.list", JSON.stringify({ repo: "maya/tinyhttp", filter: "all" }))
  const card = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  const html = markup(card)
  expect(html).toContain("Native issue")
  expect(html).toContain("/maya/tinyhttp/issues/7?source=smithers-cloud")
  expect(html).toContain("authentication required")
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
  const html = render(createElement(PullViews, { repo: "maya/tinyhttp", card, retry: () => {} }))
  for (const state of ["open", "draft", "queued", "failed", "unknown"]) expect(html).toContain(`Pull ${state}`)
  for (const state of ["closed", "merged", "landed"]) expect(html).not.toContain(`Pull ${state}`)
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
  const html = render(createElement(PullViews, { repo: "maya/tinyhttp", card, retry: () => {} }))
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
