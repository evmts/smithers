import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { FlowView, RepositoryHome } from "@smthrs/rpc/RepositoryHome"
import { createRoot } from "./views/testDom"
import { RepositoryHomeView, RunFlowView } from "./RepositoryHomeView"
import { runTraceCardFamily } from "./RunTraceCard"
import type { CardActions } from "./CardFamily"
import type { Card, RepositoryFlow, RepositoryFlowsRow } from "../state/AppState"
import { createRepositoryFlowsSeam, resolveFlowViews } from "../state/seams/RepositoryFlowsSeam"
import { FACTORY_PROJECTION_PATH } from "@smthrs/rpc/FactoryProjection"
import { createAppStore } from "../state/AppStore"
import { createControllerContext } from "../state/controller/context"
import { json, memoryStorage, settled, unavailableAgent } from "../state/TestFixtures"

/*
 * A flow's own view (mvp.md §6.14, §6.17, M-45, #4025): one declaration,
 * `Smithers.Flow({ view })`, drawn at `/owner/repo` where the homepage names
 * the flow and on the monitor of every run of that flow. It is data: opening
 * either surface runs nothing, and a broken declaration keeps the tree.
 */

const mounted: Array<() => void> = []
afterEach(() => { while (mounted.length > 0) mounted.pop()?.() })

const REPO = "ada/widgets"
const VIEW: FlowView = [
  { type: "text", title: "Triage", text: "Open issues, oldest first." },
  { type: "app", flow: "triage", title: "Triage now", picture: "issue" }
]
const flow = (id: string, view?: unknown): RepositoryFlow => ({
  id, description: `${id} flow`, summary: null, featured: false, model: null, modelInvocable: false, ...(view === undefined ? {} : { view })
})
const rows = (repo: string, ...flows: RepositoryFlow[]): RepositoryFlowsRow[] => [{ id: repo, flows, catalog: "read", loadedAt: 1 }]
const namesTriage: RepositoryHome = { kind: "blocks", blocks: [{ type: "view", flow: "triage" }] }

const mount = (node: React.ReactNode) => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(node))
  mounted.push(() => { act(() => root.unmount()); host.remove() })
  return host
}

const home = (declared: RepositoryHome, flows: RepositoryFlow[]) => {
  const calls: Array<[string, string | undefined]> = []
  const host = mount(<RepositoryHomeView repo={REPO} home={resolveFlowViews(declared, flows, "read")} treeCopyId="shared:ada/widgets"
    onRunCommand={(name, args) => { calls.push([name, args]) }} />)
  return { host, calls }
}

test("the flow a repository names draws its declared view at the repository route, with the tree one press away", () => {
  const { host, calls } = home(namesTriage, [flow("triage", VIEW)])
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")!
  expect(view.dataset.home).toBe("blocks")
  expect(view.textContent).toContain("Open issues, oldest first.")
  expect(calls).toEqual([])
  view.querySelector<HTMLButtonElement>(".repository-home-files")!.click()
  expect(calls).toEqual([["files", JSON.stringify({ operation: "tree", copy: "shared:ada/widgets" })]])
})

test("a named flow that declares no view keeps the tree and says which flow failed, never a blank frame", () => {
  const { host } = home(namesTriage, [flow("triage")])
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")!
  expect(view.dataset.home).toBe("error")
  expect(view.querySelector("[role=status]")!.textContent)
    .toBe("The triage view is unavailable: triage declares no view. Showing ada/widgets's files instead.")
  expect(view.querySelector(".repository-home-files")).not.toBeNull()
})

const runCard: Extract<Card, { kind: "run-trace" }> = {
  id: "run-one", kind: "run-trace", title: "Triage", status: "active", createdAt: 1, ordinal: 1,
  payload: { repo: REPO, workflow: "triage", runId: "one", phase: "running", steps: [], result: null, lastSeq: 0 }
}

test("the monitor of a run draws its flow's declared view through the run card", () => {
  const actions = { onRunCommand: () => {}, onStopRun: () => {}, onRetryRun: () => {}, repositoryFlows: rows(REPO, flow("triage", VIEW)) } as unknown as CardActions
  const host = document.createElement("div")
  host.innerHTML = renderToStaticMarkup(<>{runTraceCardFamily["run-trace"].render(runCard, actions)}</>)
  const view = host.querySelector<HTMLElement>("[data-testid=run-flow-view]")!
  expect(view.getAttribute("aria-label")).toBe("triage view")
  expect(view.textContent).toContain("Open issues, oldest first.")
  expect(host.querySelector("[data-testid=run-trace-one]")).not.toBeNull()
})

test("a flow button on the monitor runs only when pressed", () => {
  const calls: Array<string> = []
  const host = mount(<RunFlowView repo={REPO} flow="triage" rows={rows(REPO, flow("triage", VIEW))} onRunCommand={(name) => { calls.push(name) }} />)
  expect(calls).toEqual([])
  host.querySelector<HTMLButtonElement>('[data-flow="triage"]')!.click()
  expect(calls).toEqual(["triage"])
})

test("another repository's flow of the same name lends the monitor no view", () => {
  expect(mount(<RunFlowView repo={REPO} flow="triage" rows={rows("eve/widgets", flow("triage", VIEW))} onRunCommand={() => {}} />).innerHTML).toBe("")
})

test("a flow without a view adds nothing to the monitor, and an unreadable one says so", () => {
  expect(mount(<RunFlowView repo={REPO} flow="triage" rows={rows(REPO, flow("triage"))} onRunCommand={() => {}} />).innerHTML).toBe("")
  const broken = mount(<RunFlowView repo={REPO} flow="triage" rows={rows(REPO, flow("triage", [{ type: "markdown", path: "README.md" }]))} onRunCommand={() => {}} />)
  expect(broken.querySelector("[role=status]")!.textContent).toBe("The triage view is invalid.")
})

/*
 * The whole chain, over the real read model instead of a hand-built row: the
 * projection document a repository's `.smithers/factory.json` IS (the one the
 * `FactoryProjection` target writes, carrying `flows[].view` for a flow that
 * declares one), read by the real repository-flows seam, lands on the store
 * row the monitor and the repository's landing both draw from. Before the
 * catalog row carried `view`, the document had none and both surfaces drew
 * nothing however the repository declared it (#4025).
 */
const projection = (view?: unknown) => ({
  summary: "How widgets develops itself.",
  flows: [{
    id: "triage",
    description: "Triages the inbox.",
    summary: "Triage the inbox.",
    featured: true,
    kind: "ts",
    path: "flows/triage/flow.ts",
    capabilities: [],
    model: null,
    modelInvocable: false,
    ...(view === undefined ? {} : { view })
  }],
  on: [],
  github: { mirror: "push", issues: "two-way", changes: "land" }
})

const declaredChain = async (view?: unknown) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({
    type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ada", admin: false, scopesPlain: null
  }).isPersisted.promise
  const context = createControllerContext(store, unavailableAgent, { fetchImpl: async input => {
    const url = String(input)
    if (url.endsWith(`/contents/${FACTORY_PROJECTION_PATH}`)) return json(200, { content: JSON.stringify(projection(view)), encoding: "utf-8" })
    if (url.endsWith("/home")) return json(200, namesTriage)
    return json(404, {})
  } })
  const seam = createRepositoryFlowsSeam({
    store, baseUrl: "https://app.test", http: context.boundedFetch, dispatch: store.dispatch,
    actor: () => "user", nextOrdinal: store.nextOrdinal, isDisposed: () => context.disposed
  })
  await seam.load(REPO)
  const row = store.collections.repositoryFlows.get(REPO)!
  return { row, dispose: async () => { await context.dispose(); await settled(); await store.dispose?.() } }
}

test("a declared view travels the projection document into the read model, the monitor and the repository's landing", async () => {
  const { row, dispose } = await declaredChain(VIEW)
  try {
    /* The read model carries what the document carried, nothing invented. */
    expect(row.catalog).toBe("read")
    expect(row.flows.map(flow => flow.id)).toEqual(["triage"])
    expect(row.flows[0]!.view).toEqual(VIEW)

    /* The repository named the flow that owns its landing; the seam resolved it. */
    expect(row.home).toEqual({ kind: "blocks", blocks: VIEW })
    const landing = mount(<RepositoryHomeView repo={REPO} home={row.home} treeCopyId="shared:ada/widgets" onRunCommand={() => {}} />)
    expect(landing.querySelector<HTMLElement>("[data-testid=repository-home]")!.textContent)
      .toContain("Open issues, oldest first.")
    expect(landing.querySelector(".repository-home-files")).not.toBeNull()

    /* The same declaration, the same renderer, on every run of that flow. */
    const monitor = mount(<RunFlowView repo={REPO} flow="triage" rows={[row]} onRunCommand={() => {}} />)
    expect(monitor.querySelector<HTMLElement>("[data-testid=run-flow-view]")!.textContent)
      .toContain("Open issues, oldest first.")
  } finally { await dispose() }
})

test("a projection document that declares no view keeps the tree with an honest notice, and the monitor draws nothing", async () => {
  const { row, dispose } = await declaredChain()
  try {
    expect(row.flows[0]!.view).toBeUndefined()
    expect(row.home).toEqual({ kind: "error", message: "The triage view is unavailable: triage declares no view" })
    const landing = mount(<RepositoryHomeView repo={REPO} home={row.home} treeCopyId="shared:ada/widgets" onRunCommand={() => {}} />)
    expect(landing.querySelector<HTMLElement>("[data-testid=repository-home]")!.dataset.home).toBe("error")
    expect(landing.querySelector(".repository-home-files")).not.toBeNull()
    expect(mount(<RunFlowView repo={REPO} flow="triage" rows={[row]} onRunCommand={() => {}} />).innerHTML).toBe("")
  } finally { await dispose() }
})
