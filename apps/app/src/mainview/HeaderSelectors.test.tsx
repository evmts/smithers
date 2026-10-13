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

GlobalRegistrator.register()
afterAll(async () => {
  for (let tick = 0; tick < 3; tick++) await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})
const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()?.() })
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
    await waitFor(() => h.store.session().branchNavigation?.selected_branch === "docs")
    await settle()
    expect(crumbText(h.header())).toBe("acme/api/docs")
    expect(h.store.session().branchNavigation?.open).toBe(false)
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

  test("changing repository drops the branch picked in the last one", async () => {
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
