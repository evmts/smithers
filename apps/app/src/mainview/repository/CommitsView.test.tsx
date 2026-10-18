import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "../cards/views/testDom"
import { CommitsView } from "./CommitsView"
import { createHistoryReads } from "./HistoryReads"
const sha = "a".repeat(40)
const item = { sha, short_sha: "aaaaaaa", title: "Real commit", body: "", author: "Ada", authored_at: "2026-10-18T12:00:00Z", committed_at: "2026-10-18T12:00:00Z", parents: [] }
test("history reads real fields, follows the opaque cursor and retries a refused page", async () => {
  const calls: string[] = []
  let fail = true
  const reads = createHistoryReads(async path => {
    calls.push(path)
    if (path.includes("cursor=")) { if (fail) throw Error("Host refused"); return { items: [] } }
    return { items: [item], next_cursor: "opaque+cursor" }
  })
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  const show = (cursor?: string) => root.render(<CommitsView repo="ada/widgets" reads={reads} reference="main" cursor={cursor} onPage={show} />)
  await act(async () => { show() })
  expect(host.textContent).toContain("Real commit")
  expect(host.textContent).toContain("Ada")
  expect(host.querySelector("a")?.getAttribute("href")).toBe(`/ada/widgets/commit/${sha}`)
  await act(async () => { host.querySelector<HTMLButtonElement>("button")!.click() })
  expect(calls[1]).toContain("cursor=opaque%2Bcursor")
  expect(host.textContent).toContain("Host refused")
  fail = false
  await act(async () => { host.querySelector<HTMLButtonElement>("button")!.click() })
  expect(host.textContent).toContain("No commits found.")
  expect(calls[2]).toBe(calls[1])
})
test("an unresolved history read shows loading without inventing rows", async () => {
  const reads = createHistoryReads(() => new Promise(() => {}))
  const host = document.createElement("div"); const root = createRoot(host)
  await act(async () => root.render(<CommitsView repo="ada/widgets" reads={reads} reference="main" path="src/a.ts" />))
  expect(host.textContent).toContain("Loading…")
  expect(host.textContent).toContain("src/a.ts")
})
test("a late page from another ref cannot replace the current history", async () => {
  let release!: (value: unknown) => void
  const reads = createHistoryReads(async path => path.includes("ref=old") ? new Promise(resolve => { release = resolve }) : { items: [{ ...item, title: "Current branch" }] })
  const host = document.createElement("div"), root = createRoot(host)
  await act(async () => root.render(<CommitsView repo="ada/widgets" reads={reads} reference="old" />))
  await act(async () => root.render(<CommitsView repo="ada/widgets" reads={reads} reference="main" />))
  await act(async () => release({ items: [{ ...item, title: "Stale branch" }] }))
  expect(host.textContent).toContain("Current branch")
  expect(host.textContent).not.toContain("Stale branch")
})
test("leaving an unresolved history page aborts its read", async () => {
  let signal: AbortSignal | null | undefined
  const reads = createHistoryReads(async (_path, init) => { signal = init?.signal; return new Promise(() => {}) })
  const host = document.createElement("div"), root = createRoot(host)
  await act(async () => root.render(<CommitsView repo="ada/widgets" reads={reads} reference="old"/>))
  expect(signal?.aborted).toBe(false)
  await act(async () => root.unmount())
  expect(signal?.aborted).toBe(true)
})
