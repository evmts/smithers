import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "../cards/views/testDom"
import { createHistoryReads } from "./HistoryReads"
import { CommitView } from "./CommitView"
test("one commit shows its body, recorded author, parent links and actual file counts", async () => {
  const sha = "a".repeat(40), parent = "b".repeat(40)
  const paths: string[] = []
  const reads = createHistoryReads(async path => { paths.push(path); return { sha, short_sha: "aaaaaaa", title: "Fix history", body: "Exact body", author: "Ada", authored_at: "2026-10-18T12:00:00Z", committed_at: "2026-10-18T12:00:00Z", parents: [parent], files: [{ path: "src/a.ts", status: "modified", additions: 3, deletions: 2 }] } })
  const host = document.createElement("div"); const root = createRoot(host)
  await act(async () => root.render(<CommitView repo="ada/widgets" sha={sha} reads={reads}/>))
  expect(paths).toEqual([`/api/repos/ada/widgets/commits/${sha}`])
  expect(host.textContent).toContain("Exact body")
  expect(host.textContent).toContain("Ada")
  expect(host.textContent).toContain("+3")
  expect(host.textContent).toContain("−2")
  expect(host.querySelector(`a[href='/ada/widgets/commit/${parent}']`)).not.toBeNull()
  expect(host.textContent).not.toContain("Verified")
})
test("commit failure retries the exact read and missing commits retain their requested SHA", async () => {
  const { ApplicationClientError } = await import("../runtime/ApplicationClient")
  let fail = true, calls = 0
  const sha = "a".repeat(40)
  const reads = createHistoryReads(async () => {
    calls++
    if (fail) throw new ApplicationClientError("api", "Host unavailable", 503)
    return { sha, short_sha: "aaaaaaa", title: "Recovered", body: "", author: "Ada", authored_at: "2026-10-18T12:00:00Z", committed_at: "2026-10-18T12:00:00Z", parents: [], files: [] }
  })
  const host = document.createElement("div"), root = createRoot(host)
  await act(async () => root.render(<CommitView repo="ada/widgets" sha={sha} reads={reads}/>))
  expect(host.textContent).toContain("Host unavailable")
  fail = false
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click())
  expect(calls).toBe(2)
  expect(host.textContent).toContain("Recovered")
  const missing = createHistoryReads(async () => { throw new ApplicationClientError("api", "Not found", 404) })
  await act(async () => root.render(<CommitView repo="ada/widgets" sha={sha} reads={missing}/>))
  expect(host.textContent).toContain("Commit not found.")
  expect(host.textContent).toContain(sha)
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/ada/widgets/commits")
})
