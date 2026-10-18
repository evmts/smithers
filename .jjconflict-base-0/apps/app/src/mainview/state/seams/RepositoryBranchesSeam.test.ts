/*
 * The `branch` and `repo.select` flows off an install, through the real
 * controller and store: a branch is one of the selected Cloud repository's
 * bookmarks, read from the bookmarks route. The only stand-in is the HTTP
 * door (`fetchImpl`), which answers the wire shape production serves.
 */
import { describe, expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { scopedControllers } from "../ControllerTestScope"
import { headerSelection } from "../HeaderSelection"
import { memoryStorage, silentAgent, waitFor } from "../TestFixtures"
import { BRANCH_PICKS_STORAGE_KEY, pickKey } from "./RepositoryBranchesSeam"

const createAppController = scopedControllers()
const cloud = { apiVersion: 1 as const, host: "cloud" as const, version: "test", buildSha: "test", capabilities: ["identity" as const, "agent" as const, "github" as const, "cloud" as const], authFlow: "redirect" as const, sandbox: null }
const bookmark = (name: string) => ({ name, target_change_id: `change-${name}`, target_commit_id: `commit-${name}`, is_tracking_remote: true })
const repository = (id: string, defaultBranch: string) => {
  const [org = "", name = ""] = id.split("/")
  return { id, org, ownerKind: "org" as const, name, head: { bookmark: defaultBranch, changeId: "c", commitId: "k" } }
}

type Answer = (url: URL) => Response | undefined | Promise<Response | undefined>
const harness = async (answer: Answer, login: string | null = "maya") => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const bookmarkReads: string[] = []
  /** Every conversation this page addressed, by the branch in its path. */
  const conversations: string[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap: cloud,
    fetchImpl: async input => {
      const url = new URL(String(input), "https://cloud.test")
      if (url.pathname.endsWith("/bookmarks")) bookmarkReads.push(`${url.pathname}?${url.searchParams.get("cursor") ?? ""}`)
      const conversation = /^\/api\/conversations\/([^/]*)/.exec(url.pathname)
      if (conversation) conversations.push(decodeURIComponent(conversation[1] ?? ""))
      return await answer(url) ?? Response.json({ code: "not_found", class: "user", message: "not found" }, { status: 404 })
    }
  })
  if (login !== null) await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login, admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [repository("acme/api", "trunk"), repository("acme/web", "develop")] }).isPersisted.promise
  const selection = () => headerSelection(controller)
  return { store, controller, bookmarkReads, conversations, selection }
}
const branchesOf = (names: Readonly<Record<string, ReadonlyArray<string>>>): Answer => url => {
  const match = /^\/api\/repos\/([^/]+)\/([^/]+)\/bookmarks$/.exec(url.pathname)
  const listed = match ? names[`${match[1]}/${match[2]}`] : undefined
  return listed ? Response.json({ items: listed.map(bookmark), next_cursor: "" }) : undefined
}

describe("a branch off an install is a bookmark of the selected repository", () => {
  test("picks are read from this browser's storage when the page opens and written back on a pick", async () => {
    const values = new Map<string, string>([[BRANCH_PICKS_STORAGE_KEY, JSON.stringify({ [pickKey("maya", "acme/api")]: "docs", [pickKey("maya", "acme/web")]: "", broken: 7 })]])
    const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } } })
    try {
      const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"], "acme/web": ["develop"] }))
      await h.controller.commands.run("repo.select", "acme/api")
      expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
      await h.controller.commands.run("repo.select", "acme/web")
      expect(h.selection()).toEqual({ repository: "acme/web", branch: "develop" })
      await h.controller.commands.run("branch", "develop")
      expect(JSON.parse(values.get(BRANCH_PICKS_STORAGE_KEY) ?? "{}")).toEqual({ [pickKey("maya", "acme/api")]: "docs", [pickKey("maya", "acme/web")]: "develop" })
    } finally {
      if (prior === undefined) Reflect.deleteProperty(globalThis, "localStorage")
      else Object.defineProperty(globalThis, "localStorage", prior)
    }
  })

  test("storage that throws keeps the picks for this page and never fails a pick", async () => {
    const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") }, removeItem: () => {} } })
    try {
      const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
      await h.controller.commands.run("repo.select", "acme/api")
      expect(await h.controller.commands.run("branch", "docs")).toEqual({ status: "executed", value: "Opened docs" })
      expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
    } finally {
      if (prior === undefined) Reflect.deleteProperty(globalThis, "localStorage")
      else Object.defineProperty(globalThis, "localStorage", prior)
    }
  })

  test("the seeded fixture is off on a hosted page: no mock branch or repository can be opened", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk"] }))
    expect(h.controller.design.enabled).toBe(false)
    expect(h.controller.design.world().branches).toEqual([])
    expect(h.selection()).toEqual({ repository: null, branch: null })
  })

  test("with no repository selected, branch refuses and nothing is picked or read", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    expect(await h.controller.commands.run("branch", "docs")).toEqual({ status: "failed", error: "Choose a repository" })
    expect(h.store.session().branchNavigation).toBeUndefined()
    expect(h.bookmarkReads).toEqual([])
  })

  test("repo.select names the repository and its own default branch; branch then picks a real bookmark without opening the branch tree", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs", "retry-webhooks"] }))
    expect((await h.controller.commands.run("repo.select", "acme/api")).status).toBe("executed")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "trunk" })

    expect(await h.controller.commands.run("branch", "retry-webhooks")).toEqual({ status: "executed", value: "Opened retry-webhooks" })
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBe("retry-webhooks")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "retry-webhooks" })
    // The pick is the repository's alone: the conversation's branch was never written.
    expect(h.store.session().branchNavigation).toBeUndefined()
    expect(h.controller.repositoryBranches.rows.get("acme/api")).toMatchObject({ id: "acme/api", state: "ready", names: ["docs", "retry-webhooks", "trunk"] })
  })

  test("the button door (submit) picks the same way as the slash", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    expect((await h.controller.commands.submit({ name: "repo.select", payload: { repo: "acme/api" }, actor: "user" })).status).toBe("executed")
    expect((await h.controller.commands.submit({ name: "branch", payload: { name: "docs" }, actor: "user" })).status).toBe("executed")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
  })

  test("a branch the repository does not hold is refused and the pick stands", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    expect(await h.controller.commands.run("branch", "nope")).toEqual({ status: "failed", error: "No branch nope" })
    expect(await h.controller.commands.run("branch", "Docs")).toEqual({ status: "failed", error: "No branch Docs" })
    expect(h.selection().branch).toBe("docs")
  })

  test("a bare branch asks for main, which a repository without one refuses", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    expect(await h.controller.commands.run("branch")).toEqual({ status: "failed", error: "No branch main" })
    expect(h.selection().branch).toBe("trunk")
  })

  test("a failed read answers with its sentence, keeps the last good names, and a later read recovers", async () => {
    let fail = false
    const h = await harness(url => fail && url.pathname.endsWith("/bookmarks") ? Response.json({ message: "mirror offline" }, { status: 503 }) : branchesOf({ "acme/api": ["trunk", "docs"] })(url))
    await h.controller.commands.run("repo.select", "acme/api")
    expect((await h.controller.commands.run("branch", "docs")).status).toBe("executed")
    fail = true
    // A name the last read does not hold forces a fresh read, which fails.
    const refused = await h.controller.commands.run("branch", "just-pushed")
    expect(refused).toMatchObject({ status: "failed", error: expect.stringContaining("Branches for acme/api couldn't be listed") })
    const failed = h.controller.repositoryBranches.rows.get("acme/api")
    expect(failed).toMatchObject({ state: "failed", names: ["docs", "trunk"] })
    expect(failed?.error).toContain("Branches for acme/api couldn't be listed")
    expect(h.selection().branch).toBe("docs")
    fail = false
    expect(await h.controller.commands.run("branch", "just-pushed")).toEqual({ status: "failed", error: "No branch just-pushed" })
    const recovered = h.controller.repositoryBranches.rows.get("acme/api")
    expect(recovered).toMatchObject({ state: "ready", names: ["docs", "trunk"] })
    expect(recovered?.error).toBeUndefined()
  })

  test("a branch pushed after the last read is found by one fresh read; a listed one needs none", async () => {
    const listed = ["trunk", "docs"]
    const h = await harness(url => branchesOf({ "acme/api": listed })(url))
    await h.controller.commands.run("repo.select", "acme/api")
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/api")?.state === "ready")
    expect(h.bookmarkReads).toEqual(["/api/repos/acme/api/bookmarks?"])
    expect((await h.controller.commands.run("branch", "docs")).status).toBe("executed")
    expect(h.bookmarkReads).toEqual(["/api/repos/acme/api/bookmarks?"])
    listed.push("just-pushed")
    expect((await h.controller.commands.run("branch", "just-pushed")).status).toBe("executed")
    expect(h.bookmarkReads).toEqual(["/api/repos/acme/api/bookmarks?", "/api/repos/acme/api/bookmarks?"])
    expect(h.selection().branch).toBe("just-pushed")
  })

  test("every page of the bookmarks route is read", async () => {
    const h = await harness(url => {
      if (url.pathname !== "/api/repos/acme/api/bookmarks") return undefined
      return url.searchParams.get("cursor") === "page-2"
        ? Response.json({ items: [bookmark("trunk")], next_cursor: "" })
        : Response.json({ items: [bookmark("landing/api/main"), bookmark("docs")], next_cursor: "page-2" })
    })
    await h.controller.commands.run("repo.select", "acme/api")
    expect((await h.controller.commands.run("branch", "trunk")).status).toBe("executed")
    expect(h.controller.repositoryBranches.rows.get("acme/api")?.names).toEqual(["docs", "landing/api/main", "trunk"])
    expect(h.bookmarkReads).toEqual(["/api/repos/acme/api/bookmarks?", "/api/repos/acme/api/bookmarks?page-2"])
  })

  test("concurrent reads of one repository share a request and show loading meanwhile", async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const h = await harness(async url => {
      if (!url.pathname.endsWith("/bookmarks")) return undefined
      await gate
      return Response.json({ items: [bookmark("trunk")], next_cursor: "" })
    })
    const first = h.controller.repositoryBranches.load("acme/api")
    const second = h.controller.repositoryBranches.load("acme/api")
    expect(h.controller.repositoryBranches.rows.get("acme/api")).toMatchObject({ id: "acme/api", state: "loading", names: [] })
    release?.()
    await Promise.all([first, second])
    expect(h.bookmarkReads).toEqual(["/api/repos/acme/api/bookmarks?"])
    expect(h.controller.repositoryBranches.rows.get("acme/api")?.state).toBe("ready")
  })

  test("a hosted pick never changes the conversation the chat addresses: it stays main through picks and repository changes", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"], "acme/web": ["develop"] }))
    await waitFor(() => h.conversations.length > 0)
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    await h.controller.commands.run("repo.select", "acme/web")
    await h.controller.commands.run("branch", "develop")
    await h.controller.commands.run("repo.select", "acme/api")
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
    expect(h.store.session().branchNavigation).toBeUndefined()
    expect([...new Set(h.conversations)]).toEqual(["main"])
  })

  test("a pick leaves an open branch tree and the conversation's branch exactly as they were", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.selectConversationBranch("main")
    const before = h.store.session().branchNavigation
    expect(before).toEqual({ owner: "maya", open: true, selected_branch: "main", nodes: [] })
    await h.controller.commands.run("branch", "docs")
    expect(h.store.session().branchNavigation).toEqual(before)
    expect(h.selection().branch).toBe("docs")
  })

  test("each repository keeps its own pick: another repository shows its default and reads its branches, and returning restores the pick", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"], "acme/web": ["develop", "docs"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    await h.controller.commands.run("repo.select", "acme/api")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })

    await h.controller.commands.run("repo.select", "acme/web")
    expect(h.selection()).toEqual({ repository: "acme/web", branch: "develop" })
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/web")?.state === "ready")
    expect(h.controller.repositoryBranches.rows.get("acme/web")?.names).toEqual(["develop", "docs"])

    await h.controller.commands.run("repo.select", "acme/api")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
  })

  test("a picked branch the repository no longer holds gives way to its default once its branches are read again", async () => {
    const listed = ["trunk", "docs"]
    const h = await harness(url => branchesOf({ "acme/api": listed })(url))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    expect(h.selection().branch).toBe("docs")
    listed.splice(listed.indexOf("docs"), 1)
    await h.controller.repositoryBranches.load("acme/api")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "trunk" })
  })

  test("another account sees none of the last account's branches, and a read begun before the change writes nothing", async () => {
    let release: (() => void) | undefined
    let gated = false
    const gate = new Promise<void>(resolve => { release = resolve })
    const h = await harness(async url => {
      if (gated && url.pathname === "/api/repos/acme/web/bookmarks") await gate
      return branchesOf({ "acme/api": ["trunk", "docs"], "acme/web": ["develop"] })(url)
    })
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    expect(h.controller.repositoryBranches.rows.get("acme/api")?.names).toEqual(["docs", "trunk"])
    gated = true
    const inFlight = h.controller.repositoryBranches.load("acme/web")
    // Maya signs out and Ben signs in.
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
    await waitFor(() => h.controller.repositoryBranches.rows.size === 0)
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
    release?.()
    await inFlight
    expect(h.controller.repositoryBranches.rows.size).toBe(0)
    // Maya's pick is not Ben's, and it is still hers when she signs back in.
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBeUndefined()
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-out", login: null, admin: false, scopesPlain: null }).isPersisted.promise
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
    expect(h.controller.repositoryBranches.pickOf("acme/api")).toBe("docs")
  })

  test("a signed-out reader picks a branch of a public repository", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }), null)
    await h.controller.commands.run("repo.select", "acme/api")
    expect((await h.controller.commands.run("branch", "docs")).status).toBe("executed")
    expect(h.store.session().branchNavigation).toBeUndefined()
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
  })
})
