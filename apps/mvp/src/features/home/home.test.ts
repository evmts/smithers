import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { fixture } from "../../../worker/test/codeStorage"
import { testFile } from "../../../worker/test/harness"
import { type RepoHarness, repoHarness, resetRepos } from "../../../worker/test/repos"
import { openTab, type Tab } from "../../test/repoDevice"
import { HOME_FILE, HOME_INVALID, HOME_UNREADABLE } from "./contract"
import { resolves } from "./metrics"
import { homePageOf, tabsOf } from "./view"

// A repository's home on a tab, driven as React drives it, with no React: the route's loader calls `open`, and the
// page reads the `Home` layer's live queries. The tab reaches RepoApi's real handler (worker/RepoApi.ts) over the
// compose Postgres and Electric; Code Storage is the scripted provider (worker/test/codeStorage.ts), whose faults stand
// in for an outage (test.faults-by-injection).

const server = testFile("home_tab")
beforeEach(() => resetRepos(server))

const waitFor = <A>(check: () => A) => vi.waitFor(check, { timeout: 10_000 })

const tabs: Array<Tab> = []
afterEach(async () => {
  for (const tab of tabs.splice(0)) await tab.dispose()
})

const open = async (h: RepoHarness) => {
  const tab = await openTab({ origin: h.origin, fetch: h.fetch })
  tabs.push(tab)
  return tab
}

/** What the page shows, and the tabs over it. */
const page = (tab: Tab) => {
  const { current, home } = tab.home.queries.home.toArray[0]!
  return { page: homePageOf(current, home), tabs: tabsOf(current, home), current, home }
}

const files = (tab: Tab) => Object.fromEntries(tab.home.queries.files.toArray.map((file) => [file.path, file]))

/** A sentinel no record may carry. */
const SECRET = "sentinel-6b1f2c"

const declared = JSON.stringify({
  blocks: [
    { type: "prompt", title: `What should we work on? ${SECRET}`, placeholder: "Ask Smithers…" },
    { type: "text", text: `A small HTTP server. ${SECRET}` },
    { type: "links", links: [{ label: "Docs", url: `https://example.com/${SECRET}` }] },
    { type: "markdown", path: "docs/intro.md", title: "Intro" },
    { type: "markdown", path: "docs/intro.md" },
    { type: "markdown", path: "docs/missing.md" },
    { type: "app", flow: "flow.new", title: "Make a flow", picture: "wiki" },
    { type: "chart", data: [1, 2, 3] },
  ],
})

/** A ready repository whose default branch holds `files`. */
const seeded = async (h: RepoHarness, files: Record<string, string | Uint8Array>, defaultBranch = "main") => {
  await h.seed("maya", "tinyhttp", fixture({ branch: defaultBranch, files: { "README.md": "# tinyhttp\n", ...files } }))
}

describe("a repository's home", () => {
  test("a declared home draws its blocks, reads its Markdown files once each at the same commit, and gets tabs", async () => {
    const h = await repoHarness(server)
    await seeded(h, { [HOME_FILE]: declared, "docs/intro.md": `# Intro ${SECRET}\n` })
    const tab = await open(h)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).page.kind).toBe("home"))
    const { page: shown, tabs: links, home } = page(tab)
    expect(home).toMatchObject({ state: "declared", skipped: 1, reason: null })
    expect(shown.kind === "home" && shown.blocks.map((block) => block.type)).toEqual([
      "prompt",
      "text",
      "links",
      "markdown",
      "markdown",
      "markdown",
      "app",
    ])
    expect(shown).toMatchObject({ askHref: "/maya/tinyhttp/tree/main" })
    expect(links).toEqual({ owner: "maya", repo: "tinyhttp", ref: "main", _splat: "" })
    await waitFor(() => expect(files(tab)["docs/missing.md"]?.state).toBe("failed"))
    await waitFor(() => expect(files(tab)["docs/intro.md"]).toMatchObject({ state: "text", text: `# Intro ${SECRET}\n` }))
    expect(h.scripted.calls.filter((call) => call.endsWith(":docs/intro.md"))).toHaveLength(1)
    expect(tab.count(resolves, { outcome: "declared" })).toBe(1)
    expect(tab.lines("home.resolve")[0]!.annotations).toMatchObject({
      feature: "home",
      outcome: "declared",
      blocks: 7,
      skipped: 1,
    })
    expect(tab.lines("home.file.load").map((line) => line.annotations.outcome).sort()).toEqual(["failed", "text"])
    // Nothing the repository wrote reaches a record.
    expect(JSON.stringify(tab.logs)).not.toContain(SECRET)
    // Opened again: the file that couldn't be read is read again; the one it has is not.
    const missing = () => h.scripted.calls.filter((call) => call.endsWith(":docs/missing.md")).length
    expect(missing()).toBe(1)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(missing()).toBe(2))
    await waitFor(() => expect(files(tab)["docs/missing.md"]?.state).toBe("failed"))
    expect(h.scripted.calls.filter((call) => call.endsWith(":docs/intro.md"))).toHaveLength(1)
  })

  test("opening it again, or another page of it, reads nothing more: a home at a commit never changes", async () => {
    const h = await repoHarness(server)
    const home = JSON.stringify({ blocks: [{ type: "markdown", path: "docs/intro.md" }, { type: "text", text: "Hi" }] })
    await seeded(h, { [HOME_FILE]: home, "docs/intro.md": "# Intro\n" })
    const tab = await open(h)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(files(tab)["docs/intro.md"]?.state).toBe("text"))
    const reads = h.scripted.calls.length
    tab.home.actions.open("maya", "tinyhttp")
    // The page keeps its home while the head is read again.
    expect(page(tab).page.kind).toBe("home")
    await waitFor(() => expect(tab.count(resolves, { outcome: "cached" })).toBe(1))
    expect(h.scripted.calls.length).toBe(reads)
    expect(page(tab).page.kind).toBe("home")
  })

  test("a default branch named with a `/` splits into the tree route's ref and splat", async () => {
    const h = await repoHarness(server)
    await seeded(h, { [HOME_FILE]: declared }, "release/1.0")
    const tab = await open(h)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).tabs).toEqual({ owner: "maya", repo: "tinyhttp", ref: "release", _splat: "1.0" }))
    expect(page(tab).page).toMatchObject({ askHref: "/maya/tinyhttp/tree/release/1.0" })
  })

  test("a repository without a home is its tree, with no tabs and no line", async () => {
    const h = await repoHarness(server)
    await seeded(h, {})
    const tab = await open(h)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).home?.state).toBe("absent"))
    expect(page(tab)).toMatchObject({ page: { kind: "tree", notice: null }, tabs: undefined })
    expect(tab.lines("home.resolve")[0]!.annotations).toMatchObject({ outcome: "absent", status: 404, blocks: 0 })
  })

  test("a home declaring no blocks is the tree too", async () => {
    const h = await repoHarness(server)
    await seeded(h, { [HOME_FILE]: '{"blocks":[]}' })
    const tab = await open(h)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).home?.state).toBe("declared"))
    expect(page(tab)).toMatchObject({ page: { kind: "tree", notice: null }, tabs: undefined })
  })

  test("a home that isn't one is the tree under `Home is invalid`, by its reason", async () => {
    const cases: ReadonlyArray<readonly [string | Uint8Array, string]> = [
      ["{ not json", "json"],
      ['{"blocks":[{"type":"text","text":"<b>bold</b>"}]}', "block"],
      [JSON.stringify({ blocks: Array.from({ length: 33 }, () => ({ type: "text", text: "x" })) }), "blocks"],
      [new Uint8Array([0, 1, 2, 3]), "binary"],
      ["x".repeat(512 * 1024 + 1), "too_large"],
    ]
    for (const [body, reason] of cases) {
      await resetRepos(server)
      const h = await repoHarness(server)
      await seeded(h, { [HOME_FILE]: body })
      const tab = await open(h)
      tab.home.actions.open("maya", "tinyhttp")
      await waitFor(() => expect(page(tab).home?.state).toBe("invalid"))
      expect([reason, page(tab).home?.reason, page(tab).page]).toEqual([reason, reason, { kind: "tree", notice: HOME_INVALID }])
      expect(page(tab).tabs).toBeUndefined()
      expect(tab.lines("home.resolve")[0]!.annotations).toMatchObject({ outcome: "invalid", reason })
    }
  })

  test("RepoApi couldn't read it: the tree under `Couldn't read home`, read again on the next open", async () => {
    const h = await repoHarness(server)
    await seeded(h, { [HOME_FILE]: declared })
    h.scripted.fail("readFile", h.scripted.error("readFile", "unavailable", 503))
    const tab = await open(h)
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).home?.state).toBe("unreadable"))
    expect(page(tab).page).toEqual({ kind: "tree", notice: HOME_UNREADABLE })
    expect(tab.lines("home.resolve")[0]).toMatchObject({ level: "WARN", annotations: { outcome: "unreadable", status: 503 } })
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).page.kind).toBe("home"))
    expect(tab.count(resolves, { outcome: "declared" })).toBe(1)
  })

  test("before the repository is ready the page is the tree's; another repository interrupts the wait", async () => {
    const h = await repoHarness(server)
    await seeded(h, { [HOME_FILE]: declared })
    const tab = await open(h)
    // Not cloned: the load waits for a ready row that never comes, and the page is the tree's, which says why.
    tab.home.actions.open("octocat", "Spoon-Knife")
    expect(page(tab)).toMatchObject({ page: { kind: "tree", notice: null }, current: { owner: "octocat", key: null } })
    tab.home.actions.open("maya", "tinyhttp")
    await waitFor(() => expect(page(tab).page.kind).toBe("home"))
    expect(page(tab).current).toMatchObject({ owner: "maya", name: "tinyhttp", defaultBranch: "main" })
    // A name GitHub couldn't have opens nothing.
    tab.home.actions.open("app", "x y")
    expect(page(tab)).toMatchObject({ page: { kind: "tree", notice: null }, current: { owner: "app", key: null } })
  })
})
