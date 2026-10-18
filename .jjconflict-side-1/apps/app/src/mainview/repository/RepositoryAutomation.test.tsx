import { expect, test } from "bun:test"
import { act, type ReactNode } from "react"
import { createRoot } from "../cards/views/testDom"
import { fileListCard } from "@smthrs/rpc/FileList"
import { fileReadCard } from "@smthrs/rpc/FileRead"
import { flowCommand, flowDescription, frontmatterDescription, readFlow, readFlows, type FlowContents } from "./FlowContents"
import { FLOW_HELD, RepositoryFlow, RepositoryFlows } from "./RepositoryFlows"
import { MODELS_HELD, RepositorySettings, RepositorySyncStatus } from "./RepositorySettings"
import { githubSyncChip, githubSyncOf, type GitHubSyncChip } from "./githubSync"

function render(node: ReactNode) {
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host); act(() => root.render(node)); return host
}
const source = 'export default Flow.make("review", { description: "Review changes", body: () => "safe" })\n'
const run = () => {}
const definition = { name: "review", path: ".smithers/flows/review/flow.ts", source, description: "Review changes" }
const directories: Record<string, ReadonlyArray<{ kind: "file" | "dir"; name: string }>> = {
  ".smithers/flows": [{ kind: "dir", name: "review" }, { kind: "file", name: "README.md" }, { kind: "dir", name: "../outside" }, { kind: "dir", name: "notes" }, { kind: "dir", name: "create-flow" }],
  ".smithers/flows/review": [{ kind: "file", name: "flow.ts" }, { kind: "file", name: "prompt.md" }],
  ".smithers/flows/notes": [{ kind: "file", name: "notes.ts" }],
  ".smithers/flows/create-flow": [{ kind: "file", name: "flow.mdx" }, { kind: "dir", name: "scaffold" }]
}
const contents = (overrides: Partial<FlowContents> = {}): FlowContents => ({
  listFiles: async path => directories[path] === undefined ? `Path not found: ${path} in a/b` : fileListCard({ repo: "a/b", path, entries: [...directories[path]!] }, 0, 0),
  readFile: async () => fileReadCard({ repo: "a/b", path: definition.path, content: source, binary: false }, 0, 0), ...overrides
})

test("flows are the directories that declare an entry file, read at the selected ref", async () => {
  const calls: unknown[] = []
  const reader = contents({ listFiles: async (...args) => { calls.push(args); return contents().listFiles(...args) }, readFile: async (...args) => { calls.push(args); return contents().readFile(...args) } })
  expect(await readFlows(reader, "a/b", "main")).toEqual({ state: "ready", value: [{ name: "create-flow", path: ".smithers/flows/create-flow/flow.mdx" }, { name: "review", path: definition.path }] })
  expect(calls.slice(0, 1)).toEqual([[".smithers/flows", "a/b", "main"]])
  expect(calls.slice(1).map(call => (call as string[])[0]).sort()).toEqual([".smithers/flows/create-flow", ".smithers/flows/notes", ".smithers/flows/review"])
  calls.length = 0
  expect(await readFlow(reader, "a/b", "review", "main")).toEqual({ state: "ready", value: definition })
  expect(calls).toEqual([[".smithers/flows/review", "a/b", "main"], [definition.path, "a/b", undefined, "main"]])
  for (const name of ["../oops", "%2e%2e", "a/b", "a\\b", "", "a b"]) expect((await readFlow(reader, "a/b", name)).state).toBe("missing")
  expect(calls.length).toBe(2)
})

test("an absent definition is missing; a directory without an entry file is not a flow", async () => {
  expect(await readFlow(contents(), "a/b", "notes")).toEqual({ state: "missing" })
  expect(await readFlow(contents(), "a/b", "nothing-here")).toEqual({ state: "missing" })
  expect(await readFlows(contents({ listFiles: async path => `Path not found: ${path} in a/b at main` }), "a/b", "main")).toEqual({ state: "ready", value: [] })
  const mdx = await readFlow(contents({ readFile: async path => fileReadCard({ repo: "a/b", path, content: "---\ndescription: \"Create a flow\"\n---\nBody", binary: false }, 0, 0) }), "a/b", "create-flow")
  expect(mdx).toMatchObject({ state: "ready", value: { path: ".smithers/flows/create-flow/flow.mdx", description: "Create a flow" } })
  expect(frontmatterDescription("---\ndescription: plain words\n---\n")).toBe("plain words")
  expect(frontmatterDescription("---\ndescription: |\n  folded\n---\n")).toBeUndefined()
  expect(frontmatterDescription("description: not frontmatter")).toBeUndefined()
})

test("failed and incomplete contents never become empty or partial success", async () => {
  expect(await readFlows(contents({ listFiles: async () => "Denied" }), "a/b")).toEqual({ state: "error", reason: "Denied" })
  expect(await readFlows(contents({ listFiles: async path => path === ".smithers/flows/notes" ? "Host unavailable" : contents().listFiles(path) }), "a/b")).toEqual({ state: "error", reason: "Host unavailable" })
  expect(await readFlow(contents({ readFile: async () => "Missing source" }), "a/b", "review")).toEqual({ state: "error", reason: "Missing source" })
  const binary = contents({ readFile: async () => fileReadCard({ repo: "a/b", path: definition.path, content: "", binary: true }, 0, 0) })
  expect(await readFlow(binary, "a/b", "review")).toEqual({ state: "error", reason: "Binary file" })
  const truncated = contents({ readFile: async () => fileReadCard({ repo: "a/b", path: definition.path, content: "x".repeat(100_000), binary: false }, 0, 0) })
  expect((await readFlow(truncated, "a/b", "review")).state).toBe("error")
  expect(await readFlows(contents({ listFiles: async () => fileListCard({ repo: "a/b", path: ".smithers/flows", entries: [] }, 0, 0) }), "a/b")).toEqual({ state: "ready", value: [] })
})

test("metadata is a declared static literal, never a nested field, comment or expression", () => {
  expect(flowDescription(source)).toBe("Review changes")
  expect(flowDescription(`// description: "fake"\nexport default Flow.make('x', { body: { description: 'nested' }, description: 'It\\'s safe' })`)).toBe("It's safe")
  expect(flowDescription('Flow.make("x", { description: `Hello ${run()}` })')).toBeUndefined()
  expect(flowDescription('Flow.make("x", { description: "part" + run() })')).toBeUndefined()
  expect(flowDescription('Flow.make("x", { body: () => { const description = "other" } })')).toBeUndefined()
  expect(flowCommand("review")).toBe("npx smthrs@next flow start review")
  expect(flowCommand("x;echo")).toBe("npx smthrs@next flow start 'x;echo'")
})

test("flows list has source links and held state, without run-only surfaces", () => {
  const host = render(<RepositoryFlows repo="a/b" revision="feature/topic" onRunCommand={run} read={{ state: "ready", value: [definition] }} />)
  expect(host.textContent).toContain(FLOW_HELD)
  expect(host.querySelector('a[href="/a/b/flows/review"]')).not.toBeNull()
  expect(host.querySelector('a[href="/a/b/blob/feature/topic/.smithers/flows/review/flow.ts"]')).not.toBeNull()
  const unknownRef = render(<RepositoryFlows repo="a/b" onRunCommand={run} read={{ state: "ready", value: [definition] }} />)
  expect(unknownRef.querySelector('a[href*="/blob/"]')).toBeNull()
  expect(unknownRef.textContent).toContain(definition.path)
  expect(host.querySelector("button")!.textContent).toBe("Copy")
  expect(host.textContent).not.toMatch(/Last run|Triggers|No runs|Graph/)
})

test("loading, failure and empty states are exclusive, and Retry reads the route again", () => {
  for (const read of [{ state: "loading" } as const, { state: "error", reason: "Host unavailable" } as const, { state: "ready", value: [] } as const, { state: "missing" } as const]) {
    const host = render(<RepositoryFlows repo="a/b" revision="main" onRunCommand={run} read={read} />)
    expect(host.textContent).toContain(read.state === "loading" ? "Loading…" : read.state === "error" ? "Host unavailable" : "No flows yet.")
    expect(host.textContent).not.toContain(FLOW_HELD)
    if (read.state === "error") {
      expect(host.textContent).not.toContain("No flows yet")
      expect(host.querySelector('[role="alert"] h2')?.textContent).toBe("Couldn't load flows.")
      expect(host.querySelector('[role="alert"] a')?.getAttribute("href")).toBe("/a/b/flows")
    }
    expect(host.querySelector("button")).toBeNull()
  }
  const missing = render(<RepositoryFlow repo="a/b" name="gone" onRunCommand={run} read={{ state: "missing" }} />)
  expect(missing.querySelector("h2")?.textContent).toBe("Flow not found.")
  expect(missing.querySelector('a[href="/a/b/flows"]')).not.toBeNull()
})

test("detail renders source as text and copies only the local command through the clipboard flow", () => {
  const commands: [string, string | undefined][] = []
  const host = render(<RepositoryFlow repo="a/b" name="review" revision="main" onRunCommand={(name, args) => { commands.push([name, args]) }} read={{ state: "ready", value: { ...definition, source: '<script>bad()</script>\n' } }} />)
  expect(host.querySelector("script")).toBeNull()
  expect(host.textContent).toContain("Review changes")
  expect(host.querySelector('a[aria-label="Line 1"]')).not.toBeNull()
  const copy = host.querySelector<HTMLButtonElement>("button")!
  expect(copy.getAttribute("data-flow")).toBe("chat.copy-message")
  act(() => copy.click())
  expect(commands).toEqual([["chat.copy-message", "npx smthrs@next flow start review"]])
})

test("Settings: sign-in for visitors, not-found for readers, and only the two member sections", () => {
  const visitor = render(<RepositorySettings repo="a/b" access="signed-out" onRunCommand={run} sync={{ state: "failed", failure: "private reason", age: "1 h ago" }} />)
  expect(visitor.querySelector("h2")?.textContent).toBe("Sign in to open repository settings.")
  expect(visitor.querySelector("button")?.textContent).toBe("Sign in with GitHub")
  expect(visitor.textContent).not.toContain("private reason")
  const reader = render(<RepositorySettings repo="a/b" access="reader" onRunCommand={run} sync={{ state: "synced" }} />)
  expect(reader.textContent).toBe("Page not found.")
  const member = render(<RepositorySettings repo="a/b" access="member" onRunCommand={run} sync={{ state: "synced" }} />)
  expect([...member.querySelectorAll(".repo-settings-nav a")].map(node => [node.textContent, node.getAttribute("href"), node.getAttribute("aria-current")])).toEqual([["Models", "/a/b/settings/models", "page"], ["GitHub sync", "/a/b/settings/sync", null]])
  expect(member.querySelector("h1")?.textContent).toBe("Models")
  expect(member.textContent).toContain(MODELS_HELD)
  expect(member.querySelector("button, input")).toBeNull()
  const sync = render(<RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={run} sync={{ state: "stale", age: "3 h ago" }} />)
  expect(sync.querySelector("h1")?.textContent).toBe("GitHub sync")
  expect(sync.textContent).toContain("Synced 3 h ago")
  expect(sync.textContent).not.toContain(MODELS_HELD)
  const unknown = render(<RepositorySettings repo="a/b" access="member" section="secrets" onRunCommand={run} sync={{ state: "synced" }} />)
  expect(unknown.querySelector("h2")?.textContent).toBe("Setting not found.")
})

test("Settings while the session read is pending is the loading skeleton; a failed session read is an error, never not-found", () => {
  const pending = render(<RepositorySettings repo="a/b" access="loading" section="sync" onRunCommand={run} sync={{ state: "failed", failure: "private reason", age: "1 h ago" }} />)
  expect(pending.querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull()
  expect(pending.querySelector(".repo-frame-skeleton-title")).not.toBeNull()
  expect(pending.querySelectorAll(".repo-frame-skeleton-row")).toHaveLength(5)
  expect(pending.querySelector("a, button, select, h1, h2")).toBeNull()
  expect(pending.textContent).toBe("Loading…")
  const unavailable = render(<RepositorySettings repo="a/b" access="unavailable" onRunCommand={run} sync={{ state: "synced" }} />)
  expect(unavailable.querySelector('[role="alert"] h2')?.textContent).toBe("Couldn't load settings.")
  expect(unavailable.textContent).toContain("Sign-in is unavailable on this host.")
  expect(unavailable.textContent).not.toContain("Page not found.")
  expect(unavailable.querySelector("a, button, select, nav")).toBeNull()
})

test("Settings words GitHub sync exactly as the header chip rule does, and claims nothing without a mirror run", () => {
  const now = Date.parse("2026-10-19T12:00:00Z")
  const at = new Date(now - 3 * 3600_000).toISOString()
  const cases: [Record<string, unknown>, string | null][] = [
    [{ mirror_status: "synced", last_mirror_at: at }, "Synced with GitHub"],
    [{ mirror_status: "behind", behind_refs: 0, failed_refs: 0, last_mirror_at: at }, "Synced with GitHub"],
    [{ mirror_status: "behind", behind_refs: 2, failed_refs: 0, last_mirror_at: at }, "Synced 3 h ago"],
    [{ mirror_status: "failed", last_mirror_at: at, last_mirror_error: "GitHub returned 401" }, "GitHub sync failed: GitHub returned 401"],
    [{ mirror_status: "behind", behind_refs: 4, last_mirror_at: null }, null],
    [{ mirror_status: "synced" }, null]
  ]
  for (const [document, text] of cases) {
    const chip: GitHubSyncChip | null = githubSyncChip(githubSyncOf(document), now)
    const host = render(<RepositorySyncStatus sync={chip} />)
    if (text === null) {
      expect(chip).toBeNull()
      expect(host.textContent).toBe("No sync history.")
    } else expect(host.querySelector(".repo-settings-sync-state")?.textContent).toBe(text)
  }
})

test("the source display limit counts UTF-8 bytes and includes the boundary", async () => {
  for (const [source, state] of [["x".repeat(512 * 1024), "ready"], ["é".repeat(256 * 1024 + 1), "error"]] as const) {
    const reader = contents({ readFile: async () => {
      const answer = fileReadCard({ repo: "a/b", path: definition.path, content: source, binary: false }, 0, 0)
      return { ...answer, card: { ...answer.card, payload: { ...answer.card.payload, content: source, truncated: false } } }
    } })
    expect((await readFlow(reader, "a/b", "review")).state).toBe(state)
  }
})
