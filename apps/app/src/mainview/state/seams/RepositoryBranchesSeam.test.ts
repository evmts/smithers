/*
 * The `branch` and `repo.select` flows off an install, through the real
 * controller and store: a branch is one of the selected Cloud repository's
 * bookmarks, read from the bookmarks route. The only stand-in is the HTTP
 * door (`fetchImpl`), which answers the wire shape production serves.
 */
import { describe, expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { scopedControllers } from "../ControllerTestScope"
import { headerSelectionOf } from "../HeaderSelection"
import { memoryStorage, silentAgent, waitFor } from "../TestFixtures"

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
  const controller = createAppController(store, silentAgent, {
    bootstrap: cloud,
    fetchImpl: async input => {
      const url = new URL(String(input), "https://cloud.test")
      if (url.pathname.endsWith("/bookmarks")) bookmarkReads.push(`${url.pathname}?${url.searchParams.get("cursor") ?? ""}`)
      return await answer(url) ?? Response.json({ code: "not_found", class: "user", message: "not found" }, { status: 404 })
    }
  })
  if (login !== null) await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login, admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [repository("acme/api", "trunk"), repository("acme/web", "develop")] }).isPersisted.promise
  const selection = () => headerSelectionOf({ session: store.session(), repositories: store.collections.repositories.values(), owner: login })
  return { store, controller, bookmarkReads, selection }
}
const branchesOf = (names: Readonly<Record<string, ReadonlyArray<string>>>): Answer => url => {
  const match = /^\/api\/repos\/([^/]+)\/([^/]+)\/bookmarks$/.exec(url.pathname)
  const listed = match ? names[`${match[1]}/${match[2]}`] : undefined
  return listed ? Response.json({ items: listed.map(bookmark), next_cursor: "" }) : undefined
}

describe("a branch off an install is a bookmark of the selected repository", () => {
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
    expect(h.store.session().branchNavigation).toEqual({ owner: "maya", open: false, selected_branch: "retry-webhooks", nodes: [] })
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "retry-webhooks" })
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

  test("picking keeps an open branch tree open and its nodes in place", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.selectConversationBranch("trunk")
    expect(h.store.session().branchNavigation?.open).toBe(true)
    await h.controller.commands.run("branch", "docs")
    expect(h.store.session().branchNavigation).toEqual({ owner: "maya", open: true, selected_branch: "docs", nodes: [] })
  })

  test("another repository drops the pick, names its own default and reads its branches; the same repository keeps the pick", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"], "acme/web": ["develop", "docs"] }))
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    await h.controller.commands.run("repo.select", "acme/api")
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })

    await h.controller.commands.run("repo.select", "acme/web")
    expect(h.store.session().branchNavigation?.selected_branch).toBe("")
    expect(h.selection()).toEqual({ repository: "acme/web", branch: "develop" })
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/web")?.state === "ready")
    expect(h.controller.repositoryBranches.rows.get("acme/web")?.names).toEqual(["develop", "docs"])
  })

  test("a pick left over from another repository gives way once the new repository's branches are known", async () => {
    const h = await harness(branchesOf({ "acme/web": ["develop"] }))
    await h.controller.commands.run("repo.select", "acme/web")
    await h.controller.selectConversationBranch("main")
    expect(h.selection().branch).toBe("main")
    await h.controller.repositoryBranches.load("acme/web")
    const names = h.controller.repositoryBranches.rows.get("acme/web")?.names
    expect(headerSelectionOf({ session: h.store.session(), repositories: h.store.collections.repositories.values(), owner: "maya", ...(names ? { branches: names } : {}) }))
      .toEqual({ repository: "acme/web", branch: "develop" })
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
    // Maya's pick is not Ben's: his header falls back to the repository's default.
    expect(headerSelectionOf({ session: h.store.session(), repositories: h.store.collections.repositories.values(), owner: "ben" }).branch).not.toBe("docs")
  })

  test("a signed-out reader picks a branch of a public repository", async () => {
    const h = await harness(branchesOf({ "acme/api": ["trunk", "docs"] }), null)
    await h.controller.commands.run("repo.select", "acme/api")
    expect((await h.controller.commands.run("branch", "docs")).status).toBe("executed")
    expect(h.store.session().branchNavigation).toMatchObject({ owner: null, open: false, selected_branch: "docs" })
    expect(h.selection()).toEqual({ repository: "acme/api", branch: "docs" })
  })
})
