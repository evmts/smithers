/*
 * The mounted header: the repository and branch selectors read real state on
 * a hosted page and on an install, and the seeded crumbs appear only where
 * the design fixture is enabled. The controller, store and flows are real;
 * the HTTP door answers the wire shapes production serves.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, describe, expect, test } from "bun:test"
import type { ReactNode } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { ControllerTestProvider } from "./ControllerContext"
import { SessionNavigation } from "./SessionNavigation"
import { createAppStore } from "./state/AppStore"
import { scopedControllers } from "./state/ControllerTestScope"
import { memoryStorage, silentAgent, waitFor } from "./state/TestFixtures"
import { installFixture } from "./state/seams/InstallFixtures.test-support"
import { BRANCH_PICKS_STORAGE_KEY } from "./state/seams/RepositoryBranchesSeam"

GlobalRegistrator.register()
afterAll(async () => {
  for (let tick = 0; tick < 3; tick++) await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})
const cleanups: Array<() => void> = []
// Picks are kept in this browser's storage: one test's pick must not open the next test's header.
afterEach(() => { while (cleanups.length) cleanups.pop()?.(); localStorage.removeItem(BRANCH_PICKS_STORAGE_KEY) })
const createAppController = scopedControllers()

const mount = (node: ReactNode): HTMLElement => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(node))
  cleanups.push(() => { flushSync(() => root.unmount()); host.remove() })
  return host
}
/* happy-dom sets no window.event, so React cannot see the click as discrete: flush its update here. */
const click = (element: Element | null | undefined): void => { flushSync(() => { (element as HTMLButtonElement).click() }) }
const key = (element: Element | null | undefined, name: string): void => {
  flushSync(() => { element?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })) })
}
const settle = async (): Promise<void> => { for (let tick = 0; tick < 6; tick++) await new Promise(resolve => setTimeout(resolve, 0)); flushSync(() => {}) }

const cloud = { apiVersion: 1 as const, host: "cloud" as const, version: "test", buildSha: "test", capabilities: ["identity" as const, "agent" as const, "github" as const, "cloud" as const], authFlow: "redirect" as const, sandbox: null }
const bookmark = (name: string) => ({ name, target_change_id: `change-${name}`, target_commit_id: `commit-${name}`, is_tracking_remote: true })
const repository = (id: string, defaultBranch: string | null) => {
  const [org = "", name = ""] = id.split("/")
  return { id, org, ownerKind: "org" as const, name, head: defaultBranch === null ? null : { bookmark: defaultBranch, changeId: "c", commitId: "k" } }
}

const hosted = async (options: { readonly repositories?: ReadonlyArray<ReturnType<typeof repository>>; readonly branches?: Readonly<Record<string, ReadonlyArray<string> | number>> } = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const reads: string[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap: cloud,
    fetchImpl: async input => {
      const url = new URL(String(input), "https://cloud.test")
      const match = /^\/api\/repos\/([^/]+)\/([^/]+)\/bookmarks$/.exec(url.pathname)
      const listed = match ? options.branches?.[`${match[1]}/${match[2]}`] : undefined
      if (match) reads.push(`${match[1]}/${match[2]}`)
      if (typeof listed === "number") return Response.json({ message: "unavailable" }, { status: listed })
      return listed ? Response.json({ items: listed.map(bookmark), next_cursor: "" }) : Response.json({ code: "not_found", class: "user", message: "not found" }, { status: 404 })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
  if (options.repositories) await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: options.repositories }).isPersisted.promise
  const host = mount(<ControllerTestProvider controller={controller}><SessionNavigation /></ControllerTestProvider>)
  const header = () => host.querySelector(".session-navigation")!
  const select = (flow: "repo.select" | "branch") => host.querySelector<HTMLElement>(`[data-header-select="${flow}"]`)
  const trigger = (flow: "repo.select" | "branch") => select(flow)?.querySelector<HTMLButtonElement>("button.crumb-here") ?? null
  const options_ = (flow: "repo.select" | "branch") => [...(select(flow)?.querySelectorAll<HTMLButtonElement>(".tree .tree-row") ?? [])]
  return { store, controller, host, header, select, trigger, rows: options_, reads }
}
const crumbText = (header: Element): string => (header.querySelector(".crumbs-host")?.textContent ?? "").replace(/\s+/g, " ").trim()

describe("the header on a hosted page", () => {
  test("with no repositories it names nothing: no repository, no branch, no made-up main", async () => {
    const h = await hosted()
    await settle()
    expect(h.host.querySelector(".crumbs-host")).toBeNull()
    expect(h.header().textContent).not.toContain("main")
    expect(h.header().textContent).not.toContain("acme/api")
  })

  test("with repositories and none selected it offers the repository selector alone", async () => {
    const h = await hosted({ repositories: [repository("zeta/web", "develop"), repository("acme/api", "trunk")] })
    await settle()
    expect(crumbText(h.header())).toBe("Repository")
    expect(h.trigger("repo.select")?.getAttribute("aria-label")).toBe("Repository")
    expect(h.trigger("repo.select")?.getAttribute("aria-expanded")).toBe("false")
    expect(h.select("branch")).toBeNull()
    expect(h.rows("repo.select")).toEqual([])
  })

  test("the repository selector lists the account's repositories and repo.select names the one picked with its own default branch", async () => {
    const h = await hosted({ repositories: [repository("zeta/web", "develop"), repository("acme/api", "trunk")], branches: { "acme/api": ["trunk", "docs"] } })
    await settle()
    click(h.trigger("repo.select"))
    expect(h.trigger("repo.select")?.getAttribute("aria-expanded")).toBe("true")
    expect(h.select("repo.select")?.querySelector("nav.tree")?.getAttribute("aria-label")).toBe("Repositories")
    expect(h.rows("repo.select").map(row => row.textContent?.trim())).toEqual(["acme/api", "zeta/web"])
    expect(h.rows("repo.select").map(row => row.dataset.flow)).toEqual(["repo.select", "repo.select"])

    click(h.rows("repo.select")[0])
    await waitFor(() => h.store.session().activeRepoKey === "acme/api")
    await settle()
    expect(h.rows("repo.select")).toEqual([])
    expect(crumbText(h.header())).toBe("acme/api/trunk")
    expect(h.trigger("repo.select")?.getAttribute("aria-label")).toBe("Repository acme/api")
    expect(h.trigger("branch")?.getAttribute("aria-label")).toBe("Branch trunk")
    click(h.trigger("repo.select"))
    expect(h.rows("repo.select").map(row => row.getAttribute("aria-current"))).toEqual(["true", null])
  })

  test("the branch selector reads the repository's branches when opened, default first, and branch picks one", async () => {
    const h = await hosted({ repositories: [repository("acme/api", "trunk")], branches: { "acme/api": ["zed", "docs", "trunk", "alpha"] } })
    await h.controller.commands.run("repo.select", "acme/api")
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/api")?.state === "ready")
    await settle()
    const before = h.reads.length
    click(h.trigger("branch"))
    expect(h.reads.length).toBe(before + 1)
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/api")?.state === "ready")
    await settle()
    expect(h.select("branch")?.querySelector("nav.tree")?.getAttribute("aria-label")).toBe("Branches")
    expect(h.rows("branch").map(row => row.textContent?.trim())).toEqual(["trunk", "alpha", "docs", "zed"])
    expect(h.rows("branch").map(row => row.getAttribute("aria-current"))).toEqual(["true", null, null, null])

    click(h.rows("branch")[2])
    await waitFor(() => h.controller.repositoryBranches.pickOf("acme/api") === "docs")
    await settle()
    expect(crumbText(h.header())).toBe("acme/api/docs")
    // The pick names a repository branch; the conversation's branch is untouched.
    expect(h.store.session().branchNavigation).toBeUndefined()
    expect(h.rows("branch")).toEqual([])
  })

  test("a repository whose default is not loaded shows the Branch selector unnamed, never a guess", async () => {
    const h = await hosted({ repositories: [repository("acme/api", null)], branches: { "acme/api": ["docs"] } })
    await h.controller.commands.run("repo.select", "acme/api")
    await settle()
    expect(crumbText(h.header())).toBe("acme/api/Branch")
    expect(h.trigger("branch")?.getAttribute("aria-label")).toBe("Branch")
  })

  test("a failed branch read is shown in the open list and the selection stands", async () => {
    const h = await hosted({ repositories: [repository("acme/api", "trunk")], branches: { "acme/api": 503 } })
    await h.controller.commands.run("repo.select", "acme/api")
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/api")?.state === "failed")
    await settle()
    click(h.trigger("branch"))
    await waitFor(() => h.controller.repositoryBranches.rows.get("acme/api")?.state === "failed")
    await settle()
    expect(h.select("branch")?.querySelector('[role="alert"]')?.textContent).toContain("Branches for acme/api couldn't be listed")
    expect(h.rows("branch").map(row => row.textContent?.trim())).toEqual(["trunk"])
    expect(crumbText(h.header())).toContain("acme/api/trunk")
  })

  test("arrow keys move through the open list, Escape closes it and returns focus, and a press outside closes it", async () => {
    const h = await hosted({ repositories: [repository("acme/api", "trunk"), repository("zeta/web", "develop")] })
    await settle()
    click(h.trigger("repo.select"))
    const [first, second] = h.rows("repo.select")
    h.trigger("repo.select")?.focus()
    key(h.trigger("repo.select"), "ArrowDown")
    expect(document.activeElement).toBe(first!)
    key(first, "ArrowDown")
    expect(document.activeElement).toBe(second!)
    key(second, "ArrowDown")
    expect(document.activeElement).toBe(first!)
    key(first, "ArrowUp")
    expect(document.activeElement).toBe(second!)
    key(second, "Escape")
    expect(h.rows("repo.select")).toEqual([])
    expect(document.activeElement).toBe(h.trigger("repo.select"))

    click(h.trigger("repo.select"))
    expect(h.rows("repo.select").length).toBe(2)
    click(h.select("repo.select")?.querySelector(".crumb-backdrop"))
    expect(h.rows("repo.select")).toEqual([])
    expect(h.store.session().activeRepoKey ?? null).toBeNull()
  })

  test("each repository keeps its own pick, and a page opened later in this browser restores it", async () => {
    const h = await hosted({ repositories: [repository("acme/api", "trunk"), repository("zeta/web", "develop")], branches: { "acme/api": ["trunk", "docs"], "zeta/web": ["develop"] } })
    await h.controller.commands.run("repo.select", "acme/api")
    await h.controller.commands.run("branch", "docs")
    await settle()
    expect(crumbText(h.header())).toBe("acme/api/docs")
    click(h.trigger("repo.select"))
    click(h.rows("repo.select")[1])
    await waitFor(() => h.store.session().activeRepoKey === "zeta/web")
    await settle()
    expect(crumbText(h.header())).toBe("zeta/web/develop")
    click(h.trigger("repo.select"))
    click(h.rows("repo.select")[0])
    await waitFor(() => h.store.session().activeRepoKey === "acme/api")
    await settle()
    expect(crumbText(h.header())).toBe("acme/api/docs")

    const later = await hosted({ repositories: [repository("acme/api", "trunk")], branches: { "acme/api": ["trunk", "docs"] } })
    await later.controller.commands.run("repo.select", "acme/api")
    await settle()
    expect(crumbText(later.header())).toBe("acme/api/docs")
  })
})

describe("the header on other hosts", () => {
  test("an install names its one repository as text and its real branch tree, with nothing to select between", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "smithersai", admin: false, scopesPlain: null }).isPersisted.promise
    const controller = createAppController(store, silentAgent, {
      bootstrap: { apiVersion: 1, host: "local", version: "test", buildSha: "test", capabilities: ["install"], authFlow: "none", sandbox: null },
      fetchImpl: async input => {
        const path = new URL(String(input), "https://install.test").pathname
        return path === "/api/auth/session" ? Response.json({ id: 1, username: "smithersai", is_admin: false })
          : path === "/api/install" ? Response.json(installFixture())
          : path === "/api/branches" ? Response.json([{ name: "retry-webhooks", kind: "item", state: "open", machine: { id: "m-1" } }])
          : new Response("", { status: 404 })
      }
    })
    const host = mount(<ControllerTestProvider controller={controller}><SessionNavigation /></ControllerTestProvider>)
    await waitFor(() => controller.installSnapshots.get().model?.repository !== undefined)
    await settle()
    expect(host.querySelector(".crumb-repo")?.textContent).toBe("smithersai/smithers")
    expect(host.querySelector("[data-header-select]")).toBeNull()
    expect(host.querySelector(".crumb-here")?.textContent).toBe("main")

    await controller.listBookmarks()
    await waitFor(() => (store.session().branchNavigation?.nodes[0]?.children.length ?? 0) === 1)
    await settle()
    click(host.querySelector(".crumb-here"))
    expect([...host.querySelectorAll(".crumbs .tree .tree-name")].map(node => node.textContent)).toEqual(["main", "retry-webhooks"])
  })

  test("the seeded crumbs render only where the design fixture is enabled", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, silentAgent, { fetchImpl: async () => new Response("", { status: 404 }) })
    expect(controller.design.enabled).toBe(true)
    const host = mount(<ControllerTestProvider controller={controller}><SessionNavigation /></ControllerTestProvider>)
    await settle()
    expect(host.querySelector(".crumb-repo")?.textContent).toBe("acme/api")
    expect(host.querySelector(".crumb-here")?.textContent).toBe("main")
    expect(host.querySelector("[data-header-select]")).toBeNull()
  })
})

import { CodeHome } from "./repository/CodeHome"

describe("repository Code home availability", () => {
  test("slash default branches preserve separators in file and folder links", () => {
    const tree = { id:"copy:", copyId:"copy", path:"", state:"loaded" as const,
      entries:[{name:"a b.ts",kind:"file" as const},{name:"src",kind:"dir" as const}], expanded:true, loadedAt:1 }
    const host = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" branch="release/1.2" tree={tree}/>)
    expect(host.querySelector('a[href="/maya/tinyhttp/blob/release/1.2/a%20b.ts"]')?.textContent).toContain("a b.ts")
    expect(host.querySelector('a[href="/maya/tinyhttp/tree/release/1.2/src"]')?.textContent).toContain("src")
    expect(host.querySelector('a[href*="release%2F"]')).toBeNull()
  })
  test("files wait for an authoritative default branch before becoming links", () => {
    const tree = { id:"copy:", copyId:"copy", path:"", state:"loaded" as const, entries:[{name:"README.md",kind:"file" as const}], expanded:true, loadedAt:1 }
    const unknown = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" tree={tree}/>)
    expect(unknown.textContent).toContain("README.md")
    expect(unknown.querySelector('a[href*="/HEAD/"]')).toBeNull()
    expect(unknown.querySelector('a[href*="/blob/"]')).toBeNull()
    const known = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" branch="trunk" tree={tree}/>)
    expect(known.querySelector('a[href="/maya/tinyhttp/blob/trunk/README.md"]')).not.toBeNull()
  })
  test("a missing tree copy is an unavailable state rather than an endless spinner", () => {
    const host = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" treeAvailable={false}/>)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Couldn't load repository files.")
    expect(host.querySelector('[role="status"]')).toBeNull()
  })
})

test("declared home blocks stay above Files in spec order and README stays below", () => {
  const host = mount(<CodeHome repo="maya/tinyhttp" onRunCommand={() => false} treeAvailable={false} home={{ kind:"blocks", blocks:[
    {type:"links",links:[{label:"Documentation",url:"https://example.com/docs"}]},
    {type:"prompt",placeholder:"Ask a question"}, {type:"text",text:"Repository introduction"},
    {type:"markdown",path:"README.md",markdown:"# Project README"}
  ] }}/>)
  const home = host.querySelector('[data-testid="repository-home"]')!
  expect(home).not.toBeNull()
  const copy = home.textContent!
  expect(copy.indexOf("Repository introduction")).toBeLessThan(copy.indexOf("Ask a question"))
  expect(copy.indexOf("Ask a question")).toBeLessThan(copy.indexOf("Documentation"))
  expect(copy).not.toContain("Project README")
  const files = host.querySelector('[aria-label="Files"]')!
  const readme = host.querySelector('[aria-label="README"]')!
  expect(home.compareDocumentPosition(files) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(files.compareDocumentPosition(readme) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(readme.querySelector("h1")?.textContent).toBe("Project README")
})

// A declared home without a README block shows the tree's README below Files, in its own region, named by its file.
test("a declared home without a README block renders the repository README read from the tree below Files", () => {
  const home = { kind:"blocks" as const, blocks:[{ type:"text" as const, text:"Repository introduction" }] }
  const tree = { id:"copy:", copyId:"copy", path:"", state:"loaded" as const, entries:[{ name:"README.md", kind:"file" as const }], expanded:true, loadedAt:1 }
  const read = mount(<CodeHome repo="maya/tinyhttp" onRunCommand={() => false} branch="main" tree={tree} home={home} readme={{ name:"README.md", markdown:"# Read me from the tree" }}/>)
  const files = read.querySelector('[aria-label="Files"]')!
  const readme = read.querySelector('[aria-label="README"]')!
  expect(readme).not.toBeNull()
  expect(files.compareDocumentPosition(readme) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(readme.querySelector(".repo-ui-box-header")?.textContent).toBe("README.md")
  expect(readme.querySelector("h1")?.textContent).toBe("Read me from the tree")
  // Nothing read: no region and no placeholder.
  const none = mount(<CodeHome repo="maya/tinyhttp" onRunCommand={() => false} branch="main" tree={tree} home={home}/>)
  expect(none.querySelector('[aria-label="README"]')).toBeNull()
  expect(none.textContent).not.toContain("Read me")
  // The home's own README block outranks the tree's read.
  const declared = mount(<CodeHome repo="maya/tinyhttp" onRunCommand={() => false} branch="main" tree={tree} readme={{ name:"README.md", markdown:"# From the tree" }}
    home={{ kind:"blocks", blocks:[{ type:"markdown", path:"docs/README.md", markdown:"# Declared README" }] }}/>)
  expect(declared.querySelector('[aria-label="README"] h1')?.textContent).toBe("Declared README")
  expect(declared.querySelector('[aria-label="README"] .repo-ui-box-header')?.textContent).toBe("README.md")
})

// The repository page projects only the authoritative head and complete branch list.
import type { ChangeRow } from "./state/AppState"

const repositoryCommit: ChangeRow = {
  id: "maya/tinyhttp#change", repoId: "maya/tinyhttp", changeId: "change", commitId: "a".repeat(40),
  description: "Fix parser\nPrivate body", authorName: "Maya", timestamp: "2026-10-18T10:00:00Z",
  hasConflict: false, parentChangeIds: [], currentSeq: null, revisionCount: null, updatedAt: 1, revision: 1
}

describe("repository Code home metadata", () => {
  // repo-ui-spec view 1: the latest commit is its message, author and age; a commit id alone is not a latest commit.
  test("the exact repository head's change record supplies message, author and age, never a bare commit id", () => {
    const host = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" branch="main" headCommit={repositoryCommit.commitId} changes={[repositoryCommit]}/>)
    const latest = host.querySelector('[aria-label="Latest commit"]')!
    expect(latest.querySelector("strong")?.textContent).toBe("Maya")
    expect(latest.querySelector(".repo-code-home-latest-title")?.textContent).toBe("Fix parser")
    expect(host.textContent).not.toContain("Private body")
    expect(latest.querySelector("time")?.dateTime).toBe(repositoryCommit.timestamp!)
    expect(latest.querySelector("time")?.textContent).toMatch(/ago$|^just now$|^\d{4}-|:/)
    expect(latest.textContent).not.toMatch(/[0-9a-f]{40}/i)
    expect(latest.querySelector("code")).toBeNull()
  })
  test("the bookmark list's head is the one the record is matched against", () => {
    const host = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" branch="main" changes={[repositoryCommit]}
      branches={{ id:"maya/tinyhttp", state:"ready", names:["main"], commits:{ main: repositoryCommit.commitId! } }}/>)
    expect(host.querySelector('[aria-label="Latest commit"] strong')?.textContent).toBe("Maya")
  })
  for (const [name, repo, head] of [["another repository", "other/repo", "a".repeat(40)], ["old head", "maya/tinyhttp", "b".repeat(40)], ["unloaded head", "maya/tinyhttp", null]] as const) {
    test(`shows no latest-commit row for ${name}: no record, no row, no commit id`, () => {
      const host = mount(<CodeHome onRunCommand={() => false} repo={repo} headCommit={head} changes={[repositoryCommit]}/>)
      expect(host.querySelector('[aria-label="Latest commit"]')).toBeNull()
      expect(host.textContent).not.toContain("Fix parser")
      expect(host.textContent).not.toMatch(/[0-9a-f]{40}/i)
    })
  }
  test("a complete bookmark read supplies names and branch count; failures stay visible", () => {
    const host = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" branch="main" branches={{ id:"maya/tinyhttp", state:"ready", names:["main", "docs/ui"] }}/>)
    expect(host.textContent).toContain("2 branches")
    expect(host.querySelector('a[href="/maya/tinyhttp/tree/docs/ui"]')?.textContent).toBe("docs/ui")
    const failed = mount(<CodeHome onRunCommand={() => false} repo="maya/tinyhttp" branch="main" branches={{ id:"maya/tinyhttp", state:"failed", names:["stale"], error:"Permission denied" }}/>)
    const failure = failed.querySelector('[role="alert"]')!
    expect(failure.querySelector("p")?.textContent).toBe("Couldn’t load branches.")
    expect(failure.querySelector("details")?.hasAttribute("open")).toBe(false)
    expect(failure.querySelector('[aria-label="Failure details"]')?.textContent).toBe("Permission denied")
    expect(failed.textContent).not.toContain("stale")
    expect(failed.textContent).not.toContain("1 branch")
  })
})

test("Code home uses a fresh default-branch head instead of older inventory metadata", () => {
  const fresh = { ...repositoryCommit, commitId:"b".repeat(40), description:"Fresh head", authorName:"New author" }
  const host = mount(<CodeHome repo="maya/tinyhttp" branch="main" onRunCommand={() => false} headCommit={repositoryCommit.commitId}
    changes={[repositoryCommit,fresh]} branches={{ id:"maya/tinyhttp", state:"ready", names:["main"], commits:{main:fresh.commitId} }}/>)
  const latest = host.querySelector('[aria-label="Latest commit"]')!
  expect(latest.textContent).toContain("Fresh head")
  expect(latest.querySelector("strong")?.textContent).toBe("New author")
  expect(latest.textContent).not.toContain("Fix parser")
  expect(latest.textContent).not.toMatch(/[0-9a-f]{40}/i)
})
