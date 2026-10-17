import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { RepositoryHome } from "@smthrs/rpc/RepositoryHome"
import { createRoot } from "./views/testDom"
import { RepositoryHomeView, RunFlowView } from "./RepositoryHomeView"
import { runTraceCardFamily } from "./RunTraceCard"
import type { CardActions } from "./CardFamily"
import type { Card, RepositoryFlow, RepositoryFlowsRow } from "../state/AppState"
import { resolveFlowViews } from "../state/seams/RepositoryFlowsSeam"

/*
 * A flow's own view (mvp.md §6.14, §6.17, M-45, #4025): one declaration,
 * `Smithers.Flow({ view })`, drawn at `/owner/repo` where the homepage names
 * the flow and on the monitor of every run of that flow. It is data: opening
 * either surface runs nothing, and a broken declaration keeps the tree.
 */

const mounted: Array<() => void> = []
afterEach(() => { while (mounted.length > 0) mounted.pop()?.() })

const REPO = "ada/widgets"
const VIEW = [
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
