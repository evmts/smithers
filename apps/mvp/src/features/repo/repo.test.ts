import { Action } from "@smthrs/flow"
import { Effect, Exit, Layer, Schedule } from "effect"
import { FetchHttpClient } from "effect/http"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { testFile } from "../../../worker/test/harness"
import { type RepoHarness, repoHarness, resetRepos } from "../../../worker/test/repos"
import { runFlow } from "../../../worker/test/flowHost"
import { repoReads } from "../../flows/registrations"
import { openTab, type Tab } from "../../test/repoDevice"
import { RepoClient, RepoRefused } from "./api"
import { BUSY, COULDNT_LOAD, NOT_FOUND, READING_PAUSED } from "./contract"
import { RepoRead, RepoTree } from "./flows"
import { blobLoadMs, clones, permalinkCopies, treeLoadMs } from "./metrics"
import { headerOf } from "./view"

// The repository state machine on a tab, driven as React drives it, with no React: through the `Repo` layer's plain
// actions, reading its live queries. The tab reaches RepoApi's real handler (worker/RepoApi.ts) over the compose
// Postgres and Electric, through a fetch that hands each request to the handler in this process; a clone runs on the
// Node host. Code Storage and GitHub are the scripted providers (worker/test/codeStorage.ts).

const server = testFile("repo_tab")
beforeEach(() => resetRepos(server))

const tabs: Array<Tab> = []
afterEach(async () => {
  for (const tab of tabs.splice(0)) await tab.dispose()
})

/** A tab on `h`'s RepoApi. */
const open = async (h: RepoHarness) => {
  const tab = await openTab({ origin: h.origin, fetch: h.fetch, confirmWithin: "10 seconds" })
  tabs.push(tab)
  return tab
}

const header = (tab: Tab) => {
  const { repository, clone, view } = tab.view()
  return headerOf(repository, clone, view.signedIn)
}

const root = (owner: string, name: string) =>
  ({ owner, name, kind: "tree", ref: null, path: "", line: null, lineEnd: null }) as const

describe("cloning from a tab", () => {
  test("Clone shows cloning, Electric delivers the row, and the view opens at its README", async () => {
    const h = await repoHarness(server)
    h.scripted.publish("octocat", "Spoon-Knife")
    h.scripted.syncPolls = 2
    const tab = await open(h)
    // A second device on the same deployment sees the same row.
    const other = await open(h)
    tab.repo.actions.open(root("octocat", "Spoon-Knife"))
    other.repo.actions.open(root("octocat", "Spoon-Knife"))
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "clone" }))
    tab.repo.actions.clone("octocat", "Spoon-Knife")
    expect(header(tab)).toEqual({ kind: "cloning" })
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "accepted" })).toBe(1), { timeout: 10_000 })
    expect(tab.view().clone).toBeUndefined()
    await h.settled()
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "ready" }), { timeout: 10_000 })
    await vi.waitFor(() => expect(header(other)).toEqual({ kind: "ready" }), { timeout: 10_000 })
    await vi.waitFor(() => expect(tab.tree().tree?.state).toBe("ready"))
    expect(tab.tree().tree?.paths).toEqual(expect.arrayContaining(["README.md", "docs/guide.md", "src/index.ts"]))
    await vi.waitFor(() => expect(tab.readme().readme?.state).toBe("text"))
    expect(tab.view().view).toMatchObject({ revision: "main", path: "", readmePath: "README.md", missing: false })
    expect(tab.readme().readme?.contents).toContain("# Fixture")
    expect(tab.histogramCount(treeLoadMs, { outcome: "ready" })).toBe(1)
    expect(tab.lines("repo.tree.load")[0]!.annotations).toMatchObject({ outcome: "ready", feature: "repo" })
  })

  test("a clone already done answers 200, and the tab shows the row Electric has", async () => {
    const h = await repoHarness(server)
    await h.seed("octocat", "Spoon-Knife")
    const tab = await open(h)
    tab.repo.actions.open(root("octocat", "Spoon-Knife"))
    await vi.waitFor(() => expect(header(tab)).toEqual({ kind: "ready" }))
    tab.repo.actions.clone("octocat", "Spoon-Knife")
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "accepted" })).toBe(1))
    expect(header(tab)).toEqual({ kind: "ready" })
    expect(h.started()).toHaveLength(1)
  })

  test("a clone done before the device has its row waits for Electric to deliver it", async () => {
    const h = await repoHarness(server)
    await h.seed("octocat", "Spoon-Knife")
    const tab = await open(h)
    tab.repo.actions.clone("octocat", "Spoon-Knife")
    await vi.waitFor(() => expect(tab.count(clones, { outcome: "accepted" })).toBe(1))
    expect(tab.repo.lookups.repository("github/octocat/spoon-knife")?.status).toBe("ready")
  })
})

describe("reading a ready repository", () => {
  test("a file as text with its line anchor, a binary, one too large, and one that isn't there", async () => {
    const h = await repoHarness(server)
    const { id, headSha } = await h.seed("octocat", "Spoon-Knife")
    const tab = await open(h)
    const blob = (path: string, L?: string) =>
      tab.repo.actions.openRoute("blob", { owner: "octocat", repo: "Spoon-Knife", ref: "main", _splat: path }, { L })
    blob("src/index.ts", "2-3")
    await vi.waitFor(() => expect(tab.file().file?.state).toBe("text"))
    expect(tab.file().file).toMatchObject({ contents: expect.stringContaining("export const two = 2"), size: 65 })
    expect(tab.view().view).toMatchObject({ sha: headSha, path: "src/index.ts", line: 2, lineEnd: 3 })
    expect(tab.repo.lookups.file(id, headSha, "src/index.ts")?.state).toBe("text")
    await vi.waitFor(() => expect(tab.repo.lookups.tree(id, headSha)?.state).toBe("ready"))
    blob("logo.png")
    await vi.waitFor(() => expect(tab.file().file).toMatchObject({ state: "binary", size: 12 }))
    blob("big.txt")
    await vi.waitFor(() => expect(tab.file().file).toMatchObject({ state: "too-large", size: 600 * 1024 }))
    blob("nope.md")
    await vi.waitFor(() => expect(tab.file().file).toMatchObject({ state: "failed", message: NOT_FOUND }))
    expect(tab.histogramCount(blobLoadMs, { outcome: "text" })).toBe(1)
    expect(tab.histogramCount(blobLoadMs, { outcome: "failed" })).toBe(1)
    // A file loaded once is never fetched again.
    const reads = h.scripted.calls.filter((call) => call.startsWith("readFile")).length
    blob("src/index.ts")
    expect(tab.file().file?.state).toBe("text")
    expect(h.scripted.calls.filter((call) => call.startsWith("readFile"))).toHaveLength(reads)
  })

  test("a directory shows its README; a commit SHA reads there; another ref names nothing", async () => {
    const h = await repoHarness(server)
    const { id, headSha } = await h.seed("octocat", "Spoon-Knife")
    const tab = await open(h)
    tab.repo.actions.openRoute("tree", { owner: "octocat", repo: "Spoon-Knife", ref: headSha, _splat: "docs" }, {})
    await vi.waitFor(() => expect(tab.tree().tree?.state).toBe("ready"))
    expect(tab.view().view).toMatchObject({ revision: headSha, sha: headSha, path: "docs", readmePath: null })
    expect(tab.repo.lookups.readme(id, headSha, "docs")).toBeUndefined()
    tab.repo.actions.openRoute("tree", { owner: "octocat", repo: "Spoon-Knife", ref: "dev" }, {})
    await vi.waitFor(() => expect(tab.view().view.missing).toBe(true))
    tab.repo.actions.openRoute("tree", { owner: "octocat", repo: "Spoon-Knife" }, {})
    await vi.waitFor(() => expect(tab.readme().readme?.state).toBe("text"))
    expect(tab.repo.lookups.readme(id, headSha, "")?.state).toBe("text")
  })

  test("Copy permalink puts the location at its commit on the clipboard", async () => {
    const h = await repoHarness(server)
    const { headSha } = await h.seed("octocat", "Spoon-Knife")
    const tab = await open(h)
    tab.repo.actions.openRoute("blob", { owner: "octocat", repo: "Spoon-Knife", ref: "main", _splat: "src/index.ts" }, {
      L: "2",
    })
    await vi.waitFor(() => expect(tab.view().view.sha).toBe(headSha))
    tab.repo.actions.copyPermalink()
    await vi.waitFor(() => expect(tab.copied).toEqual([`${h.origin}/octocat/Spoon-Knife/blob/${headSha}/src/index.ts?L=2`]))
    tab.repo.actions.openRoute("blob", { owner: "octocat", repo: "Spoon-Knife", ref: "main", _splat: "src/index.ts" }, {
      L: "1-3",
    })
    await vi.waitFor(() => expect(tab.view().view.sha).toBe(headSha))
    tab.repo.actions.copyPermalink()
    await vi.waitFor(() => expect(tab.copied).toHaveLength(2))
    expect(tab.copied[1]).toBe(`${h.origin}/octocat/Spoon-Knife/blob/${headSha}/src/index.ts?L=1-3`)
    expect(tab.count(permalinkCopies, { outcome: "copied" })).toBe(2)
  })

  test("a clipboard that refuses is counted and logged", async () => {
    const h = await repoHarness(server)
    const { headSha } = await h.seed("octocat", "Spoon-Knife")
    const tab = await openTab({
      origin: h.origin,
      fetch: h.fetch,
      writeText: () => Promise.reject(new DOMException("Document is not focused.", "NotAllowedError")),
    })
    tabs.push(tab)
    tab.repo.actions.open(root("octocat", "Spoon-Knife"))
    await vi.waitFor(() => expect(tab.view().view.sha).toBe(headSha))
    tab.repo.actions.copyPermalink()
    await vi.waitFor(() => expect(tab.count(permalinkCopies, { outcome: "failed" })).toBe(1))
    expect(tab.lines("repo.permalink")[0]!.annotations).toMatchObject({ outcome: "failed" })
  })

  test("a list Code Storage couldn't give fails busy, and opening it again loads it again", async () => {
    const h = await repoHarness(server)
    const { headSha } = await h.seed("octocat", "Spoon-Knife")
    h.scripted.fail("listFiles", h.scripted.error("listFiles", "internal_error", 500))
    const tab = await open(h)
    tab.repo.actions.open(root("octocat", "Spoon-Knife"))
    await vi.waitFor(() => expect(tab.tree().tree).toMatchObject({ state: "failed", message: BUSY }))
    expect(tab.histogramCount(treeLoadMs, { outcome: "failed" })).toBe(1)
    expect(tab.lines("repo.tree.load")[0]!.annotations).toMatchObject({ outcome: "failed", status: 503 })
    tab.repo.actions.open(root("octocat", "Spoon-Knife"))
    await vi.waitFor(() => expect(tab.tree().tree?.state).toBe("ready"))
    expect(tab.view().view.sha).toBe(headSha)
  })
})

describe("reads RepoApi refuses", () => {
  test("the read budget spent reads as paused; a gateway's error, as couldn't load", async () => {
    const h = await repoHarness(server)
    await h.seed("octocat", "Spoon-Knife")
    // RepoApi's real routes, behind a client that refuses the reads (test.faults-by-injection).
    const real = RepoClient.layer({ origin: h.origin, within: "10 seconds" }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, h.fetch)),
    )
    const refusing = Layer.effect(
      RepoClient,
      Effect.map(Effect.service(RepoClient), (client) =>
        RepoClient.of({
          ...client,
          tree: () => Effect.fail(new RepoRefused({ status: 503, code: "capacity" })),
          blob: () => Effect.fail(new RepoRefused({ status: 502 })),
        })),
    ).pipe(Layer.provide(real))
    const tab = await openTab({ origin: h.origin, fetch: h.fetch, client: refusing, retry: Schedule.spaced("1 second") })
    tabs.push(tab)
    tab.repo.actions.openRoute("blob", { owner: "octocat", repo: "Spoon-Knife", ref: "main", _splat: "README.md" }, {})
    await vi.waitFor(() => expect(tab.tree().tree).toMatchObject({ state: "failed", message: READING_PAUSED }))
    await vi.waitFor(() => expect(tab.file().file).toMatchObject({ state: "failed", message: COULDNT_LOAD }))
  })
})

describe("the agent's reads on this device", () => {
  test("repo/tree and repo/read run on the Node host as the engine worker registers them, through RepoApi's routes", async () => {
    const h = await repoHarness(server)
    const { headSha } = await h.seed("octocat", "Spoon-Knife")
    // The engine worker's registration (src/flows/registrations.ts), over the host's HttpClient.
    const reads = repoReads(h.origin).pipe(
      Layer.provideMerge(Action.layerImplementations),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, h.fetch)),
    )
    const tree = await runFlow(RepoTree, { repo: "octocat/Spoon-Knife", revision: headSha }, reads)
    expect(tree.status).toBe("completed")
    expect(Exit.isSuccess(tree.exit) && tree.exit.value.paths).toEqual(expect.arrayContaining(["README.md"]))
    const file = await runFlow(RepoRead, { repo: "octocat/Spoon-Knife", revision: headSha, path: "README.md" }, reads)
    expect(file.exit).toEqual(Exit.succeed({ state: "text", contents: expect.stringContaining("# Fixture"), size: 43 }))
    const large = await runFlow(RepoRead, { repo: "octocat/Spoon-Knife", revision: headSha, path: "big.txt" }, reads)
    expect(large.exit).toEqual(Exit.succeed({ state: "too-large", size: 600 * 1024 }))
    const missing = await runFlow(RepoRead, { repo: "octocat/Spoon-Knife", revision: headSha, path: "gone.md" }, reads)
    expect(Exit.isFailure(missing.exit)).toBe(true)
    expect(missing.status).toBe("failed")
  })
})
