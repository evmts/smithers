import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IssueViews } from "./IssueViews"
import { PullViews } from "./PullViews"
import { subjectCommand } from "../RepositorySubjectEntry"
import { scopedControllers } from "../state/ControllerTestScope"
import { createAppStore } from "../state/AppStore"
import { memoryStorage, silentAgent } from "../state/TestFixtures"
import type { Card } from "../state/AppState"

const controllerFor = scopedControllers()
const issue = { number: 7, title: "Native issue", body: "Native body", state: "open", labels: [], assignees: [], author: { login: "maya" }, comment_count: 0 }
async function setup(identity: "signed-out" | "unavailable", refused = false) {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: identity, login: null, admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "maya/tinyhttp", org: "maya", ownerKind: "user", name: "tinyhttp", head: null }] }).isPersisted.promise
  const calls: string[] = []
  const controller = controllerFor(store, silentAgent, { fetchImpl: async input => {
    const url = new URL(String(input), "https://app.test")
    calls.push(url.pathname)
    if (url.pathname === "/api/repos/maya/tinyhttp") return Response.json({ full_name: "maya/tinyhttp" })
    if (url.pathname.endsWith("/issue-views") || url.pathname.endsWith("/comments")) return Response.json([])
    if (url.pathname === "/api/repos/maya/tinyhttp/issues/7") return Response.json(issue)
    if (url.pathname === "/api/repos/maya/tinyhttp/issues" && !refused) return Response.json([issue])
    return Response.json({ message: "authentication required" }, { status: 401 })
  } })
  return { store, controller, calls }
}
const markup = (card: Card) => renderToStaticMarkup(createElement(IssueViews, { repo: "maya/tinyhttp", card, signedIn: false, run: () => {} }))
test("signed out keeps native rows beside a GitHub refusal and opens the native tracker", async () => {
  const { store, controller, calls } = await setup("signed-out")
  await controller.commands.run("issues.list", JSON.stringify({ repo: "maya/tinyhttp", filter: "all" }))
  const card = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  const html = markup(card)
  expect(html).toContain("Native issue")
  expect(html).toContain("authentication required")
  expect(html).toContain("Retry")
  expect(html).not.toContain("No issues yet")
  const command = subjectCommand("maya/tinyhttp", { kind: "issue", number: 7 }, "smithers-cloud")
  await controller.commands.run(command.name, command.args)
  expect(calls).toContain("/api/repos/maya/tinyhttp/issues/7")
  expect([...store.collections.cards.values()].some(card => card.kind === "issue" && card.payload.source === "smithers-cloud")).toBe(true)
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
  const card: Card = { id: "prs", kind: "pr-list", title: "Pull requests", status: "active", createdAt: 0, ordinal: 0, payload: { repo: "maya/tinyhttp", landings: ["open", "draft", "queued", "failed", "unknown", "closed", "merged", "landed"].map((state, i) => ({ number: i + 1, title: `Pull ${state}`, state })) } }
  const html = renderToStaticMarkup(createElement(PullViews, { repo: "maya/tinyhttp", card, retry: () => {} }))
  for (const state of ["open", "draft", "queued", "failed", "unknown"]) expect(html).toContain(`Pull ${state}`)
  for (const state of ["closed", "merged", "landed"]) expect(html).not.toContain(`Pull ${state}`)
})
