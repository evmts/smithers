import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "../cards/views/testDom"
import { repositoryRouter } from "../RepositoryRouter"
import { HistoryRoute } from "./HistoryRoute"
import { createHistoryReads } from "./HistoryReads"
afterEach(() => repositoryRouter().dispose())
test("commits deep link resolves the longest authoritative ref and navigates a row in place", async () => {
  window.location.href = "https://smithers.sh/ada/widgets/commits/feature/topic/src/a.ts"
  const sha = "a".repeat(40), paths: string[] = []
  const reads = createHistoryReads(async path => { paths.push(path); return { items: [{ sha, short_sha: "aaaaaaa", title: "Change", body: "", author: "Ada", authored_at: "2026-10-18T12:00:00Z", committed_at: "2026-10-18T12:00:00Z", parents: [] }] } })
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<HistoryRoute reads={reads} defaultBranch="main" refs={["feature/topic"]}/>))
  expect(paths[0]).toContain("ref=feature%2Ftopic&path=src%2Fa.ts")
  await act(async () => host.querySelector<HTMLAnchorElement>("a")!.dispatchEvent(Object.assign(new Event("click", { bubbles: true, cancelable: true }), { button: 0 })))
  expect(repositoryRouter().getSnapshot()?.subject).toEqual({ kind: "commit", sha })
})
test("commit deep link renders the exact immutable commit", async () => {
  const sha = "a".repeat(40)
  window.location.href = `https://smithers.sh/ada/widgets/commit/${sha}`
  const reads = createHistoryReads(async () => ({ sha, short_sha: "aaaaaaa", title: "Deep linked commit", body: "", author: "Ada", authored_at: "2026-10-18T12:00:00Z", committed_at: "2026-10-18T12:00:00Z", parents: [], files: [] }))
  const host = document.createElement("div"), root = createRoot(host)
  await act(async () => root.render(<HistoryRoute reads={reads}/>))
  expect(host.textContent).toContain("Deep linked commit")
  expect(host.querySelector("a")?.getAttribute("href")).toBe(`/ada/widgets/tree/${sha}`)
})
