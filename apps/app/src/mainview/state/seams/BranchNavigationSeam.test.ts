/*
 * `/branches` on a hosted page, through the real controller and store: the
 * rows are the connected repository's actual branches, read through the one
 * canonical resolver the header dropdown, `/branch` and the agent share
 * (GET /api/repos/{owner}/{repo}/bookmarks). The only stand-in is the HTTP
 * door (`fetchImpl`), which answers the wire shape production serves.
 *
 * Production asked the hosted backend for the install's global
 * /api/branches, which it does not serve and never did: it answered 404, the
 * seam's typed BranchNavigationFailure had no registered copy, and the person
 * was told "Branches didn't finish — the app hit an unexpected error" (#4028).
 */
import { describe, expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { scopedControllers } from "../ControllerTestScope"
import { headerSelection } from "../HeaderSelection"
import { memoryStorage, silentAgent, waitFor } from "../TestFixtures"
import { presentAppFailure } from "../controller/AppFailure"
import { BranchNavigationFailure, branchNavigationDiagnostic, hostedBranchNodes, hostedBranchTree, sessionBranchIndex } from "./BranchNavigationSeam"

const createAppController = scopedControllers()
const cloud = { apiVersion: 1 as const, host: "cloud" as const, version: "test", buildSha: "test", capabilities: ["identity" as const, "agent" as const, "github" as const, "cloud" as const], authFlow: "redirect" as const, sandbox: null }
const install = { ...cloud, host: "local" as const, capabilities: ["install" as const] }
const bookmark = (name: string) => ({ name, target_change_id: `change-${name}`, target_commit_id: `commit-${name}`, is_tracking_remote: true })
const repository = (id: string, defaultBranch: string) => {
  const [org = "", name = ""] = id.split("/")
  return { id, org, ownerKind: "org" as const, name, head: { bookmark: defaultBranch, changeId: "c", commitId: "k" } }
}

type Answer = (url: URL) => Response | undefined | Promise<Response | undefined>
const harness = async (answer: Answer, bootstrap: typeof cloud | typeof install = cloud, designFixture = false) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  /** Every path the page asked for, so a read that resumed nothing can be proved. */
  const reads: string[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap,
    ...(designFixture ? { designFixture: true } : {}),
    fetchImpl: async (input, init) => {
      const url = new URL(String(input), "https://cloud.test")
      reads.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`)
      return await answer(url) ?? Response.json({ code: "not_found", class: "user", message: "not found" }, { status: 404 })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [repository("acme/api", "trunk"), repository("acme/web", "develop")] }).isPersisted.promise
  /*
   * What the hosted page paints, by the view's own rule (hostedBranchNodes):
   * the CURRENT repository's rows. Reading the session's nodes instead would
   * accept a tree another repository's read left behind.
   */
  const nodes = () => hostedBranchNodes(
    headerSelection(controller).repository,
    repo => controller.repositoryBranches.rows.get(repo)?.names,
    repo => store.collections.repositories.get(repo)?.head?.bookmark ?? null
  ).map(node => ({ id: node.id, kind: node.kind, children: node.children.length }))
  /*
   * What BranchNavigation.tsx actually paints, by its own rule: the session's
   * index where the seam writes one, the repository's rows otherwise. The two
   * sources are read through the SAME predicate the seam chose its read with,
   * which is the whole point of `sessionBranchIndex`.
   */
  const painted = () => sessionBranchIndex({
    install: bootstrap.capabilities.includes("install" as never),
    designEnabled: controller.design.enabled
  })
    ? (store.session().branchNavigation?.nodes ?? []).map(node => ({ id: node.id, kind: node.kind, children: node.children.length }))
    : nodes()
  const toast = () => store.collections.toasts.get("toast-branch-tree")
  return { store, controller, reads, nodes, painted, toast, selection: () => headerSelection(controller) }
}
const branchesOf = (names: Readonly<Record<string, ReadonlyArray<string>>>): Answer => url => {
  const match = /^\/api\/repos\/([^/]+)\/([^/]+)\/bookmarks$/.exec(url.pathname)
  if (!match) return undefined
  const listed = names[`${match[1]}/${match[2]}`]
  // A repository this account cannot read is not a row: plue refuses the read.
  if (listed === undefined) return Response.json({ code: "not_found", class: "user", message: "not found" }, { status: 404 })
  return Response.json({ items: listed.map(bookmark), next_cursor: "" })
}

describe("the hosted branch list is the connected repository's own branches", () => {
  test("rows are the repository's real branches, its own default is the trunk, and no install route or workspace is touched", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs", "retry-webhooks"], "acme/web": ["develop"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    expect((await h.controller.commands.run("branches")).status).toBe("executed")
    await waitFor(() => h.nodes().length === 3)
    // The trunk is `trunk`, the repository's own current bookmark — not a hardcoded main.
    expect(h.nodes()).toEqual([
      { id: "trunk", kind: "main", children: 0 },
      { id: "docs", kind: "scratch", children: 0 },
      { id: "retry-webhooks", kind: "scratch", children: 0 }
    ])
    expect(h.toast()?.status).not.toBe("failed")
    // No install-global branch index, and no write: listing resumes no workspace.
    expect(h.reads.some(read => read.includes("/api/branches"))).toBe(false)
    expect(h.reads.some(read => read.startsWith("POST"))).toBe(false)
    expect(new Set(h.reads.filter(read => read.includes("/bookmarks")))).toEqual(new Set(["GET /api/repos/acme/api/bookmarks?limit=100"]))
  })

  test("the list follows the bookmarks route's own pagination", async () => {
    const h = await harness(url => {
      if (url.pathname !== "/api/repos/acme/api/bookmarks") return undefined
      return url.searchParams.get("cursor") === "page-2"
        ? Response.json({ items: [bookmark("trunk")], next_cursor: "" })
        : Response.json({ items: [bookmark("landing/api/main"), bookmark("docs")], next_cursor: "page-2" })
    })
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    await waitFor(() => h.nodes().length === 3)
    expect(h.nodes().map(node => node.id)).toEqual(["trunk", "docs", "landing/api/main"])
    expect(h.reads.filter(read => read.includes("cursor=page-2")).length).toBeGreaterThan(0)
    expect(new Set(h.reads.filter(read => read.includes("/bookmarks")))).toEqual(new Set([
      "GET /api/repos/acme/api/bookmarks?limit=100",
      "GET /api/repos/acme/api/bookmarks?limit=100&cursor=page-2"
    ]))
  })

  test("rows are scoped to the selected repository: a change of repository re-reads and never mixes the two", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"], "acme/web": ["develop", "release"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    await waitFor(() => h.nodes().length === 2)
    expect(h.nodes().map(node => node.id)).toEqual(["trunk", "docs"])
    await h.controller.commands.run("repo.select", "acme/web")
    await h.controller.commands.run("branches")
    await waitFor(() => h.nodes().map(node => node.id).join() === "develop,release")
    expect(h.nodes()).toEqual([
      { id: "develop", kind: "main", children: 0 },
      { id: "release", kind: "scratch", children: 0 }
    ])
  })

  test("a repository the account cannot read lists no branches and reads back plue's own refusal words", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk"] }))
    await h.controller.commands.run("repo.select", "acme/web")
    await h.controller.commands.run("branches")
    await waitFor(() => h.toast()?.status === "failed")
    expect(h.toast()?.detail).toContain("not found")
    expect(h.toast()?.detail).not.toContain("unexpected error")
    expect(h.toast()?.detail).not.toContain("/api/")
    expect(h.nodes()).toEqual([])
  })

  test("a host that answers the bookmarks route with bare 404 text still reads as branches not listed", async () => {
    const h = await harness(url => url.pathname.endsWith("/bookmarks") ? new Response("404 page not found", { status: 404 }) : undefined)
    await h.controller.commands.run("repo.select", "acme/web")
    await h.controller.commands.run("branches")
    await waitFor(() => h.toast()?.status === "failed")
    expect(h.toast()?.detail).toContain("Branches for acme/web couldn't be listed")
    expect(h.toast()?.detail).not.toContain("unexpected error")
    expect(h.toast()?.detail).not.toContain("404")
    expect(h.nodes()).toEqual([])
  })

  test("with no repository chosen the refusal names the reader's next step, not a broken app", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk"] }))
    await h.controller.commands.run("branches")
    await waitFor(() => h.toast()?.status === "failed")
    expect(h.toast()?.detail).toBe("Choose a repository to see its branches.")
    expect(h.nodes()).toEqual([])
    expect(h.reads.some(read => read.includes("/bookmarks"))).toBe(false)
  })

  test("selecting a row picks that branch through the shared door and reads back as the current one", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    await waitFor(() => h.nodes().length === 2)
    // The row's own action: the `branch` flow, exactly what the header dropdown submits.
    expect(await h.controller.commands.submit({ name: "branch", payload: { name: "docs" }, actor: "user" }))
      .toEqual({ status: "executed", value: "Opened docs" })
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBe("docs")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
    // The conversation a hosted page addresses is still its one conversation.
    expect(h.store.session().branchNavigation?.selected_branch).toBe("main")
  })
})

/*
 * One pending read for every question: `/branches` kept a single in-flight
 * promise and a fence that compared the account login alone, so a question
 * about one repository could answer underneath another repository's header,
 * and the later question was dropped entirely while the earlier one hung.
 */
describe("the read question is one account generation and one repository", () => {
  test("the latest repository is read without waiting for the previous one, and the late answer paints nothing", async () => {
    let answerApi!: (response: Response) => void
    const api = new Promise<Response>(resolve => { answerApi = resolve })
    let webReads = 0
    const h = await harness(url => {
      if (url.pathname === "/api/repos/acme/api/bookmarks") return api
      if (url.pathname !== "/api/repos/acme/web/bookmarks") return undefined
      webReads += 1
      // The repository change's own read is refused once, so only a question
      // that was actually re-driven can produce acme/web's rows.
      return webReads === 1
        ? Response.json({ code: "unavailable", class: "infra", message: "busy" }, { status: 503 })
        : Response.json({ items: [bookmark("develop"), bookmark("release")], next_cursor: "" })
    })
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    // acme/api has not answered. The person selects another repository and asks again.
    await h.controller.commands.run("repo.select", "acme/web")
    await waitFor(() => webReads === 1)
    expect((await h.controller.commands.run("branches")).status).toBe("executed")
    await waitFor(() => h.nodes().map(node => node.id).join() === "develop,release")
    expect(h.nodes()).toEqual([
      { id: "develop", kind: "main", children: 0 },
      { id: "release", kind: "scratch", children: 0 }
    ])
    // acme/api answers last. It is not the page's question any more.
    answerApi(Response.json({ items: [bookmark("trunk"), bookmark("docs")], next_cursor: "" }))
    await waitFor(() => h.reads.filter(read => read.includes("/api/repos/acme/api/bookmarks")).length === 1)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(h.nodes().map(node => node.id)).toEqual(["develop", "release"])
    expect(h.selection()).toEqual({ repository: "acme/web", branch: "develop" })
    expect(h.controller.repositoryBranches.pickOf("acme/web")).toBeUndefined()
    expect(h.store.session().branchNavigation?.selected_branch).toBe("main")
    expect(h.toast()?.status).not.toBe("failed")
  })

  test("a repository read that began under the previous account grants no rows, no pick and no result", async () => {
    let answer!: (response: Response) => void
    const held = new Promise<Response>(resolve => { answer = resolve })
    const h = await harness(url => url.pathname === "/api/repos/acme/api/bookmarks" ? held : undefined)
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    // `/branch docs` is waiting on the very same read.
    const picking = h.controller.commands.submit({ name: "branch", payload: { name: "docs" }, actor: "user" })
    await waitFor(() => h.reads.some(read => read.includes("/api/repos/acme/api/bookmarks")))
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "alice", admin: false, scopesPlain: null }).isPersisted.promise
    answer(Response.json({ items: [bookmark("trunk"), bookmark("docs")], next_cursor: "" }))
    // The retired answer names a branch, and it authorizes nothing.
    expect((await picking).status).not.toBe("executed")
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(h.controller.repositoryBranches.rows.get("acme/api")).toBeUndefined()
    expect(h.nodes()).toEqual([])
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBeUndefined()
    expect(h.store.session().branchNavigation?.selected_branch).toBe("main")
  })

  test("a branch the retired account's read listed never becomes the new account's pick", async () => {
    const answers: Array<(response: Response) => void> = []
    // maya's read lists docs; alice's own read of the same repository does not.
    const listings = [["trunk", "docs"], ["trunk"]]
    const h = await harness(url => {
      if (url.pathname !== "/api/repos/acme/api/bookmarks") return undefined
      const names = listings[answers.length] ?? ["trunk"]
      return new Promise<Response>(resolve => { answers.push(() => resolve(Response.json({ items: names.map(bookmark), next_cursor: "" }))) })
    })
    await h.controller.commands.run("repo.select", "acme/api")
    const picking = h.controller.commands.submit({ name: "branch", payload: { name: "docs" }, actor: "user" })
    await waitFor(() => answers.length === 1)
    // The account changes, and the new account opens the same repository.
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "alice", admin: false, scopesPlain: null }).isPersisted.promise
    await h.store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [repository("acme/api", "trunk")] }).isPersisted.promise
    await h.controller.commands.run("repo.select", "acme/api")
    await waitFor(() => answers.length === 2)
    answers[1]!(new Response())
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/api")?.state === "ready")
    // maya's answer lands last. It names docs, and it authorizes nothing here.
    answers[0]!(new Response())
    // The real flow registry refuses the act outright: the account that asked is gone.
    const outcome = await picking
    expect(outcome.status).toBe("failed")
    expect(outcome.status === "failed" ? outcome.error : "").toContain("account, or turn changed")
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBeUndefined()
    expect(h.controller.repositoryBranches.rows.get("acme/api")?.names).toEqual(["trunk"])
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "trunk" })
  })

  test("an account that signed out and back in is a new generation: the earlier answer still grants nothing", async () => {
    let answer!: (response: Response) => void
    const held = new Promise<Response>(resolve => { answer = resolve })
    const h = await harness(url => url.pathname === "/api/repos/acme/api/bookmarks" ? held : undefined)
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    await waitFor(() => h.reads.some(read => read.includes("/api/repos/acme/api/bookmarks")))
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
    answer(Response.json({ items: [bookmark("trunk"), bookmark("docs")], next_cursor: "" }))
    await new Promise(resolve => setTimeout(resolve, 10))
    // The login spells the same, and the read still belongs to the generation that asked.
    expect(h.nodes()).toEqual([])
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBeUndefined()
  })
})

describe("a host that serves no branch list says so", () => {
  test("the install read's 404 carries stage and reason and reads as a missing route, never an unexpected error", async () => {
    const h = await harness(() => new Response("404 page not found", { status: 404 }), install)
    await h.controller.commands.run("branches")
    await waitFor(() => h.toast()?.status === "failed")
    expect(h.toast()?.detail).toBe("This host doesn't serve a branch list.")
    expect(h.toast()?.detail).not.toContain("unexpected error")
  })

  test("every reason has its own words, and the diagnostic names the door without a URL, a credential or host prose", () => {
    const sentences = (["repeated-branch", "cyclic-tree", "route-absent", "host-refused", "no-repository"] as const)
      .map(reason => presentAppFailure(new BranchNavigationFailure({ sentence: "Branches unavailable", stage: "install-read", reason }), () => {}).sentence)
    expect(sentences.some(sentence => sentence.includes("unexpected error"))).toBe(false)
    expect(new Set(sentences).size).toBe(sentences.length)
    const failure = new BranchNavigationFailure({ sentence: "Branches unavailable", stage: "repository-read", reason: "host-refused" })
    expect(branchNavigationDiagnostic(failure, 0)).toBe("branches.list stage=repository-read reason=host-refused rows=0")
  })
})

/*
 * The seam decides WHERE a tree is written and the view decides WHICH of the
 * two it paints, so one predicate has to answer both (`sessionBranchIndex`).
 * The seeded design world on a hosted account was where they disagreed: with
 * no hosted source the seam wrote the design tree to the session, the view
 * read the repository's rows, no hosted read had ever been made, and the page
 * painted nothing but `Earlier` (showcase repo-home and workspace, AppsDeploy
 * 38957448693 shard 3).
 */
describe("the index the seam writes is the index the page paints", () => {
  test("the seeded design world paints its own tree instead of an empty repository", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk"] }), cloud, true)
    expect(h.controller.design.enabled).toBe(true)
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    await waitFor(() => h.painted().length > 0)
    const [main] = h.painted()
    expect(main?.id).toBe("main")
    expect(main?.kind).toBe("main")
    // The design seed's own branches hang off it; an empty tree is the bug.
    expect(main!.children).toBeGreaterThan(0)
    // Nothing invented for the repository either: no hosted bookmarks read was
    // made, because this world is not reading the repository's branches.
    expect(h.reads.some(read => read.includes("/bookmarks"))).toBe(false)
  })

  test("off the design fixture a hosted page still paints the repository's own branches, and nothing from the session", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    expect(h.controller.design.enabled).toBe(false)
    expect(sessionBranchIndex({ install: false, designEnabled: false })).toBe(false)
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branches")
    await waitFor(() => h.painted().length === 2)
    expect(h.painted().map(node => node.id)).toEqual(["trunk", "docs"])
    // The hosted read is what filled it, and the session carries no tree.
    expect(h.reads.some(read => read.includes("/bookmarks"))).toBe(true)
    expect(h.store.session().branchNavigation?.nodes).toEqual([])
  })

  test("an install keeps its own session-held index", () => {
    expect(sessionBranchIndex({ install: true, designEnabled: false })).toBe(true)
    expect(sessionBranchIndex({ install: true, designEnabled: true })).toBe(true)
    expect(sessionBranchIndex({ install: false, designEnabled: true })).toBe(true)
  })
})

describe("the hosted tree is the branch names and nothing invented", () => {
  test("a repository whose default is unknown or unlisted gets no trunk node", () => {
    expect(hostedBranchTree(["docs", "trunk"], null).map(node => node.kind)).toEqual(["scratch", "scratch"])
    expect(hostedBranchTree(["docs", "trunk"], "main").map(node => node.kind)).toEqual(["scratch", "scratch"])
    expect(hostedBranchTree([], "main")).toEqual([])
  })

  test("names are unique, sorted with the trunk first, and every row opens through the branch flow", () => {
    expect(hostedBranchTree(["zeta", "docs", "trunk", "docs", ""], "trunk")).toEqual([
      { id: "trunk", name: "trunk", kind: "main", present: [], children: [], action: { tag: "branch", label: "Open", args: { name: "trunk" } } },
      { id: "docs", name: "docs", kind: "scratch", present: [], children: [], action: { tag: "branch", label: "Open", args: { name: "docs" } } },
      { id: "zeta", name: "zeta", kind: "scratch", present: [], children: [], action: { tag: "branch", label: "Open", args: { name: "zeta" } } }
    ])
  })
})
